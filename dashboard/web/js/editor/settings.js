// The panel for what is selected, as in Mailchimp: a back arrow and the
// block's name, then its Content and Styles tabs. Text itself is typed in
// the email; this panel holds everything else about a block or a section.

import {
  findBlock, findSection, NETWORKS, NETWORK_NAMES, LAYOUTS, setLayout, FOOTER_HTML,
  removeSection, duplicateSection, moveBlock, ARTICLE_SECTIONS, isArticleSection,
} from '../newsletter/model.js';
import { blockPadding } from '../newsletter/render.js';
import { FONTS } from '../newsletter/fonts.js';
import { links as textLinks } from '../newsletter/richtext.js';
import { SECTION_NAMES, ensureArticleSection } from '../newsletter/templates.js';
import { ADDRESS_TAGS } from '../newsletter/checks.js';
import { t } from '../texts.js';
import { h, clear } from '../ui/dom.js';
import { icon, columnsIcon } from '../ui/icons.js';
import {
  field, group, row, textInput, textArea, numberInput, select, segmented, toggle, slider, colourInput,
  accordion, sides, linkEditor,
} from '../ui/controls.js';

const BORDER_STYLES = ['none', 'solid', 'dashed', 'dotted'];

// A section's link name as a link can use it: Tapahtumat 2026 → tapahtumat-2026.
function anchorName(text) {
  return String(text || '').toLowerCase().replace(/[äå]/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
const ALIGN = ['left', 'center', 'right'];
const lastTab = {};

function alignControl(value, onChange) {
  return segmented(ALIGN.map((a) => ({
    value: a, title: t(`align.${a}`), icon: icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 18),
  })), value, onChange, { label: t('settings.align') });
}

export function createSettings({ store, root, actions, context }) {
  // Every change made here is one change of one block, merged with the next
  // change of the same field so a held-down arrow is one step of undo.
  function setBlock(id, key, fn) {
    store.change((d) => {
      const found = findBlock(d, id);
      if (found) fn(found.block, d);
    }, { key: key ? `set:${id}:${key}` : null, source: 'panel' });
  }

  function setSection(id, key, fn) {
    store.change((d) => {
      const found = findSection(d, id);
      if (found) fn(found.section, d);
    }, { key: key ? `sec:${id}:${key}` : null, source: 'panel' });
  }

  function styleSetter(id, name) {
    return (v) => setBlock(id, `style.${name}`, (b) => {
      if (v === '' || v === null || v === undefined) delete b.style[name];
      else b.style[name] = v;
    });
  }

  // A button's own look: its colour, shape and size, apart from the block
  // around it.
  function lookSetter(id, name) {
    return (v) => setBlock(id, `look.${name}`, (b) => {
      b.look = b.look || {};
      if (v === '' || v === null || v === undefined) delete b.look[name];
      else b.look[name] = v;
    });
  }

  // ---------- the parts most blocks share ----------

  function backgroundField(block) {
    return field(t('settings.blockBackground'), colourInput(block.style.background || '', styleSetter(block.id, 'background'), { allowNone: true }));
  }

  function borderFields(block, defaults = {}) {
    const look = { borderStyle: 'none', borderWidth: 1, borderColor: '#dde4e4', ...defaults, ...block.style };
    return group(t('settings.border'),
      field(t('settings.borderStyle'), select(BORDER_STYLES.map((s) => ({ value: s, label: t(`border.${s}`) })), look.borderStyle || 'none', styleSetter(block.id, 'borderStyle'))),
      row(
        field(t('settings.borderWidth'), numberInput(look.borderWidth, styleSetter(block.id, 'borderWidth'), { min: 0, max: 20 })),
        field(t('settings.borderColour'), colourInput(look.borderColor, styleSetter(block.id, 'borderColor'))),
      ));
  }

  function radiusField(block, fallback = 0) {
    return field(t('settings.radius'), numberInput(block.style.radius ?? fallback, styleSetter(block.id, 'radius'), { min: 0, max: 60 }));
  }

  function paddingFields(block) {
    const p = blockPadding(block, store.design.styles);
    return group(t('settings.padding'), sides(p, (v) => setBlock(block.id, 'padding', (b) => {
      b.style.paddingTop = v.top;
      b.style.paddingRight = v.right;
      b.style.paddingBottom = v.bottom;
      b.style.paddingLeft = v.left;
    })));
  }

  function marginFields(block) {
    const m = { top: block.style.marginTop || 0, right: block.style.marginRight || 0, bottom: block.style.marginBottom || 0, left: block.style.marginLeft || 0 };
    return group(t('settings.margin'), sides(m, (v) => setBlock(block.id, 'margin', (b) => {
      b.style.marginTop = v.top;
      b.style.marginRight = v.right;
      b.style.marginBottom = v.bottom;
      b.style.marginLeft = v.left;
    })));
  }

  // The image itself: what it is, a button to change it, and its address.
  function imagePicker(src, onPick, onRemove) {
    if (!src) {
      return h('div', { class: 'st-image-empty' },
        h('span', { class: 'st-image-icon', html: icon('image', 28) }),
        h('p', {}, t('settings.noImage')),
        h('div', { class: 'st-image-buttons' },
          h('button', { type: 'button', class: 'btn small', onclick: () => actions.upload(onPick) }, h('span', { html: icon('upload', 16) }), ` ${t('settings.upload')}`),
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => actions.library(onPick) }, t('settings.library'))));
    }
    return h('div', { class: 'st-image' },
      h('img', { src, alt: '' }),
      h('div', { class: 'st-image-buttons' },
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => actions.library(onPick) }, t('settings.replace')),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => actions.upload(onPick) }, h('span', { html: icon('upload', 16) }), ` ${t('settings.upload')}`),
        onRemove ? h('button', { type: 'button', class: 'st-icon-btn', title: t('settings.removeImage'), 'aria-label': t('settings.removeImage'), html: icon('trash', 18), onclick: onRemove }) : null));
  }

  function altField(value, onChange) {
    return field(t('settings.alt'), textArea(value, onChange, { rows: 2, maxlength: 300, placeholder: t('settings.altPlaceholder') }), t('settings.altHint'));
  }

  // ---------- each kind of block ----------

  const FORMS = {
    text: {
      tabs: ['styles'],
      styles: (b) => [backgroundField(b), borderFields(b), radiusField(b), paddingFields(b), marginFields(b)],
    },

    footer: {
      tabs: ['content', 'styles'],
      content: (b) => {
        const hasUnsub = textLinks(b.html).some((l) => l.href === '*|UNSUB|*');
        const hasAddress = ADDRESS_TAGS.some((tag) => (b.html || '').includes(tag));
        return [
          h('p', { class: 'st-note' }, t('settings.footerNote')),
          hasUnsub ? h('p', { class: 'st-ok', html: `${icon('tick', 16)} ` }, t('settings.footerHasUnsub'))
            : h('p', { class: 'st-warn' }, t('settings.footerNoUnsub')),
          hasUnsub ? null : h('button', { type: 'button', class: 'btn small', onclick: () => setBlock(b.id, null, (blk) => {
            blk.html += '<p><a href="*|UNSUB|*">Peru tilaus</a></p>';
          }) }, t('settings.addUnsub')),
          hasAddress ? h('p', { class: 'st-ok', html: `${icon('tick', 16)} ` }, t('settings.footerHasAddress'))
            : h('p', { class: 'st-warn' }, t('settings.footerNoAddress')),
          hasAddress ? null : h('button', { type: 'button', class: 'btn small', onclick: () => setBlock(b.id, null, (blk) => {
            blk.html += '<p>*|LIST:ADDRESSLINE|*</p>';
          }) }, t('settings.addAddress')),
          h('button', { type: 'button', class: 'btn ghost small', onclick: () => setBlock(b.id, null, (blk) => { blk.html = FOOTER_HTML; }) }, t('settings.resetFooter')),
        ];
      },
      styles: (b) => [backgroundField(b), borderFields(b), paddingFields(b)],
    },

    image: {
      tabs: ['content', 'styles'],
      content: (b) => [
        imagePicker(b.src, (img) => setBlock(b.id, null, (blk) => {
          blk.src = img.src;
          blk.naturalWidth = img.width || 0;
          blk.naturalHeight = img.height || 0;
          if (!blk.alt && img.name) blk.alt = '';
        }), () => setBlock(b.id, null, (blk) => { blk.src = ''; })),
        field(t('settings.size'), segmented([
          { value: 'original', label: t('settings.sizeOriginal') },
          { value: 'fill', label: t('settings.sizeFill') },
          { value: 'scale', label: t('settings.sizeScale') },
        ], b.size || 'original', (v) => { setBlock(b.id, 'size', (blk) => { blk.size = v; }); refresh(); })),
        b.size === 'scale' ? field(t('settings.scale'), slider(b.scale || 100, (v) => setBlock(b.id, 'scale', (blk) => { blk.scale = v; }), { min: 10, max: 100 })) : null,
        group(t('settings.link'), linkEditor(b.link, (l) => setBlock(b.id, 'link', (blk) => { blk.link = l; }))),
        altField(b.alt, (v) => setBlock(b.id, 'alt', (blk) => { blk.alt = v; })),
      ],
      styles: (b) => [
        field(t('settings.align'), alignControl(b.style.align || store.design.styles.image.align, styleSetter(b.id, 'align'))),
        backgroundField(b), borderFields(b, store.design.styles.image), radiusField(b, store.design.styles.image.radius), paddingFields(b),
      ],
    },

    logo: {
      tabs: ['content', 'styles'],
      content: (b) => [
        imagePicker(b.src, (img) => setBlock(b.id, null, (blk) => { blk.src = img.src; }), () => setBlock(b.id, null, (blk) => { blk.src = ''; })),
        field(t('settings.logoWidth'), numberInput(b.width || 160, (v) => setBlock(b.id, 'width', (blk) => { blk.width = v; }), { min: 40, max: 600 })),
        group(t('settings.link'), linkEditor(b.link, (l) => setBlock(b.id, 'link', (blk) => { blk.link = l; }))),
        altField(b.alt, (v) => setBlock(b.id, 'alt', (blk) => { blk.alt = v; })),
      ],
      styles: (b) => [
        field(t('settings.align'), alignControl(b.style.align || store.design.styles.logo.align, styleSetter(b.id, 'align'))),
        backgroundField(b), paddingFields(b),
      ],
    },

    button: {
      tabs: ['content', 'styles'],
      content: (b) => [
        field(t('settings.buttonText'), textInput(b.text, (v) => setBlock(b.id, 'text', (blk) => { blk.text = v; }), { maxlength: 80 })),
        group(t('settings.link'), linkEditor(b.link, (l) => setBlock(b.id, 'link', (blk) => { blk.link = l; }))),
      ],
      styles: (b) => buttonStyles(b.id, { ...store.design.styles.button, ...(b.look || {}) }, (name) => lookSetter(b.id, name)).concat([backgroundField(b), paddingFields(b)]),
    },

    divider: {
      tabs: ['styles'],
      styles: (b) => {
        const d = { ...store.design.styles.divider, ...b.style };
        return [
          field(t('settings.lineStyle'), segmented(['solid', 'dashed', 'dotted'].map((s) => ({ value: s, label: t(`border.${s}`) })), d.line, styleSetter(b.id, 'line'))),
          row(
            field(t('settings.lineColour'), colourInput(d.color, styleSetter(b.id, 'color'))),
            field(t('settings.thickness'), numberInput(d.thickness, styleSetter(b.id, 'thickness'), { min: 1, max: 12 })),
          ),
          backgroundField(b), paddingFields(b),
        ];
      },
    },

    spacer: {
      tabs: ['styles'],
      styles: (b) => [
        field(t('settings.height'), slider(b.height || 24, (v) => setBlock(b.id, 'height', (blk) => { blk.height = v; }), { min: 4, max: 160, unit: ' px' })),
        backgroundField(b),
      ],
    },

    social: {
      tabs: ['content', 'styles'],
      content: (b) => [
        h('div', { class: 'st-social' }, (b.items || []).map((item, i) => h('div', { class: 'st-social-item' },
          h('div', { class: 'cf-row' },
            select(NETWORKS.map((n) => ({ value: n, label: NETWORK_NAMES[n] })), item.network, (v) => setBlock(b.id, null, (blk) => {
              const it = blk.items[i];
              if (!it.label || it.label === NETWORK_NAMES[it.network]) it.label = NETWORK_NAMES[v];
              it.network = v;
            }), { label: t('settings.network') }),
            h('button', { type: 'button', class: 'st-icon-btn', title: t('settings.up'), 'aria-label': t('settings.up'), html: icon('arrowUp', 16), disabled: i === 0, onclick: () => setBlock(b.id, null, (blk) => {
              blk.items.splice(i - 1, 0, blk.items.splice(i, 1)[0]);
            }) }),
            h('button', { type: 'button', class: 'st-icon-btn', title: t('settings.remove'), 'aria-label': t('settings.remove'), html: icon('trash', 16), onclick: () => setBlock(b.id, null, (blk) => { blk.items.splice(i, 1); }) })),
          textInput(item.url, (v) => setBlock(b.id, `url${i}`, (blk) => { blk.items[i].url = v.trim() && !/^(https?:|mailto:)/i.test(v.trim()) ? (item.network === 'email' ? `mailto:${v.trim()}` : `https://${v.trim()}`) : v.trim(); }), { placeholder: item.network === 'email' ? 'info@eoppimiskeskus.fi' : 'https://', commit: 'change' }),
          textInput(item.label, (v) => setBlock(b.id, `label${i}`, (blk) => { blk.items[i].label = v; }), { placeholder: t('settings.socialLabel') })))),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => setBlock(b.id, null, (blk) => {
          const used = new Set(blk.items.map((x) => x.network));
          const next = NETWORKS.find((n) => !used.has(n)) || 'website';
          blk.items.push({ network: next, url: '', label: NETWORK_NAMES[next] });
        }) }, t('settings.addSocial')),
      ],
      styles: (b) => [
        field(t('settings.display'), segmented([
          { value: 'icon', label: t('settings.displayIcon') }, { value: 'icon_text', label: t('settings.displayBoth') }, { value: 'text', label: t('settings.displayText') },
        ], b.display || 'icon', (v) => setBlock(b.id, 'display', (blk) => { blk.display = v; }))),
        field(t('settings.iconStyle'), segmented([
          { value: 'color', label: t('settings.iconColour') }, { value: 'dark', label: t('settings.iconDark') }, { value: 'light', label: t('settings.iconLight') },
        ], b.iconStyle || 'color', (v) => setBlock(b.id, 'iconStyle', (blk) => { blk.iconStyle = v; }))),
        field(t('settings.layout'), segmented([
          { value: 'horizontal', label: t('settings.horizontal') }, { value: 'vertical', label: t('settings.vertical') },
        ], b.layout || 'horizontal', (v) => setBlock(b.id, 'layout', (blk) => { blk.layout = v; }))),
        field(t('settings.iconSize'), segmented([
          { value: 'small', label: t('settings.small') }, { value: 'medium', label: t('settings.medium') }, { value: 'large', label: t('settings.large') },
        ], b.iconSize || 'medium', (v) => setBlock(b.id, 'iconSize', (blk) => { blk.iconSize = v; }))),
        field(t('settings.spacing'), numberInput(b.spacing ?? 12, (v) => setBlock(b.id, 'spacing', (blk) => { blk.spacing = v; }), { min: 0, max: 40 })),
        field(t('settings.align'), alignControl(b.style.align || 'left', styleSetter(b.id, 'align'))),
        backgroundField(b), paddingFields(b),
      ],
    },

    video: {
      tabs: ['content', 'styles'],
      content: (b) => {
        const url = textInput(b.url, () => {}, { placeholder: 'https://www.youtube.com/watch?v=…', commit: 'change' });
        const status = h('p', { class: 'cf-hint' }, t('settings.videoHint'));
        url.addEventListener('change', async () => {
          const value = url.value.trim();
          setBlock(b.id, 'url', (blk) => { blk.url = value; });
          if (!value) return;
          status.textContent = t('settings.videoFetching');
          try {
            const thumb = await actions.videoThumbnail(value);
            setBlock(b.id, null, (blk) => {
              blk.thumb = { src: thumb.src, width: thumb.width, height: thumb.height };
              if (!blk.alt && thumb.title) blk.alt = thumb.title;
            });
            refresh();
          } catch (e) {
            status.textContent = e.message;
          }
        });
        return [
          field(t('settings.videoUrl'), url), status,
          group(t('settings.thumbnail'), imagePicker(b.thumb && b.thumb.src, (img) => setBlock(b.id, null, (blk) => {
            blk.thumb = { src: img.src, width: img.width, height: img.height };
          }), null)),
          altField(b.alt, (v) => setBlock(b.id, 'alt', (blk) => { blk.alt = v; })),
        ];
      },
      styles: (b) => [
        field(t('settings.align'), alignControl(b.style.align || 'center', styleSetter(b.id, 'align'))),
        backgroundField(b), borderFields(b), radiusField(b), paddingFields(b),
      ],
    },

    columns: {
      tabs: ['styles'],
      styles: (b) => {
        const count = b.columns.length;
        const layouts = Object.keys(LAYOUTS).filter((l) => LAYOUTS[l].length === count);
        return [
          field(t('settings.columnCount'), segmented([1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })), count, (n) => {
            const layout = { 1: '1', 2: '1:1', 3: '1:1:1', 4: '1:1:1:1' }[n];
            setBlock(b.id, null, (blk) => setLayout(blk, layout));
            refresh();
          })),
          layouts.length > 1 ? field(t('settings.columnLayout'), segmented(layouts.map((l) => ({
            value: l, title: l === '1:1' ? t('settings.equal') : l, icon: columnsIcon(LAYOUTS[l], 30),
          })), b.layout, (l) => setBlock(b.id, null, (blk) => setLayout(blk, l)))) : null,
          field(t('settings.mobile'), segmented([
            { value: 'stack', label: t('settings.stack') }, { value: 'reverse', label: t('settings.stackReverse') }, { value: 'side', label: t('settings.sideBySide') },
          ], b.mobile || 'stack', (v) => setBlock(b.id, 'mobile', (blk) => { blk.mobile = v; }))),
          field(t('settings.valign'), segmented([
            { value: 'top', label: t('settings.top') }, { value: 'middle', label: t('settings.middle') }, { value: 'bottom', label: t('settings.bottom') },
          ], b.valign || 'top', (v) => setBlock(b.id, 'valign', (blk) => { blk.valign = v; }))),
          field(t('settings.columnBackground'), colourInput(b.style.columnBackground || '', styleSetter(b.id, 'columnBackground'), { allowNone: true })),
          backgroundField(b), borderFields(b), radiusField(b), paddingFields(b),
        ];
      },
    },

    article: {
      tabs: ['content', 'styles'],
      content: (b) => {
        const article = context.articles.find((a) => Number(a.id) === Number(b.itemId));
        const foreign = b.lang && b.lang !== 'fi' && (b.title || '').trim() === (b.originalTitle || '').trim();
        const checkCard = h('div', { class: `st-checked${b.checked ? ' on' : ''}` },
          toggle(b.checked, (v) => setBlock(b.id, null, (blk) => { blk.checked = v; }), t('settings.checked')),
          h('p', { class: 'cf-hint' }, t('settings.checkedHint')));
        return [
          checkCard,
          h('div', { class: 'st-original' },
            h('span', { class: 'cf-label' }, t('settings.original')),
            b.url ? h('a', { href: b.url, target: '_blank', rel: 'noopener noreferrer' }, b.originalTitle || b.url, h('span', { html: ` ${icon('external', 14)}` })) : h('span', {}, '–'),
            article && article.publisher ? h('p', { class: 'cf-hint' }, article.publisher) : null),
          foreign ? h('p', { class: 'st-warn' }, t('settings.foreignTitle', { lang: b.lang })) : null,
          field(t('settings.title'), textInput(b.title, (v) => setBlock(b.id, 'title', (blk) => { blk.title = v; }), { maxlength: 300 })),
          toggle(b.linkTitle, (v) => setBlock(b.id, null, (blk) => { blk.linkTitle = v; }), t('settings.linkTitle')),
          toggle(!b.hideSource, (v) => setBlock(b.id, null, (blk) => { blk.hideSource = !v; }), t('settings.showSource')),
          group(t('settings.articleButton'),
            toggle(b.button && b.button.show, (v) => { setBlock(b.id, null, (blk) => { blk.button = { ...(blk.button || {}), show: v }; }); refresh(); }, t('settings.showButton')),
            b.button && b.button.show ? textInput(b.button.text, (v) => setBlock(b.id, 'buttonText', (blk) => { blk.button.text = v; }), { maxlength: 80 }) : null),
          field(t('settings.articleLayout'), segmented([
            { value: 'text', label: t('settings.layoutText') }, { value: 'image-left', label: t('settings.layoutLeft') },
            { value: 'image-right', label: t('settings.layoutRight') }, { value: 'image-top', label: t('settings.layoutTop') },
          ], b.layout || 'text', (v) => { setBlock(b.id, 'layout', (blk) => { blk.layout = v; }); refresh(); })),
          b.layout && b.layout !== 'text' ? group(t('settings.articleImage'),
            imagePicker(b.image && b.image.src, (img) => setBlock(b.id, null, (blk) => {
              blk.image = { ...(blk.image || {}), src: img.src, naturalWidth: img.width, naturalHeight: img.height };
            }), () => setBlock(b.id, null, (blk) => { blk.image = { src: '', alt: '' }; })),
            altField(b.image && b.image.alt, (v) => setBlock(b.id, 'imageAlt', (blk) => { blk.image = { ...(blk.image || {}), alt: v }; })),
            h('p', { class: 'cf-hint' }, t('settings.imageRights'))) : null,
          field(t('settings.moveTo'), select(ARTICLE_SECTIONS.map((s) => ({ value: s, label: SECTION_NAMES[s] })), b.section, (v) => {
            store.change((d) => {
              const target = ensureArticleSection(d, v);
              moveBlock(d, b.id, target.id, target.blocks.filter((x) => x.id !== b.id).length);
              const f = findBlock(d, b.id);
              if (f) f.block.section = v;
            }, { source: 'panel' });
          }, { label: t('settings.moveTo') })),
        ];
      },
      styles: (b) => [backgroundField(b), borderFields(b), radiusField(b), paddingFields(b)],
    },
  };

  // The button's look, used for a button block and for the email's styles.
  function buttonStyles(id, look, setter) {
    return [
      field(t('settings.shape'), segmented([
        { value: 'square', label: t('settings.square') }, { value: 'round', label: t('settings.round') }, { value: 'pill', label: t('settings.pill') },
      ], look.shape, setter('shape'))),
      row(
        field(t('settings.buttonColour'), colourInput(look.background, setter('background'))),
        field(t('settings.textColour'), colourInput(look.color, setter('color'))),
      ),
      group(t('settings.border'),
        field(t('settings.borderStyle'), select(BORDER_STYLES.map((s) => ({ value: s, label: t(`border.${s}`) })), look.borderStyle || 'none', setter('borderStyle'))),
        row(
          field(t('settings.borderWidth'), numberInput(look.borderWidth ?? 1, setter('borderWidth'), { min: 0, max: 10 })),
          field(t('settings.borderColour'), colourInput(look.borderColor, setter('borderColor'))),
        )),
      row(
        field(t('settings.font'), select(FONTS.map((f) => ({ value: f.id, label: f.label })), look.font, setter('font'))),
        field(t('settings.fontSize'), numberInput(look.fontSize, setter('fontSize'), { min: 10, max: 32 })),
      ),
      row(
        toggle(look.bold, setter('bold'), t('settings.bold')),
        toggle(look.italic, setter('italic'), t('settings.italic')),
      ),
      field(t('settings.letterSpacing'), numberInput(look.letterSpacing || 0, setter('letterSpacing'), { min: -2, max: 10 })),
      field(t('settings.buttonSize'), segmented([
        { value: 'small', label: t('settings.small') }, { value: 'medium', label: t('settings.medium') }, { value: 'large', label: t('settings.large') },
      ], look.size, setter('size'))),
      field(t('settings.align'), alignControl(look.align, setter('align'))),
      toggle(look.fullWidth, setter('fullWidth'), t('settings.fullWidth')),
    ];
  }

  // ---------- sections ----------

  function sectionForm(sec) {
    const s = sec.style || {};
    const set = (name, key) => (v) => setSection(sec.id, key || name, (x) => {
      if (v === '' || v === null || v === undefined) delete x.style[name];
      else x.style[name] = v;
    });
    const name = textInput(sec.name, (v) => setSection(sec.id, 'name', (x) => { x.name = v.trim() || x.name; }), { maxlength: 60 });
    return [
      field(t('settings.sectionName'), name),
      accordion(t('settings.sectionBackground'), () => h('div', {},
        field(null, colourInput(s.background || '', set('background'), { allowNone: true, noneLabel: t('settings.samePage') }), t('settings.sectionBackgroundHint'))), { open: true }),
      accordion(t('settings.contentBackground'), () => h('div', {},
        field(null, colourInput(s.contentBackground || '', set('contentBackground'), { allowNone: true, noneLabel: t('settings.sameEmail') })),
        field(t('settings.radius'), numberInput(s.radius || 0, set('radius'), { min: 0, max: 40 })))),
      isArticleSection(sec) ? accordion(t('settings.articleLook'), () => {
        const look = s.articleLook || 'plain';
        return h('div', {},
          field(null, segmented([
            { value: 'plain', label: t('settings.lookPlain') }, { value: 'large', label: t('settings.lookLarge') },
            { value: 'card', label: t('settings.lookCard') }, { value: 'bar', label: t('settings.lookBar') },
          ], look, (v) => { set('articleLook')(v === 'plain' ? '' : v); refresh(); }), t('settings.articleLookHint')),
          look === 'card' || look === 'bar'
            ? field(t(look === 'card' ? 'settings.cardColour' : 'settings.barColour'), colourInput(s.articleColour || '', set('articleColour'), { allowNone: true, noneLabel: t('settings.lookDefaultColour') }))
            : null,
          field(t('settings.newArticleLayout'), segmented([
            { value: 'text', label: t('settings.layoutText') }, { value: 'image-left', label: t('settings.layoutLeft') },
            { value: 'image-right', label: t('settings.layoutRight') }, { value: 'image-top', label: t('settings.layoutTop') },
          ], s.articleLayout || 'text', (v) => set('articleLayout')(v === 'text' ? '' : v)), t('settings.newArticleLayoutHint')));
      }, { open: true }) : null,
      accordion(t('settings.sectionText'), () => h('div', {},
        field(t('settings.textColour'), colourInput(s.textColor || '', set('textColor'), { allowNone: true, noneLabel: t('settings.sameEmail') })))),
      accordion(t('settings.sectionLink'), () => h('div', {},
        field(t('settings.linkColour'), colourInput(s.linkColor || '', set('linkColor'), { allowNone: true, noneLabel: t('settings.sameEmail') })))),
      accordion(t('settings.padding'), () => h('div', {},
        row(
          field(t('control.top'), numberInput(s.paddingTop || 0, set('paddingTop'), { max: 120 })),
          field(t('control.bottom'), numberInput(s.paddingBottom || 0, set('paddingBottom'), { max: 120 })),
        ),
        field(t('settings.spaceAbove'), numberInput(s.spaceAbove || 0, set('spaceAbove'), { max: 80 }), t('settings.spaceAboveHint')))),
      accordion(t('settings.border'), () => h('div', {},
        field(t('settings.borderStyle'), select(BORDER_STYLES.map((b) => ({ value: b, label: t(`border.${b}`) })), s.borderStyle || 'none', set('borderStyle'))),
        row(
          field(t('settings.borderWidth'), numberInput(s.borderWidth || 0, set('borderWidth'), { max: 20 })),
          field(t('settings.borderColour'), colourInput(s.borderColor || '#dde4e4', set('borderColor'))),
        ))),
      accordion(t('settings.anchor'), () => h('div', {},
        field(null, textInput(s.anchor || '', (v) => set('anchor')(anchorName(v)), { maxlength: 40, placeholder: 'tapahtumat' }), t('settings.anchorHint')))),
      h('div', { class: 'st-actions' },
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => actions.saveSection(sec.id) }, t('settings.saveSection')),
        h('button', { type: 'button', class: 'btn ghost small', onclick: () => {
          let copy = null;
          store.change((d) => { copy = duplicateSection(d, sec.id); });
          if (copy) store.select({ kind: 'section', id: copy.id });
        } }, t('settings.duplicateSection')),
        h('button', { type: 'button', class: 'btn ghost small danger', onclick: () => {
          store.change((d) => removeSection(d, sec.id));
          store.select(null);
        } }, t('settings.deleteSection'))),
    ];
  }

  // ---------- drawing the panel ----------

  function header(title, extra) {
    return h('div', { class: 'st-head' },
      h('button', { type: 'button', class: 'st-back', 'aria-label': t('settings.back'), title: t('settings.back'), html: icon('arrowLeft', 20), onclick: () => store.select(null) }),
      h('h2', { class: 'st-title' }, title),
      extra || null);
  }

  function blockPanel(block) {
    const form = FORMS[block.type];
    if (!form) return [header(t(`block.${block.type}`))];
    const tabs = form.tabs;
    let tab = lastTab[block.type] && tabs.includes(lastTab[block.type]) ? lastTab[block.type] : tabs[0];
    const body = h('div', { class: 'st-body' });
    const tabBar = tabs.length > 1 ? h('div', { class: 'st-tabs', role: 'tablist' }, tabs.map((name) => h('button', {
      type: 'button', role: 'tab', class: 'st-tab', 'aria-selected': String(name === tab),
      onclick: () => {
        lastTab[block.type] = name;
        refresh();
      },
    }, t(`settings.tab.${name}`)))) : null;
    body.append(...[].concat(form[tab](block)).filter(Boolean));
    const footer = tab === 'styles' && block.type !== 'spacer'
      ? h('div', { class: 'st-footer' },
        h('button', { type: 'button', class: 'btn ghost small', html: `${icon('clearFormat', 16)} `, onclick: () => {
          setBlock(block.id, null, (b) => {
            b.style = {};
            if (b.type === 'button') b.look = {};
          });
          refresh();
        } }, t('settings.clearStyles')),
        h('button', { type: 'button', class: 'btn ghost small', html: `${icon('styles', 16)} `, onclick: () => applyToAll(block) }, t('settings.applyAll')))
      : null;
    return [header(t(`block.${block.type}`)), tabBar, body, footer];
  }

  function applyToAll(block) {
    store.change((d) => {
      const style = JSON.stringify(block.style || {});
      const look = JSON.stringify(block.look || {});
      const visit = (list) => list.forEach((b) => {
        if (b.type === block.type && b.id !== block.id) {
          b.style = JSON.parse(style);
          if (b.type === 'button') b.look = JSON.parse(look);
        }
        if (b.type === 'columns') b.columns.forEach((c) => visit(c.blocks));
      });
      d.sections.forEach((s) => visit(s.blocks));
    }, { source: 'panel' });
    actions.toast(t('settings.appliedAll', { type: t(`block.${block.type}`) }));
  }

  let renderedFor = null;

  function refresh() {
    const sel = store.selection;
    const scroll = root.scrollTop;
    clear(root);
    if (!sel) return;
    if (sel.kind === 'block') {
      const found = findBlock(store.design, sel.id);
      if (found) root.append(...blockPanel(found.block).filter(Boolean));
    } else {
      const found = findSection(store.design, sel.id);
      if (found) root.append(header(t('settings.section')), h('div', { class: 'st-body' }, ...sectionForm(found.section)));
    }
    if (renderedFor === JSON.stringify(sel)) root.scrollTop = scroll;
    renderedFor = JSON.stringify(sel);
  }

  store.on('select', refresh);
  store.on('change', ({ source }) => {
    if (source !== 'panel' && source !== 'canvas') refresh();
  });

  return { refresh, buttonStyles };
}


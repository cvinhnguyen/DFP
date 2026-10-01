// Tyylit: the look of the whole email, as Mailchimp's Styles panel has it.
// Background, text (paragraph and each heading), links, buttons, dividers,
// images and the logo. A block or section can still change its own look;
// this is what it starts from.

import { FONTS } from '../../newsletter/fonts.js';
import { t } from '../../texts.js';
import { h, fill } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { field, row, numberInput, select, segmented, toggle, colourInput, accordion } from '../../ui/controls.js';

const TAGS = ['p', 'h1', 'h2', 'h3', 'h4'];
const LINE_HEIGHTS = ['1', '1.15', '1.2', '1.25', '1.3', '1.35', '1.4', '1.5', '1.6', '1.75', '2'];
const open = new Set(['background']);
let textTag = 'p';

export function createStylesPanel({ store, root, buttonStyles }) {
  function set(path, key) {
    return (value) => store.change((d) => {
      let target = d.styles;
      for (const part of path.slice(0, -1)) target = target[part];
      target[path[path.length - 1]] = value;
    }, { key: `styles.${key || path.join('.')}`, source: 'styles' });
  }

  const sections = {
    background: () => {
      const b = store.design.styles.background;
      return h('div', {},
        field(t('styles.contentColour'), colourInput(b.content, set(['background', 'content']))),
        field(t('styles.pageColour'), colourInput(b.page, set(['background', 'page']))),
        field(t('styles.margin'), numberInput(b.margin, set(['background', 'margin']), { max: 80 }), t('styles.marginHint')),
        field(t('styles.mobilePadding'), numberInput(b.mobilePadding, set(['background', 'mobilePadding']), { min: 0, max: 40 }), t('styles.mobilePaddingHint')));
    },

    text: () => {
      const box = h('div', {});
      const draw = () => {
        const s = store.design.styles.text[textTag];
        const p = ['text', textTag];
        fill(box, 
          segmented(TAGS.map((tag) => ({ value: tag, label: tag === 'p' ? 'P' : tag.toUpperCase(), title: t(`tt.format.${tag}`) })), textTag, (v) => {
            textTag = v;
            draw();
          }, { label: t('styles.textKind') }),
          row(
            field(t('styles.font'), select(FONTS.map((f) => ({ value: f.id, label: f.label })), s.font, set([...p, 'font']))),
            field(t('styles.letterSpacing'), numberInput(s.letterSpacing || 0, set([...p, 'letterSpacing']), { min: -2, max: 10 })),
          ),
          row(
            segmented(['left', 'center', 'right'].map((a) => ({
              value: a, title: t(`align.${a}`), icon: icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 18),
            })), s.align || 'left', set([...p, 'align']), { label: t('settings.align') }),
            segmented([
              { value: 'bold', title: t('tt.bold'), icon: icon('bold', 18) },
            ], s.bold ? 'bold' : '', () => {
              set([...p, 'bold'])(!store.design.styles.text[textTag].bold);
              draw();
            }, { label: t('tt.bold') }),
            segmented([
              { value: 'italic', title: t('tt.italic'), icon: icon('italic', 18) },
            ], s.italic ? 'italic' : '', () => {
              set([...p, 'italic'])(!store.design.styles.text[textTag].italic);
              draw();
            }, { label: t('tt.italic') }),
          ),
          field(t('styles.textColour'), colourInput(s.color, set([...p, 'color']))),
          row(
            field(t('styles.size'), numberInput(s.size, set([...p, 'size']), { min: 8, max: 72 })),
            field(t('styles.mobileSize'), numberInput(s.mobileSize || s.size, set([...p, 'mobileSize']), { min: 8, max: 72 })),
          ),
          row(
            field(t('styles.lineHeight'), select(LINE_HEIGHTS.map((v) => ({ value: v, label: v })), String(s.lineHeight), (v) => set([...p, 'lineHeight'])(Number(v)))),
            field(t('styles.spacing'), numberInput(s.spacing, set([...p, 'spacing']), { min: 0, max: 60 })),
          ),
        );
      };
      draw();
      return box;
    },

    link: () => {
      const l = store.design.styles.link;
      return h('div', {},
        field(t('styles.linkColour'), colourInput(l.color, set(['link', 'color']))),
        toggle(l.underline, set(['link', 'underline']), t('styles.underline')));
    },

    button: () => h('div', {}, ...buttonStyles(null, store.design.styles.button, (name) => set(['button', name]))),

    divider: () => {
      const d = store.design.styles.divider;
      return h('div', {},
        field(t('settings.lineStyle'), segmented(['solid', 'dashed', 'dotted'].map((s) => ({ value: s, label: t(`border.${s}`) })), d.line, set(['divider', 'line']))),
        row(
          field(t('settings.lineColour'), colourInput(d.color, set(['divider', 'color']))),
          field(t('settings.thickness'), numberInput(d.thickness, set(['divider', 'thickness']), { min: 1, max: 12 })),
        ),
        row(
          field(t('control.top'), numberInput(d.paddingTop, set(['divider', 'paddingTop']), { max: 80 })),
          field(t('control.bottom'), numberInput(d.paddingBottom, set(['divider', 'paddingBottom']), { max: 80 })),
        ));
    },

    image: () => {
      const i = store.design.styles.image;
      return h('div', {},
        field(t('settings.align'), segmented(['left', 'center', 'right'].map((a) => ({
          value: a, title: t(`align.${a}`), icon: icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 18),
        })), i.align, set(['image', 'align']))),
        field(t('settings.radius'), numberInput(i.radius, set(['image', 'radius']), { max: 60 })),
        field(t('settings.borderStyle'), select(['none', 'solid', 'dashed', 'dotted'].map((s) => ({ value: s, label: t(`border.${s}`) })), i.borderStyle, set(['image', 'borderStyle']))),
        row(
          field(t('settings.borderWidth'), numberInput(i.borderWidth, set(['image', 'borderWidth']), { max: 20 })),
          field(t('settings.borderColour'), colourInput(i.borderColor, set(['image', 'borderColor']))),
        ));
    },

    logo: () => h('div', {},
      field(t('settings.align'), segmented(['left', 'center', 'right'].map((a) => ({
        value: a, title: t(`align.${a}`), icon: icon(a === 'left' ? 'alignLeft' : a === 'center' ? 'alignCenter' : 'alignRight', 18),
      })), store.design.styles.logo.align, set(['logo', 'align'])))),
  };

  function render() {
    fill(root, 
      h('h2', { class: 'panel-title' }, t('styles.title')),
      h('p', { class: 'panel-lead' }, t('styles.lead')),
      ...Object.keys(sections).map((name) => accordion(t(`styles.${name}`), sections[name], {
        open: open.has(name),
        onToggle: (now) => (now ? open.add(name) : open.delete(name)),
      })),
    );
  }

  store.on('change', ({ source }) => {
    if (source === 'history' || source === 'replace') render();
  });
  return { render };
}

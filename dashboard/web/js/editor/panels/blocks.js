// Lohkot: the content blocks to drag into the email, the picked articles not
// in it yet, and the column layouts, as Mailchimp's Blocks panel has them.

import {
  textBlock, headingBlock, imageBlock, buttonBlock, dividerBlock, spacerBlock, videoBlock, socialBlock,
  logoBlock, footerBlock, columnsBlock, articleBlock, articleIds, LAYOUTS,
} from '../../newsletter/model.js';
import { placeArticles, SECTION_NAMES } from '../../newsletter/templates.js';
import { t, tn } from '../../texts.js';
import { h, fill } from '../../ui/dom.js';
import { icon, columnsIcon } from '../../ui/icons.js';

const CONTENT = [
  { type: 'image', iconName: 'image', create: () => imageBlock() },
  { type: 'heading', iconName: 'heading', create: () => headingBlock('', 2) },
  { type: 'paragraph', iconName: 'paragraph', create: () => textBlock('<p></p>') },
  { type: 'button', iconName: 'button', create: () => buttonBlock() },
  { type: 'divider', iconName: 'divider', create: () => dividerBlock() },
  { type: 'spacer', iconName: 'spacer', create: () => spacerBlock() },
  { type: 'video', iconName: 'video', create: () => videoBlock() },
  { type: 'social', iconName: 'social', create: () => socialBlock() },
  { type: 'logo', iconName: 'logo', create: () => logoBlock() },
  { type: 'footer', iconName: 'footer', create: () => footerBlock() },
];

export function createBlocksPanel({ store, dnd, root, context, actions }) {
  function tile(item) {
    const label = t(`tile.${item.type}`);
    const el = h('button', { type: 'button', class: 'bp-tile', title: t('blocks.tileHint', { name: label }) },
      h('span', { class: 'bp-tile-icon', html: icon(item.iconName, 22) }), h('span', { class: 'bp-tile-label' }, label));
    el.addEventListener('pointerdown', (event) => dnd.begin(event, {
      kind: 'new',
      blockType: item.create().type,
      label,
      iconName: item.iconName,
      create: item.create,
    }));
    // Enter or space on a focused tile adds it, like a click.
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        dnd.click({ kind: 'new', blockType: item.create().type, create: item.create });
      }
    });
    return el;
  }

  function columnsTile(layout) {
    const label = layout === '1' ? t('blocks.oneColumn') : layout;
    const el = h('button', { type: 'button', class: 'bp-cols', title: t('blocks.columnsHint', { name: label }) },
      h('span', { html: columnsIcon(LAYOUTS[layout], 34) }), h('span', {}, label));
    el.addEventListener('pointerdown', (event) => dnd.begin(event, {
      kind: 'new', blockType: 'columns', label: t('blocks.columns', { layout: label }), iconName: 'sections',
      create: () => columnsBlock(layout),
    }));
    return el;
  }

  function placeOne(article) {
    let added = [];
    store.change((d) => { added = placeArticles(d, [article]); });
    if (added[0]) {
      store.select({ kind: 'block', id: added[0].id });
      actions.reveal(added[0].id);
    }
  }

  function articleRow(article) {
    const el = h('div', { class: 'bp-article', tabindex: '0', role: 'button', title: t('blocks.articleHint') },
      h('span', { class: 'bp-article-icon', html: icon('article', 18) }),
      h('span', { class: 'bp-article-text' },
        h('span', { class: 'bp-article-title' }, article.title_fi || article.title),
        h('span', { class: 'bp-article-meta' }, `${SECTION_NAMES[article.section] || ''}${article.publisher ? ` · ${article.publisher}` : ''}`)));
    el.addEventListener('pointerdown', (event) => dnd.begin(event, {
      kind: 'new', blockType: 'article', label: (article.title_fi || article.title).slice(0, 40), iconName: 'article',
      create: () => articleBlock(article, article.section),
      onClick: () => placeOne(article),
    }));
    el.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        placeOne(article);
      }
    });
    return el;
  }

  function render() {
    const placed = articleIds(store.design);
    const waiting = context.articles.filter((a) => !placed.has(Number(a.id)));
    fill(root, 
      h('a', { class: 'bp-help', href: '#', onclick: (e) => { e.preventDefault(); actions.help(); } }, h('span', { html: icon('info', 16) }), ` ${t('blocks.help')}`),
      h('h2', { class: 'panel-title' }, t('blocks.title')),
      h('p', { class: 'panel-lead' }, t('blocks.lead')),
      h('div', { class: 'bp-grid' }, CONTENT.map(tile)),
      h('h3', { class: 'panel-subtitle' }, t('blocks.articles'), waiting.length ? h('span', { class: 'count' }, String(waiting.length)) : null),
      h('p', { class: 'panel-lead' }, context.articles.length === 0 ? t('blocks.noneTicked')
        : waiting.length ? t('blocks.articlesLead') : t('blocks.allPlaced')),
      waiting.length ? h('div', { class: 'bp-articles' }, waiting.map(articleRow)) : null,
      waiting.length > 1 ? h('button', { type: 'button', class: 'btn ghost small bp-add-all', onclick: () => {
        store.change((d) => placeArticles(d, waiting));
        actions.toast(tn('blocks.addedAll', waiting.length));
      } }, t('blocks.addAll')) : null,
      h('h3', { class: 'panel-subtitle' }, t('blocks.columnsTitle')),
      h('p', { class: 'panel-lead' }, t('blocks.columnsLead')),
      h('div', { class: 'bp-cols-grid' }, ['1', '1:1', '1:1:1', '1:1:1:1', '1:2', '2:1', '1:3', '3:1'].map(columnsTile)),
    );
  }

  store.on('change', ({ source }) => {
    if (source !== 'canvas') render();
  });
  return { render };
}

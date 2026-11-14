import { esc, fileName, int } from './format.js';
import { GLOSSARY } from '../enums/glossary.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)} ↗</a>`;

// A dotted word that shows its plain meaning when tapped, clicked or focused (handler in app.js). Help sits where the
// word is, instead of in a tutorial readers skip.
export const term = (key, text = GLOSSARY[key].word) => `<button type="button" class="term" data-term="${esc(key)}">${esc(text)}</button>`;

// "5 of 22" drawn as 22 small squares with 5 filled. Readers who find numbers hard read these better than a fraction
// (Galesic et al. 2009). `cls` picks the fill colour: warn, ok or nothing for the accent.
export function squares(on, total, cls = '') {
  if (!(total > 0 && total <= 200)) return '';
  return `<span class="squares ${cls}" role="img" aria-label="${on} of ${total}">${'<i class="on"></i>'.repeat(on)}${'<i></i>'.repeat(total - on)}</span>`;
}

// One source link per card: "Source ↗", or "Sources: 1 ↗ 2 ↗" when there are several files.
export function sourcesLink(list) {
  if (list.length === 1) return ext(list[0].url, 'Source');
  return `Sources: ${list.map((s, i) => `<a href="${esc(s.url)}" target="_blank" rel="noopener" title="${esc(s.name)}">${i + 1} ↗</a>`).join(' ')}`;
}

// Long lists show their first rows and a "Show all" button. Hidden rows carry data-more; app.js reveals them.
export const more = (i, limit) => (limit && i >= limit ? ' hidden data-more' : '');
export const showAll = (count, limit, noun = 'rows') => (limit && count > limit
  ? `<button type="button" class="btn small secondary show-all" data-show-all>Show all ${int(count)} ${noun}</button>` : '');

// The box under a chart that holds its filters, so the chart comes first and the choices come after.
export const changeBox = (html, label = 'Change what’s shown') => `<div class="change"><h3 class="change-title">${label}</h3><div class="controls">${html}</div></div>`;

// One evidence reference: the archive file (on GitHub), where in it, the quote, and the original source URL.
export function sourceHtml(src) {
  if (!src || !src.doc) return '';
  const where = src.loc ? ` <span class="muted">· ${esc(src.loc)}</span>` : '';
  const orig = src.url ? ` · ${ext(src.url, 'original source')}` : '';
  const quote = src.quote ? `<blockquote>${esc(src.quote)}</blockquote>` : '';
  return `<div class="src">Archive file: <a href="${esc(src.github)}" target="_blank" rel="noopener">${esc(fileName(src.doc))}</a>${where}${orig}${quote}</div>`;
}

// A chart with the three lines a reader needs: a sentence saying what it shows, how to read it, and where the data
// comes from. title, how and src are HTML. Views that redraw call caption() to update the first two.
export function figure(id, { title = '', how = '', src = '', cls = '' } = {}) {
  return `<figure class="panel fig">
    <h3 class="fig-title" id="${id}-title">${title}</h3>
    <p class="fig-how" id="${id}-how">${how}</p>
    <div id="${id}" class="chart ${cls}" role="img" aria-labelledby="${id}-title ${id}-how"></div>
    ${src ? `<p class="fig-src">Source: ${src}</p>` : ''}
  </figure>`;
}

export function caption(root, id, title, how) {
  $(`#${id}-title`, root).innerHTML = title;
  if (how != null) $(`#${id}-how`, root).innerHTML = how;
}

export function table(cols, rows, { empty = 'Nothing to show.', limit = 0 } = {}) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}" scope="col">${esc(c.label)}</th>`).join('');
  const body = rows.map((r, i) => `<tr${more(i, limit)}>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.value(r))}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${showAll(rows.length, limit)}`;
}

export const options = (items, selected) => items.map(([v, label]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');

export function setParams(params) {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  history.replaceState(null, '', `#/${path}${qs ? `?${qs}` : ''}`);
}

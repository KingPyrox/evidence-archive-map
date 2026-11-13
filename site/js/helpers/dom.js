import { esc, fileName } from './format.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const ext = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)} ↗</a>`;

// One evidence reference: the archive file (on GitHub), where in it, the quote, and the original source URL.
export function sourceHtml(src) {
  if (!src || !src.doc) return '';
  const where = src.loc ? ` <span class="muted">· ${esc(src.loc)}</span>` : '';
  const orig = src.url ? ` · ${ext(src.url, 'original source')}` : '';
  const quote = src.quote ? `<blockquote>${esc(src.quote)}</blockquote>` : '';
  return `<div class="src">Archive file: <a href="${esc(src.github)}" target="_blank" rel="noopener">${esc(fileName(src.doc))}</a>${where}${orig}${quote}</div>`;
}

export function table(cols, rows, { empty = 'Nothing to show.' } = {}) {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}" scope="col">${esc(c.label)}</th>`).join('');
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.html ? c.html(r) : esc(c.value(r))}</td>`).join('')}</tr>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export const options = (items, selected) => items.map(([v, label]) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');

export function setParams(params) {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  history.replaceState(null, '', `#/${path}${qs ? `?${qs}` : ''}`);
}

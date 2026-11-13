import { esc, fileName } from './format.js';
import { icon } from './icons.js';
import { PAGES } from '../enums/pages.js';
import { GLOSSARY } from '../enums/glossary.js';

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

// "In short": the two or three things a reader should take away, above everything else on the page. Items are HTML.
export const inShort = (items) => `<section class="in-short" aria-labelledby="in-short-h"><h2 id="in-short-h">In short</h2>
  <ul>${items.filter(Boolean).map((s) => `<li>${s}</li>`).join('')}</ul></section>`;

// A glossary word with its meaning shown on hover, tap or keyboard focus. The About page lists every word.
export function term(key, text) {
  const g = GLOSSARY[key];
  return `<span class="term" tabindex="0">${esc(text || g.word)}<span class="tip" role="tooltip">${esc(g.means)}</span></span>`;
}

// One question card. The whole card is a link (the heading link stretches over it); the source links stay clickable
// above it. With a finding it shows the number; without one it shows the page's description.
export function qCard(key, { question, num, text, src, href } = {}) {
  const p = PAGES[key];
  return `<article class="q-card t-${key}">
    <span class="q-icon">${icon(p.icon)}</span>
    <h3><a href="${href || `#/${key}`}">${esc(question || p.question)}</a></h3>
    ${num ? `<p class="q-num"><b>${esc(num)}</b> ${esc(text)}</p>` : `<p class="q-blurb">${esc(p.blurb)}</p>`}
    ${src ? `<p class="q-src">Source: ${src}</p>` : ''}
    <span class="q-go" aria-hidden="true">${esc(p.label)} ${icon('arrow')}</span>
  </article>`;
}

// "On this page" jump links. The hash holds the route, so plain #id links can't be used: app.js scrolls to data-go.
export function onPage(items) {
  const [path] = location.hash.replace(/^#\/?/, '').split('?');
  return `<nav class="on-page" aria-label="On this page"><span class="on-page-label">On this page</span>
    ${items.map(([id, label], i) => `<a href="#/${path}?go=${id}" data-go="${id}"><span class="step">${i + 1}</span>${esc(label)}</a>`).join('')}</nav>`;
}

export const nextSteps = (keys) => `<nav class="next" aria-labelledby="next-h"><h2 id="next-h">Where to next</h2>
  <div class="q-grid">${keys.map((k) => qCard(k)).join('')}</div></nav>`;

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

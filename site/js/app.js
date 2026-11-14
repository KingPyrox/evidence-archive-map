import { esc } from './helpers/format.js';
import { GLOSSARY } from './enums/glossary.js';
import { disposeAll } from './helpers/chart.js';
import { load } from './services/data.js';
import * as overview from './views/overview.js';
import * as map from './views/map.js';
import * as money from './views/money.js';
import * as spending from './views/spending.js';
import * as lobbying from './views/lobbying.js';
import * as ownership from './views/ownership.js';
import * as timeline from './views/timeline.js';
import * as survey from './views/survey.js';
import * as sources from './views/sources.js';
import * as about from './views/about.js';
import * as search from './views/search.js';

const ROUTES = { '': overview, map, money, spending, lobbying, ownership, timeline, survey, sources, about, search };
const root = document.getElementById('app');
let lastPath = null;

async function route() {
  const [path = '', qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const view = ROUTES[path] ?? overview;
  const params = Object.fromEntries(new URLSearchParams(qs));
  disposeAll();
  root.innerHTML = '<p class="loading">Loading…</p>';
  document.querySelectorAll('nav.main-nav a').forEach((a) => {
    const on = a.dataset.route === (ROUTES[path] ? path : '');
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try {
    await view.render(root, params);
    document.title = `${view.title ? `${view.title} · ` : ''}Evidence Archive Map`;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="error"><b>Something went wrong.</b> ${esc(e.message)}</div>`;
  }
  if (path !== lastPath) {
    window.scrollTo(0, 0);
    lastPath = path;
  }
}

async function footer() {
  const s = await load('summary');
  const sha = s.source_commit ? ` at commit <a href="${esc(s.source_repo)}/tree/${esc(s.source_commit)}" target="_blank" rel="noopener"><code>${esc(s.source_commit.slice(0, 7))}</code></a>` : '';
  document.getElementById('footer').insertAdjacentHTML('beforeend', ` Data built ${esc(s.built.slice(0, 10))} from the archive${sha}.`);
}

window.addEventListener('hashchange', route);
route();
footer().catch(() => {});

// Dotted words (helpers/dom.js term()) show their meaning in one shared bubble under the word.
const pop = document.createElement('div');
pop.id = 'term-pop';
pop.setAttribute('role', 'tooltip');
pop.hidden = true;
document.body.append(pop);
let shown = null;
function showTerm(b) {
  const g = GLOSSARY[b.dataset.term];
  if (!g) return;
  pop.innerHTML = `<b>${esc(g.word)}:</b> ${esc(g.means)}`;
  pop.hidden = false;
  const r = b.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + window.scrollX), window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${r.bottom + window.scrollY + 6}px`;
  b.setAttribute('aria-describedby', 'term-pop');
  b.setAttribute('aria-expanded', 'true');
  shown = b;
}
function hideTerm() {
  if (!shown) return;
  pop.hidden = true;
  shown.removeAttribute('aria-describedby');
  shown.setAttribute('aria-expanded', 'false');
  shown = null;
}
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.term');
  if (b) { if (b === shown) hideTerm(); else showTerm(b); return; }
  if (!ev.target.closest('#term-pop')) hideTerm();
  // "Show all" reveals the rows hidden in the list just before it (helpers/dom.js showAll()).
  const all = ev.target.closest('[data-show-all]');
  if (all) {
    all.previousElementSibling.querySelectorAll('[data-more]').forEach((x) => { x.hidden = false; x.removeAttribute('data-more'); });
    all.remove();
  }
});
document.addEventListener('focusin', (ev) => { const b = ev.target.closest?.('.term'); if (b) showTerm(b); else hideTerm(); });
document.addEventListener('mouseover', (ev) => { const b = ev.target.closest?.('.term'); if (b && b !== shown) showTerm(b); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideTerm(); });
window.addEventListener('hashchange', hideTerm);

import { esc } from './helpers/format.js';
import { disposeAll } from './helpers/chart.js';
import { nextSteps } from './helpers/dom.js';
import { icon } from './helpers/icons.js';
import { load } from './services/data.js';
import { PAGES } from './enums/pages.js';
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
const nav = document.getElementById('main-nav');
const menuBtn = document.getElementById('menu-btn');
let lastPath = null;

// The menu is grouped by what a reader wants to know, and built from PAGES so names match everywhere on the site.
function buildNav() {
  const groups = new Map();
  Object.entries(PAGES).filter(([k]) => k !== 'search').forEach(([k, p]) => {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group).push([k, p]);
  });
  nav.innerHTML = `<div class="nav-group"><span class="nav-label">Start</span><div class="nav-links"><a href="#/" data-route="">Home</a></div></div>
    ${[...groups].map(([g, ps]) => `<div class="nav-group"><span class="nav-label">${esc(g)}</span><div class="nav-links">${ps.map(([k, p]) => `<a href="#/${k}" data-route="${k}">${esc(p.label)}</a>`).join('')}</div></div>`).join('')}`;
}

function setMenu(open) {
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
}

async function route() {
  const [path = '', qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const known = ROUTES[path] ? path : '';
  const view = ROUTES[known];
  const params = Object.fromEntries(new URLSearchParams(qs));
  const page = PAGES[known];
  disposeAll();
  setMenu(false);
  root.innerHTML = '<p class="loading">Loading…</p>';
  document.querySelectorAll('[data-route]').forEach((a) => {
    const on = a.dataset.route === known;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  try {
    await view.render(root, params);
    if (page) {
      // Section label above the title, and three next pages at the bottom, on every page but Home.
      root.querySelector('h1')?.insertAdjacentHTML('beforebegin', `<p class="eyebrow t-${known}">${icon(page.icon)}<span>${esc(page.group)}</span></p>`);
      root.insertAdjacentHTML('beforeend', nextSteps(page.next));
    }
    document.title = `${view.title ? `${view.title} · ` : ''}Evidence Archive Map`;
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="error"><b>Something went wrong.</b> ${esc(e.message)}</div>`;
  }
  if (path !== lastPath) {
    window.scrollTo(0, 0);
    lastPath = path;
  }
  if (params.go) goTo(params.go);
}

// In-page jumps ("On this page" links and ?go= in a link): scroll to the section and move keyboard focus there.
function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

async function footer() {
  const s = await load('summary');
  const sha = s.source_commit ? ` (commit <a href="${esc(s.source_repo)}/tree/${esc(s.source_commit)}" target="_blank" rel="noopener"><code>${esc(s.source_commit.slice(0, 7))}</code></a>)` : '';
  document.getElementById('footer').innerHTML = `Last rebuilt from the archive on ${esc(s.built.slice(0, 10))}${sha}. The site checks the archive for changes once a day.
    Found a mistake? <a href="https://github.com/KingPyrox/evidence-archive-map/issues" target="_blank" rel="noopener">Report it on GitHub</a>.`;
}

buildNav();
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open')));
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[data-go]');
  if (!a || !document.getElementById(a.dataset.go)) return;
  ev.preventDefault();
  goTo(a.dataset.go);
});
window.addEventListener('hashchange', route);
route();
footer().catch(() => {});

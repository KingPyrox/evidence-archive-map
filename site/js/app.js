import { esc } from './helpers/format.js';
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

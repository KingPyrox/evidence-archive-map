import { loadAll } from '../services/data.js';
import { esc, int, fileName, nameCase } from '../helpers/format.js';
import { $, setParams } from '../helpers/dom.js';
import { NODE_TYPES } from '../enums/kinds.js';

export const title = 'Search';

const PER_GROUP = 8;

// Every name on the site, each pointing at the page that explains it.
function index({ g, est, own, lob, src }) {
  const items = [];
  const add = (group, name, note, href) => items.push({ group, name, note, href, key: name.toLowerCase() });
  g.nodes.forEach((n) => add('On the connection map', n.label, NODE_TYPES[n.type]?.label || '', `#/map?case=all&node=${encodeURIComponent(n.id)}`));
  Object.keys(est.orgs).forEach((o) => add('Federal departments and agencies', o, 'Budget in every spending plan', `#/spending?org=${encodeURIComponent(o)}`));
  [...new Set(lob.records.map((r) => r.client))].forEach((c) => add('Lobbying clients', c, 'Companies that registered lobbying', `#/lobbying?client=${encodeURIComponent(c)}`));
  [...new Set(lob.records.flatMap((r) => r.institutions))].forEach((i) => add('Offices that were lobbied', i, 'Federal institutions named in lobbying records', `#/lobbying?inst=${encodeURIComponent(i)}`));
  [...new Map(own.flat.map((n) => [nameCase(n.name), n])).entries()].forEach(([name, n]) => add('Companies in the Brookfield group', name, n.level === 1 ? 'Top of the group' : `${n.level - 1} level${n.level === 2 ? '' : 's'} below Brookfield`, `#/ownership?q=${encodeURIComponent(name)}`));
  src.files.forEach((f) => add('Archive files', fileName(f.path), f.path, `#/sources?q=${encodeURIComponent(fileName(f.path))}`));
  return items;
}

export async function render(root, params) {
  const [g, est, own, lob, src] = await loadAll('graph', 'estimates', 'ownership', 'lobbying', 'sources');
  const items = index({ g, est, own, lob, src });
  const groups = [...new Set(items.map((x) => x.group))];
  const state = { q: params.q || '', open: new Set() };

  root.innerHTML = `
    <h1>Search the archive</h1>
    <p class="lead">Type a name: a person, a company, a federal department or a file. Results are grouped by what they are,
      and each one opens the page that explains it.</p>
    <form class="big-search" role="search" id="q-form">
      <label for="q-in" class="sr-only">Search</label>
      <input id="q-in" type="search" value="${esc(state.q)}" placeholder="e.g. IRCC, Telesat, Enercare, UNHCR" autocomplete="off">
      <button class="btn" type="submit">Search</button>
    </form>
    <p class="small muted">Searching ${int(items.length)} names across ${groups.length} kinds of record.</p>
    <div id="q-out" aria-live="polite"></div>`;

  function draw() {
    setParams({ q: state.q });
    const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || state.q.trim().length < 2) {
      $('#q-out', root).innerHTML = `<div class="panel"><p><b>Not sure where to start?</b> Try one of these:</p>
        <div class="btn-row">${['IRCC', 'Telesat', 'UNHCR', 'Enercare', 'Estimates'].map((w) => `<button class="chip" type="button" data-try="${w}">${w}</button>`).join('')}</div></div>`;
      return;
    }
    const hits = items.filter((x) => words.every((w) => x.key.includes(w)))
      .sort((a, b) => Number(!a.key.startsWith(words[0])) - Number(!b.key.startsWith(words[0])) || a.name.length - b.name.length);
    if (!hits.length) {
      $('#q-out', root).innerHTML = `<div class="panel"><p>No names match “${esc(state.q)}”. Try fewer letters, or one word of the name.</p></div>`;
      return;
    }
    $('#q-out', root).innerHTML = `<p><b>${int(hits.length)}</b> result${hits.length === 1 ? '' : 's'}</p>${groups.map((gr) => {
      const hs = hits.filter((x) => x.group === gr);
      if (!hs.length) return '';
      const shown = state.open.has(gr) ? hs : hs.slice(0, PER_GROUP);
      return `<section class="panel q-group"><h2>${esc(gr)} <span class="count">${int(hs.length)}</span></h2>
        <ul class="q-list">${shown.map((x) => `<li><a href="${x.href}">${esc(x.name)}</a><span class="muted small">${esc(x.note)}</span></li>`).join('')}</ul>
        ${hs.length > shown.length ? `<button class="btn small secondary" type="button" data-more="${esc(gr)}">Show all ${int(hs.length)}</button>` : ''}</section>`;
    }).join('')}`;
  }

  $('#q-form', root).addEventListener('submit', (ev) => { ev.preventDefault(); state.q = $('#q-in', root).value; draw(); });
  $('#q-in', root).addEventListener('input', (ev) => { state.q = ev.target.value; state.open.clear(); draw(); });
  $('#q-out', root).addEventListener('click', (ev) => {
    const more = ev.target.closest('[data-more]');
    const tryIt = ev.target.closest('[data-try]');
    if (more) { state.open.add(more.dataset.more); draw(); }
    if (tryIt) { state.q = tryIt.dataset.try; $('#q-in', root).value = state.q; draw(); }
  });
  draw();
  $('#q-in', root).focus();
}

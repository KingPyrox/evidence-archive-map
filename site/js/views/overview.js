import { loadAll, load } from '../services/data.js';
import { esc, int, date, bytes, countWord, listWords, moneyShort, fileName } from '../helpers/format.js';
import { ext, qCard } from '../helpers/dom.js';
import { icon } from '../helpers/icons.js';
import { EDGE_KINDS } from '../enums/kinds.js';
import { PAGES } from '../enums/pages.js';

// The question cards on the home page, in the order most readers look for them.
const ASK = ['money', 'spending', 'lobbying', 'ownership', 'map', 'timeline', 'survey', 'sources'];

export const title = '';

// Each finding is worked out from the data, so it stays true when the archive changes. If a finding's data is missing
// or has changed shape, that finding is left out and the rest of the page still renders.
const FINDINGS = [
  ({ est }) => {
    const ri = est.recovery_index;
    return {
      num: `${ri.catalogue_missing.length} of ${est.rounds.length}`,
      text: "rounds of federal Estimates in the archive have no open.canada.ca catalogue record, the archive's recovery index says.",
      src: ext(ri.url, fileName(ri.file)), href: '#/spending', page: 'spending', see: 'See the recovered Estimates',
    };
  },
  ({ est }) => {
    const top = est.transfers.reduce((a, t) => (t.moved > a.moved ? t : a));
    return {
      num: moneyShort(top.moved),
      text: `moved between federal departments in the ${top.key} Supplementary Estimates, the most of the ${est.transfers.length} rounds that include the transfers table.`,
      src: ext(est.url, fileName(est.file)), href: `#/money?round=${encodeURIComponent(top.key)}`, page: 'money', see: 'See where it went',
    };
  },
  ({ g }) => {
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    const grants = g.edges.filter((e) => e.from === 'org:ircc' && e.money_kind === 'grant');
    if (!grants.length) return null;
    const to = [...new Set(grants.map((e) => byId[e.to].label))];
    const docs = [...new Map(grants.map((e) => [e.src.doc, e.src.github])).entries()];
    return {
      num: moneyShort(grants.reduce((a, e) => a + e.amount, 0)),
      text: `in IRCC grants to ${listWords(to)}, in ${countWord(grants.length, 'amended grant record').toLowerCase()} in the immigration case.`,
      src: docs.map(([doc, url]) => ext(url, fileName(doc))).join(' '), href: '#/money?go=grants', page: 'money', see: 'See the grants',
    };
  },
  ({ lob }) => {
    const n = new Map();
    lob.records.forEach((r) => r.institutions.forEach((i) => n.set(i, (n.get(i) || 0) + 1)));
    const [inst, count] = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      num: int(lob.records.length),
      text: `Lobbying Registry records in ${countWord(lob.datasets.length, 'table').toLowerCase()}. The institution named most often is ${inst}, in ${count}.`,
      src: lob.datasets.map((d) => ext(d.url, fileName(d.file))).join(' '), href: '#/lobbying', page: 'lobbying', see: 'Explore the records',
    };
  },
  ({ own }) => {
    const st = own.stats;
    return {
      num: int(st.direct_children),
      text: `companies are held directly by Brookfield Corporation, in a published structure of ${int(st.links)} ownership links up to ${Math.max(...Object.keys(st.by_level).map(Number)) - 1} levels deep.`,
      src: ext(own.url, fileName(own.file)), href: '#/ownership', page: 'ownership', see: 'Open the ownership diagram',
    };
  },
  ({ sv }) => {
    const answers = sv.rows.filter((r) => r.published_pct != null);
    const match = answers.filter((r) => Math.round(r.weighted_pct) === r.published_pct).length;
    return {
      num: match === answers.length ? `All ${match}` : `${match} of ${answers.length}`,
      text: "of StatCan's published survey percentages come out exactly when the raw survey file is weighted as StatCan's guide says. The archive's spreadsheet counts raw answers instead.",
      src: ext(sv.zip_url, 'survey file (zip)'), href: '#/survey', page: 'survey', see: 'See the check step by step',
    };
  },
];

const optional = (name) => load(name).catch(() => null);

export async function render(root) {
  const [s, g] = await loadAll('summary', 'graph');
  const [est, lob, own, sv] = await Promise.all(['estimates', 'lobbying', 'ownership', 'survey'].map(optional));
  const data = { s, g, est, lob, own, sv };
  const found = FINDINGS.map((f) => { try { return f(data); } catch { return null; } }).filter(Boolean);
  const c = s.counts;
  const evidenceEdges = g.edges.filter((e) => !e.layer).length;
  const passed = s.checks.filter((k) => k.pass).length;
  const failed = s.checks.filter((k) => !k.pass);
  const fresh = s.new_in_archive || { cases: [], lobbying_tables: [] };
  const freshCases = s.cases.filter((x) => fresh.cases.includes(x.id));

  root.innerHTML = `
    <section class="hero">
      <p class="hero-kicker">${icon('book')} Built on Vesper Digital's Evidence-Archive</p>
      <h1>Where the money goes, and who is connected.</h1>
      <p class="lead">Vesper Digital collected federal budget tables, grant records, lobbying records, a corporate ownership
        table and survey data, and published them in the <a href="${esc(s.source_repo)}" target="_blank" rel="noopener">Evidence-Archive</a>.
        This site turns those files into charts anyone can read. Every number links to the document it came from.</p>
      <form class="big-search" role="search" id="home-search">
        <label for="home-q" class="sr-only">Search a name</label>
        <input id="home-q" type="search" placeholder="Search a person, company or department" autocomplete="off">
        <button class="btn" type="submit">Search</button>
      </form>
      <p class="hero-meta">${countWord(s.cases.length).toLowerCase()} cases · ${int(c.files)} files · rebuilt ${esc(date(s.built.slice(0, 10)))}</p>
    </section>

    <h2 class="section-h">What do you want to know?</h2>
    <div class="q-grid">${ASK.map((k) => qCard(k)).join('')}</div>

    <h2 class="section-h">What the documents show</h2>
    <p class="muted small">Each number is counted from the archive's files every time the site is rebuilt, so it stays true when the archive changes.</p>
    <div class="findings">${found.map((f) => `<article class="finding t-${f.page}">
      <span class="f-icon">${icon(PAGES[f.page].icon)}</span>
      <b>${esc(f.num)}</b>
      <p>${esc(f.text)}</p>
      <p class="f-go"><a href="${f.href}">${esc(f.see)} ${icon('arrow')}</a></p>
      <p class="q-src">Source: ${f.src}</p>
    </article>`).join('')}</div>

    ${freshCases.length || fresh.lobbying_tables.length ? `
    <h2 class="section-h">New in the archive, not mapped yet</h2>
    <div class="panel">
      <p>Vesper added these since the connection map was last checked by hand. Their files, dates and charts are
        already on this site. Links between people and organizations are only drawn after someone reads the documents.</p>
      <ul>${freshCases.map((x) => `<li><b>${esc(x.title)}</b> · ${x.files.length} files · <a href="#/sources?case=${encodeURIComponent(x.id)}">Files</a></li>`).join('')}
        ${fresh.lobbying_tables.length ? `<li>${countWord(fresh.lobbying_tables.length, 'lobbying table')}, charted on <a href="#/lobbying">Lobbying</a></li>` : ''}</ul>
    </div>` : ''}

    <h2 class="section-h">Vesper's cases</h2>
    <p class="muted small">Each case is a folder in the archive with its own video. Open one on the map, the timeline, or as a list of files.</p>
    <div class="case-grid">${s.cases.map(caseCard).join('')}</div>

    <h2 class="section-h">How this site works</h2>
    <details class="panel fold">
      <summary>How to read the connections</summary>
      <p>Every connection is one of three kinds of evidence. The map draws each kind differently.</p>
      <ul>${['data', 'stated', 'computed'].map((k) => `<li><span class="line-sample ${EDGE_KINDS[k].style}"></span><b>${esc(EDGE_KINDS[k].label)}.</b> ${esc(EDGE_KINDS[k].help)}</li>`).join('')}</ul>
      <p>A line between two names means a document in the archive connects them. It is not a finding of wrongdoing.</p>
      <p>Claims made in the archive (for example in video titles) are shown as <b>claims</b>, not facts. A claim links to the
        documents that support or test it.</p>
    </details>
    <details class="panel fold">
      <summary>Automatic checks: ${passed} of ${s.checks.length} passed</summary>
      <p>Each time the data is rebuilt, the build reads the archive again and checks that totals, counts and quoted figures
        agree with each other.</p>
      ${failed.length ? `<p><b>Differences found in the archive's own files:</b></p><ul>${failed.map((f) => `<li>${esc(f.name)}: expected ${esc(JSON.stringify(f.expected))}, found ${esc(JSON.stringify(f.actual))}. <span class="muted">${esc(f.note || '')}</span></li>`).join('')}</ul>` : ''}
      <a href="#/sources">See every check and source file</a>
    </details>
    <details class="panel fold">
      <summary>What this site is built from</summary>
      <div class="stats quiet">
        <div class="stat"><b>${int(c.files)}</b><span>files in the archive</span></div>
        <div class="stat"><b>${int(c.nodes)}</b><span>people, bodies, programs and datasets</span></div>
        <div class="stat"><b>${int(evidenceEdges)}</b><span>sourced evidence links</span></div>
        <div class="stat"><b>${int(c.lobbying_records)}</b><span>lobbying records</span></div>
        <div class="stat"><b>${int(c.ownership_links)}</b><span>Brookfield ownership links</span></div>
        <div class="stat"><b>${int(c.estimate_rounds)}</b><span>rounds of federal Estimates recovered</span></div>
        <div class="stat"><b>${int(c.external_links)}</b><span>original-source links</span></div>
      </div>
    </details>`;

  root.querySelector('#home-search').addEventListener('submit', (ev) => {
    ev.preventDefault();
    location.hash = `#/search?q=${encodeURIComponent(root.querySelector('#home-q').value.trim())}`;
  });
}

function caseCard(c) {
  const size = c.files.reduce((a, f) => a + f.size, 0);
  const folder = `https://github.com/Vesper-Digital/Evidence-Archive/tree/main/${encodeURIComponent(c.folder)}`;
  return `<article class="case-card">
    <h3>${esc(c.title)}${c.auto ? ' <span class="badge">New: not mapped yet</span>' : ''}</h3>
    <div class="meta">${c.date ? `Published ${esc(date(c.date))} · ` : ''}${c.files.length} files · ${bytes(size)}</div>
    <p>${esc(c.summary)}</p>
    <div class="btn-row">
      <a class="btn small" href="#/map?case=${encodeURIComponent(c.id)}">Map</a>
      <a class="btn small secondary" href="#/timeline?case=${encodeURIComponent(c.id)}">Timeline</a>
      <a class="btn small secondary" href="#/sources?case=${encodeURIComponent(c.id)}">Files</a>
    </div>
    <p class="small">${ext(folder, 'Archive folder')}${c.video_url ? ` · ${ext(c.video_url, c.auto ? 'Video' : `Video: “${c.headline}”`)}` : ''}</p>
  </article>`;
}

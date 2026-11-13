import { loadAll } from '../services/data.js';
import { esc, int, date, bytes } from '../helpers/format.js';
import { ext } from '../helpers/dom.js';
import { EDGE_KINDS } from '../enums/kinds.js';

export const title = '';

export async function render(root) {
  const [s, g] = await loadAll('summary', 'graph');
  const c = s.counts;
  const evidenceEdges = g.edges.filter((e) => !e.layer).length;
  const passed = s.checks.filter((k) => k.pass).length;
  const findings = s.checks.filter((k) => !k.pass);

  root.innerHTML = `
    <h1>Follow the documents.</h1>
    <p class="lead">This site maps the <a href="${esc(s.source_repo)}" target="_blank" rel="noopener">Evidence-Archive</a>
      repository: five investigations and supporting tables covering federal spending, immigration, defence and AI drones,
      lobbying, corporate ownership and a COVID-19 survey. It shows who connects to whom, where the money goes, and the exact
      file behind every fact so you can check it yourself.</p>
    <div class="btn-row">
      <a class="btn" href="#/map">Open the connection map</a>
      <a class="btn secondary" href="#/money">Follow the money</a>
      <a class="btn secondary" href="#/timeline">Read the timeline</a>
    </div>

    <div class="stats">
      <div class="stat"><b>${int(c.files)}</b><span>files in the archive</span></div>
      <div class="stat"><b>${int(c.nodes)}</b><span>people, bodies, programs and datasets</span></div>
      <div class="stat"><b>${int(evidenceEdges)}</b><span>sourced evidence links</span></div>
      <div class="stat"><b>${int(c.lobbying_records)}</b><span>lobbying records</span></div>
      <div class="stat"><b>${int(c.ownership_links)}</b><span>Brookfield ownership links</span></div>
      <div class="stat"><b>${int(c.estimate_rounds)}</b><span>rounds of federal Estimates recovered</span></div>
      <div class="stat"><b>${int(c.external_links)}</b><span>original-source links</span></div>
    </div>

    <h2>The five cases</h2>
    <div class="grid cols-2">${s.cases.map(caseCard).join('')}</div>

    <h2>How to read this site</h2>
    <div class="panel">
      <p>Every connection is one of three kinds of evidence. The map draws each kind differently.</p>
      <ul>${['data', 'stated', 'computed'].map((k) => `<li><span class="line-sample ${EDGE_KINDS[k].style}"></span><b>${esc(EDGE_KINDS[k].label)}.</b> ${esc(EDGE_KINDS[k].help)}</li>`).join('')}</ul>
      <p>Claims made in the archive (for example in video titles) are shown as <b>claims</b>, not facts. A claim links to the
        documents that support or test it.</p>
      <p class="muted small">Dates and amounts appear exactly as they do in the archive's documents.</p>
    </div>

    <h2>Automatic checks</h2>
    <div class="panel">
      <p><span class="badge ok">${passed} of ${s.checks.length} passed</span> Each time the data is rebuilt, the build re-reads the archive
        and checks that totals, counts and quoted figures agree with each other.</p>
      ${findings.length ? `<p><b>Discrepancies found in the archive's own files:</b></p><ul>${findings.map((f) => `<li>${esc(f.name)}: expected ${esc(JSON.stringify(f.expected))}, found ${esc(JSON.stringify(f.actual))}. <span class="muted">${esc(f.note || '')}</span></li>`).join('')}</ul>` : ''}
      <a href="#/sources">See every check and source file →</a>
    </div>`;
}

function caseCard(c) {
  const size = c.files.reduce((a, f) => a + f.size, 0);
  const folder = `https://github.com/Vesper-Digital/Evidence-Archive/tree/main/${encodeURIComponent(c.folder)}`;
  return `<article class="panel case-card">
    <h3>${esc(c.title)}</h3>
    <div class="meta">Published in the archive ${esc(date(c.date))} · ${c.files.length} files · ${bytes(size)}</div>
    <p>${esc(c.summary)}</p>
    <p class="small muted">Video: “${esc(c.headline)}”</p>
    <div class="btn-row">
      <a class="btn small" href="#/map?case=${encodeURIComponent(c.id)}">Map</a>
      <a class="btn small secondary" href="#/timeline?case=${encodeURIComponent(c.id)}">Timeline</a>
      <a class="btn small secondary" href="#/sources?case=${encodeURIComponent(c.id)}">Files</a>
      <span class="small">${ext(folder, 'Archive folder')} · ${ext(c.video_url, 'Video')}</span>
    </div>
  </article>`;
}

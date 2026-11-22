import { loadAll, load } from '../services/data.js';
import { esc, int, date, countWord, listWords, moneyShort, fileName, perPerson } from '../helpers/format.js';
import { $, ext, term, squares, sourcesLink } from '../helpers/dom.js';
import { EDGE_KINDS } from '../enums/kinds.js';
import { POPULATION } from '../enums/population.js';

export const title = '';

// Each finding is worked out from the data, so it stays true when the archive changes. If a finding's data is missing
// or has changed shape, that finding is left out and the rest of the page still renders. Text is HTML: data parts are
// escaped, dotted words come from term().
const FINDINGS = [
  ({ est }) => {
    const ri = est.recovery_index;
    const n = ri.catalogue_missing.length;
    return {
      num: `${n} of ${est.rounds.length}`, pic: squares(n, est.rounds.length, 'warn'),
      text: `of the government's ${term('estimates', 'spending plans')} in the archive are not on Canada's ${term('catalogue', 'open data website')}. That is what the archive's notes say.`,
      src: [{ url: ri.url, name: fileName(ri.file) }], href: '#/spending', see: 'See the spending plans',
    };
  },
  ({ est }) => {
    const top = est.transfers.reduce((a, t) => (t.moved > a.moved ? t : a));
    return {
      num: moneyShort(top.moved), per: perPerson(top.moved),
      text: `moved from one ${term('department', 'department')} to another in a single spending plan, ${esc(top.key)}. That is the most of the ${est.transfers.length} plans that list these ${term('transfer', 'transfers')}.`,
      src: [{ url: est.url, name: fileName(est.file) }], href: `#/money?round=${encodeURIComponent(top.key)}`, see: 'See where it went',
    };
  },
  ({ g }) => {
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    const grants = g.edges.filter((e) => e.from === 'org:ircc' && e.money_kind === 'grant');
    if (!grants.length) return null;
    const to = [...new Set(grants.map((e) => byId[e.to].label))];
    const total = grants.reduce((a, e) => a + e.amount, 0);
    return {
      num: moneyShort(total), per: perPerson(total),
      text: `in ${term('grant', 'grants')} from Canada's immigration department <span class="nw">(${term('ircc')})</span> to ${countWord(to.length).toLowerCase()} ${term('un-agency', 'UN agencies')}: ${esc(listWords(to))}. They are in ${countWord(grants.length, 'grant record').toLowerCase()} in the immigration case.`,
      src: [...new Map(grants.map((e) => [e.src.github, { url: e.src.github, name: fileName(e.src.doc) }])).values()], href: '#/money', see: 'See the grants',
    };
  },
  ({ lob }) => {
    const n = new Map();
    lob.records.forEach((r) => r.institutions.forEach((i) => n.set(i, (n.get(i) || 0) + 1)));
    const [inst, count] = [...n.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      num: int(lob.records.length),
      text: `${term('lobbying')} records. Each is a time someone was paid to talk to the government. They talked to ${esc(inst)} the most: ${count} times.`,
      src: lob.datasets.map((d) => ({ url: d.url, name: fileName(d.file) })), href: '#/lobbying', see: 'See the records',
    };
  },
  ({ s }) => {
    const t = s.grants?.[0];
    if (!t) return null;
    return {
      num: moneyShort(t.total_once), per: perPerson(t.total_once),
      text: `in federal ${term('grant', 'grants')} and ${term('contribution', 'contributions')} in records that match “${esc(t.query)}”, dated ${esc(date(t.first))} to ${esc(date(t.last))}. That counts each of the ${int(t.records)} government records once. ${esc(t.top_dept.name)} gave the most: ${moneyShort(t.top_dept.amount)}.`,
      src: [{ url: t.url, name: fileName(t.file) }], href: '#/grants', see: 'See who got the money',
    };
  },
  ({ own }) => {
    const st = own.stats;
    return {
      num: int(st.direct_children),
      text: `companies belong to Brookfield itself. They own more companies, and those own more, up to ${Math.max(...Object.keys(st.by_level).map(Number)) - 1} levels down. That makes ${int(st.links)} ${term('subsidiary', 'ownership links')} in all.`,
      src: [{ url: own.url, name: fileName(own.file) }], href: '#/ownership', see: 'See who owns what',
    };
  },
  ({ pa }) => {
    const v1 = pa.tables.find((t) => /Vol1/.test(t.title));
    const debt = v1.blocks.find((b) => b.kind === 'total' && b.name === 'Cost of servicing government debt');
    const top = debt.parts.reduce((x, p) => (p.amount > x.amount ? p : x));
    return {
      num: moneyShort(debt.amount), per: perPerson(debt.amount),
      text: `to pay the cost of the government's debt in 2025-26, from the ${term('public-accounts', 'Public Accounts')}. The biggest part, ${moneyShort(top.amount)}, is “${esc(top.name)}”.`,
      src: [{ url: v1.url, name: fileName(v1.file) }], href: '#/accounts', see: 'See money in and out',
    };
  },
  ({ sv }) => {
    const answers = sv.rows.filter((r) => r.published_pct != null);
    const match = answers.filter((r) => Math.round(r.weighted_pct) === r.published_pct).length;
    return {
      num: match === answers.length ? `All ${match}` : `${match} of ${answers.length}`, pic: squares(match, answers.length, 'ok'),
      text: "of the survey numbers in the Statistics Canada article check out. Count the survey file the way its guide says, and you get the same numbers. The archive's spreadsheet counted it a different way.",
      src: [{ url: sv.zip_url, name: 'survey file (zip)' }], href: '#/survey', see: 'See the check step by step',
    };
  },
];

const optional = (name) => load(name).catch(() => null);

// "Guess first": readers who guess a number before they see it remember the data better (Kim, Reinecke & Hullman,
// CHI 2017). The answer is the number of company names in the Brookfield ownership table.
function guessBox(own) {
  if (!own) return '';
  return `<section class="panel guess" aria-labelledby="g-h">
    <h2 id="g-h">Guess first</h2>
    <p>Brookfield is a big company. It owns other companies, and they own more.
      <b>How many company names are on Brookfield's list?</b></p>
    <div class="guess-row">
      <label for="g-range">Your guess: <output id="g-out" for="g-range">100</output></label>
      <input id="g-range" type="range" min="0" max="2000" step="25" value="100">
      <button type="button" class="btn" id="g-go">Check my guess</button>
    </div>
    <div id="g-result" class="guess-result" hidden aria-live="polite"></div>
  </section>`;
}

function wireGuess(root, own) {
  const range = $('#g-range', root);
  if (!range) return;
  const real = own.stats.distinct_entities;
  const deep = Math.max(...Object.keys(own.stats.by_level).map(Number)) - 1;
  range.addEventListener('input', () => { $('#g-out', root).textContent = int(range.value); });
  $('#g-go', root).addEventListener('click', () => {
    const guess = Number(range.value);
    const top = Math.max(guess, real) * 1.08;
    const gap = real - guess;
    const verdict = Math.abs(gap) <= real * 0.05 ? 'Very close!' : gap > 0 ? `That is ${int(gap)} more than you guessed.` : `That is ${int(-gap)} fewer than you guessed.`;
    const out = $('#g-result', root);
    out.innerHTML = `
      <div class="g-bar"><span>Your guess</span><span class="g-track"><i></i></span><b>${int(guess)}</b></div>
      <div class="g-bar real"><span>The list</span><span class="g-track"><i></i></span><b>${int(real)}</b></div>
      <p><b>${verdict}</b> Brookfield owns ${int(own.stats.direct_children)} of them itself. It owns the rest through other
        companies, up to ${deep} levels down. <a href="#/ownership">See who owns what →</a></p>`;
    // both bars share one scale, so their lengths compare
    const [a, b] = out.querySelectorAll('.g-track i');
    a.style.width = `${(guess / top) * 100}%`;
    b.style.width = `${(real / top) * 100}%`;
    out.hidden = false;
    $('#g-go', root).textContent = 'Check again';
  });
}

export async function render(root) {
  const [s, g] = await loadAll('summary', 'graph');
  const [est, lob, own, sv, pa] = await Promise.all(['estimates', 'lobbying', 'ownership', 'survey', 'public_accounts'].map(optional));
  const data = { s, g, est, lob, own, sv, pa };
  const found = FINDINGS.map((f) => { try { return f(data); } catch { return null; } }).filter(Boolean);
  const c = s.counts;
  const evidenceEdges = g.edges.filter((e) => !e.layer).length;
  const passed = s.checks.filter((k) => k.pass).length;
  const failed = s.checks.filter((k) => !k.pass);
  const fresh = s.new_in_archive || { cases: [], lobbying_tables: [] };
  const freshCases = s.cases.filter((x) => fresh.cases.includes(x.id));

  root.innerHTML = `
    <h1>Follow the money. Check every number yourself.</h1>
    <p class="lead">Vesper Digital saved files, tables and videos about ${countWord(s.cases.length).toLowerCase()} cases.
      This site turns them into simple charts. Every number links to the file it came from, so you can check it.</p>

    ${guessBox(own)}

    <h2>What the files show</h2>
    <div class="findings">${found.map((f) => `<article class="finding">
      <b>${esc(f.num)}</b>
      ${f.pic || ''}
      <p>${f.text}</p>
      ${f.per ? `<p class="per">That is ${esc(f.per)}.</p>` : ''}
      <p class="small"><a href="${f.href}">${esc(f.see)} →</a> <span class="muted">·</span> ${sourcesLink(f.src)}</p>
    </article>`).join('')}</div>
    <p class="small muted">The site counts these numbers from the archive's files each time it updates.
      ${found.some((f) => f.per) ? `“For every person” uses Canada's population on ${esc(POPULATION.asOf)} (${int(POPULATION.people)}), from ${ext(POPULATION.url, 'Statistics Canada')}.` : ''}</p>
    <div class="btn-row">
      <a class="btn" href="#/map">See who is connected</a>
      <a class="btn secondary" href="#/money">Follow the money</a>
      <a class="btn secondary" href="#/timeline">See what happened when</a>
    </div>

    ${freshCases.length || fresh.lobbying_tables.length ? `
    <h2>New in the archive</h2>
    <div class="panel">
      <p>Vesper added these since someone last read the files to draw the map. Their files, dates and charts are already
        on this site. Lines between people only go on the map after someone reads the files.</p>
      <ul>${freshCases.map((x) => `<li><b>${esc(x.title)}</b> · ${x.files.length} files · <a href="#/sources?case=${encodeURIComponent(x.id)}">Files</a></li>`).join('')}
        ${fresh.lobbying_tables.length ? `<li>${countWord(fresh.lobbying_tables.length, 'lobbying table')}, charted on <a href="#/lobbying">Lobbying</a></li>` : ''}</ul>
    </div>` : ''}

    <h2>The ${countWord(s.cases.length).toLowerCase()} cases</h2>
    <div class="grid cols-2">${s.cases.map(caseCard).join('')}</div>

    <h2>How to read this site</h2>
    <div class="panel">
      <p><b>A line between two names means a file connects them.</b> It does not mean anyone did something wrong.</p>
      <p>The map draws three kinds of lines:</p>
      <ul>${['data', 'stated', 'computed'].map((k) => `<li><span class="line-sample ${EDGE_KINDS[k].style}"></span><b>${esc(EDGE_KINDS[k].label)}.</b> ${esc(EDGE_KINDS[k].help)}</li>`).join('')}</ul>
      <p>When a video title makes a claim, this site shows it as a <b>claim</b>, not a fact. It links to the files that
        support or test it.</p>
      <p class="small muted">Tap a ${term('archive', 'dotted word')} to see what it means.</p>
    </div>

    <h2>Checked every time the site updates</h2>
    <div class="panel">
      <p>${squares(passed, s.checks.length, 'ok')}</p>
      <p><b>${passed} of ${s.checks.length} checks passed.</b> Each time the site updates, it reads the archive again and
        checks that its totals and counts agree with each other.</p>
      ${failed.length ? `<p>Where the archive's own files disagree:</p><ul>${failed.map((f) => `<li>${esc(f.name)}: expected ${esc(JSON.stringify(f.expected))}, found ${esc(JSON.stringify(f.actual))}. <span class="muted">${esc(f.note || '')}</span></li>`).join('')}</ul>` : ''}
      <a href="#/sources">See every check and file →</a>
    </div>

    <h2>What this site reads</h2>
    <div class="stats quiet">
      <div class="stat"><b>${int(c.files)}</b><span>files in the archive</span></div>
      <div class="stat"><b>${int(c.nodes)}</b><span>people, groups, programs and data tables</span></div>
      <div class="stat"><b>${int(evidenceEdges)}</b><span>connections, each with a source</span></div>
      <div class="stat"><b>${int(c.lobbying_records)}</b><span>lobbying records</span></div>
      <div class="stat"><b>${int(c.ownership_links)}</b><span>Brookfield ownership links</span></div>
      <div class="stat"><b>${int(c.estimate_rounds)}</b><span>government spending plans</span></div>
      ${c.public_accounts_records ? `<div class="stat"><b>${int(c.public_accounts_records)}</b><span>Public Accounts records</span></div>` : ''}
      ${c.grant_rows ? `<div class="stat"><b>${int(c.grant_rows)}</b><span>rows of AI grants</span></div>` : ''}
      <div class="stat"><b>${int(c.external_links)}</b><span>links to the original sources</span></div>
    </div>`;
  wireGuess(root, own);
}

function caseCard(c) {
  const folder = `https://github.com/Vesper-Digital/Evidence-Archive/tree/main/${encodeURIComponent(c.folder)}`;
  return `<article class="panel case-card">
    <h3>${esc(c.title)}${c.auto ? ' <span class="badge">New: not on the map yet</span>' : ''}</h3>
    <div class="meta">${c.date ? `Added ${esc(date(c.date))} · ` : ''}${c.files.length} files</div>
    <p>${esc(c.summary)}</p>
    ${c.auto ? '' : `<p class="small muted">Video title: “${esc(c.headline)}”</p>`}
    <div class="btn-row">
      <a class="btn small" href="#/map?case=${encodeURIComponent(c.id)}">Map</a>
      <a class="btn small secondary" href="#/timeline?case=${encodeURIComponent(c.id)}">Timeline</a>
      <a class="btn small secondary" href="#/sources?case=${encodeURIComponent(c.id)}">Files</a>
      <span class="small">${ext(folder, 'Archive folder')}${c.video_url ? ` · ${ext(c.video_url, 'Video')}` : ''}</span>
    </div>
  </article>`;
}

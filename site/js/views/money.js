import { loadAll } from '../services/data.js';
import { esc, money, moneyShort, fileName, countWord, listWords } from '../helpers/format.js';
import { $, sourceHtml, options, table, setParams, ext, figure, caption, inShort, term, onPage } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';
import { MONEY_KINDS } from '../enums/kinds.js';

export const title = 'Money flows';

const short = (s, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const OTHER_KIND = { label: 'Other amounts', help: 'Amounts this site has not sorted into a kind yet.' };
const TOPS = [10, 20, 40, 999];
const L = (n) => `${n} `; // giver column (trailing space keeps a giver and a receiver with the same name apart)
const R = (n) => `→ ${n}`; // receiver column
const plain = (name) => name.replace(/^→ /, '').trim();

export async function render(root, params) {
  const [g, est] = await loadAll('graph', 'estimates');
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const figures = g.edges.filter((e) => !e.layer && e.amount).sort((a, b) => b.amount - a.amount);
  const kindOf = (e) => (MONEY_KINDS[e.money_kind] ? e.money_kind : '');
  const groups = [...Object.keys(MONEY_KINDS), ''].map((k) => [k, figures.filter((e) => kindOf(e) === k)]).filter(([, es]) => es.length);
  const grants = figures.filter((e) => e.from === 'org:ircc' && (e.to === 'org:iom' || e.to === 'org:unhcr'));
  const recipients = [...new Set(grants.map((e) => e.to))];
  const grantTotal = grants.reduce((a, e) => a + e.amount, 0);
  const rounds = est.transfers.map((t) => t.key);
  const biggest = est.transfers.reduce((a, t) => (t.moved > a.moved ? t : a));
  const state = {
    round: rounds.includes(params.round) ? params.round : rounds[rounds.length - 1],
    top: TOPS.includes(Number(params.top)) ? Number(params.top) : 10,
    dept: params.dept || '',
  };
  const estSrc = ext(est.url, fileName(est.file));
  const save = () => setParams({ round: state.round, top: state.top === 10 ? '' : state.top, dept: state.dept });

  const card = (e) => `<div class="money-card">
    <span class="amount">${money(e.amount, e.amount % 1 !== 0)}</span>
    <div class="what">${esc(e.money || e.label)}</div>
    <div class="small">${esc(byId[e.from].label)} → ${esc(byId[e.to].label)}</div>
    ${sourceHtml(e.src)}
  </div>`;

  root.innerHTML = `
    <h1>Money flows</h1>
    <p class="lead">Follow the money in Vesper's files: money federal departments moved to each other, grants from Immigration,
      Refugees and Citizenship Canada (IRCC) to two UN agencies, and every other dollar figure in the documents.</p>
    ${inShort([
      `In ${esc(biggest.key)}, federal departments moved <b>${moneyShort(biggest.moved)}</b> to each other. That is the most of the ${rounds.length} rounds Vesper recovered with this table.`,
      grants.length ? `IRCC's grants to ${esc(listWords(recipients.map((id) => byId[id].label)))} add up to <b>${moneyShort(grantTotal)}</b> in ${countWord(grants.length, 'grant record').toLowerCase()}.` : '',
      'The other dollar figures are different kinds of money: budgets, grants, proposals and contract ceilings. Each kind has its own group. Don\'t add them together.',
    ])}
    ${onPage([['transfers', 'Money moved between departments'], ['grants', 'Grants to UN agencies'], ['figures', 'Every dollar figure in the evidence']])}

    <section id="transfers" class="step-section">
      <h2><span class="step">1</span>Money moved between federal departments</h2>
      <p>Departments get their budgets through the ${term('estimates', 'Estimates')}. During the year, the
        ${term('supp', 'Supplementary Estimates')} can also move money from one department's budget to another's. Each move is
        listed in a table called <i>${term('transfer', 'Transfers between Organizations')}</i>. Vesper's recovery index says this table was
        “discontinued after 2021–22”. The recovered files have it for ${countWord(rounds.length).toLowerCase()} rounds, from
        ${esc(rounds[0])} to ${esc(rounds[rounds.length - 1])}.</p>
      ${figure('t-total', {
        title: `The ${esc(biggest.key)} round moved the most: ${moneyShort(biggest.moved)}.`,
        how: 'Each bar is one round. Taller bars mean more money moved from one department to another. Click a bar to see that round below.',
        src: estSrc, cls: 'short',
      })}
      <div class="controls">
        <label>Round <select id="t-round">${options(est.transfers.map((t) => [t.key, `${t.key} (${moneyShort(t.moved)} moved)`]), state.round)}</select></label>
        <label>Follow one department <select id="t-dept"></select></label>
        <label>Show <select id="t-top">${options([[10, 'Top 10 transfers'], [20, 'Top 20 transfers'], [40, 'Top 40 transfers'], [999, 'All transfers']].map(([v, l]) => [String(v), l]), String(state.top))}</select></label>
      </div>
      ${figure('t-chart', {
        how: '<b>Read it from left to right.</b> Money leaves the department on the left and arrives at the department on the right. The thicker the band, the more money. Hover over a band for the amount. Click a department to follow only its money.',
        src: estSrc,
      })}
      <p class="small muted">When one transfer has several givers <i>and</i> several receivers, the table does not say who paid
        whom. This site splits those amounts in proportion and marks them with ≈. Transfers with a single giver or a single receiver are exact.</p>
      <div id="t-table"></div>
    </section>

    <section id="grants" class="step-section">
      <h2><span class="step">2</span>IRCC ${term('grant', 'grants')} to UN agencies</h2>
      <p>Three amended grant records in the immigration case show IRCC funding the International Organization for Migration (IOM)
        and the UN Refugee Agency (UNHCR) for resettlement work. The IOM and UNHCR agreements that start March 29, 2021 have
        consecutive numbers (G228665001 and G228665002) and the same dates.</p>
      <div class="money-cards">${recipients.map((id) => {
        const es = grants.filter((e) => e.to === id);
        return `<div class="money-card">
          <span class="amount">${money(es.reduce((a, e) => a + e.amount, 0))}</span>
          <div class="what">to ${esc(byId[id].full || byId[id].label)}</div>
          <div class="small">${countWord(es.length, 'grant')} from IRCC: ${es.map((e) => esc(e.label.replace(/^Grant \$[\d,.]+ /, ''))).join('; ')}</div>
        </div>`;
      }).join('')}</div>
      <details class="fold-inline"><summary>Each grant record</summary>${table([
        { label: 'Recipient', value: (e) => byId[e.to].full || byId[e.to].label },
        { label: 'Amount', num: true, value: (e) => money(e.amount, true) },
        { label: 'Term and record', html: (e) => `${esc(e.label.replace(/^Grant \$[\d,.]+ /, ''))}${sourceHtml(e.src)}` },
      ], grants)}</details>
    </section>

    <section id="figures" class="step-section">
      <h2><span class="step">3</span>Every dollar figure in the evidence</h2>
      <p>These are different kinds of money, so each kind has its own group. Compare amounts inside a group, not across groups,
        and don't add the groups together. One year's budget, a five-year proposal and a contract ceiling are not the same thing.</p>
      ${groups.map(([k, es]) => {
        const kind = MONEY_KINDS[k] || OTHER_KIND;
        return `<h3 class="kind-h">${esc(kind.label)} <span class="count">${es.length}</span></h3>
          <p class="small muted">${esc(kind.help)}</p>
          <div class="money-cards">${es.map(card).join('')}</div>`;
      }).join('')}
    </section>`;

  const totalChart = chart($('#t-total', root), {
    grid: { left: 10, right: 20, top: 24, bottom: 10, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) },
    xAxis: { type: 'category', data: rounds },
    yAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
    series: [{ type: 'bar', data: est.transfers.map((t) => t.moved), itemStyle: { color: '#067647', borderRadius: [4, 4, 0, 0] }, label: { show: true, position: 'top', formatter: (p) => moneyShort(p.value) } }],
  });
  totalChart.on('click', (p) => { state.round = p.name; $('#t-round', root).value = p.name; drawFlows(); $('#t-chart', root).scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  const flowChart = chart($('#t-chart', root), {});

  function roundFlows(t) {
    const agg = new Map();
    for (const f of t.flows) {
      const k = `${f.from}|${f.to}`;
      const a = agg.get(k) || { from: f.from, to: f.to, amount: 0, split: false, purposes: [] };
      a.amount += f.amount;
      a.split ||= f.split;
      a.purposes.push(f.purpose);
      agg.set(k, a);
    }
    return [...agg.values()].sort((a, b) => b.amount - a.amount);
  }

  function drawFlows() {
    const t = est.transfers.find((x) => x.key === state.round);
    const every = roundFlows(t);
    // departments in this round, the most money involved first
    const involved = new Map();
    every.forEach((f) => { involved.set(f.from, (involved.get(f.from) || 0) + f.amount); involved.set(f.to, (involved.get(f.to) || 0) + f.amount); });
    const depts = [...involved.entries()].sort((a, b) => b[1] - a[1]).map(([d]) => d);
    if (state.dept && !involved.has(state.dept)) state.dept = '';
    $('#t-dept', root).innerHTML = options([['', `All departments (${depts.length})`], ...depts.map((d) => [d, d])], state.dept);
    save();

    const flows = state.dept ? every.filter((f) => f.from === state.dept || f.to === state.dept) : every;
    const shown = flows.slice(0, state.top);
    const rest = flows.slice(state.top);
    const links = shown.map((f) => ({ source: L(f.from), target: R(f.to), value: f.amount, split: f.split }));
    if (rest.length) {
      links.push({ source: L(`${rest.length} smaller transfers`), target: R('the rest'), value: rest.reduce((a, f) => a + f.amount, 0), split: rest.some((f) => f.split) });
    }
    const names = [...new Set([...links.map((l) => l.source), ...links.map((l) => l.target)])];
    const lead = flows[0];
    if (state.dept) {
      const out = flows.filter((f) => f.from === state.dept);
      const inn = flows.filter((f) => f.to === state.dept);
      const sum = (fs) => fs.reduce((a, f) => a + f.amount, 0);
      caption(root, 't-chart', `${esc(t.key)}: ${esc(state.dept)} gave ${moneyShort(sum(out))} to ${countWord(new Set(out.map((f) => f.to)).size, 'department').toLowerCase()} and received ${moneyShort(sum(inn))} from ${countWord(new Set(inn.map((f) => f.from)).size, 'department').toLowerCase()}.`);
    } else {
      caption(root, 't-chart', `${esc(t.key)}: ${moneyShort(t.moved)} moved in ${flows.length} transfers. The largest was ${esc(lead.from)} to ${esc(lead.to)}, ${lead.split ? 'about ' : ''}${moneyShort(lead.amount)}.`);
    }
    flowChart.getDom().style.height = `${Math.max(360, Math.min(1600, names.length * 20))}px`;
    flowChart.resize();
    flowChart.setOption({
      tooltip: { confine: true, formatter: (p) => (p.dataType === 'edge' ? `${esc(plain(p.data.source))} → ${esc(plain(p.data.target))}<br><b>${p.data.split ? '≈ ' : ''}${money(p.data.value)}</b>` : `${esc(plain(p.name))}<br><span style="color:#667085">Click to follow only this department</span>`) },
      series: [{
        type: 'sankey', left: 10, right: 10, nodeGap: 8, nodeAlign: 'justify', emphasis: { focus: 'adjacency' },
        label: { fontSize: 11, formatter: (p) => short(plain(p.name), 46) },
        // receivers sit in the right-hand column, so their names go on the inside, not off the edge
        data: names.map((name) => ({ name, label: { position: name.startsWith('→') ? 'left' : 'right' } })),
        links,
        lineStyle: { color: 'gradient', opacity: 0.35 },
      }],
    }, true);
    $('#t-table', root).innerHTML = `<details class="fold-inline"><summary>${state.dept ? `${flows.length} transfers involving ${esc(state.dept)}` : `All ${flows.length} transfers`} in ${esc(t.key)}, largest first</summary>${table([
      { label: 'From', value: (f) => f.from },
      { label: 'To', value: (f) => f.to },
      { label: 'Amount', num: true, value: (f) => `${f.split ? '≈ ' : ''}${money(f.amount)}` },
      { label: 'Purpose (as written in the table)', html: (f) => [...new Set(f.purposes)].map((x) => `<div>${esc(x)}</div>`).join('') },
    ], flows)}<p class="small muted">Source table: ${esc(t.file)}, inside ${esc(est.file)}.</p></details>`;
  }

  flowChart.on('click', (p) => {
    if (p.dataType !== 'node') return;
    const d = plain(p.name);
    if (d === 'the rest' || / smaller transfers$/.test(d)) return;
    state.dept = state.dept === d ? '' : d;
    drawFlows();
  });
  $('#t-round', root).addEventListener('change', (ev) => { state.round = ev.target.value; drawFlows(); });
  $('#t-dept', root).addEventListener('change', (ev) => { state.dept = ev.target.value; drawFlows(); });
  $('#t-top', root).addEventListener('change', (ev) => { state.top = Number(ev.target.value); drawFlows(); });
  drawFlows();
}

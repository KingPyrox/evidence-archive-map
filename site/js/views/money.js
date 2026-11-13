import { loadAll } from '../services/data.js';
import { esc, money, moneyShort } from '../helpers/format.js';
import { $, sourceHtml, options, table, setParams } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';

export const title = 'Money flows';

const short = (s, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function render(root, params) {
  const [g, est] = await loadAll('graph', 'estimates');
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const figures = g.edges.filter((e) => !e.layer && e.amount).sort((a, b) => b.amount - a.amount);
  const grants = figures.filter((e) => e.from === 'org:ircc' && (e.to === 'org:iom' || e.to === 'org:unhcr'));
  const rounds = est.transfers.map((t) => t.key);
  const state = { round: rounds.includes(params.round) ? params.round : rounds[rounds.length - 1], top: Number(params.top) || 40 };

  root.innerHTML = `
    <h1>Money flows</h1>
    <p class="lead">Every dollar figure in the evidence, the grants IRCC paid to UN agencies, and the money federal departments
      moved between each other in the deleted Estimates tables.</p>

    <h2>Dollar figures in the evidence</h2>
    <p class="muted">These amounts are different kinds of money: grants, budget proposals, spending estimates and contracts.
      Each row says which kind it is. Do not add them together.</p>
    <div class="panel"><div id="f-chart" class="chart"></div></div>
    ${table([
      { label: 'Amount', num: true, value: (e) => money(e.amount, e.amount % 1 !== 0) },
      { label: 'What it is', html: (e) => `<b>${esc(e.money || e.label)}</b><br><span class="small">${esc(byId[e.from].label)} → ${esc(byId[e.to].label)}</span>` },
      { label: 'Source', html: (e) => `${esc(e.label)}${sourceHtml(e.src)}` },
    ], figures)}

    <h2>IRCC grants to UN agencies</h2>
    <p>Three amended grant records in the immigration case show IRCC funding the International Organization for Migration (IOM)
      and the UN Refugee Agency (UNHCR) for resettlement work. The IOM and UNHCR agreements that start March 29, 2021 have
      consecutive numbers (G228665001 and G228665002) and the same dates.</p>
    <div class="panel"><div id="g-chart" class="chart" style="height:340px"></div></div>
    ${table([
      { label: 'Recipient', value: (e) => byId[e.to].full || byId[e.to].label },
      { label: 'Amount', num: true, value: (e) => money(e.amount, true) },
      { label: 'Term and record', html: (e) => `${esc(e.label.replace(/^Grant \$[\d,.]+ /, ''))}${sourceHtml(e.src)}` },
    ], grants)}

    <h2>Money moved between federal departments</h2>
    <p>The <i>Transfers between Organizations</i> table lists money moved from one department's budget to another's in each
      round of Supplementary Estimates. The archive's recovery index says this table was “discontinued after 2021–22”. The
      recovered files hold it for six rounds, from 2019-20 to 2021-22. Choose a round to see where the money went.</p>
    <div class="controls">
      <label>Round <select id="t-round">${options(est.transfers.map((t) => [t.key, `${t.key} (${moneyShort(t.moved)} moved)`]), state.round)}</select></label>
      <label>Show <select id="t-top">${options([[20, 'Top 20 flows'], [40, 'Top 40 flows'], [80, 'Top 80 flows'], [999, 'All flows']].map(([v, l]) => [String(v), l]), String(state.top))}</select></label>
    </div>
    <div class="grid cols-2">
      <div class="panel"><h3>Total moved in each round</h3><div id="t-total" class="chart" style="height:300px"></div></div>
      <div class="panel"><h3>How to read the flow chart</h3>
        <p>Departments giving money are on the left and departments receiving it are on the right. Thicker bands mean more money.</p>
        <p class="small muted">When one transfer has several givers <i>and</i> several receivers, the table does not say who paid
          whom. This site splits those amounts in proportion and marks them with ≈. Single giver or single receiver transfers are exact.</p>
        <p class="small">Archive file: <a href="${esc(est.url)}" target="_blank" rel="noopener">${esc(est.file.split('/').pop())}</a></p>
      </div>
    </div>
    <div class="panel"><div id="t-chart" class="chart xtall"></div></div>
    <div id="t-table"></div>`;

  chart($('#f-chart', root), {
    grid: { left: 10, right: 70, top: 10, bottom: 10, containLabel: true },
    tooltip: { trigger: 'item', confine: true, formatter: (p) => `${esc(p.name)}<br><b>${money(p.value)}</b>` },
    xAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
    yAxis: { type: 'category', inverse: true, data: figures.map((e) => e.money || e.label), axisLabel: { width: 300, overflow: 'break', lineHeight: 13, fontSize: 11 } },
    series: [{ type: 'bar', data: figures.map((e) => e.amount), itemStyle: { color: '#b42318' }, label: { show: true, position: 'right', formatter: (p) => moneyShort(p.value) } }],
  });

  const sumTo = (id) => grants.filter((e) => e.to === id).reduce((a, e) => a + e.amount, 0);
  chart($('#g-chart', root), {
    tooltip: { confine: true, formatter: (p) => (p.dataType === 'edge' ? `${esc(p.data.source)} → ${esc(p.data.target)}<br><b>${money(p.data.value, true)}</b>` : esc(p.name)) },
    series: [{
      type: 'sankey', left: 10, right: 290, nodeGap: 24, emphasis: { focus: 'adjacency' },
      label: { formatter: (p) => p.name },
      data: [{ name: 'IRCC' }, { name: 'IOM' }, { name: 'UNHCR' }, { name: 'Resettlement and Complementary Pathways' }],
      links: [
        { source: 'IRCC', target: 'IOM', value: sumTo('org:iom') },
        { source: 'IRCC', target: 'UNHCR', value: sumTo('org:unhcr') },
        { source: 'IOM', target: 'Resettlement and Complementary Pathways', value: sumTo('org:iom') },
        { source: 'UNHCR', target: 'Resettlement and Complementary Pathways', value: sumTo('org:unhcr') },
      ],
      lineStyle: { color: 'gradient', opacity: 0.35 },
    }],
  });

  chart($('#t-total', root), {
    grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) },
    xAxis: { type: 'category', data: rounds },
    yAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
    series: [{ type: 'bar', data: est.transfers.map((t) => t.moved), itemStyle: { color: '#1d4ed8' } }],
  });

  const flowChart = chart($('#t-chart', root), {});
  function drawFlows() {
    const t = est.transfers.find((x) => x.key === state.round);
    const agg = new Map();
    for (const f of t.flows) {
      const k = `${f.from}|${f.to}`;
      const a = agg.get(k) || { from: f.from, to: f.to, amount: 0, split: false, purposes: [] };
      a.amount += f.amount;
      a.split ||= f.split;
      a.purposes.push(f.purpose);
      agg.set(k, a);
    }
    const flows = [...agg.values()].sort((a, b) => b.amount - a.amount);
    const shown = flows.slice(0, state.top);
    const L = (n) => `${n} `;
    const R = (n) => `→ ${n}`;
    const names = [...new Set([...shown.map((f) => L(f.from)), ...shown.map((f) => R(f.to))])];
    flowChart.getDom().style.height = `${Math.max(420, Math.min(1600, names.length * 16))}px`;
    flowChart.resize();
    flowChart.setOption({
      tooltip: { confine: true, formatter: (p) => (p.dataType === 'edge' ? `${esc(p.data.source)} ${esc(p.data.target)}<br><b>${p.data.split ? '≈ ' : ''}${money(p.data.value)}</b>` : esc(p.name)) },
      series: [{
        type: 'sankey', left: 10, right: 10, nodeGap: 6, nodeAlign: 'justify', emphasis: { focus: 'adjacency' },
        label: { fontSize: 11, formatter: (p) => short(p.name.trim(), 46) },
        data: names.map((name) => ({ name })),
        links: shown.map((f) => ({ source: L(f.from), target: R(f.to), value: f.amount, split: f.split })),
        lineStyle: { color: 'gradient', opacity: 0.3 },
      }],
    }, true);
    $('#t-table', root).innerHTML = `<h3>${esc(state.round)}: ${flows.length} department-to-department flows</h3>${table([
      { label: 'From', value: (f) => f.from },
      { label: 'To', value: (f) => f.to },
      { label: 'Amount', num: true, value: (f) => `${f.split ? '≈ ' : ''}${money(f.amount)}` },
      { label: 'Purpose (as written in the table)', html: (f) => [...new Set(f.purposes)].map((p) => `<div>${esc(p)}</div>`).join('') },
    ], shown)}<p class="small muted">Source table: ${esc(t.file)}, inside ${esc(est.file)}.</p>`;
  }
  $('#t-round', root).addEventListener('change', (ev) => { state.round = ev.target.value; setParams({ round: state.round, top: state.top }); drawFlows(); });
  $('#t-top', root).addEventListener('change', (ev) => { state.top = Number(ev.target.value); setParams({ round: state.round, top: state.top }); drawFlows(); });
  drawFlows();
}

import { loadAll } from '../services/data.js';
import { esc, money, moneyShort, fileName, countWord } from '../helpers/format.js';
import { $, sourceHtml, options, table, setParams, ext, figure, caption } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';
import { MONEY_KINDS } from '../enums/kinds.js';

export const title = 'Money flows';

const short = (s, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const OTHER_KIND = { label: 'Other amounts', help: 'Amounts this site has not sorted into a kind yet.' };
const TOPS = [10, 20, 40, 999];

export async function render(root, params) {
  const [g, est] = await loadAll('graph', 'estimates');
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const figures = g.edges.filter((e) => !e.layer && e.amount).sort((a, b) => b.amount - a.amount);
  const kindOf = (e) => (MONEY_KINDS[e.money_kind] ? e.money_kind : '');
  const groups = [...Object.keys(MONEY_KINDS), ''].map((k) => [k, figures.filter((e) => kindOf(e) === k)]).filter(([, es]) => es.length);
  const grants = figures.filter((e) => e.from === 'org:ircc' && (e.to === 'org:iom' || e.to === 'org:unhcr'));
  const recipients = [...new Set(grants.map((e) => e.to))];
  const rounds = est.transfers.map((t) => t.key);
  const biggest = est.transfers.reduce((a, t) => (t.moved > a.moved ? t : a));
  const state = {
    round: rounds.includes(params.round) ? params.round : rounds[rounds.length - 1],
    top: TOPS.includes(Number(params.top)) ? Number(params.top) : 10,
  };
  const estSrc = ext(est.url, fileName(est.file));

  const card = (e) => `<div class="money-card">
    <span class="amount">${money(e.amount, e.amount % 1 !== 0)}</span>
    <div class="what">${esc(e.money || e.label)}</div>
    <div class="small">${esc(byId[e.from].label)} → ${esc(byId[e.to].label)}</div>
    ${sourceHtml(e.src)}
  </div>`;

  root.innerHTML = `
    <h1>Money flows</h1>
    <p class="lead">Every dollar figure in the evidence, the grants IRCC paid to UN agencies, and the money federal departments
      moved between each other in the deleted Estimates tables.</p>

    <h2>Dollar figures in the evidence</h2>
    <p>These are different kinds of money, so each kind has its own group. Compare amounts inside a group, not across groups,
      and do not add the groups together: one year's budget, a five-year proposal and a contract ceiling are not the same thing.</p>
    ${groups.map(([k, es]) => {
      const kind = MONEY_KINDS[k] || OTHER_KIND;
      return `<h3>${esc(kind.label)} <span class="muted small">(${es.length})</span></h3>
        <p class="small muted">${esc(kind.help)}</p>
        <div class="money-cards">${es.map(card).join('')}</div>`;
    }).join('')}

    <h2>IRCC grants to UN agencies</h2>
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
    ${table([
      { label: 'Recipient', value: (e) => byId[e.to].full || byId[e.to].label },
      { label: 'Amount', num: true, value: (e) => money(e.amount, true) },
      { label: 'Term and record', html: (e) => `${esc(e.label.replace(/^Grant \$[\d,.]+ /, ''))}${sourceHtml(e.src)}` },
    ], grants)}

    <h2>Money moved between federal departments</h2>
    <p>The <i>Transfers between Organizations</i> table lists money moved from one department's budget to another's in each
      round of Supplementary Estimates. The archive's recovery index says this table was “discontinued after 2021–22”. The
      recovered files hold it for ${countWord(rounds.length).toLowerCase()} rounds, from ${esc(rounds[0])} to ${esc(rounds[rounds.length - 1])}.</p>
    ${figure('t-total', {
      title: `The ${esc(biggest.key)} round moved the most: ${moneyShort(biggest.moved)}.`,
      how: 'Each bar is one round of Supplementary Estimates. Taller bars mean more money moved from one department to another.',
      src: estSrc, cls: 'short',
    })}
    <div class="controls">
      <label>Round <select id="t-round">${options(est.transfers.map((t) => [t.key, `${t.key} (${moneyShort(t.moved)} moved)`]), state.round)}</select></label>
      <label>Show <select id="t-top">${options([[10, 'Top 10 transfers'], [20, 'Top 20 transfers'], [40, 'Top 40 transfers'], [999, 'All transfers']].map(([v, l]) => [String(v), l]), String(state.top))}</select></label>
    </div>
    ${figure('t-chart', {
      how: 'Departments giving money are on the left and departments receiving it are on the right. Thicker bands mean more money. The smaller transfers are grouped into one band. Hover over a band for its amount.',
      src: estSrc,
    })}
    <p class="small muted">When one transfer has several givers <i>and</i> several receivers, the table does not say who paid
      whom. This site splits those amounts in proportion and marks them with ≈. Transfers with a single giver or a single receiver are exact.</p>
    <div id="t-table"></div>`;

  chart($('#t-total', root), {
    grid: { left: 10, right: 20, top: 24, bottom: 10, containLabel: true },
    tooltip: { trigger: 'axis', valueFormatter: (v) => money(v) },
    xAxis: { type: 'category', data: rounds },
    yAxis: { type: 'value', axisLabel: { formatter: moneyShort } },
    series: [{ type: 'bar', data: est.transfers.map((t) => t.moved), itemStyle: { color: '#1d4ed8' }, label: { show: true, position: 'top', formatter: (p) => moneyShort(p.value) } }],
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
    const rest = flows.slice(state.top);
    const L = (n) => `${n} `;
    const R = (n) => `→ ${n}`;
    const links = shown.map((f) => ({ source: L(f.from), target: R(f.to), value: f.amount, split: f.split }));
    if (rest.length) {
      links.push({ source: L(`${rest.length} smaller transfers`), target: R('the rest'), value: rest.reduce((a, f) => a + f.amount, 0), split: rest.some((f) => f.split) });
    }
    const names = [...new Set([...links.map((l) => l.source), ...links.map((l) => l.target)])];
    const lead = flows[0];
    caption(root, 't-chart', `${esc(t.key)}: ${moneyShort(t.moved)} moved in ${flows.length} transfers. The largest was ${esc(lead.from)} to ${esc(lead.to)}, ${lead.split ? 'about ' : ''}${moneyShort(lead.amount)}.`);
    flowChart.getDom().style.height = `${Math.max(420, Math.min(1600, names.length * 18))}px`;
    flowChart.resize();
    flowChart.setOption({
      tooltip: { confine: true, formatter: (p) => (p.dataType === 'edge' ? `${esc(p.data.source)} ${esc(p.data.target)}<br><b>${p.data.split ? '≈ ' : ''}${money(p.data.value)}</b>` : esc(p.name)) },
      series: [{
        type: 'sankey', left: 10, right: 10, nodeGap: 8, nodeAlign: 'justify', emphasis: { focus: 'adjacency' },
        label: { fontSize: 11, formatter: (p) => short(p.name.trim(), 46) },
        // receivers sit in the right-hand column, so their names go on the inside, not off the edge
        data: names.map((name) => ({ name, label: { position: name.startsWith('→') ? 'left' : 'right' } })),
        links,
        lineStyle: { color: 'gradient', opacity: 0.3 },
      }],
    }, true);
    $('#t-table', root).innerHTML = `<details><summary>All ${flows.length} transfers in ${esc(t.key)}, largest first</summary>${table([
      { label: 'From', value: (f) => f.from },
      { label: 'To', value: (f) => f.to },
      { label: 'Amount', num: true, value: (f) => `${f.split ? '≈ ' : ''}${money(f.amount)}` },
      { label: 'Purpose (as written in the table)', html: (f) => [...new Set(f.purposes)].map((p) => `<div>${esc(p)}</div>`).join('') },
    ], flows)}<p class="small muted">Source table: ${esc(t.file)}, inside ${esc(est.file)}.</p></details>`;
  }
  $('#t-round', root).addEventListener('change', (ev) => { state.round = ev.target.value; setParams({ round: state.round, top: state.top }); drawFlows(); });
  $('#t-top', root).addEventListener('change', (ev) => { state.top = Number(ev.target.value); setParams({ round: state.round, top: state.top }); drawFlows(); });
  drawFlows();
}

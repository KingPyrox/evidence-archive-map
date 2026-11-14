import { loadAll } from '../services/data.js';
import { esc, money, moneyShort, fileName, countWord, perPerson } from '../helpers/format.js';
import { $, sourceHtml, options, table, setParams, ext, figure, caption, term, changeBox, more, showAll } from '../helpers/dom.js';
import { chart } from '../helpers/chart.js';
import { MONEY_KINDS } from '../enums/kinds.js';
import { POPULATION } from '../enums/population.js';

export const title = 'Money flows';

const short = (s, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const OTHER_KIND = { label: 'Other amounts', help: 'Amounts this site has not sorted into a kind yet.' };
const TOPS = [10, 20, 40, 999];
const CARDS = 4; // amounts shown per group before "Show all"

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

  const per = (v) => (perPerson(v) ? `<div class="per">That is ${esc(perPerson(v))}.</div>` : '');
  const card = (e, i) => `<div class="money-card"${more(i, CARDS)}>
    <span class="amount">${money(e.amount, e.amount % 1 !== 0)}</span>
    ${per(e.amount)}
    <div class="what">${esc(e.money || e.label)}</div>
    <div class="small">${esc(byId[e.from].label)} → ${esc(byId[e.to].label)}</div>
    ${sourceHtml(e.src)}
  </div>`;

  root.innerHTML = `
    <h1>Money flows</h1>
    <p class="lead">Where public money went, according to the archive's files. Each kind of money has its own section.
      A one-year budget, a five-year plan and a contract limit are different things, so this page never adds them together.</p>

    <h2>Money moved between departments</h2>
    <p>Sometimes the government moves money from one ${term('department', 'department')}'s budget to another's. A table in the
      ${term('estimates', 'spending plans')} lists these ${term('transfer', 'transfers')}. The archive says the table stopped
      after 2021-22. It has the table for ${countWord(rounds.length).toLowerCase()} plans, from ${esc(rounds[0])} to ${esc(rounds[rounds.length - 1])}.</p>
    ${figure('t-total', {
      title: `The ${esc(biggest.key)} plan moved the most: ${moneyShort(biggest.moved)}. That is ${esc(perPerson(biggest.moved))}.`,
      how: 'Each bar is one spending plan. A taller bar means more money moved from one department to another.',
      src: estSrc, cls: 'short',
    })}
    ${figure('t-chart', {
      how: 'Departments that gave money are on the left. Departments that got it are on the right. A thicker band means more money. Small transfers are grouped into one band. Point at a band to see its amount.',
      src: estSrc,
    })}
    ${changeBox(`<label>Plan <select id="t-round">${options(est.transfers.map((t) => [t.key, `${t.key} (${moneyShort(t.moved)} moved)`]), state.round)}</select></label>
      <label>Show <select id="t-top">${options([[10, 'Top 10 transfers'], [20, 'Top 20 transfers'], [40, 'Top 40 transfers'], [999, 'All transfers']].map(([v, l]) => [String(v), l]), String(state.top))}</select></label>`)}
    <p class="small muted">Sometimes one transfer has several givers <i>and</i> several receivers, and the table does not
      say who paid whom. This site splits those amounts by size and marks them with ≈. All other transfers are exact.</p>
    <div id="t-table"></div>

    <h2>Grants from IRCC to UN agencies</h2>
    <p>Three changed (“amended”) ${term('grant', 'grant')} records in the immigration case show ${term('ircc')} paying two
      ${term('un-agency', 'UN agencies')} to help resettle people: the International Organization for Migration (IOM) and
      the UN Refugee Agency (UNHCR). The IOM and UNHCR agreements that start March 29, 2021 have numbers in a row
      (G228665001 and G228665002) and the same dates.</p>
    <div class="money-cards">${recipients.map((id) => {
      const es = grants.filter((e) => e.to === id);
      const sum = es.reduce((a, e) => a + e.amount, 0);
      return `<div class="money-card">
        <span class="amount">${money(sum)}</span>
        ${per(sum)}
        <div class="what">to ${esc(byId[id].full || byId[id].label)}</div>
        <div class="small">${countWord(es.length, 'grant')} from IRCC: ${es.map((e) => esc(e.label.replace(/^Grant \$[\d,.]+ /, ''))).join('; ')}</div>
      </div>`;
    }).join('')}</div>
    ${table([
      { label: 'Recipient', value: (e) => byId[e.to].full || byId[e.to].label },
      { label: 'Amount', num: true, value: (e) => money(e.amount, true) },
      { label: 'Term and record', html: (e) => `${esc(e.label.replace(/^Grant \$[\d,.]+ /, ''))}${sourceHtml(e.src)}` },
    ], grants)}

    <h2>Every dollar amount in the files</h2>
    <p>These are different kinds of money, so each kind has its own group. Compare amounts inside a group only, and
      never add the groups together.</p>
    ${groups.map(([k, es]) => {
      const kind = MONEY_KINDS[k] || OTHER_KIND;
      return `<h3>${esc(kind.label)} <span class="muted small">(${es.length})</span></h3>
        <p class="small muted">${esc(kind.help)}</p>
        <div class="money-cards">${es.map(card).join('')}</div>${showAll(es.length, CARDS, 'amounts')}`;
    }).join('')}
    <p class="small muted">“For every person” uses Canada's population on ${esc(POPULATION.asOf)}, from ${ext(POPULATION.url, 'Statistics Canada')}.</p>`;

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

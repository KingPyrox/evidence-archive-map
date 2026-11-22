import { loadAll } from '../services/data.js';
import { esc, int, money, moneyShort, date, month, monthRange, monthTick, nameCase, fileName } from '../helpers/format.js';
import { $, options, table, setParams, ext, figure, caption, term, changeBox } from '../helpers/dom.js';
import { chart, namedBars, BAR, BAR_SOFT } from '../helpers/chart.js';

export const title = 'AI grants';

const recordUrl = (r) => r.url || `https://search.open.canada.ca/grants/record/${r.ref},current`;
const DRAWN = 300; // table rows drawn at once; the CSV download has every match
const SHORT = 150; // characters of a purpose shown before "Read all"
const TOP = 12;
const TOP_DEPTS = 15;

// A long purpose shows its start and a "Read all" button (handler in render), so the table stays short.
function purposeHtml(r) {
  const p = r.purpose || '';
  const cut = r.cut ? ' <span class="muted">(cut short in the file)</span>' : '';
  if (p.length <= SHORT + 40) return `<span class="small purpose">${esc(p)}${cut}</span>`;
  const at = p.lastIndexOf(' ', SHORT) > 60 ? p.lastIndexOf(' ', SHORT) : SHORT;
  return `<span class="small purpose">${esc(p.slice(0, at))}<span class="dots">…</span><span class="rest" hidden>${esc(p.slice(at))}</span>${cut}
    <button type="button" class="linkish" data-read>Read all</button></span>`;
}

// Text that starts with = + - or @ is a formula to a spreadsheet; a leading apostrophe keeps it as text.
const cell = (v) => {
  const s = String(v ?? '');
  return `"${(typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export async function render(root, params) {
  const [gr] = await loadAll('grants');
  const tables = gr.tables;
  const multi = tables.length > 1;
  const recs = gr.records.map((r) => ({
    ...r, table: r.table || 0, name: nameCase(r.who), key: `${r.who} ${r.purpose} ${r.program} ${r.dept}`.toLowerCase(),
  }));
  const sum = (k) => tables.reduce((a, t) => a + t[k], 0);
  const T = {
    rows: sum('rows'), records: sum('records'), totalRows: sum('total_rows'), totalOnce: sum('total_once'),
    repeated: sum('repeated'), repeatRows: sum('repeat_rows'), differ: sum('repeat_amounts_differ'), identical: sum('repeat_identical'),
  };
  const depts = [...new Set(recs.map((r) => r.dept))].sort((a, b) => a.localeCompare(b));
  const progs = [...new Set(recs.map((r) => r.program))].sort((a, b) => a.localeCompare(b));
  const whos = [...new Map(recs.map((r) => [r.who, r.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const first = tables.map((t) => t.first).sort()[0];
  const last = tables.map((t) => t.last).sort().pop();
  const pick = (v, list) => (list.includes(v) ? v : '');
  const state = {
    ds: params.ds || '', dept: pick(params.dept, depts), prog: pick(params.prog, progs), q: params.q || '',
    who: whos.find(([w]) => w === params.who || w.toLowerCase() === String(params.who || '').toLowerCase())?.[0] || '',
    count: params.count === 'rows' ? 'rows' : 'once', show: params.show === 'count' ? 'count' : 'money',
  };
  const src = tables.map((t) => ext(t.url, fileName(t.file))).join(' · ');

  root.innerHTML = `
    <h1>AI grants: federal money in records that match “AI”</h1>
    <p class="lead">Vesper searched the federal government's list of ${term('grant', 'grants')} and
      ${term('contribution', 'contributions')} for “AI” and saved ${int(T.rows)} rows, dated ${esc(date(first))} to
      ${esc(date(last))}. Each row says who got the money, which department gave it, how much, and what it is for.</p>
    <p class="small muted">A record shows money the government agreed to give. It does not show how the money was spent.</p>
    <div class="stats">
      <div class="stat"><b>${moneyShort(T.totalOnce)}</b><span>counting each government record once</span></div>
      <div class="stat"><b>${int(T.records)}</b><span>government records, in ${int(T.rows)} rows</span></div>
      <div class="stat"><b>${int(whos.length)}</b><span>recipient names</span></div>
      <div class="stat"><b>${int(depts.length)}</b><span>departments and agencies</span></div>
    </div>
    ${T.repeated ? `<div class="panel">
      <h3>Some records are in the file more than once</h3>
      <p>${int(T.repeated)} government records fill ${int(T.repeatRows)} rows. Every copy links to the same government
        record, but the copies can differ in amount, program or end date. In ${int(T.differ)} of them the amount differs.
        ${T.identical ? `${int(T.identical)} are exact copies.` : ''}</p>
      <p>Adding up every row gives <b>${moneyShort(T.totalRows)}</b>. Counting each record once, at its largest amount,
        gives <b>${moneyShort(T.totalOnce)}</b>. The file does not say which copy is the newest, so this page counts each
        record once. To count every row, change “Count” under the charts.</p>
    </div>` : ''}
    <div class="grid cols-2">
      ${figure('g-dept', { how: `The ${TOP_DEPTS} departments and agencies with the most. Tap or click a bar to show only its records.`, src, cls: 'tall' })}
      <div>
        ${figure('g-month', { how: 'Each bar is one month, by the date on the record. Every month has a slot, so gaps are months with no records.', src, cls: 'short' })}
        ${figure('g-who', { how: `The ${TOP} recipients with the most. Names are as written in the file, so one company can show up under two spellings. Tap or click a bar to show only that one.`, src, cls: 'short' })}
      </div>
    </div>
    ${figure('g-prog', { how: `The ${TOP} programs with the most. Tap or click a bar to show only that program.`, src, cls: 'short' })}
    ${changeBox(`
      ${multi ? `<label>List <select id="g-ds">${options([['', 'All lists'], ...tables.map((t) => [String(t.id), t.title])], state.ds)}</select></label>` : ''}
      <label>Department <select id="g-dept">${options([['', 'All departments'], ...depts.map((d) => [d, d])], state.dept)}</select></label>
      <label>Program <select id="g-prog">${options([['', 'All programs'], ...progs.map((p) => [p, p])], state.prog)}</select></label>
      <label>Recipient <select id="g-who">${options([['', 'Anyone'], ...whos], state.who)}</select></label>
      <label>Search <input id="g-q" type="search" value="${esc(state.q)}" placeholder="Words in the name, purpose or program…"></label>
      <label>Count <select id="g-count">${options([['once', 'Each record once'], ['rows', 'Every row']], state.count)}</select></label>
      <label>Show <select id="g-show">${options([['money', 'Dollars'], ['count', 'Number of records']], state.show)}</select></label>`)}
    <h2 id="g-n"></h2>
    <p id="g-note" class="small"></p>
    <div id="g-table"></div>

    <h2>Where these records come from</h2>
    <div class="grid cols-2">${tables.map((t) => `
      <div class="panel"><h3>${esc(t.title)}</h3>
        <p class="small">Searched for <code>${esc(t.query)}</code>${t.match ? ` (${esc(t.match.toLowerCase())})` : ''} · ${esc(t.date_range || '')}<br>
        ${int(t.rows)} rows · ${int(t.records)} government records · ${ext(t.url, 'archive file')}</p>
        ${t.cut ? `<p class="small muted">${int(t.cut)} purposes are cut short in the file and have no full text. They end in “…”.</p>` : ''}</div>`).join('')}
    </div>
    <p class="small muted">Each row links to its record in the government's
      ${ext('https://search.open.canada.ca/grants/', 'Grants and Contributions search')}. The full purposes come from the
      file's second sheet.</p>`;

  const deptChart = chart($('#g-dept', root), {});
  const monthChart = chart($('#g-month', root), {});
  const whoChart = chart($('#g-who', root), {});
  const progChart = chart($('#g-prog', root), {});
  let rows = [];

  const val = (r) => (state.show === 'money' ? r.amount : 1);
  const fmt = (v) => (state.show === 'money' ? moneyShort(v) : int(v));
  const unit = () => (state.count === 'rows' ? 'rows' : 'records');

  function filtered() {
    const words = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return recs.filter((r) => (state.count === 'rows' || r.once)
      && (!state.ds || String(r.table) === state.ds)
      && (!state.dept || r.dept === state.dept) && (!state.prog || r.program === state.prog) && (!state.who || r.who === state.who)
      && words.every((w) => r.key.includes(w)));
  }

  function rank(key) {
    const by = new Map();
    rows.forEach((r) => by.set(r[key], (by.get(r[key]) || 0) + val(r)));
    return [...by.entries()].sort((a, b) => b[1] - a[1]);
  }

  // Named bars, biggest first; the bar the title talks about is dark. Clicking a bar filters by it.
  function bars(c, ranked, label, onPick, top = TOP) {
    const shown = ranked.slice(0, top);
    const names = shown.map(([k]) => label(k));
    const nb = namedBars(c, names, { right: 80 });
    c.setOption({
      grid: nb.grid, xAxis: nb.xAxis, yAxis: nb.yAxis,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true, formatter: (ps) => `<b>${esc(names[ps[0].dataIndex])}</b><br>${fmt(ps[0].value)}` },
      series: [{
        name: state.show === 'money' ? 'dollars' : unit(), type: 'bar', barWidth: nb.barWidth,
        data: shown.map(([, v], i) => ({ value: v, itemStyle: { color: i ? BAR_SOFT : BAR } })),
        label: { show: true, position: 'right', color: '#1c1f24', formatter: (p) => fmt(p.value) },
      }],
    }, true);
    c.off('click');
    c.on('click', (p) => onPick(shown[p.dataIndex][0]));
  }

  function lead(ranked, total, what) {
    if (!ranked.length) return 'No records match these choices.';
    const [k, v] = ranked[0];
    const share = total ? Math.round((v / total) * 100) : 0;
    return `${what(k)} ${state.show === 'money' ? `${moneyShort(v)} of ${moneyShort(total)}` : `${int(v)} of ${int(total)} ${unit()}`} (${share}%).`;
  }

  function draw() {
    setParams({ ...state, count: state.count === 'rows' ? 'rows' : '', show: state.show === 'count' ? 'count' : '' });
    rows = filtered();
    const total = rows.reduce((a, r) => a + val(r), 0);

    const d = rank('dept');
    caption(root, 'g-dept', esc(lead(d, total, (k) => `${k} gave the most:`)));
    bars(deptChart, d, (k) => k, (k) => { state.dept = k; $('#g-dept', root).value = k; draw(); }, TOP_DEPTS);

    const ms = rows.map((r) => r.date.slice(0, 7)).sort();
    const months = ms.length ? monthRange(ms[0], ms[ms.length - 1]) : [];
    const per = new Map();
    rows.forEach((r) => per.set(r.date.slice(0, 7), (per.get(r.date.slice(0, 7)) || 0) + val(r)));
    const data = months.map((m) => per.get(m) || 0);
    const peak = data.indexOf(Math.max(...data));
    caption(root, 'g-month', rows.length ? esc(`${month(months[peak])} has the most: ${fmt(data[peak])}.`) : 'No records match these choices.');
    monthChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => `<b>${esc(month(months[ps[0].dataIndex]))}</b><br>${fmt(ps[0].value)}` },
      grid: { left: 10, right: 20, top: 28, bottom: 10, containLabel: true },
      xAxis: { type: 'category', data: months, axisLabel: { interval: 0, formatter: monthTick(months.length) } },
      yAxis: { type: 'value', minInterval: 1, axisLabel: { formatter: (v) => fmt(v) } },
      series: [{
        name: state.show === 'money' ? 'dollars' : unit(), type: 'bar',
        data: data.map((v, i) => ({ value: v, itemStyle: { color: i === peak ? BAR : BAR_SOFT } })),
        label: { show: true, position: 'top', color: '#1c1f24', formatter: (p) => (p.dataIndex === peak ? fmt(p.value) : '') },
      }],
    }, true);

    const names = new Map(whos);
    const w = rank('who');
    caption(root, 'g-who', esc(lead(w, total, (k) => `${names.get(k)} got the most:`)));
    bars(whoChart, w, (k) => names.get(k), (k) => { state.who = k; $('#g-who', root).value = k; draw(); });

    const p = rank('program');
    caption(root, 'g-prog', esc(lead(p, total, (k) => `“${k}” has the most:`)));
    bars(progChart, p, (k) => k, (k) => { state.prog = k; $('#g-prog', root).value = k; draw(); });

    const dollars = rows.reduce((a, r) => a + r.amount, 0);
    $('#g-n', root).textContent = `${int(rows.length)} ${rows.length === 1 ? unit().slice(0, -1) : unit()} · ${money(dollars)}`;
    $('#g-note', root).innerHTML = `${rows.length > DRAWN ? `The table shows the ${DRAWN} largest. Narrow it with the choices above, or ` : ''}
      ${rows.length ? `<button type="button" class="linkish" id="g-csv">${rows.length > DRAWN ? 'get' : 'Get'} all ${int(rows.length)} as a spreadsheet (CSV)</button>` : ''}`;
    const sorted = [...rows].sort((a, b) => b.amount - a.amount || b.date.localeCompare(a.date));
    $('#g-table', root).innerHTML = table([
      { label: 'Date', value: (r) => date(r.date) },
      { label: 'Recipient', html: (r) => `<b>${esc(r.name)}</b><div class="small muted">${esc(r.dept)}</div>` },
      { label: 'Program', html: (r) => `<span class="small">${esc(r.program)}</span>` },
      { label: 'Amount', num: true, html: (r) => `${esc(money(r.amount, r.amount % 1 !== 0))}${r.repeat ? `<br><span class="badge warn" title="This government record fills ${r.repeat} rows in the file">${r.repeat} rows in the file</span>` : ''}` },
      { label: 'Ends', value: (r) => date(r.end) },
      { label: 'What it is for', html: purposeHtml },
      { label: 'Record', html: (r) => `${ext(recordUrl(r), 'Government record')}<div class="small muted">Row ${r.row} of the ${multi ? esc(fileName(tables[r.table].file)) : 'file'}</div>` },
    ], sorted.slice(0, DRAWN), { empty: 'No records match these choices.', limit: 20, cls: 'grants' });
  }

  function download() {
    const head = ['date', 'amount', 'recipient', 'department', 'program', 'end_date', 'purpose', 'government_record', 'archive_file', 'archive_row', 'rows_for_this_record'];
    const body = rows.map((r) => [r.date, r.amount, r.who, r.dept, r.program, r.end, r.purpose, recordUrl(r), tables[r.table].file, r.row, r.repeat || 1]);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`\ufeff${[head, ...body].map((x) => x.map(cell).join(',')).join('\r\n')}`], { type: 'text/csv' }));
    a.download = 'ai-grants.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const on = (id, key) => $(id, root)?.addEventListener('change', (ev) => { state[key] = ev.target.value; draw(); });
  on('#g-ds', 'ds');
  on('#g-dept', 'dept');
  on('#g-prog', 'prog');
  on('#g-who', 'who');
  on('#g-count', 'count');
  on('#g-show', 'show');
  let wait;
  $('#g-q', root).addEventListener('input', (ev) => { clearTimeout(wait); wait = setTimeout(() => { state.q = ev.target.value; draw(); }, 200); });
  $('#g-note', root).addEventListener('click', (ev) => { if (ev.target.closest('#g-csv')) download(); });
  $('#g-table', root).addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-read]');
    if (!b) return;
    const box = b.parentElement;
    const open = box.querySelector('.rest').hidden;
    box.querySelector('.rest').hidden = !open;
    box.querySelector('.dots').hidden = open;
    b.textContent = open ? 'Show less' : 'Read all';
  });
  draw();
}

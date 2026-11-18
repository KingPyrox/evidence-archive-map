// Thin wrapper over the global `echarts` (site/vendor/echarts.min.js) that disposes charts between pages.
const live = new Set();
const FONT = 'system-ui, Segoe UI, Roboto, Arial, sans-serif';

// A theme survives setOption(option, true), so every chart keeps the site font and 12px minimum text.
window.echarts.registerTheme('site', { textStyle: { fontFamily: FONT, fontSize: 12 } });

// The bar a chart's title talks about is dark, the rest lighter. Both pass 3:1 on white (WCAG 1.4.11).
export const BAR = '#1d4ed8';
export const BAR_SOFT = '#6185d6';

export function chart(el, option) {
  const c = window.echarts.init(el, 'site', { renderer: 'canvas' });
  c.setOption(option);
  live.add(c);
  dataLink(el, c);
  return c;
}

// Pattern fills on top of colour, for charts where colour tells series apart (WCAG 1.4.1).
// Spread into an option: setOption({ ...DECALS, series: [...] }).
export const DECALS = { aria: { enabled: true, decal: { show: true } } };

const pen = document.createElement('canvas').getContext('2d');
export function textWidth(text, size = 12) {
  pen.font = `${size}px ${FONT}`;
  return pen.measureText(String(text)).width;
}

// How many lines `text` takes at `width` px, so a chart can grow to fit wrapped labels instead of cutting them.
export function lines(text, width, size = 12) {
  pen.font = `${size}px ${FONT}`;
  let n = 1;
  let line = '';
  for (const w of String(text).split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (line && pen.measureText(next).width > width) { n += 1; line = w; } else line = next;
  }
  return n;
}

// Horizontal bars with each full name on its own line above its bar, as newsrooms do on phones, so no name is cut.
// `bar` is the bar (or bar group) thickness. Sets the chart height to fit and returns grid, axes and barWidth to
// spread into setOption. Values go in bar labels, so the value axis is hidden.
// `head` leaves room above the bars for a key.
export function namedBars(c, names, { bar = 14, right = 70, head = 0 } = {}) {
  const fit = () => {
    const width = Math.max(120, c.getDom().clientWidth - 12);
    const most = Math.max(1, ...names.map((n) => lines(n, width)));
    const top = head + Math.max(2, Math.ceil(most * 7.5));
    c.getDom().style.height = `${names.length * (bar + 12 + most * 15) + top + 4}px`;
    return { width, top };
  };
  const f = fit();
  c.resize();
  c.fitNames = () => { const g = fit(); c.setOption({ grid: { top: g.top }, yAxis: { axisLabel: { width: g.width } } }); };
  return {
    grid: { left: 2, right, top: f.top, bottom: 4, containLabel: false },
    // a "nice" rounded minimum would put zero far from the names when one value is a little below zero
    xAxis: { type: 'value', show: false, min: (v) => Math.min(0, v.min) },
    yAxis: {
      type: 'category', inverse: true, data: names, axisTick: { show: false }, axisLine: { show: false },
      axisLabel: { inside: true, interval: 0, align: 'left', verticalAlign: 'bottom', padding: [0, 0, bar / 2 + 3, 0], width: f.width, overflow: 'break', lineHeight: 15, color: '#1c1f24' },
    },
    barWidth: bar,
  };
}

// "Get the data" under every chart: a CSV of exactly what the chart shows, as Datawrapper and Our World in Data do.
// Series whose id starts with "_" are drawing helpers and are left out.
function rowsOf(c) {
  const o = c.getOption();
  const s = (o.series || []).filter((x) => !String(x.id || '').startsWith('_'));
  if (!s.length) return [];
  if (s[0].type === 'sankey' || s[0].type === 'graph') {
    const name = new Map((s[0].data || []).map((d) => [d.id ?? d.name, d.name]));
    const clean = (k) => String(name.get(k) ?? k).replace(/^→ /, '').trim();
    const amount = s[0].type === 'sankey';
    return [['from', 'to', ...(amount ? ['amount'] : [])],
      ...(s[0].links || []).map((l) => [clean(l.source), clean(l.target), ...(amount ? [l.value] : [])])];
  }
  const cat = [...(o.yAxis || []), ...(o.xAxis || [])].find((a) => a.type === 'category');
  const val = (d) => (d && typeof d === 'object' ? d.value : d);
  return [[cat?.name || 'item', ...s.map((x) => x.name || 'value')],
    ...(cat?.data || []).map((k, i) => [typeof k === 'object' ? k.value : k, ...s.map((x) => val((x.data || [])[i]) ?? '')])];
}

function dataLink(el, c) {
  const fig = el.closest('figure');
  if (!fig || fig.querySelector('[data-csv]')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'linkish';
  btn.dataset.csv = '';
  btn.textContent = 'Get the data (CSV)';
  btn.addEventListener('click', () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`\ufeff${rowsOf(c).map((r) => r.map(q).join(',')).join('\r\n')}`], { type: 'text/csv' }));
    a.download = `${el.id}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  let src = fig.querySelector('.fig-src');
  if (src) src.append(' · ');
  else { src = document.createElement('p'); src.className = 'fig-src'; fig.append(src); }
  src.append(btn);
}

export function disposeAll() {
  live.forEach((c) => c.dispose());
  live.clear();
}

window.addEventListener('resize', () => live.forEach((c) => { c.fitNames?.(); c.resize(); }));

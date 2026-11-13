// Thin wrapper over the global `echarts` (site/vendor/echarts.min.js) that disposes charts between pages.
const live = new Set();

export function chart(el, option) {
  const c = window.echarts.init(el, null, { renderer: 'canvas' });
  c.setOption({ textStyle: { fontFamily: 'system-ui, Segoe UI, Roboto, Arial, sans-serif' }, ...option });
  live.add(c);
  return c;
}

export function disposeAll() {
  live.forEach((c) => c.dispose());
  live.clear();
}

window.addEventListener('resize', () => live.forEach((c) => c.resize()));

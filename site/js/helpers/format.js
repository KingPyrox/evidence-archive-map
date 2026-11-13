const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const nf = new Intl.NumberFormat('en-CA');
export const int = (v) => (v == null ? '' : nf.format(Math.round(v)));

export function money(v, cents = false) {
  if (v == null) return '';
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(v);
}

export function moneyShort(v) {
  if (v == null) return '';
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function date(s) {
  if (!s) return '';
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function month(s) {
  const d = new Date(`${s.slice(0, 7)}-15T12:00:00`);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long' });
}

export const bytes = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`);
export const fileName = (p) => p.split('/').pop();

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
// countWord(4, 'table') -> 'Four tables'. Numbers above ten stay as digits.
export function countWord(n, noun = '') {
  const w = WORDS[n] || String(n);
  return noun ? `${w} ${noun}${n === 1 ? '' : 's'}` : w;
}
// listWords(['a', 'b', 'c']) -> 'a, b and c'
export const listWords = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

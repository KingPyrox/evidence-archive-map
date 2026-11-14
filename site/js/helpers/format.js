import { POPULATION } from '../enums/population.js';

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
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
  return `${sign}$${a.toFixed(0)}`;
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

// Every month from first to last ('YYYY-MM'), so a month axis has a slot for empty months and gaps look like gaps.
export function monthRange(first, last) {
  const out = [];
  let [y, m] = first.split('-').map(Number);
  const [Y, M] = last.split('-').map(Number);
  while (y < Y || (y === Y && m <= M)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

// Axis label for a month slot: month names on a short range, only the year (each January) on a long one.
export const monthTick = (count) => (v, i) => {
  const jan = i === 0 || v.endsWith('-01');
  if (count > 18) return jan ? v.slice(0, 4) : '';
  return new Date(`${v}-15T12:00:00`).toLocaleDateString('en-CA', jan ? { month: 'short', year: 'numeric' } : { month: 'short' });
};

// perPerson(901143051) -> 'about $22 for every person in Canada'. Below 10 million the share is a few cents, which
// helps nobody, so it returns ''.
export function perPerson(v) {
  if (v == null || v < 1e7) return '';
  const p = v / POPULATION.people;
  return `about ${p >= 1 ? money(p) : `${Math.round(p * 100)} cents`} for every person in Canada`;
}

// The ownership table prints names in capitals, which are slower to read. 'BAM HOLDINGS UK (2018) CORPORATION' ->
// 'BAM Holdings UK (2018) Corporation'. Short forms (LP, ULC, BAM) and Roman numerals stay in capitals.
const KEEP_CAPS = new Set(['ULC', 'USA', 'US', 'UK', 'EU', 'SA', 'AG', 'AB', 'AS', 'SAS', 'SARL', 'SRL', 'SPA', 'SE', 'SAU',
  'BAM', 'BIP', 'BEP', 'BPI', 'BRPI', 'BPG', 'BPO', 'REIT', 'HECO']);
const SMALL = new Set(['OF', 'AND', 'THE', 'DE', 'DU', 'DES', 'LA', 'LE', 'DEL', 'FOR']);
const FIXED = { LTD: 'Ltd', GMBH: 'GmbH' }; // company endings with their own spelling
export function nameCase(s) {
  if (!s || /[a-z]/.test(s)) return s;
  return s.split(' ').map((w, i) => {
    const bare = w.replace(/[^A-Z.]/g, '');
    if (!/[A-Z]/.test(w) || /\d/.test(w)) return w;
    if (KEEP_CAPS.has(bare.replace(/\.$/, ''))) return w;
    if (FIXED[bare.replace(/\.$/, '')]) return w.replace(/[A-Z]+/, FIXED[bare.replace(/\.$/, '')]);
    if (!/[AEIOUY]/.test(bare) || /^(I{1,3}|IV|VI{0,3}|IX|XI{0,3})$/.test(bare) || /^([A-Z]\.)+[A-Z]?\.?$/.test(bare)) return w;
    if (i > 0 && SMALL.has(bare)) return w.toLowerCase();
    return w.toLowerCase().replace(/(^|[-'(/&])([a-z])/g, (m, a, b) => a + b.toUpperCase());
  }).join(' ');
}

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
// countWord(4, 'table') -> 'Four tables'. Numbers above ten stay as digits.
export function countWord(n, noun = '') {
  const w = WORDS[n] || String(n);
  return noun ? `${w} ${noun}${n === 1 ? '' : 's'}` : w;
}
// listWords(['a', 'b', 'c']) -> 'a, b and c'
export const listWords = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

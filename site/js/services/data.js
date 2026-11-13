// Loads the JSON files that pipeline/build_data.py writes to site/data/.
const cache = new Map();

export function load(name) {
  if (!cache.has(name)) {
    cache.set(name, fetch(`data/${name}.json`).then((r) => {
      if (!r.ok) throw new Error(`Could not load data/${name}.json (HTTP ${r.status})`);
      return r.json();
    }));
  }
  return cache.get(name);
}

export const loadAll = (...names) => Promise.all(names.map(load));

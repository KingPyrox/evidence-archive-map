// Lookups between cases, datasets and videos.
export function caseIndex(cases) {
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
  const ofDataset = {};
  const ofVideo = {};
  for (const c of cases) {
    for (const d of c.datasets || []) (ofDataset[d] ||= []).push(c.id);
    for (const v of [c.video, ...(c.related_videos || [])].filter(Boolean)) (ofVideo[v] ||= []).push(c.id);
  }
  return { byId, ofDataset, ofVideo };
}

export function nodeCases(node, idx) {
  const s = new Set(node.cases || []);
  for (const d of node.datasets || []) for (const c of idx.ofDataset[d] || []) s.add(c);
  return s;
}

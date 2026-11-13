// Node types and evidence kinds used across the site. One place to change colours and wording.
export const NODE_TYPES = {
  case: { label: 'Case (archive folder)', color: '#be123c', symbol: 'roundRect' },
  claim: { label: 'Claim made in the archive', color: '#dc2626', symbol: 'diamond' },
  government: { label: 'Federal government body', color: '#1d4ed8', symbol: 'circle' },
  international: { label: 'International organization', color: '#7c3aed', symbol: 'circle' },
  person: { label: 'Person', color: '#047857', symbol: 'circle' },
  company: { label: 'Company', color: '#ea580c', symbol: 'circle' },
  program: { label: 'Program, policy or process', color: '#0e7490', symbol: 'circle' },
  country: { label: 'Country', color: '#65a30d', symbol: 'triangle' },
  dataset: { label: 'Dataset or table', color: '#475569', symbol: 'rect' },
  publisher: { label: 'Publisher', color: '#8b8b8b', symbol: 'circle' },
  'lobby-client': { label: 'Lobbying client', color: '#d97706', symbol: 'circle' },
  institution: { label: 'Institution named in lobbying records', color: '#93c5fd', symbol: 'circle' },
};

export const EDGE_KINDS = {
  data: { label: 'From a record', style: 'solid', help: 'A figure or fact copied from an official record: a grant, an Estimates table, a registry entry or an ownership table.' },
  stated: { label: 'Stated in a document', style: 'dashed', help: 'Stated in a document, news release, transcript or slide that is in the archive.' },
  computed: { label: 'Calculated by this site', style: 'dotted', help: 'A comparison or calculation this site made from archive files. The archive itself does not state it.' },
  case: { label: 'Appears in case', style: 'solid', help: 'The item appears in this case folder.' },
};

export const LAYERS = {
  evidence: 'Evidence links',
  lobbying: 'Lobbying: client to institution',
  'lobbying-summary': 'Lobbying: table to institution totals',
  case: 'Case membership',
};

export const TIMELINE_LAYERS = {
  evidence: { label: 'Events in the evidence', color: '#be123c' },
  lobbying: { label: 'Lobbying records', color: '#d97706' },
  video: { label: 'Videos', color: '#1d4ed8' },
  archive: { label: 'Archive case published', color: '#475569' },
};

export const DATASET_COLORS = {
  'dataset:lobby-drones': '#d97706',
  'dataset:lobby-telesat': '#1d4ed8',
  'dataset:lobby-roshel': '#047857',
  'dataset:lobby-stelco': '#7c3aed',
};

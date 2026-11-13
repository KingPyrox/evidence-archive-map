// Every page: its menu label, the reader's question it answers, and where to go next.
// The home page cards, the label above each page title and the "Where to next" cards all read from here.
export const PAGES = {
  money: { label: 'Money flows', group: 'Follow the money', icon: 'money', question: 'Where did the money go?', blurb: 'Money moved between federal departments, and grants IRCC paid to UN agencies.', next: ['spending', 'lobbying', 'map'] },
  spending: { label: 'Department budgets', group: 'Follow the money', icon: 'building', question: 'How much did each department get?', blurb: 'Every federal department, round by round, from the recovered Estimates tables.', next: ['money', 'timeline', 'sources'] },
  lobbying: { label: 'Lobbying', group: 'Who has influence', icon: 'megaphone', question: 'Who lobbied the government?', blurb: 'Registry records: which companies contacted which federal offices, and about what.', next: ['ownership', 'map', 'timeline'] },
  ownership: { label: 'Who owns what', group: 'Who has influence', icon: 'tree', question: 'Who owns what?', blurb: "Search Brookfield Corporation's published ownership structure, company by company.", next: ['lobbying', 'map', 'money'] },
  map: { label: 'Connections', group: 'Who has influence', icon: 'network', question: 'How is everything connected?', blurb: 'People, agencies, companies and programs, and the documents that link them.', next: ['timeline', 'money', 'sources'] },
  timeline: { label: 'Timeline', group: 'When it happened', icon: 'calendar', question: 'What happened when?', blurb: 'Every dated event, record and video, in order.', next: ['map', 'money', 'lobbying'] },
  survey: { label: 'Survey check', group: 'Check the facts', icon: 'check', question: 'Do the survey numbers add up?', blurb: 'A Statistics Canada article checked against the raw survey file.', next: ['sources', 'timeline', 'about'] },
  sources: { label: 'Sources', group: 'Check the facts', icon: 'folder', question: 'Where does every number come from?', blurb: 'Every archive file, the original sources it links to, and the automatic checks.', next: ['about', 'survey', 'map'] },
  about: { label: 'About', group: 'Check the facts', icon: 'info', question: 'How was this site made?', blurb: 'Where the data comes from, the words this site uses, and its limits.', next: ['sources', 'map', 'money'] },
  search: { label: 'Search', group: 'Search', icon: 'search', question: 'Looking for a name?', blurb: 'Search people, companies, departments and files.', next: ['map', 'lobbying', 'ownership'] },
};

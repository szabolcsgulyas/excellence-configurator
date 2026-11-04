// Árak a B2B árlistából (nettó Ft / fő / év). Ha az árlista változik, csak itt kell átírni.
export const PACKAGES = [
  { id: 'office-start', name: 'Office Start', price: 69050, items: ['excel-alap', 'ppt', 'word', 'outlook', 'canva'] },
  { id: 'excel-pro', name: 'Excel PRO', price: 91800, items: ['excel-alap', 'fuggv', 'diagram', 'kimut', 'ppivot', 'pquery'] },
  { id: 'data-bi', name: 'Data & BI Master', price: 79150, items: ['diagram', 'ppivot', 'pquery', 'pbi'] },
  { id: 'smart-office', name: 'Smart Office 360', price: 207800, items: ['excel-alap', 'fuggv', 'diagram', 'kimut', 'ppivot', 'pquery', 'pbi', 'chatgpt', 'ai-excel', 'word', 'outlook', 'ppt', 'canva'] },
  { id: 'creative-lab', name: 'Creative Lab', price: 73300, items: ['diagram', 'ppt', 'canva', 'chatgpt', 'ai-excel'] }
].map(p => ({ ...p, type: 'pkg' }));

export const COURSES = [
  ['excel-alap', 'Excel ismeretek a való világhoz', 36400], ['fuggv', 'Modern Excel függvények', 18000], ['diagram', 'Excel diagramok', 20000],
  ['kimut', 'Excel Kimutatás Extra', 36400], ['ppivot', 'Excel Power Pivot', 36400], ['pquery', 'Excel Power Query', 36400], ['vba', 'Excel VBA és makrók', 36400],
  ['pbi', 'Power BI', 65500], ['chatgpt', 'ChatGPT Mesterfokon', 43000], ['ai-excel', 'Mesterséges intelligencia az Excelben', 21800],
  ['word', 'Word', 25400], ['outlook', 'Outlook', 14500], ['ppt', 'PowerPoint', 25400], ['canva', 'Canva', 36400]
].map(([id, name, price]) => ({ id, name, price, type: 'course' }));

// Élő képzések: ár / alkalom (tájékoztató, a végleges díjat az Excellence egyezteti)
export const LIVE = [
  ['live-excel', 'Excel élő képzés (1 nap)', 299000], ['live-pbi', 'Power BI élő képzés (2 nap)', 698000], ['live-ai', 'AI a mindennapi irodai munkában (1 nap)', 399000],
  ['live-soft', 'Soft skill tréning (1 nap)', 580000], ['live-coach', 'Coaching és vezetőfejlesztés (1 nap)', 870000], ['live-opex', 'CI / OPEX (1 nap)', 690000]
].map(([id, name, price]) => ({ id, name, price, type: 'live' }));

export const BANDS = [{ min: 1, max: 10, pct: 0 }, { min: 11, max: 50, pct: 20 }, { min: 51, max: 100, pct: 36 }, { min: 101, max: 199, pct: 49 }];
export const FAST_PCT = 5, LOYAL_PCT = 30, VAT = 27, MIN_ORDER = 500000, MAX_SEATS = 199, VALID_DAYS = 14, FAST_DAYS = 7;
export const HOOK = ['fuggv', 'diagram'], GIFTS = ['ppt', 'word', 'outlook'];
export const ALL = [...PACKAGES, ...COURSES, ...LIVE];
export const byId = id => ALL.find(x => x.id === id);

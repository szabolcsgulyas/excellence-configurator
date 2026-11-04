// B2B árlista 2026 (Excellence) – a konfigurátorral azonos adatok. Árak nettó Ft.
// Nem megújuló csomagok: items = fizetős tartalom, gifts = ajándék tananyag (excelneked.hu csomagoldalak alapján)
export const PACKAGES = [
  { id: 'office-start', code: 'EB01', name: 'Office Start', price: 43700, items: ['excel-alap', 'word', 'ppt'], gifts: ['canva', 'outlook'] },
  { id: 'office-pro', code: 'EB02', name: 'Office Pro', price: 72900, items: ['excel-alap', 'word', 'ppt', 'kimut', 'pquery', 'ppivot'], gifts: ['diagram', 'fuggv', 'outlook', 'canva', 'chatgpt'] },
  { id: 'office-expert', code: 'EB03', name: 'Office Expert', price: 116700, items: ['excel-alap', 'word', 'ppt', 'kimut', 'pquery', 'ppivot', 'pbi', 'vba'], gifts: ['diagram', 'fuggv', 'outlook', 'canva', 'chatgpt'] }
].map(p => ({ ...p, type: 'pkg' }));

export const COURSES = [
  ['excel-alap', 'VT01', 'Excel ismeretek a való világhoz', 36400], ['fuggv', 'VT02', 'Modern Excel függvények', 18000], ['diagram', 'VT03', 'Excel diagramok', 20000],
  ['kimut', 'VT04', 'Excel Kimutatás Extra', 36400], ['ppivot', 'VT05', 'Excel Power Pivot', 36400], ['pquery', 'VT06', 'Excel Power Query', 36400],
  ['ppt', 'VT07', 'PowerPoint', 25400], ['word', 'VT08', 'Word', 25400], ['outlook', 'VT09', 'Outlook', 14500], ['pbi', 'VT10', 'Power BI', 65500],
  ['canva', 'VT11', 'Canva', 36400], ['chatgpt', 'VT13', 'ChatGPT Mesterfokon', 43000], ['vba', 'VT14', 'Excel VBA és makrók', 36400]
].map(([id, code, name, price]) => ({ id, code, name, price, type: 'course' }));

// Élő képzések: [kód, név, ár/csoport, napok]
export const LIVE = [
  ['MS01', 'Kezdő Excel tanfolyam', 299000, 1], ['MS02', 'Középhaladó Excel tanfolyam', 598000, 2], ['MS03', 'Haladó Excel tanfolyam', 598000, 2],
  ['MS04', 'Power Pivot és adatmodellezés tanfolyam', 598000, 2], ['MS05', 'Excel Power Query tanfolyam', 598000, 2], ['MS06', 'Excel VBA és makrók – alapismeretek', 598000, 2],
  ['MS07', 'Excel VBA és makrók – haladó', 299000, 1], ['MS08', 'Word – hatékony dokumentumkészítés', 299000, 1], ['MS09', 'PowerPoint – professzionális prezentációk', 299000, 1],
  ['PP01', 'Kezdő Power BI tanfolyam', 698000, 2], ['PP02', 'Középhaladó Power BI tanfolyam', 698000, 2], ['PP03', 'Haladó Power BI (DAX) tanfolyam', 349000, 1],
  ['PP04', 'Power BI vezetőknek', 174500, 0.5], ['PP05', 'Power Automate képzés', 698000, 2],
  ['AI01', 'AI a mindennapi irodai munkában', 399000, 1], ['AI02', 'AI a mindennapi munkában – saját feladatokkal', 798000, 2], ['AI03', 'Hatékony promptolás – ChatGPT és Claude', 399000, 1],
  ['AI04', 'Microsoft Copilot a munkahelyen', 399000, 1], ['AI05', 'AI workshop – gyakorlati vállalati felhasználás', 399000, 1],
  ['GW01', 'Google Workspace – hatékony irodai munkavégzés', 299000, 1], ['PR01', 'Python alapok tanfolyam', 1497000, 3], ['PR02', 'Python adatelemzés és automatizálás', 1497000, 3],
  ['SS01', 'Soft skill tréning', 580000, 1], ['CO01', 'Coaching és vezetőfejlesztés', 870000, 1], ['OX01', 'CI / OPEX – folyamatfejlesztés', 690000, 1]
].map(([code, name, price, days]) => ({ id: 'live-' + code.toLowerCase(), code, name, price, days, type: 'live' }));

export const EXTRAS = [
  { id: 'x-cert', code: 'KT03', name: 'Hivatalos tanfolyam (igazolással)', price: 5000, per: 'seat' },
  { id: 'x-track', code: 'KT04', name: 'Résztvevők haladásának nyomon követése', price: 30000, per: 'flat' },
  { id: 'x-exam', code: 'KT05', name: 'Záró tudásellenőrzés', price: 5000, per: 'exam' }
].map(x => ({ ...x, type: 'extra' }));
export const EXAM_IDS = ['excel-alap', 'kimut', 'pquery', 'ppivot'];

// Létszámsáv az összes e-learning hozzáférés (csomag + egyedi) után, csak egyedi képzésekre
export const BANDS = [{ min: 1, max: 10, pct: 0 }, { min: 11, max: 50, pct: 20 }, { min: 51, max: 100, pct: 36 }, { min: 101, max: 199, pct: 49 }];
// Napszám-kedvezmény az összes élő oktatási napra
export const DAY_TIERS = [{ min: 1, pct: 0 }, { min: 3, pct: 5 }, { min: 6, pct: 8 }, { min: 10, pct: 10 }, { min: 15, pct: 12 }];
export const FAST_PCT = 5, LOYAL_PCT = 30, VAT = 27, MIN_ORDER = 500000, MAX_SEATS = 199, VALID_DAYS = 14, FAST_DAYS = 7;
export const HOOK = ['fuggv', 'diagram'];
export const ALL = [...PACKAGES, ...COURSES, ...LIVE, ...EXTRAS];
export const byId = id => ALL.find(x => x.id === id);

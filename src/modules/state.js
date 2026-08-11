import { DEFAULT_SETTINGS } from './settings.js';

/* ---------- Global state ----------
   Orijinal tek-dosya sürümünde bunlar üst seviyede ayrı `let` değişkenleriydi
   (let EMP, let SETTINGS, let period, ...). ES modüllerinde bir modülden
   dışa aktarılan bir bağlayıcı başka bir modülden doğrudan yeniden
   atanamaz (import edilen isim salt okunurdur), bu yüzden hepsi TEK bir
   değişebilir (mutable) nesnenin alanları haline getirildi. Davranış
   birebir aynıdır: her yerde `EMP` yerine `state.EMP` okunur/yazılır. */
export const state = {
  EMP: [],
  SETTINGS: structuredClone(DEFAULT_SETTINGS),
  period: new Date().toISOString().slice(0, 7), // YYYY-MM
  ATT: {},
  OT: {},
  ADV: [],
  SPECIAL: [],
  currentTab: 'ozet',
  selectedDay: new Date().getDate(),
  ozetGizli: true,
};

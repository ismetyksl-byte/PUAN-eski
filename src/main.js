import './style.css';
import { wireNavigation, init } from './modules/handlers.js';
import { eskiVeriyiSupabaseyeTasiBirKereligine } from './modules/storage.js';

/* Orijinal tek-dosya sürümünde bu iki adım, script'in en altında,
   sırasıyla top-level olarak çalışıyordu: önce nav/period-picker
   olay dinleyicileri bağlanıyor, sonra init() (veri yükleme + ilk
   render) başlatılıyordu. Vite modül script'i de (type="module")
   tarayıcı tarafından DOM ayrıştırıldıktan sonra, defer edilerek
   çalıştırıldığı için zamanlama garantisi birebir aynıdır. */
wireNavigation();
await eskiVeriyiSupabaseyeTasiBirKereligine(); // bu cihazdaki eski IndexedDB verisini bir kereliğine buluta taşı
init();

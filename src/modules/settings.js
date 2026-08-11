/* ---------- Defaults ---------- */
export const DEFAULT_SETTINGS = {
  gunlukSaat: 9,
  ayGunSayisi: 30,
  katsayi: { haftaici:1.5, cumartesi:2, pazar:2, ozel:1.5 },
  kodlar: [
    {kod:'TG', ad:'Tam Gün', etki:'yok', ekOdeme:0, tip:'durum'},
    {kod:'YG', ad:'Yarım Gün', etki:'yarim', ekOdeme:0, tip:'durum'},
    {kod:'ÜZ', ad:'Ücretsiz İzin', etki:'tam', ekOdeme:0, tip:'durum'},
    {kod:'Yİ', ad:'Yıllık İzin', etki:'yok', ekOdeme:0, tip:'durum'},
    {kod:'R',  ad:'Rapor', etki:'yok', ekOdeme:0, tip:'durum'},
    {kod:'İÇ', ad:'İl İçi Montaj', etki:'yok', ekOdeme:950, tip:'ek'},
    {kod:'İD', ad:'İl Dışı', etki:'yok', ekOdeme:1350, tip:'ek'},
    {kod:'YOL', ad:'Yol Ödemesi', etki:'yok', ekOdeme:700, tip:'ek'},
  ]
};
export function migrateSettings(s){
  s.kodlar = s.kodlar || [];
  s.kodlar.forEach(k=>{
    if(k.ekOdeme===undefined) k.ekOdeme = 0;
    if(k.tip===undefined) k.tip = (k.ekOdeme>0 || ['İÇ','İD','YOL'].includes(k.kod)) ? 'ek' : 'durum';
  });
  DEFAULT_SETTINGS.kodlar.forEach(dk=>{
    const existing = s.kodlar.find(k=>k.kod===dk.kod);
    if(!existing) s.kodlar.push({...dk});
    else if(!existing.ekOdeme && dk.ekOdeme) existing.ekOdeme = dk.ekOdeme;
  });
  if(s.gunlukSaat===undefined) s.gunlukSaat = DEFAULT_SETTINGS.gunlukSaat;
  if(s.ayGunSayisi===undefined) s.ayGunSayisi = DEFAULT_SETTINGS.ayGunSayisi;
  if(!s.katsayi) s.katsayi = structuredClone(DEFAULT_SETTINGS.katsayi);
  return s;
}

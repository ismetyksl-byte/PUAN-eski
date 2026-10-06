import { state } from './state.js';
import { esc } from './utils.js';
import { daysInPeriod, weekday } from './period-utils.js';
import { calcEmployee, hourlyRate, getCell, normalizeCell } from './calculations.js';
import { attachHandlers } from './handlers.js';

/* ---------- Rendering ---------- */
const titles = {ozet:'Aylık Özet', puantaj:'Puantaj', mesai:'Mesailer', avans:'Avans / Kesinti', personel:'Personel Listesi', ayarlar:'Ayarlar'};

export function fmt(n){ return (Math.round(n*100)/100).toLocaleString('tr-TR',{minimumFractionDigits:2, maximumFractionDigits:2}); }

export async function render(){
  document.getElementById('pagetitle').textContent = titles[state.currentTab];
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.tab===state.currentTab));
  document.getElementById('periodInput').value = state.period;
  const c = document.getElementById('content');
  if(state.currentTab==='ozet') c.innerHTML = renderOzet();
  else if(state.currentTab==='puantaj') c.innerHTML = renderPuantaj();
  else if(state.currentTab==='mesai') c.innerHTML = renderMesai();
  else if(state.currentTab==='avans') c.innerHTML = renderAvans();
  else if(state.currentTab==='personel') c.innerHTML = renderPersonel();
  else if(state.currentTab==='ayarlar') c.innerHTML = renderAyarlar();
  attachHandlers();
}


function renderOzet(){
  if(state.EMP.length===0) return `<div class="card"><div class="empty">Henüz personel eklenmemiş. Önce "Personel Listesi" sekmesinden personel ekleyin.</div></div>`;
  if(state.EMP.filter(e=>e.aktif!==false).length===0) return `<div class="card"><div class="empty">Kayıtlı personel var ama hepsi pasif durumda. "Personel Listesi" sekmesinden aktif hale getirin.</div></div>`;
  let totalNet=0;
  const cards = state.EMP.filter(e=>e.aktif!==false).map(emp=>{
    const r = calcEmployee(emp);
    totalNet += r.net;
    const netGoster = state.ozetGizli ? '*** ₺' : fmt(r.net)+' ₺';
    return `<div class="tile ozet-tile" data-ozetemp="${emp.id}">
      <div class="tile-name">${esc(emp.ad)} ${esc(emp.soyad)}</div>
      <div class="tile-sub">${esc(emp.gorev)||''}</div>
      <div class="ozet-net">${netGoster}</div>
      <div class="tile-sub">Net Ödenecek</div>
      ${(!state.ozetGizli && r.ekOdemeToplam>0)?`<div class="pill" style="margin-top:6px;">+${fmt(r.ekOdemeToplam)} ₺ ek ödeme</div>`:''}
    </div>`;
  }).join('');
  return `<div class="card">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>${state.period} Dönemi — kendi kutusuna dokunarak tam detayını görebilirsin</span>
      <button class="chip" id="toggleOzetGizli">${state.ozetGizli?'👁 Tutarları Göster':'🙈 Tutarları Gizle'}</button>
    </div>
    <div class="tilegrid ozetgrid">${cards}</div>
    <div style="text-align:right;margin-top:16px;font-family:'Inter',sans-serif;font-size:15px;">Toplam Ödenecek: <b>${state.ozetGizli?'*** ₺':fmt(totalNet)+' ₺'}</b></div>
    <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn ghost small" id="exportCsv">CSV olarak indir</button>
      <button class="btn ghost small" id="exportXlsx">Excel (.xlsx) olarak indir</button>
    </div>
  </div>`;
}

function clampSelectedDay(){
  const days = daysInPeriod(state.period);
  if(state.selectedDay>days) state.selectedDay = days;
  if(state.selectedDay<1) state.selectedDay = 1;
}
const WD_NAMES = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
// "2026-10-04" -> " · Pazar" (geçersiz/boş tarihte boş döner)
function gunAdiEki(tarih){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tarih||'');
  if(!m) return '';
  return ' · '+WD_NAMES[new Date(Number(m[1]), Number(m[2])-1, Number(m[3])).getDay()];
}

function dayNavBar(){
  clampSelectedDay();
  const wd = weekday(state.period, state.selectedDay);
  const isSpecial = state.SPECIAL.includes(String(state.selectedDay));
  return `<div class="daynav">
    <button class="btn ghost small" id="prevDay">‹ Gün</button>
    <div class="daynav-label"><b>${state.selectedDay}</b> <span>${state.period}</span> · ${WD_NAMES[wd]}${(wd===0||wd===6)?' <span class="pill">Hafta Sonu</span>':''}</div>
    <button class="btn ghost small" id="nextDay">Gün ›</button>
  </div>
  <button class="chip ${isSpecial?'active':''}" id="toggleSpecial">${isSpecial?'★ Özel Gün (mesai x'+state.SETTINGS.katsayi.ozel+')':'☆ Bugünü özel gün yap'}</button>`;
}

function renderPuantaj(){
  if(state.EMP.length===0) return `<div class="card"><div class="empty">Önce personel ekleyin.</div></div>`;
  if(state.EMP.filter(e=>e.aktif!==false).length===0) return `<div class="card"><div class="empty">Kayıtlı personel var ama hepsi pasif durumda.</div></div>`;
  clampSelectedDay();
  const ekKodlar = state.SETTINGS.kodlar.filter(k=>k.tip==='ek');
  const tiles = state.EMP.filter(e=>e.aktif!==false).map(emp=>{
    const cell = getCell(emp.id, state.selectedDay);
    const def = state.SETTINGS.kodlar.find(k=>k.kod===cell.durum);
    const chips = ekKodlar.map(k=>`<span class="ek-chip ${cell.ekler.includes(k.kod)?'active':''}" data-ektap="${emp.id}" data-ekkod="${k.kod}">${k.kod}</span>`).join('');
    let badgeClass = cell.durum ? 'filled' : 'empty';
    if(cell.durum==='Yİ') badgeClass = 'badge-green';
    else if(cell.durum==='ÜZ') badgeClass = 'badge-red';
    return `<div class="tile" data-tileemp="${emp.id}">
      <div class="tile-badge ${badgeClass}">${cell.durum || '＋'}</div>
      <div class="tile-name">${esc(emp.ad)} ${esc(emp.soyad)}</div>
      <div class="tile-sub">${def?esc(def.ad):'Kayıt yok'}</div>
      ${cell.not?`<div class="tile-note">${esc(cell.not)}</div>`:''}
      <div class="ek-chip-row">${chips}</div>
    </div>`;
  }).join('');
  return `<div class="card">
    ${dayNavBar()}
    <div class="tilegrid" id="puantajGrid">${tiles}</div>
    <div class="hint">Ortadaki daireye dokun → gün durumu değişir (yıllık izin yeşil, ücretsiz izin kırmızı) &nbsp;·&nbsp; Alttaki İÇ/İD/YOL etiketlerine dokun → aynı gün için birden fazlasını aç-kapat &nbsp;·&nbsp; Basılı tut → tüm seçenekler ve aylık detay</div>
  </div>
  ${renderBordroListesi()}`;
}

function renderBordroListesi(){
  const sorted = state.EMP.filter(e=>e.aktif!==false).slice().sort((a,b)=>(a.ad+' '+a.soyad).localeCompare(b.ad+' '+b.soyad,'tr'));
  const g = n => state.ozetGizli ? '***' : fmt(n);
  const rows = sorted.map((emp,i)=>{
    const r = calcEmployee(emp);
    return `<tr>
      <td class="mono">${i+1}</td>
      <td>${esc(emp.ad)} ${esc(emp.soyad)}</td>
      <td class="mono">${g(emp.maas)}</td>
      <td class="mono">${g(r.deduction)}</td>
      <td class="mono">${g(r.otUcret)}</td>
      <td class="mono">${g(r.ekOdemeToplam)}</td>
      <td class="mono">${g(r.avansToplam)}</td>
      <td class="mono">${g(r.kesintiToplam)}</td>
      <td class="mono summary-net">${g(r.net)}${state.ozetGizli?'':' ₺'}</td>
    </tr>`;
  }).join('');
  return `<div class="card" id="bordroPrintArea">
    <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span>Bordro Listesi — İsme Göre A-Z (${state.period})</span>
      <button class="chip" id="toggleBordroGizli">${state.ozetGizli?'👁 Tutarları Göster':'🙈 Tutarları Gizle'}</button>
    </div>
    <div class="gridwrap"><table>
      <thead><tr><th>#</th><th>Personel</th><th>Maaş</th><th>Gün Kesintisi</th><th>Mesai Ücreti</th><th>Ek Ödeme</th><th>Avans</th><th>Kesinti</th><th>Net Ödenecek</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="empty">Personel yok</td></tr>'}</tbody>
    </table></div>
    <div style="margin-top:10px;"><button class="btn ghost small" id="printBordro">Yazdır</button></div>
  </div>`;
}

function renderMesai(){
  if(state.EMP.length===0) return `<div class="card"><div class="empty">Önce personel ekleyin.</div></div>`;
  if(state.EMP.filter(e=>e.aktif!==false).length===0) return `<div class="card"><div class="empty">Kayıtlı personel var ama hepsi pasif durumda.</div></div>`;
  clampSelectedDay();
  const tiles = state.EMP.filter(e=>e.aktif!==false).map(emp=>{
    const val = (state.OT[emp.id]||{})[state.selectedDay];
    return `<div class="tile" data-tileemp="${emp.id}">
      <div class="tile-badge ${val?'filled':'empty'}">${val ? val+' sa' : '＋'}</div>
      <div class="tile-name">${esc(emp.ad)} ${esc(emp.soyad)}</div>
      <div class="tile-sub">${val?'Mesai girildi':'Mesai yok'}</div>
    </div>`;
  }).join('');
  return `<div class="card">
    ${dayNavBar()}
    <div class="tilegrid" id="mesaiGrid">${tiles}</div>
    <div class="hint">Kutuya dokun → saat seç &nbsp;·&nbsp; Basılı tut → aylık mesai detayı</div>
  </div>`;
}

function renderAvans(){
  if(state.EMP.length===0) return `<div class="card"><div class="empty">Önce personel ekleyin.</div></div>`;
  if(state.EMP.filter(e=>e.aktif!==false).length===0) return `<div class="card"><div class="empty">Kayıtlı personel var ama hepsi pasif durumda.</div></div>`;
  const empOpts = state.EMP.filter(e=>e.aktif!==false).map(e=>`<option value="${e.id}">${esc(e.ad)} ${esc(e.soyad)}</option>`).join('');
  const rows = state.ADV.map(a=>{
    const emp = state.EMP.find(e=>e.id===a.empId);
    const isSaat = a.tur==='kesinti' && a.sekil==='saat';
    const hesapTutar = isSaat ? (Number(a.saat)||0)*hourlyRate(emp) : Number(a.tutar||0);
    const turEtiket = a.tur==='avans' ? 'Avans' : (isSaat ? 'Kesinti (Saat)' : 'Kesinti (Tutar)');
    return `<tr>
      <td>${emp?esc(emp.ad)+' '+esc(emp.soyad):'—'}</td>
      <td class="mono">${esc(a.tarih)}${gunAdiEki(a.tarih)}</td>
      <td>${esc(a.aciklama)}</td>
      <td><span class="pill ${a.tur==='kesinti'?'neg':''}">${turEtiket}</span></td>
      <td class="mono">${isSaat?(a.saat+' sa × '+fmt(hourlyRate(emp))+'₺ = '):''}${fmt(hesapTutar)} ₺</td>
      <td><button class="btn danger small" data-deladv="${a.id}">Sil</button></td>
    </tr>`;
  }).join('');
  return `<div class="card">
    <div class="section-title">Yeni Avans / Kesinti Ekle</div>
    <div class="row">
      <div class="field"><label>Personel</label><select id="advEmp">${empOpts}</select></div>
      <div class="field"><label>Tarih</label><input type="date" id="advTarih"/></div>
      <div class="field"><label>Tür</label><select id="advTur">
        <option value="avans">Avans</option>
        <option value="kesinti_saat">Kesinti — Geç Kalma / Erken Çıkış (saat)</option>
        <option value="kesinti_tutar">Kesinti — Sabit Tutar (₺)</option>
      </select></div>
    </div>
    <div class="row">
      <div class="field" id="tutarField"><label>Tutar (₺)</label><input type="number" id="advTutar"/></div>
      <div class="field" id="saatField" style="display:none;"><label>Kaç Saat</label><input type="number" step="0.25" min="0" id="advSaat" placeholder="ör. 1.5"/></div>
    </div>
    <div style="font-size:11px;color:var(--ink-soft);margin:-6px 0 12px;">Saat girilirse tutar otomatik hesaplanır: saat × personelin saatlik ücreti (mesai ücretiyle aynı oran).</div>
    <div class="field"><label>Açıklama</label><input type="text" id="advAciklama" placeholder="ör. Sabah 1.5 saat geç geldi"/></div>
    <button class="btn" id="addAdv">Ekle</button>
  </div>
  <div class="card">
    <div class="section-title">${state.period} Dönemi Kayıtları</div>
    <div class="gridwrap"><table><thead><tr><th>Personel</th><th>Tarih</th><th>Açıklama</th><th>Tür</th><th>Tutar</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="empty">Kayıt yok</td></tr>'}</tbody></table></div>
  </div>`;
}

function renderPersonel(){
  const rows = state.EMP.map(e=>`<tr>
    <td>${esc(e.ad)} ${esc(e.soyad)}</td>
    <td>${esc(e.gorev)}</td>
    <td>${esc(e.birim)}</td>
    <td>${esc(e.telefon)}</td>
    <td class="mono">${esc(e.ise_tarihi)}</td>
    <td class="mono">${fmt(e.maas||0)}</td>
    <td>${e.aktif!==false?'<span class="pill">Aktif</span>':'<span class="pill neg">Pasif</span>'}</td>
    <td><button class="btn ghost small" data-editemp="${e.id}">Düzenle</button> <button class="btn danger small" data-deletemp="${e.id}">Sil</button></td>
  </tr>`).join('');
  return `<div class="card">
    <div class="section-title" id="empFormTitle">Yeni Personel Ekle</div>
    <input type="hidden" id="empId"/>
    <div class="row">
      <div class="field"><label>Adı</label><input type="text" id="empAd"/></div>
      <div class="field"><label>Soyadı</label><input type="text" id="empSoyad"/></div>
      <div class="field"><label>Görevi</label><input type="text" id="empGorev" placeholder="ör. Ustabaşı"/></div>
      <div class="field"><label>Birim</label><input type="text" id="empBirim" placeholder="ör. Mobilya"/></div>
    </div>
    <div class="row">
      <div class="field"><label>Telefon</label><input type="tel" id="empTelefon"/></div>
      <div class="field"><label>İşe Giriş Tarihi</label><input type="date" id="empIseTarihi"/></div>
      <div class="field"><label>Aylık Maaş (₺)</label><input type="number" id="empMaas"/></div>
    </div>
    <button class="btn" id="saveEmp">Kaydet</button>
    <button class="btn ghost" id="cancelEmpEdit" style="display:none;">Vazgeç</button>
  </div>
  <div class="card">
    <div class="section-title">Tüm Personel</div>
    <div class="gridwrap"><table><thead><tr><th>Ad Soyad</th><th>Görevi</th><th>Birim</th><th>Telefon</th><th>İşe Giriş</th><th>Maaş</th><th>Durum</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="empty">Kayıt yok</td></tr>'}</tbody></table></div>
  </div>`;
}

function renderAyarlar(){
  const rows = state.SETTINGS.kodlar.map((k,i)=>`<tr>
    <td class="mono">${k.kod}</td>
    <td><input type="text" data-kodname="${i}" value="${esc(k.ad)}"/></td>
    <td><select data-kodetki="${i}">
      <option value="yok" ${k.etki==='yok'?'selected':''}>Ücret kesintisi yok</option>
      <option value="yarim" ${k.etki==='yarim'?'selected':''}>Yarım gün kesinti</option>
      <option value="tam" ${k.etki==='tam'?'selected':''}>Tam gün kesinti</option>
    </select></td>
    <td><input type="number" data-kodek="${i}" value="${k.ekOdeme||0}" style="width:100px"/></td>
  </tr>`).join('');
  return `<div class="card">
    <div class="section-title">Mesai Katsayıları</div>
    <div class="row">
      <div class="field"><label>Hafta İçi</label><input type="number" step="0.1" id="katHaftaici" value="${state.SETTINGS.katsayi.haftaici}"/></div>
      <div class="field"><label>Cumartesi</label><input type="number" step="0.1" id="katCumartesi" value="${state.SETTINGS.katsayi.cumartesi}"/></div>
      <div class="field"><label>Pazar</label><input type="number" step="0.1" id="katPazar" value="${state.SETTINGS.katsayi.pazar}"/></div>
      <div class="field"><label>Özel Gün</label><input type="number" step="0.1" id="katOzel" value="${state.SETTINGS.katsayi.ozel}"/></div>
    </div>
    <div class="row">
      <div class="field"><label>Günlük Çalışma Saati</label><input type="number" min="0.5" step="0.5" id="gunlukSaat" value="${state.SETTINGS.gunlukSaat}"/></div>
      <div class="field"><label>Bordro Ayı Gün Sayısı</label><input type="number" min="1" step="1" id="ayGunSayisi" value="${state.SETTINGS.ayGunSayisi}"/></div>
    </div>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">Saatlik ücret = Maaş ÷ (Ay gün sayısı × Günlük saat). Bu değerler Türk bordro geleneğinde genelde 30 gün / 9 saat olarak kullanılır.</div>
  </div>
  <div class="card">
    <div class="section-title">Puantaj Kodları ve Ücretlendirme Politikası</div>
    <div class="gridwrap"><table><thead><tr><th>Kod</th><th>Açıklama</th><th>Maaşa Etkisi</th><th>Her İşaretlemede Ek Ödeme (₺)</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>
  <button class="btn" id="saveSettings">Ayarları Kaydet</button>`;
}

const AY_ADLARI = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

export function gunGunDokum(emp){
  const days = daysInPeriod(state.period);
  const att = state.ATT[emp.id] || {};
  const ot = state.OT[emp.id] || {};
  const ayAdi = AY_ADLARI[Number(state.period.split('-')[1])-1];
  const rows = [];
  for(let d=1; d<=days; d++){
    const cell = normalizeCell(att[d]);
    const saat = ot[d];
    if(!cell.durum && cell.ekler.length===0 && !saat && !cell.not) continue;
    const parcalar = [];
    if(cell.durum){
      const def = state.SETTINGS.kodlar.find(k=>k.kod===cell.durum);
      parcalar.push(def?esc(def.ad):esc(cell.durum));
    }
    cell.ekler.forEach(kod=>{
      const def = state.SETTINGS.kodlar.find(k=>k.kod===kod);
      parcalar.push(def?esc(def.ad):esc(kod));
    });
    if(saat) parcalar.push('Mesai: '+saat+' sa');
    if(cell.not) parcalar.push('Not: '+esc(cell.not));
    rows.push(`<tr><td class="mono">${d} ${ayAdi} ${WD_NAMES[weekday(state.period,d)]}</td><td>${parcalar.join(' · ')}</td></tr>`);
  }
  return rows.length ? rows.join('') : '<tr><td colspan="2" class="empty">Bu ay için işlenmiş gün yok</td></tr>';
}


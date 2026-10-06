import * as XLSX from 'xlsx';
import { state } from './state.js';
import { toast, uid } from './utils.js';
import { loadJSON, saveJSON, storageGetRaw, storageSetRaw } from './storage.js';
import { daysInPeriod, validatePeriod } from './period-utils.js';
import { DEFAULT_SETTINGS, migrateSettings } from './settings.js';
import { calcEmployee, hourlyRate, getCell, setCell, loadPeriodData, deleteEmployeeCompletely } from './calculations.js';
import { render, fmt } from './render.js';
import { showDetail, showCodePicker, showHourPicker, bindTapHold } from './modals.js';

/* ---------- Event handlers ---------- */
export function attachHandlers(){
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showDetail(b.dataset.detail));

  if(state.currentTab==='puantaj' || state.currentTab==='mesai'){
    const prevBtn = document.getElementById('prevDay'), nextBtn = document.getElementById('nextDay');
    if(prevBtn) prevBtn.onclick = ()=>{ state.selectedDay--; if(state.selectedDay<1) state.selectedDay=1; render(); };
    if(nextBtn) nextBtn.onclick = ()=>{ state.selectedDay++; render(); };
    const specialBtn = document.getElementById('toggleSpecial');
    if(specialBtn) specialBtn.onclick = async ()=>{
      const tabAtStart = state.currentTab;
      const d = String(state.selectedDay);
      if(state.SPECIAL.includes(d)) state.SPECIAL = state.SPECIAL.filter(x=>x!==d); else state.SPECIAL.push(d);
      await saveJSON('special:'+state.period, state.SPECIAL);
      if(state.currentTab===tabAtStart) render();
    };
    const printBtn = document.getElementById('printBordro');
    if(printBtn) printBtn.onclick = ()=>{
      document.body.classList.add('print-bordro-only');
      window.print();
    };
    const toggleBordroBtn = document.getElementById('toggleBordroGizli');
    if(toggleBordroBtn) toggleBordroBtn.onclick = ()=>{ state.ozetGizli = !state.ozetGizli; render(); };
  }
  if(state.currentTab==='puantaj'){
    const durumSeq = ['', ...state.SETTINGS.kodlar.filter(k=>k.tip!=='ek').map(k=>k.kod)];
    document.querySelectorAll('#puantajGrid .tile').forEach(tile=>{
      const empId = tile.dataset.tileemp;
      bindTapHold(tile,
        async ()=>{ // tap: cycle to next durum code (ek payments untouched)
          const tabAtStart = state.currentTab;
          const cell = getCell(empId, state.selectedDay);
          cell.durum = durumSeq[(durumSeq.indexOf(cell.durum)+1) % durumSeq.length];
          setCell(empId, state.selectedDay, cell);
          await saveJSON('attendance:'+state.period, state.ATT);
          if(state.currentTab===tabAtStart) render();
        },
        ()=>showCodePicker(empId) // long press: full picker + monthly detail
      );
      tile.querySelectorAll('.ek-chip').forEach(chip=>{
        chip.addEventListener('pointerdown', e=>e.stopPropagation());
        chip.addEventListener('pointerup', async (e)=>{
          e.stopPropagation();
          const tabAtStart = state.currentTab;
          const ekKod = chip.dataset.ekkod;
          const cell = getCell(empId, state.selectedDay);
          const idx = cell.ekler.indexOf(ekKod);
          if(idx>=0) cell.ekler.splice(idx,1); else cell.ekler.push(ekKod);
          setCell(empId, state.selectedDay, cell);
          await saveJSON('attendance:'+state.period, state.ATT);
          if(state.currentTab===tabAtStart) render();
        });
      });
    });
  }
  if(state.currentTab==='mesai'){
    document.querySelectorAll('#mesaiGrid .tile').forEach(tile=>{
      const empId = tile.dataset.tileemp;
      bindTapHold(tile,
        ()=>showHourPicker(empId), // tap: open hour picker
        ()=>showDetail(empId) // long press: monthly detail
      );
    });
  }
  if(state.currentTab==='avans'){
    const turSelEl = document.getElementById('advTur');
    const tutarField = document.getElementById('tutarField'), saatField = document.getElementById('saatField');
    const syncFields = ()=>{
      const v = turSelEl.value;
      saatField.style.display = v==='kesinti_saat' ? 'block' : 'none';
      tutarField.style.display = v==='kesinti_saat' ? 'none' : 'block';
    };
    turSelEl.onchange = syncFields;
    syncFields();
    document.getElementById('addAdv').onclick = async ()=>{
      const empId = document.getElementById('advEmp').value;
      const tarih = document.getElementById('advTarih').value;
      const turSel = turSelEl.value;
      const aciklama = document.getElementById('advAciklama').value;
      if(!empId){ toast('Personel seçin.'); return; }
      let record = {id:uid(), empId, tarih, aciklama};
      if(turSel==='avans'){
        const tutar = Number(document.getElementById('advTutar').value);
        if(!tutar){ toast('Tutar girin.'); return; }
        record.tur='avans'; record.sekil='tutar'; record.tutar=tutar;
      } else if(turSel==='kesinti_tutar'){
        const tutar = Number(document.getElementById('advTutar').value);
        if(!tutar){ toast('Tutar girin.'); return; }
        record.tur='kesinti'; record.sekil='tutar'; record.tutar=tutar;
      } else {
        const saat = Number(document.getElementById('advSaat').value);
        if(!saat){ toast('Saat girin.'); return; }
        record.tur='kesinti'; record.sekil='saat'; record.saat=saat;
      }
      state.ADV.push(record);
      const tabAtStart = state.currentTab;
      await saveJSON('advances:'+state.period, state.ADV);
      if(state.currentTab===tabAtStart) render();
    };
    document.querySelectorAll('[data-deladv]').forEach(b=>b.onclick=async()=>{
      const tabAtStart = state.currentTab;
      state.ADV = state.ADV.filter(a=>a.id!==b.dataset.deladv);
      await saveJSON('advances:'+state.period, state.ADV);
      if(state.currentTab===tabAtStart) render();
    });
  }
  if(state.currentTab==='personel'){
    document.getElementById('saveEmp').onclick = async ()=>{
      const tabAtStart = state.currentTab;
      const id = document.getElementById('empId').value;
      const maas = Number(document.getElementById('empMaas').value)||0;
      const data = {
        ad: document.getElementById('empAd').value.trim(),
        soyad: document.getElementById('empSoyad').value.trim(),
        gorev: document.getElementById('empGorev').value.trim(),
        birim: document.getElementById('empBirim').value.trim(),
        telefon: document.getElementById('empTelefon').value.trim(),
        ise_tarihi: document.getElementById('empIseTarihi').value,
        maas: maas,
        aktif: true
      };
      if(!data.ad || !data.soyad){ toast('Ad ve soyad zorunlu.'); return; }
      if(!maas || maas<=0){ toast('Aylık maaş 0\'dan büyük olmalı.'); return; }
      if(id){
        const idx = state.EMP.findIndex(e=>e.id===id);
        state.EMP[idx] = {...state.EMP[idx], ...data};
      } else {
        state.EMP.push({id:uid(), ...data});
      }
      await saveJSON('employees', state.EMP);
      toast('Kaydedildi.');
      if(state.currentTab===tabAtStart) render();
    };
    document.getElementById('cancelEmpEdit').onclick = ()=>render();
    document.querySelectorAll('[data-editemp]').forEach(b=>b.onclick=()=>{
      const e = state.EMP.find(x=>x.id===b.dataset.editemp);
      render().then(()=>{
        document.getElementById('empFormTitle').textContent = 'Personeli Düzenle';
        document.getElementById('empId').value = e.id;
        document.getElementById('empAd').value = e.ad;
        document.getElementById('empSoyad').value = e.soyad;
        document.getElementById('empGorev').value = e.gorev||'';
        document.getElementById('empBirim').value = e.birim||'';
        document.getElementById('empTelefon').value = e.telefon||'';
        document.getElementById('empIseTarihi').value = e.ise_tarihi||'';
        document.getElementById('empMaas').value = e.maas||'';
        document.getElementById('cancelEmpEdit').style.display='inline-block';
      });
    });
    document.querySelectorAll('[data-deletemp]').forEach(b=>b.onclick=async()=>{
      if(!confirm('Bu personeli silmek istediğinize emin misiniz? Bu personelin tüm dönemlerdeki puantaj, mesai ve avans kayıtları da silinecek.')) return;
      const tabAtStart = state.currentTab;
      try{
        await deleteEmployeeCompletely(b.dataset.deletemp);
        if(state.currentTab===tabAtStart) render();
      } catch(e){
        console.error('employee delete cleanup failed', e);
        toast('Silme işlemi tamamlanamadı, tekrar deneyin.');
      }
    });
  }
  if(state.currentTab==='ayarlar'){
    document.getElementById('saveSettings').onclick = async ()=>{
      const tabAtStart = state.currentTab;
      const gunlukSaat = Number(document.getElementById('gunlukSaat').value);
      const ayGunSayisi = Number(document.getElementById('ayGunSayisi').value);
      if(!gunlukSaat || gunlukSaat<=0 || !ayGunSayisi || ayGunSayisi<=0){
        toast('Günlük çalışma saati ve ay gün sayısı 0\'dan büyük olmalı — kaydedilmedi.');
        return;
      }
      state.SETTINGS.katsayi.haftaici = Number(document.getElementById('katHaftaici').value);
      state.SETTINGS.katsayi.cumartesi = Number(document.getElementById('katCumartesi').value);
      state.SETTINGS.katsayi.pazar = Number(document.getElementById('katPazar').value);
      state.SETTINGS.katsayi.ozel = Number(document.getElementById('katOzel').value);
      state.SETTINGS.gunlukSaat = gunlukSaat;
      state.SETTINGS.ayGunSayisi = ayGunSayisi;
      document.querySelectorAll('[data-kodname]').forEach(inp=>{
        state.SETTINGS.kodlar[Number(inp.dataset.kodname)].ad = inp.value;
      });
      document.querySelectorAll('[data-kodetki]').forEach(sel=>{
        state.SETTINGS.kodlar[Number(sel.dataset.kodetki)].etki = sel.value;
      });
      document.querySelectorAll('[data-kodek]').forEach(inp=>{
        state.SETTINGS.kodlar[Number(inp.dataset.kodek)].ekOdeme = Number(inp.value)||0;
      });
      await saveJSON('settings', state.SETTINGS);
      toast('Ayarlar kaydedildi.');
      if(state.currentTab===tabAtStart) render();
    };
  }
  if(state.currentTab==='ozet'){
    document.querySelectorAll('[data-ozetemp]').forEach(t=>t.onclick=()=>showDetail(t.dataset.ozetemp));
    const toggleBtn = document.getElementById('toggleOzetGizli');
    if(toggleBtn) toggleBtn.onclick = ()=>{ state.ozetGizli = !state.ozetGizli; render(); };
    const exp = document.getElementById('exportCsv');
    if(exp) exp.onclick = ()=>{
      // CSV hücreleri, HTML kaçışından (esc()) farklı bir risk taşır: bir alan
      // '=', '+', '-' veya '@' ile başlarsa, dosya Excel'de açıldığında bu
      // içerik formül olarak çalıştırılabilir ("CSV formül enjeksiyonu").
      // Bu yalnızca CSV'ye özgüdür; sayısal alanlar zaten fmt() ile
      // biçimlendiği için etkilenmez, sadece serbest metin alanları korunur.
      const csvGuvenli = (s) => /^[=+\-@]/.test(s) ? "'" + s : s;
      let csv = 'Personel;Maaş;Ücretsiz İzin Günü;Gün Kesintisi;Mesai Saat;Mesai Ücreti;Ek Ödeme (İÇ/İD/YOL vb.);Avans;Kesinti;Net\n';
      state.EMP.filter(e=>e.aktif!==false).forEach(emp=>{
        const r = calcEmployee(emp);
        csv += `${csvGuvenli(emp.ad+' '+emp.soyad)};${fmt(emp.maas)};${r.tamGunSayisi};${fmt(r.deduction)};${r.saatToplam};${fmt(r.otUcret)};${fmt(r.ekOdemeToplam)};${fmt(r.avansToplam)};${fmt(r.kesintiToplam)};${fmt(r.net)}\n`;
      });
      const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href=url; a.download = `hakedis-${state.period}.csv`; a.click();
      URL.revokeObjectURL(url);
    };
    const expX = document.getElementById('exportXlsx');
    if(expX) expX.onclick = ()=>{
      const round2 = n => Math.round(n*100)/100;
      const days = daysInPeriod(state.period);
      const wb = XLSX.utils.book_new();

      const ozetRows = [['Personel','Maaş','Ücretsiz İzin Günü','Gün Kesintisi','Mesai Saat','Mesai Ücreti','Ek Ödeme','Avans','Kesinti','Net Ödenecek']];
      state.EMP.filter(e=>e.aktif!==false).forEach(emp=>{
        const r = calcEmployee(emp);
        ozetRows.push([emp.ad+' '+emp.soyad, round2(emp.maas), r.tamGunSayisi, round2(r.deduction), r.saatToplam, round2(r.otUcret), round2(r.ekOdemeToplam), round2(r.avansToplam), round2(r.kesintiToplam), round2(r.net)]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ozetRows), 'Özet');

      const puantajRows = [['Personel', ...Array.from({length:days},(_,i)=>i+1)]];
      state.EMP.filter(e=>e.aktif!==false).forEach(emp=>{
        puantajRows.push([emp.ad+' '+emp.soyad, ...Array.from({length:days},(_,i)=>{
          const cell = getCell(emp.id, i+1);
          const parts = [];
          if(cell.durum) parts.push(cell.durum);
          if(cell.ekler && cell.ekler.length) parts.push(...cell.ekler);
          return parts.join('+');
        })]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(puantajRows), 'Puantaj');

      const mesaiRows = [['Personel', ...Array.from({length:days},(_,i)=>i+1)]];
      state.EMP.filter(e=>e.aktif!==false).forEach(emp=>{
        const ot = state.OT[emp.id]||{};
        mesaiRows.push([emp.ad+' '+emp.soyad, ...Array.from({length:days},(_,i)=>ot[i+1]||'')]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mesaiRows), 'Mesai');

      const advRows = [['Personel','Tarih','Tür','Açıklama','Saat','Tutar (₺)']];
      state.ADV.forEach(a=>{
        const emp = state.EMP.find(e=>e.id===a.empId);
        const isSaat = a.tur==='kesinti' && a.sekil==='saat';
        const hesapTutar = isSaat ? (Number(a.saat)||0)*hourlyRate(emp) : Number(a.tutar||0);
        advRows.push([emp?emp.ad+' '+emp.soyad:'', a.tarih, a.tur==='avans'?'Avans':(isSaat?'Kesinti (Saat)':'Kesinti (Tutar)'), a.aciklama, isSaat?a.saat:'', round2(hesapTutar)]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(advRows), 'Avans-Kesinti');

      XLSX.writeFile(wb, `puantaj-${state.period}.xlsx`);
    };
  }
}

/* ---------- Nav & period wiring ---------- */
export function wireNavigation(){
  document.querySelectorAll('.navbtn').forEach(b=>{
    b.onclick = ()=>{ state.currentTab = b.dataset.tab; render(); };
  });
  document.getElementById('periodInput').onchange = async (e)=>{
    const val = e.target.value;
    if(!validatePeriod(val)){
      toast('Geçersiz dönem formatı. Beklenen biçim: YYYY-MM');
      e.target.value = state.period;
      return;
    }
    const tabAtStart = state.currentTab;
    state.period = val;
    await loadPeriodData();
    if(state.currentTab===tabAtStart) render();
  };
  document.getElementById('prevMonth').onclick = async ()=>{
    const [y,m]=state.period.split('-').map(Number);
    const d = new Date(y, m-2, 1);
    const newPeriod = d.toISOString().slice(0,7);
    if(!validatePeriod(newPeriod)){ toast('Geçersiz dönem formatı.'); return; }
    const tabAtStart = state.currentTab;
    state.period = newPeriod;
    await loadPeriodData();
    if(state.currentTab===tabAtStart) render();
  };
  document.getElementById('nextMonth').onclick = async ()=>{
    const [y,m]=state.period.split('-').map(Number);
    const d = new Date(y, m, 1);
    const newPeriod = d.toISOString().slice(0,7);
    if(!validatePeriod(newPeriod)){ toast('Geçersiz dönem formatı.'); return; }
    const tabAtStart = state.currentTab;
    state.period = newPeriod;
    await loadPeriodData();
    if(state.currentTab===tabAtStart) render();
  };
}

/* ---------- Init ---------- */
export async function checkStorageHealth(){
  try{
    const testVal = 't'+Date.now();
    await storageSetRaw('__healthcheck__', testVal);
    const okundu = await storageGetRaw('__healthcheck__');
    if(okundu !== testVal) throw new Error('okuma/yazma uyuşmadı');
  } catch(e){
    console.error('Bulut depolama sağlık kontrolü başarısız:', e);
    // Eskiden burada "gizli pencere" metni vardı; veriler artık Supabase'de
    // olduğu için gerçek hata nedeni (ör. "Failed to fetch", RLS ihlali,
    // eksik .env) gösteriliyor. Şeride dokununca kapanır.
    const neden = (e && (e.message || e.details || e.code)) ? String(e.message || e.details || e.code) : 'bilinmeyen hata';
    const b = document.createElement('div');
    b.id='storageWarning';
    b.style.cssText='position:fixed;top:8px;left:8px;right:8px;background:var(--red);color:#fff;text-align:center;padding:10px 14px;font-size:12.5px;line-height:1.4;z-index:200;font-family:Inter,sans-serif;border-radius:16px;box-shadow:0 8px 24px rgba(20,22,31,.18);cursor:pointer;';
    b.textContent='⚠ Buluta (Supabase) bağlanılamıyor, veriler kaydedilemiyor. Neden: '+neden+' — kapatmak için dokunun.';
    b.onclick=()=>b.remove();
    document.body.prepend(b);
  }
}

export async function init(){
  await checkStorageHealth();
  state.EMP = await loadJSON('employees', []);
  const savedSettings = await loadJSON('settings', null);
  if(savedSettings) state.SETTINGS = migrateSettings(savedSettings);
  else state.SETTINGS = structuredClone(DEFAULT_SETTINGS);
  await saveJSON('settings', state.SETTINGS);
  await loadPeriodData();
  await render();
}
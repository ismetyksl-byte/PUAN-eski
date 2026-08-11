import { state } from './state.js';
import { esc } from './utils.js';
import { saveJSON } from './storage.js';
import { calcEmployee, yillikIzinGunSayisi, getCell, setCell } from './calculations.js';
import { fmt, gunGunDokum, render } from './render.js';

/* ---------- Detail modal ---------- */
export async function showDetail(empId){
  const emp = state.EMP.find(e=>e.id===empId);
  const r = calcEmployee(emp);
  const year = state.period.split('-')[0];
  const yillikIzin = await yillikIzinGunSayisi(empId, year);
  const ekRows = r.ekOdemeDetay.map(x=>`<tr><td>${esc(x.ad)} (${x.sayi} gün × ${fmt(x.birim)} ₺)</td><td class="mono" style="text-align:right;">+${fmt(x.toplam)} ₺</td></tr>`).join('');
  const el = document.createElement('div');
  el.className='modal-bg';
  el.innerHTML = `<div class="modal">
    <h3>${esc(emp.ad)} ${esc(emp.soyad)} — ${state.period}</h3>
    <table style="margin-top:14px;">
      <tr><td>Maaş</td><td class="mono" style="text-align:right;">${fmt(emp.maas)} ₺</td></tr>
      <tr><td>Günlük ücret</td><td class="mono" style="text-align:right;">${fmt(r.gunlukUcret)} ₺</td></tr>
      <tr><td>Saatlik ücret</td><td class="mono" style="text-align:right;">${fmt(r.saatlikUcret)} ₺</td></tr>
      <tr><td>Gün bazlı kesinti (ÜZ/YG)</td><td class="mono" style="text-align:right;">−${fmt(r.deduction)} ₺</td></tr>
      <tr><td>Mesai (${r.saatToplam} sa)</td><td class="mono" style="text-align:right;">+${fmt(r.otUcret)} ₺</td></tr>
      ${ekRows}
      <tr><td>Avans</td><td class="mono" style="text-align:right;">−${fmt(r.avansToplam)} ₺</td></tr>
      <tr><td>Kesinti</td><td class="mono" style="text-align:right;">−${fmt(r.kesintiToplam)} ₺</td></tr>
      <tr><td><b>Net Ödenecek</b></td><td class="mono summary-net" style="text-align:right;">${fmt(r.net)} ₺</td></tr>
    </table>
    <div style="margin-top:12px;padding-top:10px;border-top:1px dashed var(--line);font-size:12px;color:var(--ink-soft);">
      ${year} yılı toplam yıllık izin: <b style="color:var(--ink);font-family:'IBM Plex Mono';">${yillikIzin} gün</b>
    </div>
    <div class="section-title" style="margin-top:16px;">Gün Gün Döküm</div>
    <div class="gridwrap"><table><thead><tr><th>Tarih</th><th>Detay</th></tr></thead><tbody>${gunGunDokum(emp)}</tbody></table></div>
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:16px;">
      <button class="btn ghost small" id="printDetail">Yazdır</button>
      <button class="btn ghost" id="closeModal">Kapat</button>
    </div>
  </div>`;
  document.getElementById('modalRoot').appendChild(el);
  el.querySelector('#closeModal').onclick = ()=>el.remove();
  el.querySelector('#printDetail').onclick = ()=>{
    document.body.classList.add('print-modal-only');
    window.print();
  };
  el.onclick = (e)=>{ if(e.target===el) el.remove(); };
}
window.addEventListener('afterprint', ()=>{
  document.body.classList.remove('print-modal-only');
  document.body.classList.remove('print-bordro-only');
});

/* ---------- Tap / long-press helper ---------- */
export function bindTapHold(el, onTap, onHold){
  let timer=null, held=false;
  const clear=()=>{ if(timer){ clearTimeout(timer); timer=null; } };
  el.addEventListener('pointerdown', (e)=>{
    held=false;
    timer=setTimeout(()=>{ held=true; if(navigator.vibrate) navigator.vibrate(12); onHold(); }, 480);
  });
  el.addEventListener('pointerup', ()=>{ clear(); if(!held) onTap(); });
  el.addEventListener('pointerleave', clear);
  el.addEventListener('contextmenu', (e)=>e.preventDefault());
}

export function closeModals(){ document.getElementById('modalRoot').innerHTML=''; }

export function showCodePicker(empId){
  const emp = state.EMP.find(e=>e.id===empId);
  const cell = getCell(empId, state.selectedDay);
  const durumKodlar = state.SETTINGS.kodlar.filter(k=>k.tip!=='ek');
  const ekKodlar = state.SETTINGS.kodlar.filter(k=>k.tip==='ek');
  const durumButtons = durumKodlar.map(k=>`<button data-pickdurum="${k.kod}" class="${cell.durum===k.kod?'active':''}">${k.kod} · ${esc(k.ad)}</button>`).join('');
  const ekButtons = ekKodlar.map(k=>`<button data-pickek="${k.kod}" class="${cell.ekler.includes(k.kod)?'active':''}">${cell.ekler.includes(k.kod)?'✓ ':''}${k.kod} · ${esc(k.ad)} (+${k.ekOdeme}₺)</button>`).join('');
  const el = document.createElement('div');
  el.className='modal-bg';
  el.innerHTML = `<div class="modal">
    <h3>${esc(emp.ad)} ${esc(emp.soyad)}</h3>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">${state.selectedDay} ${state.period}</div>
    <div class="section-title" style="margin-top:14px;">Gün Durumu (tek seçim)</div>
    <div class="pickerlist">
      <button class="clearbtn ${!cell.durum?'active':''}" data-pickdurum="">Boşalt</button>
      ${durumButtons}
    </div>
    <div class="section-title">Ek Ödemeler (aynı gün için birden fazlası seçilebilir)</div>
    <div class="pickerlist">${ekButtons}</div>
    <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;">
      <button class="btn ghost small" id="openMonthDetail">Aylık Detayı Gör</button>
      <button class="btn small" id="closePicker">Tamam</button>
    </div>
  </div>`;
  document.getElementById('modalRoot').appendChild(el);
  el.onclick=(e)=>{ if(e.target===el) el.remove(); };
  el.querySelector('#closePicker').onclick=()=>el.remove();
  el.querySelector('#openMonthDetail').onclick=()=>{ el.remove(); showDetail(empId); };
  el.querySelectorAll('[data-pickdurum]').forEach(b=>b.onclick=async()=>{
    const tabAtStart = state.currentTab;
    cell.durum = b.dataset.pickdurum;
    setCell(empId, state.selectedDay, cell);
    await saveJSON('attendance:'+state.period, state.ATT);
    el.remove();
    if(state.currentTab===tabAtStart) render();
    showCodePicker(empId);
  });
  el.querySelectorAll('[data-pickek]').forEach(b=>b.onclick=async()=>{
    const tabAtStart = state.currentTab;
    const kod = b.dataset.pickek;
    const idx = cell.ekler.indexOf(kod);
    if(idx>=0) cell.ekler.splice(idx,1); else cell.ekler.push(kod);
    setCell(empId, state.selectedDay, cell);
    await saveJSON('attendance:'+state.period, state.ATT);
    el.remove();
    if(state.currentTab===tabAtStart) render();
    showCodePicker(empId);
  });
}

export function showHourPicker(empId){
  const emp = state.EMP.find(e=>e.id===empId);
  const presets = [1,2,3,4,5,6,8,10];
  const buttons = presets.map(h=>`<button data-pickhour="${h}">${h} sa</button>`).join('');
  const el = document.createElement('div');
  el.className='modal-bg';
  el.innerHTML = `<div class="modal">
    <h3>${esc(emp.ad)} ${esc(emp.soyad)}</h3>
    <div style="font-size:12px;color:var(--ink-soft);margin-top:4px;">${state.selectedDay} ${state.period} için mesai saati</div>
    <div class="pickerlist">
      <button class="clearbtn" data-pickhour="0">Boşalt</button>
      ${buttons}
    </div>
    <div class="field"><label>Özel saat gir</label><input type="number" step="0.5" min="0" id="customHour"/></div>
    <div style="display:flex;justify-content:space-between;gap:8px;">
      <button class="btn ghost small" id="saveCustomHour">Kaydet</button>
      <button class="btn ghost small" id="openMonthDetailH">Aylık Detayı Gör</button>
      <button class="btn ghost small" id="closePickerH">Kapat</button>
    </div>
  </div>`;
  document.getElementById('modalRoot').appendChild(el);
  el.onclick=(e)=>{ if(e.target===el) el.remove(); };
  el.querySelector('#closePickerH').onclick=()=>el.remove();
  el.querySelector('#openMonthDetailH').onclick=()=>{ el.remove(); showDetail(empId); };
  const applyHour = async (h)=>{
    const tabAtStart = state.currentTab;
    if(!state.OT[empId]) state.OT[empId]={};
    if(h && Number(h)>0) state.OT[empId][state.selectedDay]=h; else delete state.OT[empId][state.selectedDay];
    await saveJSON('overtime:'+state.period, state.OT);
    el.remove();
    if(state.currentTab===tabAtStart) render();
  };
  el.querySelectorAll('[data-pickhour]').forEach(b=>b.onclick=()=>applyHour(b.dataset.pickhour));
  el.querySelector('#saveCustomHour').onclick=()=>applyHour(el.querySelector('#customHour').value);
}


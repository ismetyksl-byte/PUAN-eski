import { state } from './state.js';
import { loadJSON, saveJSON, storageListKeys } from './storage.js';
import { toast } from './utils.js';
import { daysInPeriod, weekday, validatePeriod } from './period-utils.js';

export async function loadPeriodData(){
  if(!validatePeriod(state.period)){
    toast('Geçersiz dönem formatı: '+state.period+' (beklenen: YYYY-MM)');
    return;
  }
  state.ATT = await loadJSON('attendance:'+state.period, {});
  state.OT = await loadJSON('overtime:'+state.period, {});
  state.ADV = await loadJSON('advances:'+state.period, []);
  state.SPECIAL = await loadJSON('special:'+state.period, []);
}

/* Single point of deletion for an employee and every record that references them.
   Order matters: all referencing records are cleaned first, and the employee
   record is only removed after that succeeds — so if cleanup throws partway,
   the employee stays in state.EMP (nothing pretends to be deleted) rather than
   leaving orphaned data behind under a vanished employee id. */
export async function deleteEmployeeCompletely(empId){
  const mapPrefixes = ['attendance:', 'overtime:'];
  for(const prefix of mapPrefixes){
    const keys = await storageListKeys(prefix);
    for(const key of keys){
      const data = await loadJSON(key, {});
      if(data[empId]){
        delete data[empId];
        await saveJSON(key, data);
      }
    }
  }
  const advKeys = await storageListKeys('advances:');
  for(const key of advKeys){
    const list = await loadJSON(key, []);
    const filtered = list.filter(a=>a.empId!==empId);
    if(filtered.length!==list.length) await saveJSON(key, filtered);
  }
  state.EMP = state.EMP.filter(e=>e.id!==empId);
  await saveJSON('employees', state.EMP);
  await loadPeriodData();
}

/* ---------- Attendance cell model: one exclusive "durum" code + any number of stackable "ek" payment codes ---------- */
export function normalizeCell(raw){
  if(!raw) return {durum:'', ekler:[]};
  if(typeof raw === 'string'){ // legacy single-code entries from before ek codes could stack
    const def = state.SETTINGS.kodlar.find(k=>k.kod===raw);
    if(def && def.tip==='ek') return {durum:'', ekler:[raw]};
    return {durum:raw, ekler:[]};
  }
  return {durum: raw.durum||'', ekler: raw.ekler||[]};
}
export function getCell(empId, day){
  return normalizeCell((state.ATT[empId]||{})[day]);
}
export function setCell(empId, day, cell){
  if(!state.ATT[empId]) state.ATT[empId] = {};
  if(!cell.durum && (!cell.ekler || cell.ekler.length===0)) delete state.ATT[empId][day];
  else state.ATT[empId][day] = {durum: cell.durum||'', ekler: cell.ekler||[]};
}

/* ---------- Calculation ---------- */
export function calcEmployee(emp){
  const gunlukUcret = emp.maas / state.SETTINGS.ayGunSayisi;
  const saatlikUcret = emp.maas / (state.SETTINGS.ayGunSayisi * state.SETTINGS.gunlukSaat);
  const days = daysInPeriod(state.period);
  const att = state.ATT[emp.id] || {};
  let tamGun=0, yarimGun=0, digerGun=0, deduction=0;
  const ekSayac = {};
  for(let d=1; d<=days; d++){
    const cell = normalizeCell(att[d]);
    if(cell.durum){
      const def = state.SETTINGS.kodlar.find(k=>k.kod===cell.durum);
      const etki = def ? def.etki : 'yok';
      if(etki==='tam'){ deduction += gunlukUcret; tamGun++; }
      else if(etki==='yarim'){ deduction += gunlukUcret*0.5; yarimGun++; }
      else { digerGun++; }
    }
    cell.ekler.forEach(kod=>{
      const def = state.SETTINGS.kodlar.find(k=>k.kod===kod);
      if(def && def.ekOdeme){ ekSayac[kod] = (ekSayac[kod]||0)+1; }
    });
  }
  const ekOdemeDetay = Object.entries(ekSayac).map(([kod,sayi])=>{
    const def = state.SETTINGS.kodlar.find(k=>k.kod===kod);
    return {kod, ad:def.ad, sayi, birim:def.ekOdeme, toplam:sayi*def.ekOdeme};
  });
  const ekOdemeToplam = ekOdemeDetay.reduce((s,x)=>s+x.toplam,0);
  const ot = state.OT[emp.id] || {};
  let saatToplam=0, otUcret=0;
  for(let d=1; d<=days; d++){
    const h = parseFloat(ot[d]);
    if(!h) continue;
    const wd = weekday(state.period, d);
    let kats;
    if(state.SPECIAL.includes(String(d))) kats = state.SETTINGS.katsayi.ozel;
    else if(wd===6) kats = state.SETTINGS.katsayi.cumartesi;
    else if(wd===0) kats = state.SETTINGS.katsayi.pazar;
    else kats = state.SETTINGS.katsayi.haftaici;
    saatToplam += h;
    otUcret += h * saatlikUcret * kats;
  }
  const advList = state.ADV.filter(a=>a.empId===emp.id);
  const avansToplam = advList.filter(a=>a.tur==='avans').reduce((s,a)=>s+Number(a.tutar||0),0);
  const kesintiToplam = advList.filter(a=>a.tur==='kesinti').reduce((s,a)=>{
    const tutar = a.sekil==='saat' ? (Number(a.saat)||0)*saatlikUcret : Number(a.tutar||0);
    return s + tutar;
  },0);
  const net = emp.maas - deduction + otUcret + ekOdemeToplam - avansToplam - kesintiToplam;
  return {gunlukUcret, saatlikUcret, tamGunSayisi:tamGun, yarimGunSayisi:yarimGun, deduction, saatToplam, otUcret, ekOdemeDetay, ekOdemeToplam, avansToplam, kesintiToplam, net};
}
export function hourlyRate(emp){ return emp ? emp.maas / (state.SETTINGS.ayGunSayisi * state.SETTINGS.gunlukSaat) : 0; }

export async function yillikIzinGunSayisi(empId, year){
  // Each month's read is independent of the others, so fire all 12 in parallel
  // instead of awaiting them one by one — cuts wait time from ~12 round-trips
  // in series down to the duration of the single slowest read. loadJSON already
  // catches its own errors and falls back to {}, so error handling is unchanged.
  const keys = Array.from({length:12}, (_,i)=>'attendance:'+year+'-'+String(i+1).padStart(2,'0'));
  const attList = await Promise.all(keys.map(key=>loadJSON(key, {})));
  let total=0;
  for(const att of attList){
    const empAtt = att[empId] || {};
    total += Object.values(empAtt).filter(raw=>normalizeCell(raw).durum==='Yİ').length;
  }
  return total;
}


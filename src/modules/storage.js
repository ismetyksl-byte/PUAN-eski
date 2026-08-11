import { toast } from './utils.js';
import { createClient } from '@supabase/supabase-js';

/* ---------- Supabase bulut depolama katmanı ----------
   Bu dosya artık verileri tarayıcıda (IndexedDB/localStorage) DEĞİL, Supabase
   üzerindeki "kv_store" tablosunda saklar. Böylece veriler cihazdan bağımsız,
   buluta kaydolur ve otomatik günlük yedekleme kurulabilir.

   loadJSON(key, fallback) ve saveJSON(key, value) imzaları ve davranışı
   (çakışma kontrolü, hata mesajları) AYNI kaldı — geri kalan tüm dosyalar
   (calculations.js, handlers.js, modals.js) hiç değişmedi. */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const KV_TABLO = 'kv_store';
const ESKI_VERI_TASINDI_BAYRAGI = 'puan_supabase_migrasyon_v1_tamam';

let __supabase = null;
function supabaseClient(){
  if(__supabase) return __supabase;
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    throw new Error('Supabase bağlantı bilgileri eksik. .env dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlı olmalı.');
  }
  __supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return __supabase;
}

export async function storageGetRaw(key){
  const sb = supabaseClient();
  const { data, error } = await sb.from(KV_TABLO).select('value').eq('key', key).maybeSingle();
  if(error) throw error;
  return data ? data.value : null;
}

export async function storageSetRaw(key, deger){
  const sb = supabaseClient();
  const { error } = await sb.from(KV_TABLO).upsert({ key, value: deger, updated_at: new Date().toISOString() });
  if(error) throw error;
}

export async function storageListKeys(onEk){
  const sb = supabaseClient();
  const { data, error } = await sb.from(KV_TABLO).select('key').like('key', onEk + '%');
  if(error) throw error;
  return (data || []).map(r => r.key);
}

/* ---------- Eski tarayıcı (IndexedDB) verisini bir kereliğine Supabase'e taşı ---------- */
const IDB_DATABASE_ADI = 'atolyePuantajDefteri';
const IDB_DEPO_ADI = 'kv';
const IDB_SURUM = 1;

function idbAcEskiVeriIcin(){
  return new Promise((resolve)=>{
    if(!('indexedDB' in window)){ resolve(null); return; }
    const istek = indexedDB.open(IDB_DATABASE_ADI, IDB_SURUM);
    istek.onupgradeneeded = (e)=>{
      const db = e.target.result;
      if(!db.objectStoreNames.contains(IDB_DEPO_ADI)) db.createObjectStore(IDB_DEPO_ADI);
    };
    istek.onsuccess = ()=> resolve(istek.result);
    istek.onerror = ()=> resolve(null);
    istek.onblocked = ()=> resolve(null);
  });
}

async function eskiIndexedDBVerisiniOku(){
  const db = await idbAcEskiVeriIcin();
  if(!db) return {};
  return new Promise((resolve)=>{
    try{
      const islem = db.transaction(IDB_DEPO_ADI, 'readonly');
      const depo = islem.objectStore(IDB_DEPO_ADI);
      const anahtarIstek = depo.getAllKeys();
      const degerIstek = depo.getAll();
      let anahtarlar, degerler;
      anahtarIstek.onsuccess = ()=>{ anahtarlar = anahtarIstek.result; tamamsaCozGetir(); };
      degerIstek.onsuccess = ()=>{ degerler = degerIstek.result; tamamsaCozGetir(); };
      anahtarIstek.onerror = ()=> resolve({});
      degerIstek.onerror = ()=> resolve({});
      function tamamsaCozGetir(){
        if(anahtarlar === undefined || degerler === undefined) return;
        const sonuc = {};
        anahtarlar.forEach((k, i)=>{ if(typeof k === 'string') sonuc[k] = degerler[i]; });
        resolve(sonuc);
      }
    } catch(e){ resolve({}); }
  });
}

export async function eskiVeriyiSupabaseyeTasiBirKereligine(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY) return; // bağlantı yoksa taşıma denemesi yapma
  if(window.localStorage.getItem(ESKI_VERI_TASINDI_BAYRAGI) === '1') return; // zaten taşındı

  try{
    const eskiVeriler = await eskiIndexedDBVerisiniOku();
    const anahtarlar = Object.keys(eskiVeriler);
    if(anahtarlar.length > 0){
      const sb = supabaseClient();
      // Sunucuda hangi anahtarlar zaten var, kontrol et — üzerine yazma, sadece eksikleri ekle
      const { data: mevcutlar } = await sb.from(KV_TABLO).select('key');
      const mevcutSet = new Set((mevcutlar || []).map(r => r.key));
      const eklenecekler = anahtarlar
        .filter(k => !mevcutSet.has(k))
        .map(k => ({ key: k, value: eskiVeriler[k], updated_at: new Date().toISOString() }));
      if(eklenecekler.length > 0){
        const { error } = await sb.from(KV_TABLO).upsert(eklenecekler);
        if(error) throw error;
        toast('Bu cihazdaki eski veriler buluta taşındı ('+eklenecekler.length+' kayıt).');
      }
    }
    window.localStorage.setItem(ESKI_VERI_TASINDI_BAYRAGI, '1');
  } catch(e){
    console.warn('Eski veri taşıma denemesi başarısız (uygulama yine de çalışmaya devam eder):', e);
    // Bayrağı set ETME — bağlantı sorunu geçiciyse bir sonraki açılışta tekrar denesin.
  }
}

/* ---------- Storage helpers (loadJSON/saveJSON imzaları ve davranışı AYNI) ---------- */
const __lastSyncedRaw = {};
const __writeQueues = {};

export async function loadJSON(key, fallback){
  let raw;
  try{ raw = await storageGetRaw(key); }
  catch(e){
    console.error('Supabase okuma hatası:', e);
    toast('Bulut bağlantısı kurulamadı, "'+key+'" için geçici olarak boş gösteriliyor.');
    return fallback;
  }
  if(raw === null || raw === undefined) return fallback;
  __lastSyncedRaw[key] = raw;
  try{
    return JSON.parse(raw);
  } catch(parseErr){
    console.error('Bozuk kayıt (JSON parse edilemedi):', key, parseErr);
    toast('"'+key+'" için kayıtlı veri okunamadı (bozuk format). Geçici olarak boş gösteriliyor.');
    return fallback;
  }
}

export async function saveJSON(key, value){
  const run = async ()=>{
    try{
      const payload = JSON.stringify(value);
      if(__lastSyncedRaw[key] !== undefined){
        let currentRaw = null;
        try{ currentRaw = await storageGetRaw(key); } catch(e){ currentRaw = null; }
        if(currentRaw !== null && currentRaw !== __lastSyncedRaw[key]){
          toast('Bu kayıt başka bir cihaz/sekmeden güncellenmiş görünüyor. Verinizi kaybetmemek için sayfayı yenileyip tekrar deneyin.');
          return false;
        }
      }
      await storageSetRaw(key, payload);
      __lastSyncedRaw[key] = payload;
      return true;
    } catch(e){
      console.error('storage error', e);
      toast('Buluta kaydedilemedi (internet bağlantınızı kontrol edin), tekrar deneyin.');
      return false;
    }
  };
  const prev = __writeQueues[key] || Promise.resolve();
  const next = prev.then(run, run);
  __writeQueues[key] = next;
  return next;
}

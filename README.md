# Puantaj Takip

Personel, puantaj, mesai, avans/kesinti ve aylık bordro yönetimi için hazırlanmış web paneli. Veriler **Supabase** (PostgreSQL) üzerinde saklanır; böylece tarayıcı verisi silinse ya da bilgisayar değişse bile kaybolmaz.

Teknoloji: **Vite + Vanilla JavaScript**, Supabase (`@supabase/supabase-js`), Excel dışa aktarma için `xlsx`.

---

## Hızlı Başlangıç

```bash
# 1. Bağımlılıkları yükleyin
npm install

# 2. .env dosyasını oluşturup Supabase bilgilerini girin (aşağıya bakın)
cp .env.example .env

# 3. Geliştirme sunucusu
npm run dev

# 4. Production build / önizleme
npm run build
npm run preview
```

---

## Supabase Kurulumu (ZORUNLU)

Uygulama **iki ortam değişkeni olmadan veri okuyamaz/kaydedemez**:

| Değişken | Nereden alınır |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |

- **Yerelde:** `.env` dosyasına yazın (`.env` git'e girmez).
- **Vercel'de:** Project → Settings → Environment Variables bölümüne **aynı isimlerle** ekleyin, ardından **yeniden deploy** edin. `VITE_` ile başlayan değişkenler build sırasında koda gömülür; sonradan eklenip deploy edilmezse etkisi olmaz.

### Veritabanı tablosu

Kod, tek bir anahtar-değer tablosu kullanır: **`kv_store`** (bkz. `src/modules/storage.js`). Kodun beklediği sütunlar:

| Sütun | Tür | Not |
|---|---|---|
| `key` | text | birincil anahtar |
| `value` | text | JSON metni |
| `updated_at` | timestamptz | |

Tablo üzerinde (RLS açıksa) anon rolünün **select, insert ve update** yapabilmesi gerekir; aksi halde kayıt sırasında "row-level security" hatası alınır.

Saklanan anahtarlar: `employees`, `settings`, `attendance:YYYY-MM`, `overtime:YYYY-MM`, `advances:YYYY-MM`, `special:YYYY-MM`. (`__healthcheck__` anahtarı, açılışta bağlantıyı denemek için kullanılır.)

---

## Proje Yapısı

```
PUANTAJ-TAKIP/
├── index.html
├── package.json
├── vite.config.js
├── .env.example
├── public/favicon.svg
├── assets/logo.svg
└── src/
    ├── main.js            # Giriş noktası
    ├── style.css          # Tüm görünüm (mavi/kart teması)
    └── modules/
        ├── storage.js      # Supabase (kv_store) veri katmanı
        ├── utils.js        # toast, uid, esc
        ├── settings.js     # Varsayılan ayarlar + eski veri göçü
        ├── period-utils.js # Tarih/dönem hesaplamaları
        ├── state.js        # Paylaşımlı uygulama durumu
        ├── calculations.js # Maaş/mesai/kesinti hesaplama mantığı
        ├── render.js       # Ekranların HTML üretimi
        ├── modals.js       # Detay/seçim pencereleri, uzun basma
        └── handlers.js     # Olaylar, gezinme, uygulama başlatma
```

`state.js`, paylaşılan uygulama durumunu (`EMP`, `SETTINGS`, `period`, `ATT`, `OT`, `ADV`, `SPECIAL`, `currentTab`, `selectedDay`, `ozetGizli`) tek bir nesnede toplar. `render.js` ↔ `handlers.js` arasındaki döngüsel import kasıtlıdır ve güvenlidir (fonksiyonlar modül yüklenirken değil, kullanıcı etkileşiminde çağrılır).

---

## Eski Tarayıcı Verisinin Taşınması

Uygulamanın önceki sürümü verileri tarayıcıda (IndexedDB) tutuyordu. `main.js`, açılışta bir kereliğine o eski veriyi okuyup Supabase'e **yalnızca eksik anahtarları** ekler (var olanların üzerine yazmaz) ve cihazda bir bayrak bırakır. Bu yüzden `storage.js` içinde hâlâ eski IndexedDB okuma kodu bulunur.

---

## Vercel'e Deploy

1. Depoyu Vercel'e bağlayın.
2. Ayarlar: Build Command `npm run build`, Output Directory `dist`, Install Command `npm install`.
3. **Environment Variables** bölümüne `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` ekleyin, deploy edin.

---

## Sorun Giderme

Açılışta ekranın üstünde kırmızı bir şerit ve **"Buluta (Supabase) bağlanılamıyor… Neden: …"** yazısı çıkarsa, "Neden" kısmı sorunu gösterir:

| "Neden" metni | Anlamı / çözüm |
|---|---|
| `Supabase bağlantı bilgileri eksik…` | Vercel/`.env` içinde iki değişken tanımlı değil. Ekleyip yeniden deploy edin. |
| `Failed to fetch` | Ağ yok, URL yanlış ya da Supabase projesi **duraklatılmış** (ücretsiz planda bir süre kullanılmazsa olur). Supabase panelinden "Restore/Resume" edin. |
| `row-level security…` | `kv_store` tablosunda anon rolü için select/insert/update politikası eksik. |
| `relation "public.kv_store" does not exist` | `kv_store` tablosu oluşturulmamış. |
| `Invalid API key` | `VITE_SUPABASE_ANON_KEY` yanlış ya da değiştirilmiş. |

Şeride dokunarak kapatabilirsiniz.

---

## Değişiklik Geçmişi

Ayrıntılı değişiklik günlüğü `index.html` dosyasının `<head>` bölümündeki yorum bloğundadır.

- Tek dosyalık HTML → Vite + Vanilla JS projesine geçiş; Excel kütüphanesi build'e gömüldü.
- Depolama tarayıcı IndexedDB'den Supabase `kv_store` tablosuna taşındı; eski veri tek seferlik göçle aktarılır.
- Hata şeridi artık gerçek bağlantı hata nedenini gösterir.
- Yeni tasarım: mavi vurgu, beyaz yuvarlak kartlar, ikonlu yüzen alt menü.

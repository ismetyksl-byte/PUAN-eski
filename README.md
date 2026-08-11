# Atölye Puantaj Defteri (PUAN)

Personel, puantaj, mesai, avans/kesinti ve aylık bordro yönetimi için hazırlanmış, tarayıcı içi (IndexedDB) veri saklayan bir web paneli.

Bu proje, daha önce tek bir `.html` dosyası olarak yazılan uygulamanın **davranışı birebir korunarak**, üretim (production) kalitesinde bir **Vite + Vanilla JavaScript** projesine taşınmış halidir.

---

## Hızlı Başlangıç

```bash
# 1. Bağımlılıkları yükleyin
npm install

# 2. Geliştirme sunucusunu başlatın (canlı yeniden yükleme ile)
npm run dev

# 3. Production build alın
npm run build

# 4. Build'i yerel olarak önizleyin
npm run preview
```

`npm run dev` komutundan sonra tarayıcı otomatik olarak `http://localhost:5173` adresinde açılır.

---

## Proje Yapısı

```
PUAN/
├── index.html                 # Tek sayfa uygulamanın HTML iskeleti
├── package.json
├── vite.config.js
├── .env.example
├── .gitignore
├── public/                    # Build'e OLDUĞU GİBİ kopyalanan statik dosyalar
│   └── favicon.svg
├── assets/                    # Proje/marka varlıkları (kaynak SVG vb.)
│   └── logo.svg
└── src/
    ├── main.js                # Giriş noktası — navigasyonu bağlar ve init() çağırır
    ├── style.css               # Tüm CSS (orijinal <style> bloğundan taşındı)
    └── modules/
        ├── storage.js          # IndexedDB / localStorage veri katmanı
        ├── utils.js             # toast, uid, esc (saf yardımcı fonksiyonlar)
        ├── settings.js           # Varsayılan ayarlar + eski veri göçü (migration)
        ├── period-utils.js        # Tarih/dönem hesaplamaları (saf fonksiyonlar)
        ├── state.js                # Paylaşımlı uygulama durumu (tek kaynak)
        ├── calculations.js          # Maaş/mesai/kesinti hesaplama mantığı
        ├── render.js                  # Tüm ekranların HTML üretimi
        ├── modals.js                   # Detay/seçim pencereleri, uzun-basma
        └── handlers.js                  # Olay bağlama, gezinme, uygulama başlatma
```

### Neden bu şekilde bölündü?

Orijinal dosyada tüm mantık tek bir `<script>` bloğu içindeydi ve paylaşılan durum (`EMP`, `SETTINGS`, `period`, `ATT`, `OT`, `ADV`, `SPECIAL`, `currentTab`, `selectedDay`, `ozetGizli`) üst seviye `let` değişkenleriydi. ES modüllerinde bir modülden dışa aktarılan bir isim başka bir modülden yeniden atanamadığı için, bu durum **tek bir `state` nesnesi** (`src/modules/state.js`) altında toplandı. Geri kalan her modül, sadece ihtiyaç duyduğu fonksiyonları `import` eder — bağımlılık yönü açık ve tek yönlüdür (yalnızca `render.js` ↔ `handlers.js` arasında, `render()`'ın `attachHandlers()`'ı çağırması nedeniyle kasıtlı bir döngüsel referans vardır; bu, ES modüllerinde güvenli bir kalıptır çünkü hiçbir fonksiyon modül yüklenirken değil, yalnızca kullanıcı etkileşimi sırasında çağrılır).

---

## Bu Sürümde Değişen Tek Şey: Kod Organizasyonu

**Değişmeyenler (davranış birebir korundu):**
- Tüm ekranlar: Aylık Özet, Puantaj, Mesailer, Avans/Kesinti, Personel Listesi, Ayarlar
- Tüm hesaplama formülleri (maaş, mesai katsayıları, gün bazlı kesinti, ek ödeme, saat bazlı kesinti, yıllık izin sayacı)
- Tüm görsel tasarım (CSS birebir taşındı, hiçbir kural değişmedi)
- Tüm veri modeli ve depolama anahtarları (`employees`, `settings`, `attendance:YYYY-MM`, `overtime:YYYY-MM`, `advances:YYYY-MM`, `special:YYYY-MM`)
- Veri bütünlüğü önlemleri (bozuk JSON ayrımı, sıralı yazma kuyruğu, sekmeler arası çakışma kontrolü)

**Değişenler (sadece teknik altyapı):**
1. **Kod, 9 ayrı modüle bölündü** (yukarıdaki proje yapısına bakın).
2. **Excel kütüphanesi artık CDN'den değil, npm paketi olarak (`xlsx`) build'e gömülüyor.** Bunun tek pratik sonucu: Excel dışa aktarma artık **internet bağlantısı olmadan da çalışıyor** (önceki sürümde CDN'den yüklenemezse "kütüphane yüklenemedi" hatası veriyordu — bu kontrol artık gereksiz olduğu için kaldırıldı, çünkü kütüphane her zaman build'in içinde hazır bulunuyor).
3. Google Fonts hâlâ CDN üzerinden yükleniyor (bu, orijinal davranışla aynı — internet yoksa yalnızca fontlar yedek fonta düşer, işlevsellik etkilenmez).

---

## Veri Nerede Saklanıyor?

Uygulama **Supabase veya başka bir harici veritabanı kullanmıyor.** Tüm veriler, kullanıcının tarayıcısındaki **IndexedDB**'de (desteklenmiyorsa otomatik olarak **localStorage**'da) tutulur. `.env.example` dosyasında ileride bir Supabase geçişi için rezerve edilmiş (şu an kullanılmayan) değişken adları bulunur — bunlar şu an kodun hiçbir yerinde okunmuyor.

Bu, verinin **tarayıcıya/cihaza özel** olduğu, cihazlar arası otomatik senkronizasyon olmadığı anlamına gelir. Ayrıntı için `src/modules/storage.js` dosyasının başındaki yorumlara bakın.

---

## Vercel'e Deploy

Bu proje Vercel'de ek bir yapılandırma gerektirmeden çalışır:

1. Depoyu Vercel'e bağlayın (veya `vercel` CLI ile `vercel --prod` çalıştırın).
2. Vercel, `package.json` içindeki `vite` bağımlılığını otomatik tanır:
   - **Build Command:** `npm run build` (veya boş bırakılırsa Vercel otomatik algılar)
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
3. Ortam değişkeni gerekmiyor (şu an hiçbiri kullanılmıyor — bkz. `.env.example`).



---

## Sürüm Geçmişi

Ayrıntılı ve güncel değişiklik günlüğü her zaman `index.html` dosyasının `<head>` bölümündeki yorum bloğunda tutulur.

- **v1.2.0** — Vite + Vanilla JS proje yapısına geçiş (bu sürüm). Excel export artık build'e gömülü.
- **v1.1.0** — Depolama, Claude'a özel `window.storage`'dan IndexedDB/localStorage'a taşındı.
- **v1.0.0** — İlk kararlı tek-dosya sürüm.

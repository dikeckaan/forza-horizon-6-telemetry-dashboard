# FH Telemetry

Forza Horizon 6'nın **Veri Çıkışı** (Data Out) telemetrisi için canlı masaüstü paneli.
macOS, Windows ve Linux'ta çalışır.

## Oyunda ayar

Ayarlar › HUD ve Oynanış:

- **Veri Çıkışı**: Açık
- **Veri Çıkışı IP Adresi**: bu bilgisayarın IP'si (uygulamanın Ayarlar ekranında yazar)
- **Veri Çıkışı IP Portu**: `20440`

## Ekranlar

| Kısayol | Ekran | İçerik |
|---|---|---|
| 1 | Kokpit | Devir saati, shift ışıkları, vites/hız, pedallar, direksiyon, G-çemberi, güç/tork/turbo/yakıt, mini harita, tur ya da sprint bilgisi |
| 2 | Araç & Lastikler | Canlı 3D araç: 9 gövde tipi (otomatik tahmin, seçimin araç kategorisine öğretilir), boya seçimi, akan yol, drift açısı, lastik dumanı ve fren izleri, kızaran fren diskleri, egzoz alevi, takip/serbest/üst kamera, röntgen modu (yaylar, lastik sıcaklığı). Yanında 4 lastik kartı |
| 3 | Harita | Hıza ya da gaz/frene göre renklenen sürüş izi, takip modu, yakınlaştırma |
| 4 | Grafikler | Hız, devir, vites, pedallar, direksiyon, G, güç, turbo, lastik sıcaklığı, süspansiyon ve kayma için kayan grafikler |
| 5 | Yarış & Turlar | Pist yarışında tur tablosu, canlı delta ve tur karşılaştırması. Sprint yarışında pozisyon, % ilerleme ve en iyi koşuya göre delta |
| 6 | Kayıtlar | Otomatik kaydedilen sürüşler: tekrar oynatma (0.5×–8×), CSV'ye aktarma |
| 7 | Ham Veri | Paketteki tüm alanlar, canlı olarak |
| 8 | Ayarlar | Port, birimler, UDP yönlendirme, demo modu, araç isimleri |

Oyun rota uzunluğunu göndermez. Bu yüzden sprint yarışlarındaki % ilerleme, rotayı ilk kez
baştan sona sürdüğünde öğrenilir ve sonraki koşularda gösterilir.

## Geliştirme

```bash
npm install
npm run dev        # Electron + Vite, canlı yenileme
npm run dev:web    # yalnızca arayüz, tarayıcıda dahili demo verisiyle
npm test           # ayrıştırıcı, tur/yarış takibi ve kayıt testleri (gerçek FH6 kayıtlarıyla)
npm run dist       # kurulum paketleri → release/
```

Kayıtlar `userData/sessions/*.fhs` altında tutulur (macOS'ta `~/Library/Application Support/FH Telemetry/sessions`).

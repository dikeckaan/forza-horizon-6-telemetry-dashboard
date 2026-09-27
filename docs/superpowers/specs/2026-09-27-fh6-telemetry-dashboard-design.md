# FH6 Telemetry — Masaüstü Uygulaması Tasarımı

Tarih: 2026-09-27

## Amaç
Forza Horizon 6'nın "Data Out" özelliğiyle UDP 20440 portuna gönderdiği telemetriyi
alıp, mümkün olan her bilgiyi keyifli, akıcı (60 fps) ve şık biçimde gösteren,
macOS / Windows / Linux'ta çalışan bir masaüstü uygulaması.

Başarı ölçütü: Oyun açıkken uygulama başlatıldığında ek ayar gerektirmeden canlı
veri akar; tüm paket alanları bir ekranda görünür; sürüşler kaydedilip tekrar
izlenebilir.

## Doğrulanan gerçekler
- 192.168.2.20:5200 → :20440, ~55 paket/sn, her paket **324 byte**
  (FH4/FH5 "Dash" düzeni: Sled 0–231, 12 byte Horizon bloğu 232–243, Dash 244–322).
- Menüdeyken `IsRaceOn = 0` ve tüm alanlar 0 gelir.

## Mimari
Electron (main + preload + renderer), TypeScript her yerde.

- **main/udp.ts** — `dgram` soketi, yapılandırılabilir port (vars. 20440), paket
  hızı/kaynak IP istatistiği, opsiyonel UDP yönlendirme (başka araçlara relay).
- **main/recorder.ts** — `IsRaceOn=1` olunca oturum kaydı başlatır, 5 sn veri
  yoksa/`IsRaceOn=0` ise kapatır. Format `.fhs`: 16 byte başlık
  (`FHS1`, sürüm, paket boyutu, başlangıç epoch ms) + kayıtlar
  `[u32 t_ms][u16 len][len byte paket]`. Konum: `userData/sessions/`.
- **main/demo.ts** — oyun yokken sentetik sürüş üreten, gerçek formatta 324 byte
  paket basan demo kaynağı.
- **main/settings.ts** — `userData/settings.json` (port, birimler, forward, demo,
  araç isim eşlemeleri).
- **preload** — `window.fh` köprüsü: `onPacket(ArrayBuffer)`, `onStatus`,
  ayarlar, oturum listele/oku/sil/CSV dışa aktar.
- **shared/packet.ts** — saf ayrıştırıcı. Boyuta göre düzen seçer:
  311 (FM7 Dash), 324 (FH4/5/6), 331 (FM2023: + lastik aşınması, pist no).
  85+ alanın hepsi tipli `Frame` nesnesine.
- **renderer** — React 19 + Vite. Canlı veri React state'ine değil, mutable bir
  `TelemetryStore`'a (son kare + sütunlu halka tamponlar + oturum geçmişi) yazılır;
  bileşenler `requestAnimationFrame` ile tazelenir. Replay aynı store'u besler, yani
  tüm ekranlar canlı/replay için aynıdır.
  - Grafikler: uPlot. 3D: three + @react-three/fiber + drei.
  - Fontlar @fontsource ile gömülü (çevrimdışı çalışır).
  - Tarayıcıda (`window.fh` yoksa) renderer dahili demo üreticiyle çalışır —
    geliştirme ve ekran görüntüsü testi için.

## Ekranlar
Sol ikon menü + üst durum çubuğu (bağlantı, paket/sn, kaynak IP, sınıf/PI rozeti,
kayıt göstergesi, canlı/replay).

1. **Kokpit** — büyük devir saati (redline'a göre dinamik skala, shift-light LED
   şeridi), dijital hız + vites, gaz/fren/debriyaj/el freni çubukları, direksiyon
   göstergesi, güç & tork, turbo, yakıt, G-kuvveti çemberi (iz bırakan, tepe G),
   mini harita, tur özeti.
2. **Araç** — 3D prosedürel araç: yaw/pitch/roll, süspansiyon hareketi, tekerlek
   dönüşü ve direksiyon canlı. Etrafında 4 lastik kartı: sıcaklık (renk skalası),
   kayma oranı/açısı/birleşik kayma, süspansiyon (normalize + metre), tekerlek hızı,
   rumble strip, su birikintisi, yüzey titreşimi. Açısal hız, hız vektörü.
3. **Harita** — X/Z pozisyon izi, hıza (veya gaz/frene) göre renkli, yakınlaştırma/
   kaydırma, araç işareti ve yön.
4. **Grafikler** — seçilebilir kanallar, kayan pencere (10/30/60 sn): hız, devir,
   pedallar, direksiyon, G boylamsal/yanal, lastik sıcaklıkları, süspansiyon, güç.
5. **Turlar** — tur tablosu (süre, en iyi işaretli, vmax), canlı delta (mevcut tur
   vs. en iyi, mesafe bazlı), iki turun hız/pedal bindirmesi.
6. **Oturumlar** — kayıtlı sürüşler (tarih, süre, araç, mesafe, vmax), yükle →
   replay (oynat/duraklat/hız/kaydırıcı), CSV dışa aktar, sil.
7. **Ham veri** — tüm alanların canlı tablosu (hata ayıklama/merak için).
8. **Ayarlar** — port, birimler (km/h↔mph, °C↔°F, hp↔kW, bar↔psi, Nm↔lb-ft),
   UDP yönlendirme, demo modu, araç ID → isim eşleme.

Araç adları: güvenilir bir FH6 araç listesi olmadığından uydurma bir liste
gömülmez; `CarOrdinal` gösterilir ve kullanıcı isim atayabilir.

## Hata durumları
- Port kullanımda → durum çubuğunda açık hata + ayarlardan port değiştir.
- Beklenmeyen paket boyutu → en yakın bilinen düzenle ayrıştır, durum çubuğunda uyar.
- 2 sn veri yok → "Bekleniyor" durumu, göstergeler yumuşakça sıfıra iner.
- Bozuk kayıt dosyası → okunabilen kısmı yükle, uyar.

## Test
- Vitest: ayrıştırıcı (bilinen değerlerle üretilen paketler, 3 boyut), birim
  dönüşümleri, tur/delta hesabı, kayıt formatı yaz-oku.
- Uçtan uca: demo kaynağıyla renderer tarayıcıda açılıp her ekranın ekran görüntüsü
  kontrol edilir; Electron uygulaması gerçek oyun verisiyle çalıştırılır.
- Gerçek sürüşte yakalanan paketlerle alan ofsetleri doğrulanır.

## Paketleme
electron-builder: macOS dmg (arm64+x64), Windows nsis, Linux AppImage.
Main/preload esbuild ile, renderer Vite ile derlenir.

## Yapım sırası
1. İskelet + derleme/dev betikleri
2. Ayrıştırıcı + testler
3. UDP, demo, kayıt, ayarlar (main) + preload
4. Store + tur hesabı + testler
5. Kabuk (menü, durum çubuğu, tema)
6. Kokpit → Araç (3D) → Harita → Grafikler → Turlar → Oturumlar/Replay → Ham → Ayarlar
7. Görsel doğrulama, gerçek veriyle doğrulama, paketleme

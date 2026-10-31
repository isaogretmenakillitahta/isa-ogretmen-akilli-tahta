# İsa Öğretmen Akıllı Tahta — V1.0

Telefon ile akıllı tahta arasında QR kod üzerinden dosya paylaşımı yapan web uygulaması.

## Özellikler
- Tahta ekranında otomatik oda ve QR kod oluşturma
- QR kodu okutan telefondan dosya yükleme
- PDF'leri sayfa sayfa görüntüleme (PDF.js)
- Fotoğraf ve videoları tahtada görüntüleme
- Word/PowerPoint dosyalarını gönderme ve indirme/açma bağlantısı
- 100 MB dosya sınırı
- Kullanılmayan dosyaları yaklaşık 2 saat sonra temizleme

## İnternette yayınlama
Bu proje kaynak kodudur; herkese açık çalışması için Node.js destekleyen bir sunucuya dağıtılmalıdır.

1. Projeyi GitHub hesabınıza yükleyin.
2. Render, Railway veya Node.js destekleyen başka bir barındırma hizmetinde yeni Web Service oluşturun.
3. Build komutu: `npm install`
4. Start komutu: `npm start`
5. `BASE_URL` ortam değişkenine yayınlanan HTTPS adresini yazın (ör. `https://ornek-alaniniz.com`).
6. Dağıtım tamamlanınca tahta bilgisayarında/akıllı tahtada ana adresi açın.

Sunucunun WebSocket bağlantılarını desteklemesi gerekir. Ücretsiz barındırma planları uykuya geçebilir; kalıcı ve kesintisiz kullanım için uygun bir plan seçin.

## Yerel deneme
Node.js 20 veya üstü kurulu bilgisayarda:
```bash
npm install
npm start
```
Ardından `http://localhost:3000` adresini açın. Telefonla denemek için uygulamayı internete açık bir sunucuya yayınlayın; localhost QR kodu telefonunuzda çalışmaz.

## Güvenlik ve sınırlar
- Her tahta oturumu rastgele oda kodu ve gizli anahtar kullanır.
- Dosya yükleme yalnızca desteklenen türlerle sınırlıdır.
- Dosyalar geçicidir; uygulama hassas veya kişisel belgelerin paylaşımı için tasarlanmamıştır.
- Bu ilk sürümde kullanıcı hesabı, yönetici paneli ve kalıcı arşiv yoktur.
- PDF, resim ve video doğrudan görüntülenir. DOC/DOCX/PPT/PPTX dosyalarının önizlemesi tarayıcıya bağlıdır; gerektiğinde indirilebilir.
- Canlı kullanım öncesi HTTPS, barındırma sağlayıcısının depolama politikası ve dosya saklama süresi ayrıca kontrol edilmelidir.


## GitHub ve Render ile kolay yayınlama
1. ZIP dosyasını bilgisayarınıza indirin ve bir klasöre çıkarın.
2. GitHub'da `isa-ogretmen-akilli-tahta` adlı yeni bir repository oluşturun.
3. Çıkarılmış klasördeki tüm dosya ve klasörleri (package.json, server.js, public klasörü, render.yaml ve .gitignore) repository'nin ana dizinine yükleyin. ZIP dosyasının kendisini değil, içeriğini yükleyin.
4. Render hesabında New > Web Service seçin ve GitHub repository'nizi bağlayın.
5. `render.yaml` algılanırsa ayarları otomatik doldurun. Algılanmazsa Runtime Node, Build Command `npm install`, Start Command `npm start`, Health Check Path `/health`, plan Free seçin.
6. Create Web Service ile yayına alın. Render size `https://...onrender.com` adresi verecektir.
7. Bu adresi tahtada açıp QR kodu telefonla okutun.

Not: Ücretsiz Render hizmeti 15 dakika hareketsizlikten sonra uykuya geçebilir. Yerel dosya sistemi kalıcı değildir; sunucu yeniden başladığında yüklenen dosyalar silinir. Bu nedenle V1 yalnızca deneme içindir. Gerçek okul kullanımından önce kalıcı dosya saklama, kötüye kullanım sınırları ve uygun barındırma planı eklenmelidir.

# Oyun Masası

İki kişi kendi telefonundan aynı linki açıp iki oyundan birini oynar: **UNO** ve **Beni ne kadar tanıyorsun**.
Sunucu kodu yok: her hamle tarayıcıda hesaplanır ve Supabase tablosuna (`oyun_odalari`) yazılır.
GitHub Pages'te çalışır, derleme gerekmez.

## Nasıl oynanır
1. Adını yaz, **Oda kur**'a bas. Oda UNO olarak açılır.
2. Çıkan linki ya da 4 harfli kodu eşine gönder. O da adını yazıp **Katıl**'a basar.
3. Ev sahibi lobide oyunu seçer (**UNO** ya da **Beni ne kadar tanıyorsun**), ayarları yapar ve **Oyunu başlat**'a basar.
   Oyun yalnız lobide değişir; oyun bitince **Lobiye dön** ile lobiye inilir.

### UNO
İki ile dört kişi, resmi kurallar.
- Sıra sendeyse parlayan bir kartı at ya da desteden kart çek. Çektiğin kartı atabilirsin, olmazsa **Pas** de.
- Son iki karta düşünce **UNO!**'ya bas. Birisi basmayı unutursa **Yakala!** ile 2 kart yedirebilirsin.
- Biri sana +4 atarsa **İtiraz et** ya da **Kabul et**.
- Ayarlar: "+2'nin üstüne +2 koyma" (varsayılan kapalı), hedef puan 500 / 200 / Tek el.

### Beni ne kadar tanıyorsun
Tam iki kişi. Her soruda ikiniz de iki şey seçersiniz: **kendi cevabını** ve **eşinin ne dediğini**.
İkiniz de gönderince cevaplar açılır. Eşinin cevabını doğru bilen her kişi 1 puan alır.
Sonda **Uyum** yüzdesi (doğru tahmin / (2 x soru sayısı)) ve **Bunları konuşun** listesi çıkar.
- Ayarlar (ev sahibi): soru sayısı 5 / 10 / 15, konular (en az biri açık), "Kendi sorularımız da gelsin".
- **Sorularım**: lobiden kendi sorunu yazabilirsin (en fazla 70 harf, 2-4 seçenek, seçenek en fazla 28 harf, en çok 50 soru).
  Sorular bu tarayıcıda (`tanis-sorularim`) saklanır ve lobide odaya iletilir. Açıksa oyuna önce bunlar gelir.
- **Tekrar oyna** yeni sorular getirir; odada sorulan sorular tekrar sorulmaz (havuz bitince baştan başlar).

Aynı tarayıcıdan aynı linke dönersen koltuğuna otursun diye kimliğin tarayıcıda saklanır.

## Testleri çalıştırma
```
node test/uno-test.js
node test/tanis-test.js
```
`tanis-test.js` "Beni ne kadar tanıyorsun" motorunu ve oyun yönlendiriciyi (`oyunlar.js`) sınar.
Hata varsa çıkış kodu 1 olur.

## Dosyalar
- `index.html`: sayfa iskeleti, Supabase betiği
- `style.css`: tüm görünüm (kartlar dahil, resim yok); "Beni ne kadar tanıyorsun" odası mor-gül temayla açılır
- `app.js`: ekranlar, UNO masası, Supabase senkronu
- `tanis-ekran.js`: "Beni ne kadar tanıyorsun" ekranları (lobi ayarları, Sorularım, soru, sonuç, özet)
- `oyunlar.js`: oyun yönlendirici; hareketi `durum.oyun`'a göre doğru motora verir, oyun seçimini (`oyunSec`) yapar
- `uno.js`: UNO kuralları (saf motor, DOM ve ağ yok)
- `tanis.js`: "Beni ne kadar tanıyorsun" kuralları (saf motor, DOM ve ağ yok)
- `sorular.js`: hazır soru bankası (kategoriler ve sorular)
- `config.js`: Supabase adresi ve herkese açık anahtar
- `test/uno-test.js`: UNO motoru testleri
- `test/tanis-test.js`: tanış motoru ve yönlendirici testleri
- `package.json`: node'un `.js` dosyalarını modül olarak okuması için

## Bilinen sınırlar
Tüm oyun durumu tek satırda durduğu için teknik olarak herkesin eli (UNO) ve verilmiş cevaplar (tanış oyunu) okunabilir; ekran başkasının kartını ya da eşinin cevabını cevaplar açılmadan göstermez.
Satırın `oyun` sütunu hep `uno` kalır; gerçek oyun `durum.oyun` içindedir (böylece eski odalar ve veritabanı değişmeden çalışır).

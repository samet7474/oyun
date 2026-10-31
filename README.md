# Oyun Masası

Arkadaşlar kendi telefonundan aynı linki açıp dört oyundan birini oynar: **UNO**, **Beni ne kadar tanıyorsun**, **Kelime düellosu** ve **Aynı Kafa**.
Sunucu kodu yok: her hamle tarayıcıda hesaplanır ve Supabase tablosuna (`oyun_odalari`) yazılır.
GitHub Pages'te çalışır, derleme gerekmez.

## Nasıl oynanır
1. Adını yaz, **Oda kur**'a bas. Oda UNO olarak açılır.
2. Çıkan linki ya da 4 harfli kodu arkadaşına gönder. O da adını yazıp **Katıl**'a basar.
3. Ev sahibi lobide oyunu seçer (**UNO**, **Beni ne kadar tanıyorsun** **Kelime düellosu** ya da **Aynı Kafa**), ayarları yapar ve **Oyunu başlat**'a basar.
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

### Kelime düellosu
İki ile dört kişi, Türkçe Wordle. Herkes aynı 5 harfli gizli kelimeyi aynı anda, birbirinden bağımsız bulmaya çalışır (sıra yok).
- Herkesin 6 hakkı var. Karolar: **yeşil** doğru harf doğru yer, **sarı** kelimede var ama başka yerde, **gri** kelimede yok.
- Tahtanı ve klavye renklerini sen görürsün. Rakiplerin küçük tahtasında yalnız renkler çıkar, harfleri görünmez;
  biri bitirince "çözdü ✓ (4. denemede)" ya da "bitti ✗" yazar.
- Herkes bitince kelime açılır. En az denemede çözen turu alır (eşitlikte hepsi +1, kimse çözemezse puan yok).
  Herhangi biri **Sonraki kelime**'ye basabilir.
- Sonda en çok tur kazanan oyunu alır, eşitlikte "Berabere". Ev sahibi **Tekrar oyna** (yeni kelimeler) ya da **Lobiye dön** der.
- Ayarlar (ev sahibi): tur sayısı 3 / 5 / 7, "Sözlükte olmayan kelime" **Kabul etme** / **Kabul et**.
  "Kabul etme"de listede olmayan kelime sallanır ve **Yine de kullan** çıkar.
- Odada çıkan kelime tekrar gelmez (liste bitince baştan başlar). Telefonda ekran klavyesi, bilgisayarda fiziksel klavye çalışır.
- Kelime listesi `kelimeler.js` içindedir: gizli kelimeler `CEVAPLAR`, kabul edilen kelimeler `GECERLI`.

### Aynı Kafa
İki ile dört kişi, birlikte oynanır (birbirine karşı değil). Amaç aynı şeyi düşünmek.
- Her turda herkese aynı ipucu gelir ("Bir meyve söyle", "Kırmızı bir şey"). Herkes cevabını gizlice yazar (en fazla 30 harf, boş olmaz).
  Cevap açılmadan önce değiştirilebilir. Herkes görür kimin gönderdiğini, ama cevabı görmez.
- Herkes gönderince cevaplar aynı anda açılır, eşleşen kartlar parlar. Aynı cevabı veren her ikili takıma 1 puan getirir
  (2 kişide en çok 1, 3 kişide 3, 4 kişide hepsi aynıysa 6). Puan takımın ortak puanıdır; ekranda kim kiminle eşleşti yazar.
- Karşılaştırma bağışlayıcıdır: büyük/küçük harf, baş/son boşluk, noktalama ve Türkçe harf farkı (ş/s, ç/c, ğ/g, ü/u, ö/o, ı/i) yok sayılır;
  "kopek" ile "köpek" aynıdır.
- Eşleşmeyen iki cevap için herhangi biri **Bunlar aynı sayılsın** diyebilir ("elma" ve "yeşil elma" gibi). Bir kez basmak yeter,
  puan hemen güncellenir, **Geri al** ile döndürülür. Onay yoktur, güvene dayalıdır.
- Herhangi biri **Sonraki ipucu**'na basabilir. Sonda **Uyum** yüzdesi (kazanılan / en fazla puan), en güzel eşleşmeler,
  ev sahibi için **Tekrar oyna** (yeni ipuçları) ve **Lobiye dön** çıkar.
- Ayarlar (ev sahibi): ipucu sayısı 5 / 10 / 15. Odada sorulan ipucu, liste bitene kadar tekrar gelmez.
- İpucu bankası `aynikafa-ipuclari.js` içindedir (`IPUCLARI`).

Aynı tarayıcıdan aynı linke dönersen koltuğuna otursun diye kimliğin tarayıcıda saklanır.

## Testleri çalıştırma
```
node test/uno-test.js
node test/tanis-test.js
node test/kelime-test.js
node test/aynikafa-test.js
```
`tanis-test.js` "Beni ne kadar tanıyorsun" motorunu ve oyun yönlendiriciyi (`oyunlar.js`) sınar.
`kelime-test.js` "Kelime düellosu" motorunu (renklendirme, Türkçe harfler, tur akışı, çakışma) ve yönlendiriciyi sınar;
kendi küçük kelime listesini kullanır.
`aynikafa-test.js` "Aynı Kafa" motorunu (Türkçe karşılaştırma, puanlama, aynı sayılsın oyu, uyum, ipucu tekrarı) ve yönlendiriciyi sınar.
Hata varsa çıkış kodu 1 olur.

## Dosyalar
- `index.html`: sayfa iskeleti, Supabase betiği
- `style.css`: tüm görünüm (kartlar dahil, resim yok); "Beni ne kadar tanıyorsun" odası mor-gül, "Kelime düellosu" koyu ardıç, "Aynı Kafa" sıcak mercan temayla açılır
- `app.js`: ekranlar, UNO masası, Supabase senkronu
- `tanis-ekran.js`: "Beni ne kadar tanıyorsun" ekranları (lobi ayarları, Sorularım, soru, sonuç, özet)
- `kelime-ekran.js`: "Kelime düellosu" ekranları (lobi ayarları, tahta, klavye, rakip tahtaları, sonuç, özet)
- `aynikafa-ekran.js`: "Aynı Kafa" ekranları (lobi ayarları, ipucu ve cevap, açılış kartları, oylar, sonuç)
- `oyunlar.js`: oyun yönlendirici; hareketi `durum.oyun`'a göre doğru motora verir, oyun seçimini (`oyunSec`) yapar
- `uno.js`: UNO kuralları (saf motor, DOM ve ağ yok)
- `tanis.js`: "Beni ne kadar tanıyorsun" kuralları (saf motor, DOM ve ağ yok)
- `kelime.js`: "Kelime düellosu" kuralları (saf motor, DOM ve ağ yok)
- `aynikafa.js`: "Aynı Kafa" kuralları (saf motor, DOM ve ağ yok)
- `aynikafa-ipuclari.js`: "Aynı Kafa" ipucu bankası
- `kelimeler.js`: gizli kelimeler (`CEVAPLAR`) ve kabul edilen kelimeler (`GECERLI`)
- `sorular.js`: hazır soru bankası (kategoriler ve sorular)
- `config.js`: Supabase adresi ve herkese açık anahtar
- `test/uno-test.js`: UNO motoru testleri
- `test/tanis-test.js`: tanış motoru ve yönlendirici testleri
- `test/kelime-test.js`: kelime düellosu motoru ve yönlendirici testleri
- `test/aynikafa-test.js`: Aynı Kafa motoru ve yönlendirici testleri
- `package.json`: node'un `.js` dosyalarını modül olarak okuması için

## Bilinen sınırlar
Tüm oyun durumu tek satırda durduğu için teknik olarak herkesin eli (UNO), verilmiş cevaplar (tanış oyunu ve Aynı Kafa) ve gizli kelime ile rakiplerin harfleri (kelime düellosu) okunabilir; ekran bunları zamanı gelmeden göstermez.
Satırın `oyun` sütunu hep `uno` kalır; gerçek oyun `durum.oyun` içindedir (böylece eski odalar ve veritabanı değişmeden çalışır).

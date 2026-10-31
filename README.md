# Oyun Masası

Arkadaşlar kendi telefonundan aynı linki açıp aynı odada sekiz oyundan birini oynar, oyunlar arasında geçer.
Sunucu kodu yok: her hamle tarayıcıda hesaplanır ve Supabase tablosuna (`oyun_odalari`) yazılır.
GitHub Pages'te çalışır, derleme gerekmez.

## Oyunlar
| Oyun | Kişi | Kısaca |
| --- | --- | --- |
| **UNO** | 2-4 | Kartını at, ilk bitiren kazanır. |
| **Beni ne kadar tanıyorsun** | 2 | Birbirinizin cevaplarını tahmin edin (birlikte oynanır, kazanan yok). |
| **Kelime düellosu** | 2-4 | Aynı gizli kelimeyi önce kim bulacak? |
| **Aynı Kafa** | 2-4 | Aynı cevabı yazın, birlikte puan toplayın (kazanan yok). |
| **Gizli Yol** | 2 | Rakibinin gizli yolunu hatırla ve bul. |
| **Gizli Görev** | 2-4 | Gizli görevini fark ettirmeden yap. |
| **Taş Kağıt Makas** | 2 | Taş, kağıt, makas: kartını gizlice seç. |
| **Risk Kulesi** | 2-4 | Zar at, kuleni yükselt, yıkılmadan dur. |

Oyunların bilgileri (ad, kişi sayısı, açıklama, simge, renk) `oyunlar.js` içindeki `OYUNLAR` listesindedir; lobideki oyun kartları oradan çizilir.

## Ortak özellikler
- **Oyun seçici:** lobide her oyun bir kart (simge, ad, kişi sayısı, tek cümlelik açıklama). Seçili oyun belirgindir.
  Ev sahibi dışındakiler seçimi görür ama değiştiremez. Odadaki kişi sayısı oyuna uymuyorsa kart soluk olur ve nedeni yazar ("2 kişiliktir").
- **Kim önde:** aynı odada oynanan bütün oyunlarda kim kaç oyun kazandı, oda boyunca tutulur (`durum.genel`) ve lobide gösterilir.
  Oyun değişince, "Tekrar oyna"da ve "Lobiye dön"de kaybolmaz. Bir oyun bittiği anda kazananı bir kez sayılır; beraberlikte kimseye yazılmaz
  (yalnız "berabere" sayısı artar). Risk Kulesi'nde rakipler çıkınca kalan kişiye galibiyet yazılmaz. Birlikte oynanan iki oyunda (Beni ne kadar tanıyorsun, Aynı Kafa)
  kazanan sayılmaz, bunun yerine en iyi uyum rekoru tutulur. Her motorda `kazananlar(durum)` saf yardımcısı vardır; sayım `oyunlar.js` içindeki `genelGuncelle` ile yapılır.
- **Onay penceresi:** tehlikeli işlerde ("Lobiye dön", "Pes et", "Oyunu bitir", soru silme) tarayıcı penceresi yerine sitenin kendi küçük penceresi (`onay.js`) açılır.
- **Bağlantı:** sekmeye dönünce ya da ağ gelince oda hemen yenilenir, kanal düştüyse yeniden kurulur (4 saniyelik yedek yoklama de sürer).
  Bağlantı yokken ekranın altında sakin bir "Bağlantı bekleniyor…" şeridi görünür, bağlantı gelince kaybolur.
- **Sesler:** üst çubuktaki ses düğmesiyle açılır (varsayılan kapalı, tercih tarayıcıda saklanır). WebAudio ile üretilen kısa, yumuşak sesler (`ses.js`):
  sıra sana geçti, kazandın. Ses dosyası yoktur. Titreşim, sayfaya ilk dokunuştan önce çağrılmaz.

## Yayın öncesi: sürüm numarasını artır
GitHub Pages dosyaları kısa süre önbelleğe alır; telefon eski `app.js` ile yeni modülleri karıştırabilir.
Bunu önlemek için `index.html` içindeki `SURUM` değeri bütün `.js` modüllerine ve `style.css`'e `?v=SURUM` olarak eklenir (bir import haritasıyla, derleme yok).
**Her yayından önce `index.html` içindeki `const SURUM = '...'` değerini değiştir** (ör. `2026-11-02-a`).
Yeni bir `.js` dosyası eklersen aynı dosyadaki `DOSYALAR` listesine de ekle (`test/genel-test.js` listede olmayan dosyayı yakalar).
İlk yüklemede soru, kelime, ipucu ve görev bankaları (yaklaşık 100 KB) de iner: motorlar bankaları doğrudan içe aldığı için bunları oyun seçilince yüklemek
motorların eşzamanlı çalışmasını bozardı, bu yüzden yapılmadı.

## Nasıl oynanır
1. Adını yaz, **Oda kur**'a bas. Oda UNO olarak açılır.
2. Çıkan linki ya da 4 harfli kodu arkadaşına gönder. O da adını yazıp **Katıl**'a basar.
3. Ev sahibi lobide oyun kartlarından birini seçer, ayarları yapar ve **Oyunu başlat**'a basar.
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

### Gizli Yol
Tam iki kişi, aynı anda oynanır (sıra yok). Tahta 6 sütun ve 8 ya da 10 satırdır. Bir hafıza ve zekâ oyunudur: herkes gizli bir yol seçer, sonra birbirinin yolunu hatırlayıp bulmaya çalışır.
- **Kurma:** Her satırdan tam bir kutu seçilir (hangi sütun olduğu serbest, komşuluk şartı yok). Bir satırda başka kutuya dokunursan seçim oraya taşınır, seçili kutuya tekrar dokunursan seçim kalkar.
  Ekranda "Seçilen: 6 / 10 satır" sayacı vardır. **Temizle** hepsini siler, **Rastgele doldur** her satıra rastgele bir kutu koyar.
  Bütün satırlar seçilince **Hazırım** açılır (rakip hazır olmadan **Yolu değiştir** ile vazgeçilebilir). İkisi de hazır olunca çözme başlar.
- **Bakma:** Çözme başında büyük bir **Bak** düğmesi vardır. Basınca rakibin yolu (her satırdaki kutu) ayardaki süre kadar görünür, ekranda geri sayım olur, süre bitince gizlenir.
  Bak her turda **bir kez** kullanılır. Bakmadan da başlanabilir: ilk tahminde Bak hakkı yanar ("Tahmine başlarsan Bak hakkın gider."). Rakip "Ayşe baktı" diye görür.
  Motor yalnız "baktı" bilgisini ve basılan anı tutar; yolu gizleme işini ekran kendi saatiyle yapar (sayfa yenilenirse süre kaldığı yerden sürer).
- **Çözme:** En alt satırdan başlayıp yukarı çıkılır. Sıradaki satırda bir kutuya dokunulur.
  Doğruysa kutu yeşil yanar, kalıcı açık kalır ve sıradaki satıra geçilir. Yanlışsa kutu kalıcı kırmızı çarpı olur, hata 1 artar ve oyuncu **aynı satırda** denemeye devam eder (başa dönme yok).
  İşaretli kutuya tekrar dokunmak ya da sıradaki satır dışına dokunmak hata sayılmaz, kısa bir uyarı çıkar. Sıradaki satır tahtada belirgindir, satır numaraları solda küçük yazılıdır (1 = en alt satır).
- Bütün satırları bulan bitirir. Rakibin ilerlemesi canlı görünür (kaç satır buldu, kaç hata), kutuları görünmez.
- İkisi de bitirince tur biter: daha az hata yapan turu alır, eşitse berabere (puan yok). Sonuçta iki yol ve karşı tarafın o yolda yaptığı hatalar gösterilir. Herhangi biri **Sonraki tur**'a basabilir.
- Biri 25 hataya ulaşırsa **Pes et** düğmesi çıkar: pes eden o tur 25 hata sayılır ve rakibin bitirmesini bekler.
- Ayarlar (ev sahibi): tur sayısı 1 / 3 / 5, tahta 8 ya da 10 satır (varsayılan 10), Bak süresi 3 / 5 / 10 / 15 saniye (varsayılan 5). Sonda kazanan, **Tekrar oyna** ve **Lobiye dön** çıkar.
- Oyun tam 2 kişiliktir: lobide 2'den fazla kişi varken Gizli Yol seçilemez.
- Eski odalar: eski kurallı (komşu kareli yol, "kısa/uzun" ayarı) bir oda lobideyse sessizce yeni kurallara geçer, eski ayar silinip yenisi varsayılan olur. Oyun ortasındaki eski bir odada hata mesajı çıkar, ev sahibi **Lobiye dön**'e basınca yeni kurallarla devam edilir.
- Bilinen sınır: yollar oda satırında durur (durum herkese açıktır); ekran Bak süresi dışında rakibin yolunu çizmez.

### Gizli Görev
İki ile dört kişi. Oyun ekranın dışında, konuşurken ya da mesajlaşırken oynanır; site görevleri dağıtır, puanı ve onayları tutar.
- Herkesin elinde 3 gizli görev durur: bir **kolay** (1 puan), bir **orta** (2 puan), bir **zor** (3 puan).
- Görevini yaptığını düşünen o görevde **Yaptım**'a basar. Diğerlerinin ekranının üstünde "<Ad> şu görevi yaptığını söylüyor: ... Oldu mu?" kartı çıkar
  (**Oldu** / **Olmadı**). 2 kişide rakibin cevabı belirler; 3-4 kişide çoğunluk karar verir, eşitlikte kabul edilir.
  Kabul edilirse puan gelir ve desteden aynı zorlukta yeni görev çekilir. Reddedilirse görev kalır. Onay beklerken aynı görev için tekrar basılamaz.
- **Yakaladım:** biri bir rakibin görev yapmaya çalıştığını fark ederse kimden şüphelendiğini seçer ve tahminini yazar (en fazla 60 harf).
  Şüphelenilenin ekranında tahmin ve kendi görevleri çıkar: **Evet, bu görevimdi** (görevi seçer) ya da **Hayır**.
  Evetse yakalayan 1 puan alır, görev yanar (puansız) ve yenisi gelir. Her oyuncunun oyun başına 3 yakalama hakkı var; her tahmin bir hak harcar.
- Her oyuncunun oyun başına 1 **Değiştir** hakkı var (görevi aynı zorlukta yenisiyle değiştirir; onay beklerken değişmez).
- Ayarlar (ev sahibi): oyun hedef puanla (10 / 15 / 20, önce ulaşan kazanır) ya da süreyle (15 / 30 / 60 dakika, en çok puan kazanır) biter.
  Süre başlangıç anından sayılır, ekranda geri sayım görünür; süre bitince ilk hamle yapan telefon oyunu bitirir. Ev sahibi her an **Oyunu bitir** diyebilir.
- Sonda puan tablosu ve herkesin tamamladığı görevler açılır (oyun bitene kadar başkasının görevleri görünmez). Ev sahibi **Tekrar oyna** ya da **Lobiye dön** der.
- Dağıtılan görevler desteden çıkar, deste bitince karışıp yeniden dolar; iki oyuncunun elinde aynı görev olmaz. Tekrar oynamada önce görülmemiş görevler gelir.
- Görev bankası `gorev-gorevler.js` içindedir (124 görev: 40 kolay, 42 orta, 42 zor).
- Bilinen sınır: görevler oda satırında durur (durum herkese açıktır); ekran başkasının görevini göstermez. Süre her telefonun saatine göre sayılır.

### Taş Kağıt Makas
Tam iki kişi, aynı anda kapalı seçim yapılan kart oyunu. Üç şekil var: **Taş**, **Kağıt**, **Makas**.
Kağıt taşı sarar, taş makası kırar, makas kağıdı keser. (Oyunun kimliği ve dosya adları eski adından, "element", kalır:
eski odalar ve "Kim önde" kayıtları bozulmasın diye. Eski Element Düellosu odalarındaki ateş, su, toprak kartları
sırayla taş, kağıt, makas olarak okunur.)
- **Deste:** her oyuncunun kendi destesi var: her şekilden 1-5 değerli birer kart (15 kart) + 3 özel kart = 18 kart. Başta herkes 5 kart çeker.
- **Özel kartlar:** **Ters Rüzgâr** o tur yenme döngüsünü tersine çevirir (taş kağıdı yener, kağıt makası yener, makas taşı yener); kendisi şekilsizdir, bir şekil kartıyla birlikte oynanır
  (iki kart birlikte). İki oyuncu da Ters Rüzgâr oynarsa etkisi kalmaz. **Kalkan** tek başına oynanır: o tur kimse puan almaz, iki kart da atılır.
  **İkiye Katla** bir şekil kartıyla birlikte oynanır; o kart kazanırsa puan iki katı olur (kaybederse bir etkisi yok).
  Bir turda en fazla bir özel kart oynanır. Ters Rüzgâr ya da İkiye Katla tek başına oynanamaz.
- **Tur:** iki oyuncu aynı anda gizlice seçer, **Oyna**'ya basınca seçim kilitlenir (geri alınmaz). Rakip yalnız "seçti" görür.
  İkisi de kilitleyince kartlar animasyonla açılır.
- **Kazanan:** şekiller farklıysa döngüye göre yenen şekil kazanır. Aynı şekilde büyük sayı kazanır, sayılar da eşitse berabere (puan yok).
  Kazanan, **kendi kartının sayısı + rakip kartın sayısı** kadar puan alır (İkiye Katla ile iki katı). Berabere ve Kalkan turunda puan yok.
- Tur sonunda herkes elini 5'e tamamlar (deste bittiyse tamamlamaz). Oynanan kartlar atılır ve iki oyuncunun açılan kartları
  **Oynananlar** şeridinde birikir (kart sayma için). Herhangi biri **Sonraki tur**'a basabilir.
- **Oyun sonu:** biri hedef puana ulaşınca (ayar: 20 / 30 / 40) ya da iki oyuncunun da oynayabileceği kart kalmayınca.
  Kartlar biterse çok puanlı kazanır, eşitse berabere. Oynanabilir kart: bir şekil kartı ya da Kalkan; elinde yalnız
  Ters Rüzgâr / İkiye Katla kalan oyuncu o tur otomatik "oynayacak kartı yok" sayılır (o turda puan çıkmaz).
- Ekranda küçük bir "Kim kimi yener?" döngü şeması (taş, kağıt, makas okları) ve "Nasıl oynanır" kutusu vardır. Kartlar CSS ve inline SVG ile çizilir.
- Oyun tam 2 kişiliktir: lobide 2'den fazla kişi varken Taş Kağıt Makas seçilemez.
- Bilinen sınır: eller ve kilitli seçimler oda satırında durur (durum herkese açıktır); ekran rakibin elini ve kilitli seçimini açılıştan önce çizmez.

### Risk Kulesi
İki ile dört kişi, sırayla oynanan zar oyunu. Herkesin kendi kulesi ve kasası var.
- **Zar at:** sırası gelen oyuncu tek zar atar (1-6). Çıkan sayı o turdaki kulesine bir kat olur; kat üstünde sayısı yazar ve kule yükselir.
- **1 gelirse** kule yıkılır: o turda biriken her şey gider ve sıra sonrakine geçer (yıkılma animasyonu herkeste oynar).
- **Çift kat:** atılan sayı bir önceki katın sayısıyla aynıysa (1 hariç) o kat iki kat sayılır, katın üstünde "x2" görünür. Yalnız bir önceki kat kıyaslanır.
- **Dur:** istediğin an "Dur"a basabilirsin; kulenin toplamı kasana eklenir ve sıra geçer. İlk zarı atmadan durulamaz.
- **Çatlak taş:** oyun başına herkesin 1 hakkı var. Sırası başında ya da sırası kendinde değilken bir rakip seçilir; o rakibin **bir sonraki turunda** 1 de 2 de kuleyi yıkar.
  Rakibin adı yanında çatlak simgesi görünür, rakip kendi turunda büyük bir uyarı görür. Bir oyuncunun üstünde aynı anda en fazla bir çatlak olur;
  çatlak o oyuncunun turu bitince (durarak ya da yıkılarak) kalkar. Kendine atılamaz, sırası gelen oyuncu zar attıktan sonra atamaz.
  Şu an oynayan oyuncuya atılan çatlak bu turu etkilemez, bir sonraki turuna kalır.
- **Kazanan:** kasası hedefe (ayar: 50 / 100 / 150) ulaşan ya da geçen ilk oyuncu kazanır. Hedefe "Dur" ile ulaşılır; turun ortasında hedef geçilse bile durmadan sayılmaz. Kimse fazladan tur oynamaz.
- **Sırayı geç:** sırası gelen oyuncu sayfadan çıkarsa oyun kilitlenmesin diye, 60 saniye boyunca zar atılmaz ve "Dur"a basılmazsa diğer oyuncular "Sırayı geç" düğmesini görür.
  Geçirilen turun kulesi gider. Son hamle zamanı durumda `sonHamle` olarak tutulur; motor `simdi` (ms) parametresi alır, testler sabitler.
- Oyun sürerken **Çık**'a basan oyuncu odadan çıkar; sırası ondaysa kulesi gider ve sıra sonrakine geçer, tek kişi kalırsa o kazanır.
- Zar sonucu motorda `rastgele` ile üretilir (zarı atan istemcinin hamlesi; durum sürüm kontrolüyle yazılır).
- Ekranda ortada yükselen kule (CSS blokları), yuvarlanan zar (inline SVG), kasalar ve hedefe ilerleme çubukları, turdaki toplam, oyun içi en yüksek kule rekoru ve "Nasıl oynanır" kutusu vardır.
  Oyun sonunda kazanan, en yüksek kule ve en çok yıkılan görünür. Gizli bilgi yoktur: başkasının turunu herkes canlı izler.

Aynı tarayıcıdan aynı linke dönersen koltuğuna otursun diye kimliğin tarayıcıda saklanır.

## Testleri çalıştırma
```
node test/uno-test.js
node test/tanis-test.js
node test/kelime-test.js
node test/aynikafa-test.js
node test/gizliyol-test.js
node test/gorev-test.js
node test/element-test.js
node test/kule-test.js
node test/genel-test.js
```
Hepsini bir arada: `for t in test/*.js; do node $t; done`
`genel-test.js` oyun bilgilerini (`OYUNLAR` alanları, kişi yazısı, sığmama nedeni), "Kim önde" genel skorunu (tek kazanan bir kez sayılır, beraberlik, oyun değişimi ve Lobiye dön'de kalıcılık, birlikte oynanan oyunlar, rakipsiz galibiyet) ve `index.html` sürüm listesinin eksiksizliğini sınar.
`tanis-test.js` "Beni ne kadar tanıyorsun" motorunu ve oyun yönlendiriciyi (`oyunlar.js`) sınar.
`kelime-test.js` "Kelime düellosu" motorunu (renklendirme, Türkçe harfler, tur akışı, çakışma) ve yönlendiriciyi sınar;
kendi küçük kelime listesini kullanır.
`aynikafa-test.js` "Aynı Kafa" motorunu (Türkçe karşılaştırma, puanlama, aynı sayılsın oyu, uyum, ipucu tekrarı) ve yönlendiriciyi sınar.
`gizliyol-test.js` "Gizli Yol" motorunu (satır başına bir kutu, 8 ve 10 satır, bakma hakkı ve süre ayarı, doğru ve yanlış tahmin, aynı satırda devam, işaretli kutu, sıra dışı satır, bitirme, tur ve oyun sonu, beraberlik, pes, eski oda uyumu) ve yönlendiriciyi sınar.
`gorev-test.js` "Gizli Görev" motorunu (dağıtım, onay ve çoğunluk, yakalama, değiştirme hakkı, hedef puan ve süre bitişi, gizlilik yardımcıları) ve yönlendiriciyi sınar.
`element-test.js` "Taş Kağıt Makas" motorunu (deste, dağıtım, yenme döngüsü, eski ateş/su/toprak anahtarlarının eşlenmesi, özel kartlar ve kombinasyonları, geçersiz seçimler, el tamamlama, hedef puan ve eller boşalınca bitiş, gizlilik yardımcısı) ve yönlendiriciyi sınar.
`kule-test.js` "Risk Kulesi" motorunu (zar ekleme, 1'de yıkılma, çift kat, dur ve kasa, çatlak taş kuralları, hedefe ulaşma, sıra döngüsü, oyuncu ayrılınca sıra, sırayı geç) ve yönlendiriciyi sınar.
Hata varsa çıkış kodu 1 olur.

## Dosyalar
- `index.html`: sayfa iskeleti, Supabase betiği, sürüm numarası (`SURUM`) ve modül listesi (import haritası)
- `style.css`: tüm görünüm (kartlar dahil, resim yok); "Beni ne kadar tanıyorsun" odası mor-gül, "Kelime düellosu" koyu ardıç, "Aynı Kafa" sıcak mercan, "Gizli Yol" gece mavisi, "Gizli Görev" antrasit ve altın, "Taş Kağıt Makas" koyu deniz yeşili ve sarı, "Risk Kulesi" gün batımı tuğlası temayla açılır
- `app.js`: ekranlar, lobi (oyun kartları, Kim önde), UNO masası, Supabase senkronu, bağlantı şeridi
- `tanis-ekran.js`: "Beni ne kadar tanıyorsun" ekranları (lobi ayarları, Sorularım, soru, sonuç, özet)
- `kelime-ekran.js`: "Kelime düellosu" ekranları (lobi ayarları, tahta, klavye, rakip tahtaları, sonuç, özet)
- `aynikafa-ekran.js`: "Aynı Kafa" ekranları (lobi ayarları, ipucu ve cevap, açılış kartları, oylar, sonuç)
- `gizliyol-ekran.js`: "Gizli Yol" ekranları (lobi ayarları, kutu seçme, Bak ve geri sayım, çözme tahtası, rakip ilerlemesi, açık yollar, sonuç)
- `gorev-ekran.js`: "Gizli Görev" ekranları (lobi ayarları, görev kartları, onay ve yakalama soruları, puan tablosu, geri sayım, sonuç)
- `element-ekran.js`: "Taş Kağıt Makas" ekranları (lobi ayarları, kartlar, masa ve açılış animasyonu, el şeridi, oynananlar şeridi, döngü şeması, sonuç)
- `kule-ekran.js`: "Risk Kulesi" ekranları (lobi ayarları, kasalar, kule ve zar animasyonu, çatlak taş paneli ve uyarısı, sırayı geç, sonuç)
- `oyunlar.js`: oyun yönlendirici; oyun bilgileri (`OYUNLAR`), hareketi `durum.oyun`'a göre doğru motora verme, oyun seçimi (`oyunSec`) ve "Kim önde" genel skoru (`genelGuncelle`)
- `onay.js`: sitenin kendi onay penceresi (`onayIste`)
- `ses.js`: WebAudio ile kısa sesler, ses aç/kapa tercihi ve güvenli titreşim (`titret`)
- `uno.js`: UNO kuralları (saf motor, DOM ve ağ yok)
- `gizliyol.js`: Gizli Yol kuralları (saf motor, DOM ve ağ yok)
- `tanis.js`: "Beni ne kadar tanıyorsun" kuralları (saf motor, DOM ve ağ yok)
- `gorev.js`: Gizli Görev kuralları (saf motor, DOM ve ağ yok)
- `gorev-gorevler.js`: Gizli Görev görev bankası
- `element.js`: Taş Kağıt Makas kuralları (saf motor, DOM ve ağ yok)
- `kule.js`: Risk Kulesi kuralları (saf motor, DOM ve ağ yok)
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
- `test/gizliyol-test.js`: Gizli Yol motoru ve yönlendirici testleri
- `test/gorev-test.js`: Gizli Görev motoru ve yönlendirici testleri
- `test/element-test.js`: Taş Kağıt Makas motoru ve yönlendirici testleri
- `test/kule-test.js`: Risk Kulesi motoru ve yönlendirici testleri
- `test/genel-test.js`: oyun bilgileri, Kim önde genel skoru ve sürüm listesi testleri
- `package.json`: node'un `.js` dosyalarını modül olarak okuması için

## Bilinen sınırlar
Tüm oyun durumu tek satırda durduğu için teknik olarak herkesin eli (UNO), verilmiş cevaplar (tanış oyunu ve Aynı Kafa), rakibin yolu (Gizli Yol; ekran yalnız Bak süresince gösterir), rakibin eli ve kilitli seçimi (Taş Kağıt Makas) ve gizli kelime ile rakiplerin harfleri (kelime düellosu) okunabilir; ekran bunları zamanı gelmeden göstermez.
Satırın `oyun` sütunu hep `uno` kalır; gerçek oyun `durum.oyun` içindedir (böylece eski odalar ve veritabanı değişmeden çalışır).

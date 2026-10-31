// "Kelime düellosu" motoru ve oyun yönlendirici testleri. Çalıştır: node test/kelime-test.js
import assert from 'node:assert/strict';
import {
  ALFABE,
  DENEME_SAYISI,
  TUR_SAYILARI,
  herkesBitti,
  kelimeTemizle,
  klavyeRenkleri,
  lobiKur,
  oyuncuDurumu,
  oyunKazananlari,
  renklendir,
  sozlukteVarMi,
  tahminHatasi,
  uygula,
  yeniOda,
} from '../kelime.js';
import { OYUNLAR, oyunId, uygula as yonlendir, yeniOda as yonlendirYeniOda } from '../oyunlar.js';
import { yeniOda as unoYeniOda } from '../uno.js';
import { yeniOda as tanisYeniOda } from '../tanis.js';

// ---------------------------------------------------------------------------
// Küçük test düzeni
// ---------------------------------------------------------------------------

const testler = [];

function test(ad, fonksiyon) {
  testler.push({ ad: ad, fonksiyon: fonksiyon });
}

// Tohumlu rastgele sayı üretici (mulberry32)
function rng(tohum) {
  let a = tohum >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

// Küçük deneme listesi (gerçek kelimeler.js kullanılmaz)
const CEVAPLAR = ['kalem', 'deniz', 'elmas', 'kitap', 'çiçek', 'balık', 'sasma'];
const GECERLI = CEVAPLAR.concat(['kakao', 'eleme', 'masal', 'izmir', 'şeker']);
const LISTE = { cevaplar: CEVAPLAR, gecerli: GECERLI };

// Sözlükte olmayan ama 5 harfli, birbirinden farklı kelimeler (yanlış tahmin yakmak için, "zorla" ile)
const YANLISLAR = ['abcde', 'fghıi', 'jklmn', 'oöprs', 'ştuüv', 'yzabc'];

function pid(i) {
  return 'p' + i;
}

function basarili(sonuc) {
  assert.equal(sonuc.ok, true, 'Başarılı olmalıydı ama hata geldi: ' + sonuc.hata);
  return sonuc.durum;
}

function hatali(sonuc) {
  assert.equal(sonuc.ok, false, 'Hata vermeliydi');
  assert.equal(typeof sonuc.hata, 'string');
  assert.ok(sonuc.hata.length > 0);
  return sonuc.hata;
}

// Deneme listesiyle hareket uygular
function u(d, eylem, tohum = 1) {
  return uygula(d, eylem, rng(tohum), LISTE);
}

function dondur(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    Object.values(x).forEach(dondur);
  }
  return x;
}

// n kişilik lobi (Ali, Oyuncu1, ...)
function lobi(n, ayar = {}) {
  let d = yeniOda(pid(0), 'Ali');
  for (let i = 1; i < n; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  d.ayar = Object.assign({}, d.ayar, ayar);
  return d;
}

// Oyunu başlatır. cevap verilirse ilk kelime o olur (kullanilanlar da buna göre kalır).
function baslat(n, ayar = {}, cevap = null, tohum = 1) {
  let d = basarili(u(lobi(n, ayar), { tip: 'baslat', id: pid(0) }, tohum));
  if (cevap) {
    d.cevap = cevap;
    d.kullanilanlar = [cevap];
  }
  return d;
}

function tahmin(d, i, kelime, ek = {}) {
  return u(d, Object.assign({ tip: 'tahmin', id: pid(i), tur: d.tur, kelime: kelime }, ek));
}

function oyna(d, i, kelime, ek = {}) {
  return basarili(tahmin(d, i, kelime, ek));
}

// i. oyuncu gizli kelimeyi n. denemede çözer (öncesinde n-1 yanlış tahmin yakar)
function cozdur(d, i, n) {
  for (let k = 0; k < n - 1; k++) {
    d = oyna(d, i, YANLISLAR[k], { zorla: true });
  }
  return oyna(d, i, d.cevap);
}

// i. oyuncu 6 yanlış tahminle biter
function yakdir(d, i) {
  for (let k = 0; k < DENEME_SAYISI; k++) {
    d = oyna(d, i, YANLISLAR[k], { zorla: true });
  }
  return d;
}

function sonraki(d, i = 0, ek = {}) {
  return u(d, Object.assign({ tip: 'sonraki', id: pid(i), tur: d.tur }, ek));
}

// ---------------------------------------------------------------------------
// Türkçe metin
// ---------------------------------------------------------------------------

test('alfabe: 29 harf, q w x yok', () => {
  assert.equal([...ALFABE].length, 29);
  for (const harf of ['q', 'w', 'x']) {
    assert.ok(!ALFABE.includes(harf));
  }
  for (const harf of ['ç', 'ğ', 'ı', 'i', 'ö', 'ş', 'ü']) {
    assert.ok(ALFABE.includes(harf));
  }
});

test('kelimeTemizle: büyük İ/I Türkçe küçülür', () => {
  assert.equal(kelimeTemizle('İZMİR'), 'izmir');
  assert.equal(kelimeTemizle('BALIK'), 'balık');
  assert.equal(kelimeTemizle('ŞEKER'), 'şeker');
  assert.equal(kelimeTemizle('ÇİÇEK'), 'çiçek');
  assert.equal(kelimeTemizle('Işık'), 'ışık');
  assert.equal('i'.toLocaleUpperCase('tr-TR'), 'İ');
  assert.equal('ı'.toLocaleUpperCase('tr-TR'), 'I');
});

test('kelimeTemizle: alfabe dışı karakterler atılır, birleşik işaretler tek harf olur', () => {
  assert.equal(kelimeTemizle('ka-lem 1!'), 'kalem');
  assert.equal(kelimeTemizle('qwx'), '');
  assert.equal(kelimeTemizle(undefined), '');
  assert.equal(kelimeTemizle(null), '');
  // ç yerine c + birleşik çengel (NFC'ye çevrilir)
  assert.equal(kelimeTemizle('çi̇çek'), 'çiçek');
  assert.equal([...kelimeTemizle('çi̇çek')].length, 5);
});

// ---------------------------------------------------------------------------
// Renklendirme
// ---------------------------------------------------------------------------

test('renk: hepsi doğru', () => {
  assert.deepEqual(renklendir('kalem', 'kalem'), [2, 2, 2, 2, 2]);
});

test('renk: hiçbir harf yok', () => {
  assert.deepEqual(renklendir('sürüş', 'kalem'), [0, 0, 0, 0, 0]);
});

test('renk: kalem / kakao (tekrar eden k ve a, fazlası gri)', () => {
  assert.deepEqual(renklendir('kakao', 'kalem'), [2, 2, 0, 0, 0]);
});

test('renk: elmas / eleme (fazla e gri, m sarı)', () => {
  assert.deepEqual(renklendir('eleme', 'elmas'), [2, 2, 0, 1, 0]);
});

test('renk: sasma / ssaaa (yeşil önce, kalan kadar sarı)', () => {
  // s a s m a  <-  s s a a a
  assert.deepEqual(renklendir('ssaaa', 'sasma'), [2, 1, 1, 0, 2]);
});

test('renk: yalnız doğru yerdeki a yeşil, fazlası gri', () => {
  assert.deepEqual(renklendir('aaaaa', 'sasma'), [0, 2, 0, 0, 2]);
  assert.deepEqual(renklendir('aaaaa', 'masal'), [0, 2, 0, 2, 0]);
});

test('renk: yeşille tüketilen harf için sarı verilmez', () => {
  // k a l e m  <-  e l l e k : 2. l ve 2. e yeşil, 1. e ve 1. l gri, k sarı
  assert.deepEqual(renklendir('ellek', 'kalem'), [0, 0, 2, 2, 1]);
});

test('renk: cevapta tek olan harf tahminde iki kez yanlış yerdeyse yalnız ilki sarı', () => {
  // k a l e m  <-  l l b b b : cevapta bir l var
  assert.deepEqual(renklendir('llbbb', 'kalem'), [1, 0, 0, 0, 0]);
  // l a l e l : 3. l doğru yerde (yeşil), diğer l'lere kalan l yok
  assert.deepEqual(renklendir('lalel', 'kalem'), [0, 2, 2, 2, 0]);
});

test('renk: Türkçe harfler (ç, i) tekrarlı', () => {
  // ç i ç e k  <-  ç e ç i k
  assert.deepEqual(renklendir('çeçik', 'çiçek'), [2, 1, 2, 1, 2]);
});

test('renk: i ile ı farklı harftir', () => {
  assert.deepEqual(renklendir('balik', 'balık'), [2, 2, 2, 0, 2]);
  assert.deepEqual(renklendir('balık', 'balık'), [2, 2, 2, 2, 2]);
});

test('renk: her harf için sarı sayısı cevaptaki kalan sayıyı geçmez (rastgele deneme)', () => {
  const r = rng(7);
  const harfler = [...'abcçd'];
  const kelime = () => Array.from({ length: 5 }, () => harfler[Math.floor(r() * harfler.length)]).join('');
  for (let n = 0; n < 500; n++) {
    const cevap = kelime();
    const t = kelime();
    const renkler = renklendir(t, cevap);
    for (const harf of harfler) {
      const cevapta = [...cevap].filter((h) => h === harf).length;
      const isaretli = [...t].filter((h, j) => h === harf && renkler[j] > 0).length;
      assert.ok(isaretli <= cevapta, cevap + ' / ' + t + ' / ' + harf);
    }
    [...t].forEach((h, j) => {
      assert.equal(renkler[j] === 2, h === cevap[j]);
    });
  }
});

// ---------------------------------------------------------------------------
// Oda, ayarlar, katılma
// ---------------------------------------------------------------------------

test('yeni oda: lobi, varsayılan ayarlar, ev sahibi', () => {
  const d = yeniOda('a', 'Ali');
  assert.equal(d.oyun, 'kelime');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, 'a');
  assert.deepEqual(d.ayar, { turSayisi: 5, serbest: false });
  assert.deepEqual(d.oyuncular, [{ id: 'a', ad: 'Ali', puan: 0 }]);
  assert.deepEqual(d.gecmis, []);
  assert.deepEqual(d.kullanilanlar, []);
  assert.deepEqual(TUR_SAYILARI, [3, 5, 7]);
});

test('ayar: tur sayısı 3/5/7, yalnız ev sahibi, yalnız lobide', () => {
  let d = lobi(2);
  for (const sayi of [3, 7, 5]) {
    d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: sayi } }));
    assert.equal(d.ayar.turSayisi, sayi);
  }
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 4 } }));
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: '5' } }));
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { turSayisi: 3 } })), /ev sahibi/);
  const basladi = baslat(2);
  assert.match(hatali(u(basladi, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 3 } })), /başlamadan/);
});

test('ayar: sözlük dışı kelime anahtarı', () => {
  let d = lobi(2);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { serbest: true } }));
  assert.equal(d.ayar.serbest, true);
  assert.equal(d.ayar.turSayisi, 5);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { serbest: false } }));
  assert.equal(d.ayar.serbest, false);
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { serbest: 'evet' } }));
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { serbest: true } })), /ev sahibi/);
});

test('katılma: en fazla 4 kişi, aynı ad benzersizleşir, başlayınca katılınamaz', () => {
  let d = yeniOda('a', 'Ali');
  d = basarili(u(d, { tip: 'katil', id: 'b', ad: 'Ali' }));
  assert.notEqual(d.oyuncular[0].ad, d.oyuncular[1].ad);
  d = basarili(u(d, { tip: 'katil', id: 'c', ad: 'Can' }));
  d = basarili(u(d, { tip: 'katil', id: 'd', ad: 'Deniz' }));
  assert.match(hatali(u(d, { tip: 'katil', id: 'e', ad: 'Ece' })), /dolu/);
  // Zaten odadaysa sorun yok
  assert.equal(basarili(u(d, { tip: 'katil', id: 'b', ad: 'Ali' })).oyuncular.length, 4);
  const basladi = basarili(u(d, { tip: 'baslat', id: 'a' }));
  assert.match(hatali(u(basladi, { tip: 'katil', id: 'e', ad: 'Ece' })), /başladı/);
});

test('çıkarma: kendi çıkar, ev sahibi çıkarır, sahip devredilir, oyun sürerken olmaz', () => {
  let d = lobi(3);
  d = basarili(u(d, { tip: 'cikar', id: pid(2) }));
  assert.equal(d.oyuncular.length, 2);
  hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(0) }));
  d = basarili(u(d, { tip: 'cikar', id: pid(0), hedef: pid(1) }));
  assert.deepEqual(d.oyuncular.map((o) => o.id), [pid(0)]);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.oyuncular.length, 0);
  const basladi = baslat(2);
  assert.match(hatali(u(basladi, { tip: 'cikar', id: pid(1) })), /sürerken/);
});

// ---------------------------------------------------------------------------
// Başlatma
// ---------------------------------------------------------------------------

test('başlat: en az 2 kişi, yalnız ev sahibi', () => {
  hatali(u(lobi(1), { tip: 'baslat', id: pid(0) }));
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: 'yabanci' })), /ev sahibi/);
});

test('başlat: herkes aynı gizli kelimeyi görür, tahtalar boş, kelime listeden gelir', () => {
  for (let n = 2; n <= 4; n++) {
    const d = baslat(n);
    assert.equal(d.asama, 'tur');
    assert.equal(d.tur, 0);
    assert.ok(CEVAPLAR.includes(d.cevap), d.cevap);
    assert.equal(d.tahminler.length, n);
    assert.ok(d.tahminler.every((t) => t.length === 0));
    assert.deepEqual(d.kullanilanlar, [d.cevap]);
    assert.ok(d.oyuncular.every((o) => o.puan === 0));
    assert.deepEqual(d.gecmis, []);
  }
});

test('başlat: kelime rastgeleye göre seçilir ama hep listeden', () => {
  const gorulen = new Set();
  for (let tohum = 1; tohum <= 60; tohum++) {
    const d = baslat(2, {}, null, tohum);
    assert.ok(CEVAPLAR.includes(d.cevap));
    gorulen.add(d.cevap);
  }
  assert.ok(gorulen.size > 3, 'seçim hep aynı kelime');
});

test('başlat: cevap listesindeki bozuk girdiler (kısa, uzun, tekrar, büyük harf) elenir', () => {
  const liste = { cevaplar: ['KALEM', 'kalem', 'ev', 'kocaman', 'İZMİR'], gecerli: [] };
  const goruldu = new Set();
  for (let tohum = 1; tohum <= 40; tohum++) {
    const d = basarili(uygula(lobi(2), { tip: 'baslat', id: pid(0) }, rng(tohum), liste));
    goruldu.add(d.cevap);
  }
  assert.deepEqual([...goruldu].sort(), ['izmir', 'kalem']);
  hatali(uygula(lobi(2), { tip: 'baslat', id: pid(0) }, rng(1), { cevaplar: ['ev'], gecerli: [] }));
});

test('başlat: girdi durumu değişmez (donmuş durumla çalışır)', () => {
  const d = dondur(lobi(2));
  const sonuc = u(d, { tip: 'baslat', id: pid(0) });
  assert.equal(sonuc.ok, true);
  assert.equal(d.asama, 'lobi');
  const oyunda = dondur(baslat(2, {}, 'kalem'));
  const yeni = oyna(oyunda, 0, 'elmas');
  assert.equal(oyunda.tahminler[0].length, 0);
  assert.equal(yeni.tahminler[0].length, 1);
});

// ---------------------------------------------------------------------------
// Tahmin doğrulama
// ---------------------------------------------------------------------------

test('tahmin: motor rengi hesaplar, kelime temiz saklanır', () => {
  let d = baslat(2, {}, 'kalem');
  d = oyna(d, 0, 'KAKAO');
  assert.deepEqual(d.tahminler[0], [{ kelime: 'kakao', renkler: [2, 2, 0, 0, 0] }]);
  assert.deepEqual(d.tahminler[1], []);
  // İstemci renk göndermeye çalışsa da dikkate alınmaz
  d = oyna(d, 1, 'elmas', { renkler: [2, 2, 2, 2, 2] });
  assert.deepEqual(d.tahminler[1][0].renkler, renklendir('elmas', 'kalem'));
});

test('tahmin: oyuncu odada olmalı, doğru aşamada olmalı', () => {
  const d = baslat(2, {}, 'kalem');
  assert.match(hatali(u(d, { tip: 'tahmin', id: 'yabanci', tur: 0, kelime: 'elmas' })), /odada değilsin/);
  assert.match(hatali(u(lobi(2), { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'kalem' })), /tahmin yapılmaz/);
  const bitmis = cozdur(cozdur(d, 0, 1), 1, 1);
  assert.equal(bitmis.asama, 'acik');
  assert.match(hatali(u(bitmis, { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'elmas' })), /tahmin yapılmaz/);
});

test('tahmin: bayat kelime numarası reddedilir', () => {
  const d = baslat(2, {}, 'kalem');
  assert.match(hatali(u(d, { tip: 'tahmin', id: pid(0), tur: 3, kelime: 'elmas' })), /geçti/);
  // tur hiç verilmezse kabul (tur, çakışma koruması için isteğe bağlı)
  basarili(u(d, { tip: 'tahmin', id: pid(0), kelime: 'elmas' }));
});

test('tahmin: 5 harften az olamaz, harf olmayan karakter olmaz', () => {
  const d = baslat(2, {}, 'kalem');
  assert.equal(hatali(tahmin(d, 0, 'kale')), '5 harf gerekli');
  assert.equal(hatali(tahmin(d, 0, '')), '5 harf gerekli');
  assert.equal(hatali(tahmin(d, 0, 'kalemler')), '5 harf gerekli');
  hatali(tahmin(d, 0, 'ka1em'));
  hatali(tahmin(d, 0, 'kal-m'));
  hatali(tahmin(d, 0, 'qwxqw'));
  hatali(tahmin(d, 0, undefined));
  hatali(tahmin(d, 0, 12345));
});

test('tahmin: sözlükte olmayan kelime reddedilir, "yine de kullan" (zorla) kabul eder', () => {
  const d = baslat(2, {}, 'kalem');
  assert.equal(hatali(tahmin(d, 0, 'abcde')), 'Bu kelime listede yok.');
  const yeni = oyna(d, 0, 'abcde', { zorla: true });
  assert.equal(yeni.tahminler[0].length, 1);
  assert.equal(yeni.tahminler[0][0].kelime, 'abcde');
  // zorla yalnız true değeriyle çalışır
  hatali(tahmin(d, 0, 'abcde', { zorla: 'evet' }));
  hatali(tahmin(d, 0, 'abcde', { zorla: 1 }));
  // zorla bile olsa 5 harf kuralı geçerli
  assert.equal(hatali(tahmin(d, 0, 'abcd', { zorla: true })), '5 harf gerekli');
});

test('tahmin: "Kabul et" ayarında sözlükte olmayan kelime doğrudan kabul edilir', () => {
  let d = baslat(2, { serbest: true }, 'kalem');
  d = oyna(d, 0, 'abcde');
  assert.equal(d.tahminler[0][0].kelime, 'abcde');
  assert.equal(tahminHatasi(d, 1, 'abcde', false, LISTE), null);
});

test('tahmin: aynı kelime ikinci kez denenmez (büyük/küçük fark etmez)', () => {
  let d = baslat(2, {}, 'kalem');
  d = oyna(d, 0, 'elmas');
  assert.equal(hatali(tahmin(d, 0, 'elmas')), 'Bunu zaten denedin.');
  assert.equal(hatali(tahmin(d, 0, 'ELMAS')), 'Bunu zaten denedin.');
  // Rakip aynı kelimeyi deneyebilir
  d = oyna(d, 1, 'elmas');
  assert.equal(d.tahminler[1].length, 1);
  // Sözlükte olmayanı zorla deneyip tekrar etmek de yasak
  d = oyna(d, 0, 'abcde', { zorla: true });
  assert.equal(hatali(tahmin(d, 0, 'abcde', { zorla: true })), 'Bunu zaten denedin.');
});

test('tahmin: büyük İ ve I Türkçe küçülür (İZMİR, BALIK)', () => {
  let d = baslat(2, {}, 'kalem');
  d = oyna(d, 0, 'İZMİR');
  assert.equal(d.tahminler[0][0].kelime, 'izmir');
  d = oyna(d, 0, 'BALIK');
  assert.equal(d.tahminler[0][1].kelime, 'balık');
  // Noktalı küçük i ile yazılan balik sözlükte yok
  assert.equal(hatali(tahmin(d, 1, 'balik')), 'Bu kelime listede yok.');
  assert.equal(oyna(d, 1, 'balık').tahminler[1][0].kelime, 'balık');
  // ç, ş büyük harfle de çalışır
  assert.equal(oyna(d, 1, 'ŞEKER').tahminler[1][0].kelime, 'şeker');
});

test('sözlük: cevaplar da geçerli sayılır, tahminHatasi motorla aynı kararı verir', () => {
  assert.ok(sozlukteVarMi('kalem', LISTE));
  assert.ok(sozlukteVarMi('kakao', LISTE));
  assert.ok(!sozlukteVarMi('abcde', LISTE));
  // cevap, geçerli listesinde yazılmamış olsa bile geçerli
  assert.ok(sozlukteVarMi('deniz', { cevaplar: ['deniz'], gecerli: [] }));
  const d = baslat(2, {}, 'kalem');
  assert.equal(tahminHatasi(d, 0, 'kale', false, LISTE).neden, 'kisa');
  assert.equal(tahminHatasi(d, 0, 'abcde', false, LISTE).neden, 'sozluk');
  assert.equal(tahminHatasi(d, 0, 'abcde', true, LISTE), null);
  assert.equal(tahminHatasi(d, 0, 'ka1em', false, LISTE).neden, 'harf');
  assert.equal(tahminHatasi(oyna(d, 0, 'elmas'), 0, 'elmas', false, LISTE).neden, 'tekrar');
});

test('tahmin: en fazla 6 deneme; 6. denemeden sonra tahmin yapılamaz', () => {
  let d = baslat(2, {}, 'kalem');
  for (let k = 0; k < 5; k++) {
    d = oyna(d, 0, YANLISLAR[k], { zorla: true });
    assert.equal(oyuncuDurumu(d, 0).bitti, false);
  }
  d = oyna(d, 0, YANLISLAR[5], { zorla: true });
  assert.equal(d.tahminler[0].length, 6);
  assert.equal(oyuncuDurumu(d, 0).bitti, true);
  assert.equal(oyuncuDurumu(d, 0).cozdu, false);
  assert.match(hatali(tahmin(d, 0, 'elmas')), /bitirdin/);
  // Rakip hâlâ oynayabilir ve tur açılmadı
  assert.equal(d.asama, 'tur');
  oyna(d, 1, 'elmas');
});

test('tahmin: çözen oyuncu artık tahmin yapamaz', () => {
  let d = baslat(3, {}, 'kalem');
  d = oyna(d, 0, 'kalem');
  assert.equal(oyuncuDurumu(d, 0).cozdu, true);
  assert.equal(oyuncuDurumu(d, 0).deneme, 1);
  assert.match(hatali(tahmin(d, 0, 'elmas')), /bitirdin/);
});

test('bilinmeyen hareket ve boş hareket reddedilir', () => {
  const d = baslat(2);
  assert.match(hatali(u(d, { tip: 'uc' })), /Bilinmeyen/);
  assert.match(hatali(u(d, null)), /Bilinmeyen/);
  assert.match(hatali(u(d, undefined)), /Bilinmeyen/);
  assert.match(hatali(u(d, { tip: 'oyna', id: pid(0), kart: 1 })), /Bilinmeyen/);
});

// ---------------------------------------------------------------------------
// Tur akışı
// ---------------------------------------------------------------------------

test('tur akışı (2 kişi): herkes bitirmeden sonuç açılmaz; en az denemede çözen kazanır', () => {
  let d = baslat(2, {}, 'kalem');
  d = cozdur(d, 0, 3);
  assert.equal(d.asama, 'tur', 'rakip bitirmeden tur kapanmamalı');
  assert.equal(herkesBitti(d), false);
  assert.deepEqual(d.gecmis, []);
  assert.equal(d.oyuncular[0].puan, 0);
  d = cozdur(d, 1, 5);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 0]);
  assert.deepEqual(d.gecmis, [{ kelime: 'kalem', denemeler: [3, 5], kazananlar: [0] }]);
});

test('tur akışı: tahminler sıra beklemeden, iç içe yapılabilir', () => {
  let d = baslat(2, {}, 'kalem');
  d = oyna(d, 1, 'elmas');
  d = oyna(d, 1, 'deniz');
  d = oyna(d, 0, 'kitap');
  d = oyna(d, 1, 'kalem');
  d = oyna(d, 0, 'kalem');
  assert.equal(d.asama, 'acik');
  // 1. oyuncu 3'te, 0. oyuncu 2'de çözdü
  assert.deepEqual(d.gecmis[0].denemeler, [2, 3]);
  assert.deepEqual(d.gecmis[0].kazananlar, [0]);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 0]);
});

test('berabere: aynı denemede çözenlerin ikisi de +1 alır', () => {
  let d = baslat(2, {}, 'kalem');
  d = cozdur(d, 0, 4);
  d = cozdur(d, 1, 4);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 1]);
  assert.deepEqual(d.gecmis[0].kazananlar, [0, 1]);
});

test('çözen, çözemeyene karşı kazanır; çözemeyen puan almaz', () => {
  let d = baslat(2, {}, 'kalem');
  d = yakdir(d, 0);
  assert.equal(d.asama, 'tur');
  d = cozdur(d, 1, 6);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 1]);
  assert.deepEqual(d.gecmis[0].denemeler, [null, 6]);
  assert.deepEqual(d.gecmis[0].kazananlar, [1]);
});

test('kimse çözemezse kimse puan almaz', () => {
  let d = baslat(3, {}, 'kalem');
  d = yakdir(d, 0);
  d = yakdir(d, 2);
  assert.equal(d.asama, 'tur');
  d = yakdir(d, 1);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0, 0]);
  assert.deepEqual(d.gecmis[0], { kelime: 'kalem', denemeler: [null, null, null], kazananlar: [] });
});

test('tur akışı (3 kişi): en az denemede çözenler paylaşır, geç çözen almaz', () => {
  let d = baslat(3, {}, 'kalem');
  d = cozdur(d, 2, 2);
  d = cozdur(d, 0, 5);
  d = cozdur(d, 1, 2);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 1, 1]);
  assert.deepEqual(d.gecmis[0].kazananlar, [1, 2]);
});

test('tur akışı (4 kişi): biri çözer, biri yanar, ikisi geç çözer', () => {
  let d = baslat(4, {}, 'kalem');
  d = cozdur(d, 3, 6);
  d = yakdir(d, 1);
  d = cozdur(d, 0, 1);
  assert.equal(d.asama, 'tur');
  d = cozdur(d, 2, 2);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 0, 0, 0]);
  assert.deepEqual(d.gecmis[0].denemeler, [1, null, 2, 6]);
});

test('klavye renkleri: harf başına en iyi renk', () => {
  let d = baslat(2, {}, 'kalem');
  d = oyna(d, 0, 'kakao');
  d = oyna(d, 0, 'elmas');
  const harita = klavyeRenkleri(d.tahminler[0]);
  // kakao: k yeşil, a yeşil, o gri;  elmas: e sarı, l sarı, m sarı, a gri, s gri
  assert.equal(harita['k'], 2);
  assert.equal(harita['a'], 2, 'a bir yerde yeşil olduysa yeşil kalır');
  assert.equal(harita['o'], 0);
  assert.equal(harita['e'], 1);
  assert.equal(harita['s'], 0);
  assert.equal(harita['z'], undefined);
  assert.deepEqual(klavyeRenkleri([]), {});
  assert.deepEqual(klavyeRenkleri(undefined), {});
});

// ---------------------------------------------------------------------------
// Sonraki kelime ve oyun sonu
// ---------------------------------------------------------------------------

function turuBitir(d, kazanan = 0) {
  // kazanan 1. denemede çözer, diğerleri yanar
  for (let i = 0; i < d.oyuncular.length; i++) {
    d = i === kazanan ? cozdur(d, i, 1) : yakdir(d, i);
  }
  assert.equal(d.asama, 'acik');
  return d;
}

test('sonraki: herkes basabilir, yeni kelime ve boş tahtalar gelir, puanlar kalır', () => {
  let d = baslat(2, {}, 'kalem');
  d = turuBitir(d, 0);
  d = basarili(sonraki(d, 1));
  assert.equal(d.asama, 'tur');
  assert.equal(d.tur, 1);
  assert.notEqual(d.cevap, 'kalem');
  assert.ok(CEVAPLAR.includes(d.cevap));
  assert.ok(d.tahminler.every((t) => t.length === 0));
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 0]);
  assert.equal(d.gecmis.length, 1);
  assert.equal(d.kullanilanlar.length, 2);
});

test('sonraki: yalnız odadakiler basabilir, yalnız tur sonunda', () => {
  const d = baslat(2, {}, 'kalem');
  assert.match(hatali(sonraki(d, 0)), /geçilmez/);
  const acik = turuBitir(d, 0);
  assert.match(hatali(u(acik, { tip: 'sonraki', id: 'yabanci', tur: 0 })), /odada değilsin/);
  assert.match(hatali(u(lobi(2), { tip: 'sonraki', id: pid(0), tur: 0 })), /geçilmez/);
});

test('sonraki: bayat numara zararsız (durum değişmez), iki kişi aynı anda basarsa ikincisi zararsız', () => {
  let d = turuBitir(baslat(2, {}, 'kalem'), 0);
  // Yanlış kelime numarası
  const ayni = basarili(sonraki(d, 0, { tur: 5 }));
  assert.deepEqual(ayni, d);
  // İki kişi aynı anda bastı: ikinci işlem, ilkinin sonucuna uygulanır
  const birinci = basarili(sonraki(d, 0));
  const ikinci = basarili(u(birinci, { tip: 'sonraki', id: pid(1), tur: 0 }));
  assert.deepEqual(ikinci, birinci);
  assert.equal(ikinci.tur, 1);
  // Yeni turda eski numarayla gelen sonraki, yeni turu atlatmaz
  assert.equal(ikinci.asama, 'tur');
});

test('sonraki: son kelimeden sonra oyun biter; tekrar basmak zararsız', () => {
  let d = baslat(2, { turSayisi: 3 }, 'kalem');
  for (let t = 0; t < 3; t++) {
    d = turuBitir(d, 0);
    assert.equal(d.tur, t);
    d = basarili(sonraki(d, 0));
  }
  assert.equal(d.asama, 'bitti');
  assert.equal(d.tur, 2);
  assert.equal(d.gecmis.length, 3);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [3, 0]);
  assert.deepEqual(oyunKazananlari(d), [0]);
  // İkinci kişi de "sonraki"ye bastı
  assert.deepEqual(basarili(sonraki(d, 1)), d);
  assert.match(hatali(tahmin(d, 0, 'elmas')), /tahmin yapılmaz/);
});

test('oyun sonu: en çok tur kazanan; eşitlik berabere', () => {
  const d = baslat(3, { turSayisi: 3 }, 'kalem');
  const bitti = (puanlar) => {
    const x = structuredClone(d);
    x.oyuncular.forEach((o, i) => {
      o.puan = puanlar[i];
    });
    return oyunKazananlari(x);
  };
  assert.deepEqual(bitti([2, 1, 0]), [0]);
  assert.deepEqual(bitti([0, 1, 2]), [2]);
  assert.deepEqual(bitti([1, 1, 1]), [0, 1, 2]);
  assert.deepEqual(bitti([2, 0, 2]), [0, 2]);
  assert.deepEqual(bitti([0, 0, 0]), [0, 1, 2]);
});

test('oyun sonu: 3 turluk oyunun gerçek akışı berabere bitebilir', () => {
  let d = baslat(2, { turSayisi: 3 }, 'kalem');
  d = turuBitir(d, 0);
  d = basarili(sonraki(d, 0));
  d = turuBitir(d, 1);
  d = basarili(sonraki(d, 0));
  // 3. tur: kimse çözmez
  d = yakdir(yakdir(d, 0), 1);
  d = basarili(sonraki(d, 0));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 1]);
  assert.deepEqual(oyunKazananlari(d), [0, 1]);
  assert.deepEqual(d.gecmis.map((g) => g.kazananlar), [[0], [1], []]);
});

test('tur sayısı ayarı: 5 tur oynanır ve bitiş tam 5. turda olur', () => {
  let d = baslat(2, {}, 'kalem');
  for (let t = 0; t < 5; t++) {
    assert.equal(d.asama, 'tur');
    assert.equal(d.tur, t);
    d = turuBitir(d, 0);
    d = basarili(sonraki(d, 0));
  }
  assert.equal(d.asama, 'bitti');
  assert.equal(d.gecmis.length, 5);
});

test('kelimeler bir oyunda ve Tekrar oyna sonrasında tekrar etmez', () => {
  // 7 cevap var: 7 turluk oyun hepsini tam bir kez kullanır
  let d = baslat(2, { turSayisi: 7 }, null, 11);
  const gorulen = [];
  for (let t = 0; t < 7; t++) {
    gorulen.push(d.cevap);
    d = turuBitir(d, 0);
    d = basarili(sonraki(d, 0));
  }
  assert.equal(d.asama, 'bitti');
  assert.equal(new Set(gorulen).size, 7, 'kelime tekrar etti: ' + gorulen.join(','));
  assert.deepEqual(d.gecmis.map((g) => g.kelime), gorulen);
});

test('kelimeler: farklı tohumlarda 5 turluk oyunda aynı kelime tekrar etmez', () => {
  for (let tohum = 1; tohum <= 25; tohum++) {
    let d = baslat(2, { turSayisi: 5 }, null, tohum);
    for (let t = 0; t < 5; t++) {
      d = turuBitir(d, 0);
      d = u(d, { tip: 'sonraki', id: pid(0), tur: d.tur }, tohum * 100 + t).durum;
    }
    const kelimeler = d.gecmis.map((g) => g.kelime);
    assert.equal(new Set(kelimeler).size, 5, 'tohum ' + tohum + ': ' + kelimeler.join(','));
  }
});

test('Tekrar oyna: yeni kelimeler, puanlar sıfır, ayarlar aynı, kelime tekrarı yok', () => {
  let d = baslat(2, { turSayisi: 3, serbest: true }, null, 5);
  const ilkOyun = [];
  for (let t = 0; t < 3; t++) {
    ilkOyun.push(d.cevap);
    d = turuBitir(d, t % 2);
    d = basarili(sonraki(d, 0));
  }
  assert.equal(d.asama, 'bitti');
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  assert.match(hatali(u(baslat(2), { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  d = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, 9));
  assert.equal(d.asama, 'tur');
  assert.equal(d.tur, 0);
  assert.deepEqual(d.ayar, { turSayisi: 3, serbest: true });
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0]);
  assert.deepEqual(d.gecmis, []);
  assert.ok(d.tahminler.every((t) => t.length === 0));
  assert.ok(!ilkOyun.includes(d.cevap), 'ilk oyundaki kelime yine geldi: ' + d.cevap);
  assert.equal(d.kullanilanlar.length, 4);
});

test('havuz bitince kullanılanlar sıfırlanır ve oyun devam eder (art arda aynı kelime gelmez)', () => {
  const kucuk = { cevaplar: ['kalem', 'deniz', 'elmas'], gecerli: [] };
  let d = basarili(uygula(lobi(2, { turSayisi: 7 }), { tip: 'baslat', id: pid(0) }, rng(3), kucuk));
  const kelimeler = [];
  for (let t = 0; t < 7; t++) {
    kelimeler.push(d.cevap);
    for (let i = 0; i < 2; i++) {
      d = basarili(uygula(d, { tip: 'tahmin', id: pid(i), tur: d.tur, kelime: d.cevap }, rng(1), kucuk));
    }
    d = basarili(uygula(d, { tip: 'sonraki', id: pid(0), tur: d.tur }, rng(10 + t), kucuk));
  }
  assert.equal(d.asama, 'bitti');
  assert.equal(kelimeler.length, 7);
  for (let t = 1; t < 7; t++) {
    assert.notEqual(kelimeler[t], kelimeler[t - 1], 'art arda aynı kelime: ' + kelimeler.join(','));
  }
  // İlk üçü hepsi farklı (havuz sıfırlanmadan önce)
  assert.equal(new Set(kelimeler.slice(0, 3)).size, 3);
  assert.ok(d.kullanilanlar.length <= 3);
});

test('tek kelimelik havuz: sıfırlanınca aynı kelime kaçınılmaz ama oyun bozulmaz', () => {
  const tek = { cevaplar: ['kalem'], gecerli: [] };
  let d = basarili(uygula(lobi(2, { turSayisi: 3 }), { tip: 'baslat', id: pid(0) }, rng(1), tek));
  d = basarili(uygula(d, { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'kalem' }, rng(1), tek));
  d = basarili(uygula(d, { tip: 'tahmin', id: pid(1), tur: 0, kelime: 'kalem' }, rng(1), tek));
  d = basarili(uygula(d, { tip: 'sonraki', id: pid(0), tur: 0 }, rng(1), tek));
  assert.equal(d.asama, 'tur');
  assert.equal(d.cevap, 'kalem');
});

test('Lobiye dön: yalnız ev sahibi, her aşamada; puanlar sıfırlanır, ayarlar ve kullanılanlar kalır', () => {
  let d = baslat(2, { turSayisi: 7, serbest: true }, 'kalem');
  d = cozdur(d, 0, 2);
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  hatali(u(lobi(2), { tip: 'yeniOyun', id: pid(0) }));
  const lobiye = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.deepEqual(lobiye.ayar, { turSayisi: 7, serbest: true });
  assert.deepEqual(lobiye.oyuncular.map((o) => o.puan), [0, 0]);
  assert.deepEqual(lobiye.tahminler, []);
  assert.deepEqual(lobiye.gecmis, []);
  assert.equal(lobiye.cevap, '');
  assert.deepEqual(lobiye.kullanilanlar, ['kalem']);
  // Yeni oyun başlatılabilir
  assert.equal(basarili(u(lobiye, { tip: 'baslat', id: pid(0) })).asama, 'tur');
  // Açık ve bitti aşamalarında da çalışır
  const acik = turuBitir(baslat(2, {}, 'kalem'), 0);
  assert.equal(basarili(u(acik, { tip: 'yeniOyun', id: pid(0) })).asama, 'lobi');
});

test('başlat: oyun zaten başladıysa tekrar başlatılamaz', () => {
  const d = baslat(2);
  assert.match(hatali(u(d, { tip: 'baslat', id: pid(0) })), /zaten/);
});

// ---------------------------------------------------------------------------
// Eşzamanlılık: başkası araya yazsa da tahmin kaybolmaz
// ---------------------------------------------------------------------------

test('çakışma: A ve B aynı eski durumdan tahmin yapar; B yeniden uygulanınca ikisi de kayıtlı kalır', () => {
  const temel = baslat(3, {}, 'kalem');
  const aninin = oyna(temel, 0, 'elmas');
  // B, A'nın yazdığı yeni durumu çekip tahminini yeniden uygular
  const sonuc = oyna(aninin, 1, 'deniz');
  assert.equal(sonuc.tahminler[0].length, 1);
  assert.equal(sonuc.tahminler[1].length, 1);
  assert.equal(sonuc.tahminler[0][0].kelime, 'elmas');
  assert.equal(sonuc.tahminler[1][0].kelime, 'deniz');
  // Sıra ters de olsa aynı sonuç
  const ters = oyna(oyna(temel, 1, 'deniz'), 0, 'elmas');
  assert.deepEqual(ters.tahminler, sonuc.tahminler);
});

test('çakışma: aynı anda gelen tahminler her sırayla uygulansa da aynı tahtaları verir', () => {
  const temel = baslat(4, {}, 'kalem');
  const hamleler = [
    [0, 'elmas'],
    [1, 'deniz'],
    [2, 'kitap'],
    [3, 'balık'],
  ];
  const izdiham = (sira) => {
    let d = temel;
    for (const k of sira) {
      d = oyna(d, hamleler[k][0], hamleler[k][1]);
    }
    return d.tahminler;
  };
  const beklenen = izdiham([0, 1, 2, 3]);
  for (const sira of [[3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]]) {
    assert.deepEqual(izdiham(sira), beklenen);
  }
});

test('çakışma: turu bitiren son tahmin başkasının yazısından sonra da geçerlidir', () => {
  const temel = baslat(2, {}, 'kalem');
  const bAnin = oyna(temel, 1, 'kalem'); // B çözdü
  // A'nın tahmini B'nin yazısından sonra uygulanır ve turu kapatır
  const sonuc = oyna(bAnin, 0, 'kalem');
  assert.equal(sonuc.asama, 'acik');
  assert.deepEqual(sonuc.gecmis[0].kazananlar, [0, 1]);
});

test('çakışma: tur ilerledikten sonra gelen eski tahmin reddedilir, yeni turu bozmaz', () => {
  let d = turuBitir(baslat(2, {}, 'kalem'), 0);
  d = basarili(sonraki(d, 0));
  const hata = hatali(u(d, { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'elmas' }));
  assert.match(hata, /geçti/);
  assert.ok(d.tahminler.every((t) => t.length === 0));
});

// ---------------------------------------------------------------------------
// Oyun yönlendirici (oyunlar.js)
// ---------------------------------------------------------------------------

function yonlendirLobi(oyun, n) {
  let d = yonlendirYeniOda(pid(0), 'Ali', oyun);
  for (let i = 1; i < n; i++) {
    d = basarili(yonlendir(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  return d;
}

function kimlikler(d) {
  return d.oyuncular.map((o) => o.id + ':' + o.ad);
}

test('yönlendirici: oyun listesi üç oyun içerir, kelime odası kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element', 'kule']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'kelime').ad, 'Kelime düellosu');
  const d = yonlendirYeniOda('a', 'Ali', 'kelime');
  assert.equal(d.oyun, 'kelime');
  assert.equal(oyunId(d), 'kelime');
  assert.equal(d.asama, 'lobi');
  assert.equal(yonlendirYeniOda('a', 'Ali').oyun, 'uno');
});

test('yönlendirici: kelime odasındaki hareketler kelime motoruna gider (liste 5. parametre)', () => {
  let d = yonlendirLobi('kelime', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 3 } }));
  assert.equal(d.ayar.turSayisi, 3);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1), undefined, LISTE));
  assert.equal(d.asama, 'tur');
  assert.ok(CEVAPLAR.includes(d.cevap));
  const hamle = { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'elmas' };
  const yeni = basarili(yonlendir(d, hamle, rng(1), undefined, LISTE));
  assert.equal(yeni.tahminler[0].length, 1);
  // Yanlış aşamadaki hareket yönlendiriciden de hata döner
  assert.equal(yonlendir(d, { tip: 'sonraki', id: pid(0), tur: 0 }).ok, false);
  // UNO ve tanış hareketleri kelime odasında reddedilir
  assert.match(hatali(yonlendir(d, { tip: 'oyna', id: pid(0), kart: 1 })), /Bilinmeyen/);
  assert.match(hatali(yonlendir(d, { tip: 'cevapla', id: pid(0), tur: 0, kendi: 0, tahmin: 0 })), /Bilinmeyen/);
});

test('yönlendirici: kelime hareketleri UNO ve tanış odalarında reddedilir', () => {
  const uno = yonlendirLobi('uno', 2);
  assert.match(hatali(yonlendir(uno, { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'kalem' })), /./);
  const tanis = yonlendirLobi('tanis', 2);
  assert.match(hatali(yonlendir(tanis, { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'kalem' })), /Bilinmeyen/);
});

test('oyun seçimi: UNO -> kelime -> tanış -> UNO oyuncuları, sırayı ve ev sahibini korur', () => {
  let d = yonlendirLobi('uno', 3);
  d = basarili(yonlendir(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  const once = structuredClone(d);
  const kimlik = kimlikler(d);

  const kelime = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'kelime' }));
  assert.deepEqual(d, once, 'girdi değişti');
  assert.equal(kelime.oyun, 'kelime');
  assert.equal(kelime.asama, 'lobi');
  assert.equal(kelime.sahip, pid(1));
  assert.deepEqual(kimlikler(kelime), kimlik);
  assert.deepEqual(kelime.ayar, { turSayisi: 5, serbest: false });
  assert.ok(kelime.oyuncular.every((o) => o.puan === 0));

  const tanis = basarili(yonlendir(kelime, { tip: 'oyunSec', id: pid(1), oyun: 'tanis' }));
  assert.equal(tanis.oyun, 'tanis');
  assert.deepEqual(kimlikler(tanis), kimlik);

  const geriKelime = basarili(yonlendir(tanis, { tip: 'oyunSec', id: pid(1), oyun: 'kelime' }));
  assert.equal(geriKelime.oyun, 'kelime');
  assert.deepEqual(kimlikler(geriKelime), kimlik);

  const uno = basarili(yonlendir(geriKelime, { tip: 'oyunSec', id: pid(1), oyun: 'uno' }));
  assert.equal(uno.oyun, 'uno');
  assert.deepEqual(kimlikler(uno), kimlik);
  assert.equal(uno.sahip, pid(1));
});

test('oyun seçimi: aynı oyunu seçmek ayarları bozmaz; yalnız ev sahibi, yalnız lobide', () => {
  let d = yonlendirLobi('kelime', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 7, serbest: true } }));
  const ayni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'kelime' }));
  assert.deepEqual(ayni, d);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'uno' })), /ev sahibi/);
  const oyunda = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1), undefined, LISTE));
  assert.match(hatali(yonlendir(oyunda, { tip: 'oyunSec', id: pid(0), oyun: 'uno' })), /lobide/);
  // Lobiye dönünce oyun değiştirilebilir
  const lobiye = basarili(yonlendir(oyunda, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(basarili(yonlendir(lobiye, { tip: 'oyunSec', id: pid(0), oyun: 'tanis' })).oyun, 'tanis');
});

test('oyun seçimi: kelime lobisine 4 kişi geçebilir, tanış lobisinden dönüşte kimse düşmez', () => {
  const d = yonlendirLobi('uno', 4);
  const kelime = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'kelime' }));
  assert.equal(kelime.oyuncular.length, 4);
  const basladi = basarili(yonlendir(kelime, { tip: 'baslat', id: pid(0) }, rng(2), undefined, LISTE));
  assert.equal(basladi.tahminler.length, 4);
});

test('kelimeler.js (gerçek liste) yüklenir ve biçimi doğrudur', async () => {
  const gercek = await import('../kelimeler.js');
  assert.ok(Array.isArray(gercek.CEVAPLAR));
  assert.ok(Array.isArray(gercek.GECERLI));
  assert.ok(gercek.CEVAPLAR.length > 0);
  // Gerçek liste varsayılan olarak kullanılıyor: ilk cevap sözlükte
  assert.ok(sozlukteVarMi(kelimeTemizle(gercek.CEVAPLAR[0])));
});

// ---------------------------------------------------------------------------
// Çalıştır
// ---------------------------------------------------------------------------

let gecen = 0;
let kalan = 0;

for (const t of testler) {
  try {
    await t.fonksiyon();
    gecen += 1;
    console.log('  ok   ' + t.ad);
  } catch (hata) {
    kalan += 1;
    console.log('  HATA ' + t.ad);
    console.log('       ' + String(hata && hata.message ? hata.message : hata).split('\n').join('\n       '));
  }
}

console.log('');
console.log(gecen + ' geçti, ' + kalan + ' kaldı (toplam ' + testler.length + ')');

if (kalan > 0) {
  process.exit(1);
}

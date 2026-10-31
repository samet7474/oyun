// "Beni ne kadar tanıyorsun" motoru ve oyun yönlendirici testleri. Çalıştır: node test/tanis-test.js
import assert from 'node:assert/strict';
import {
  MAKS_OZEL,
  VARSAYILAN_BANKA,
  konusulacaklar,
  lobiKur,
  ozelAnahtar,
  ozelIdUret,
  ozelSoruHatasi,
  ozelTemizle,
  turSonucu,
  uygula,
  uyumEtiketi,
  uyumYuzdesi,
  yeniOda,
} from '../tanis.js';
import { OYUNLAR, oyunId, uygula as yonlendir, yeniOda as yonlendirYeniOda } from '../oyunlar.js';
import { yeniOda as unoYeniOda, uygula as unoUygula } from '../uno.js';

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

// Küçük deneme bankası: yemek 6, aliskanlik 6, hayal 3 soru; "bos" konusunda soru yok.
function soruUret(id, kategori, secenekSayisi) {
  const secenekler = [];
  for (let i = 1; i <= secenekSayisi; i++) {
    secenekler.push('Seçenek ' + i);
  }
  return { id: id, kategori: kategori, soru: id + ' sorusu?', secenekler: secenekler };
}

function bankaKur() {
  const sorular = [];
  for (let i = 1; i <= 6; i++) {
    sorular.push(soruUret('yemek-0' + i, 'yemek', 4));
  }
  for (let i = 1; i <= 6; i++) {
    sorular.push(soruUret('aliskanlik-0' + i, 'aliskanlik', 3));
  }
  for (let i = 1; i <= 3; i++) {
    sorular.push(soruUret('hayal-0' + i, 'hayal', 3));
  }
  return {
    kategoriler: [
      { id: 'yemek', ad: 'Yemek' },
      { id: 'aliskanlik', ad: 'Alışkanlık' },
      { id: 'hayal', ad: 'Hayal' },
      { id: 'bos', ad: 'Boş konu' },
    ],
    sorular: sorular,
  };
}

const BANKA = bankaKur();

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

// Deneme bankasıyla hareket uygular
function u(d, eylem, tohum = 1) {
  return uygula(d, eylem, rng(tohum), BANKA);
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
  let d = yeniOda(pid(0), 'Ali', BANKA);
  for (let i = 1; i < n; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  d.ayar = Object.assign({}, d.ayar, ayar);
  return d;
}

function ozelSoru(no, soruMetni = 'Kendi sorum ' + no + '?') {
  return { id: 'ozel-q' + String(no).padStart(3, '0'), soru: soruMetni, secenekler: ['Evet', 'Hayır'] };
}

function ozelListe(bas, adet) {
  const liste = [];
  for (let i = bas; i < bas + adet; i++) {
    liste.push(ozelSoru(i));
  }
  return liste;
}

function ozelVer(d, kim, liste) {
  return basarili(u(d, { tip: 'ozelSorular', id: pid(kim), sorular: liste }));
}

// İki kişilik oyun başlatır
function oyunBaslat(ayar = {}, tohum = 1) {
  const d = lobi(2, ayar);
  return basarili(u(d, { tip: 'baslat', id: pid(0) }, tohum));
}

function cevapla(d, kim, kendi, tahmin) {
  return u(d, { tip: 'cevapla', id: pid(kim), tur: d.tur, kendi: kendi, tahmin: tahmin });
}

function sonraki(d, kim = 0) {
  return u(d, { tip: 'sonraki', id: pid(kim), tur: d.tur });
}

// Bir soruyu iki oyuncuyla oynar. a = [kendi, tahmin] (oyuncu 0), b = [kendi, tahmin] (oyuncu 1)
function turOyna(d, a, b) {
  let yeni = basarili(cevapla(d, 0, a[0], a[1]));
  yeni = basarili(cevapla(yeni, 1, b[0], b[1]));
  return yeni;
}

// Bütün soruları verilen kalıpla oynar ve bitirir. kalip(tur) -> [a, b]
function hepsiniOyna(d, kalip) {
  let yeni = d;
  while (yeni.asama === 'cevap') {
    const [a, b] = kalip(yeni.tur);
    yeni = turOyna(yeni, a, b);
    yeni = basarili(sonraki(yeni));
  }
  return yeni;
}

// ---------------------------------------------------------------------------
// Oda ve lobi
// ---------------------------------------------------------------------------

test('oda: yeni lobi varsayılanlarla kurulur', () => {
  const d = yeniOda('a', 'Ali', BANKA);
  assert.equal(d.oyun, 'tanis');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, 'a');
  assert.equal(d.oyuncular.length, 1);
  assert.equal(d.oyuncular[0].ad, 'Ali');
  assert.deepEqual(d.oyuncular[0].ozel, []);
  assert.equal(d.ayar.soruSayisi, 10);
  assert.deepEqual(d.ayar.konular, ['yemek', 'aliskanlik', 'hayal', 'bos']);
  assert.equal(d.ayar.ozel, true);
  assert.deepEqual(d.sorulanlar, []);
});

test('oda: ad temizlenir, boşsa varsayılan', () => {
  assert.equal(yeniOda('a', '   ', BANKA).oyuncular[0].ad, 'Oyuncu');
  assert.ok(yeniOda('a', 'Çok Uzun Bir İsim Yazıldı', BANKA).oyuncular[0].ad.length <= 12);
});

test('lobi: en fazla 4 kişi, aynı kişi tek koltuk, aynı isim ayrılır', () => {
  const d = lobi(4);
  assert.match(hatali(u(d, { tip: 'katil', id: 'p9', ad: 'Fazla' })), /dolu/);
  const d2 = basarili(u(lobi(2), { tip: 'katil', id: pid(1), ad: 'Başka' }));
  assert.equal(d2.oyuncular.length, 2);
  const d3 = basarili(u(d2, { tip: 'katil', id: 'yeni', ad: 'ali' }));
  assert.equal(d3.oyuncular.length, 3);
  assert.notEqual(d3.oyuncular[2].ad.toLocaleLowerCase('tr'), 'ali');
});

test('lobi: oyun başladıktan sonra yeni gelen katılamaz, eski oyuncu içeri girer', () => {
  const d = oyunBaslat();
  assert.match(hatali(u(d, { tip: 'katil', id: 'gec', ad: 'Geç' })), /başladı/);
  basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Oyuncu1' }));
});

test('lobi: çıkma, ev sahibi çıkarma, ev sahibi devri', () => {
  let d = lobi(3);
  hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(2) }));
  d = basarili(u(d, { tip: 'cikar', id: pid(0), hedef: pid(2) }));
  assert.equal(d.oyuncular.length, 2);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  assert.equal(d.oyuncular.length, 1);
});

test('lobi: oyun sürerken kimse çıkamaz', () => {
  const d = oyunBaslat();
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1) })), /çıkılamaz/);
});

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------

test('ayar: yalnız ev sahibi değiştirir', () => {
  const d = lobi(2);
  hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { soruSayisi: 5 } }));
  const d2 = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: 5 } }));
  assert.equal(d2.ayar.soruSayisi, 5);
});

test('ayar: soru sayısı yalnız 5, 10, 15', () => {
  const d = lobi(2);
  for (const sayi of [5, 10, 15]) {
    const d2 = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: sayi } }));
    assert.equal(d2.ayar.soruSayisi, sayi);
  }
  for (const kotu of [0, 7, 20, '10', null]) {
    hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: kotu } }));
  }
});

test('ayar: konular bankadaki sırayla saklanır, en az biri açık kalır, bilinmeyen konu reddedilir', () => {
  const d = lobi(2);
  const d2 = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { konular: ['hayal', 'yemek', 'yemek'] } }));
  assert.deepEqual(d2.ayar.konular, ['yemek', 'hayal']);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { konular: [] } })), /en az bir konu/i);
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { konular: ['yemek', 'yok-boyle-konu'] } }));
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { konular: 'yemek' } }));
});

test('ayar: kendi sorular anahtarı ve kısmi ayar diğerlerini bozmaz', () => {
  const d = lobi(2);
  const d2 = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { ozel: false } }));
  assert.equal(d2.ayar.ozel, false);
  assert.equal(d2.ayar.soruSayisi, 10);
  assert.deepEqual(d2.ayar.konular, d.ayar.konular);
});

test('ayar: geçersiz bir alan varsa hiçbiri uygulanmaz, oyun başlayınca değişmez', () => {
  const d = lobi(2);
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: 5, konular: [] } }));
  assert.equal(d.ayar.soruSayisi, 10);
  const oyunda = oyunBaslat();
  assert.match(hatali(u(oyunda, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: 5 } })), /başlamadan/);
});

// ---------------------------------------------------------------------------
// Kendi sorularım
// ---------------------------------------------------------------------------

test('kendi soru: uzunluk, seçenek sayısı, boş ve aynı seçenek kuralları', () => {
  assert.equal(ozelSoruHatasi('Nerede doğdun?', ['İstanbul', 'Ankara']), null);
  assert.equal(ozelSoruHatasi('a'.repeat(70), ['A', 'B']), null);
  assert.match(ozelSoruHatasi('a'.repeat(71), ['A', 'B']), /70/);
  assert.match(ozelSoruHatasi('   ', ['A', 'B']), /yaz/);
  assert.match(ozelSoruHatasi('Soru?', ['A']), /2 seçenek/);
  assert.match(ozelSoruHatasi('Soru?', ['A', 'B', 'C', 'D', 'E']), /4/);
  assert.equal(ozelSoruHatasi('Soru?', ['A', 'B', 'C', 'D']), null);
  assert.match(ozelSoruHatasi('Soru?', ['A', '  ']), /Boş/);
  assert.match(ozelSoruHatasi('Soru?', ['A', 'a'.repeat(29)]), /28/);
  assert.equal(ozelSoruHatasi('Soru?', ['A', 'a'.repeat(28)]), null);
  assert.match(ozelSoruHatasi('Soru?', ['Işık', 'ışık']), /Aynı/);
  assert.match(ozelSoruHatasi('Soru?', ['Çay', ' çay ']), /Aynı/);
});

test('kendi soru: temizleme bozukları atar, boşlukları düzeltir, tekrar temizlemek bir şey değiştirmez', () => {
  const liste = [
    ozelSoru(1),
    { id: 'ozel-q002', soru: '  İki   boşluk?  ', secenekler: [' A  ', 'B'] },
    { id: 'kotu-id', soru: 'Soru?', secenekler: ['A', 'B'] },
    { id: 'ozel-q003', soru: 'Tek seçenek?', secenekler: ['A'] },
    { id: 'ozel-q004', soru: 'Aynı seçenek?', secenekler: ['A', 'a'] },
    { id: 'ozel-q001', soru: 'Aynı id', secenekler: ['A', 'B'] },
    null,
    'metin',
    { id: 'ozel-q005', soru: 'Seçenek yok?' },
  ];
  const temiz = ozelTemizle(liste);
  assert.deepEqual(
    temiz.map((q) => q.id),
    ['ozel-q001', 'ozel-q002']
  );
  assert.equal(temiz[1].soru, 'İki boşluk?');
  assert.deepEqual(temiz[1].secenekler, ['A', 'B']);
  assert.deepEqual(ozelTemizle(temiz), temiz);
  assert.deepEqual(ozelTemizle('liste değil'), []);
});

test('kendi soru: en fazla 50 tane', () => {
  assert.equal(MAKS_OZEL, 50);
  assert.equal(ozelTemizle(ozelListe(0, 80)).length, 50);
});

test('kendi soru: id üretimi desene uyar, rastgele fonksiyonla tekrarlanır', () => {
  const a = ozelIdUret(rng(3));
  const b = ozelIdUret(rng(3));
  const c = ozelIdUret(rng(4));
  assert.match(a, /^ozel-[a-z0-9]{10}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(ozelTemizle([{ id: a, soru: 'Soru?', secenekler: ['A', 'B'] }]).length, 1);
});

test('ozelSorular: oyuncu yalnız kendi listesini yazar, liste temizlenmiş saklanır', () => {
  let d = lobi(2);
  d = ozelVer(d, 1, [ozelSoru(1), { id: 'bozuk', soru: 'x', secenekler: ['a', 'b'] }]);
  assert.deepEqual(d.oyuncular[0].ozel, []);
  assert.equal(d.oyuncular[1].ozel.length, 1);
  assert.equal(d.oyuncular[1].ozel[0].id, 'ozel-q001');
  d = ozelVer(d, 0, ozelListe(10, 2));
  assert.equal(d.oyuncular[0].ozel.length, 2);
  assert.equal(d.oyuncular[1].ozel.length, 1);
  // Boş liste göndermek listeyi siler
  d = ozelVer(d, 1, []);
  assert.deepEqual(d.oyuncular[1].ozel, []);
});

test('ozelSorular: anahtar, saklanan listeyle gönderilen listeyi eşleştirir', () => {
  const gonderilen = ozelTemizle(ozelListe(1, 3));
  const d = ozelVer(lobi(2), 0, gonderilen);
  assert.equal(ozelAnahtar(d.oyuncular[0].ozel), ozelAnahtar(gonderilen));
  assert.notEqual(ozelAnahtar(d.oyuncular[0].ozel), ozelAnahtar(ozelListe(1, 2)));
  assert.equal(ozelAnahtar([]), ozelAnahtar(undefined));
});

test('ozelSorular: yabancı, lobi dışı ve bozuk istek reddedilir', () => {
  const d = lobi(2);
  hatali(u(d, { tip: 'ozelSorular', id: 'yabanci', sorular: [] }));
  hatali(u(d, { tip: 'ozelSorular', id: pid(0), sorular: 'liste değil' }));
  hatali(u(d, { tip: 'ozelSorular', id: pid(0) }));
  const oyunda = oyunBaslat();
  assert.match(hatali(u(oyunda, { tip: 'ozelSorular', id: pid(0), sorular: [] })), /lobide/);
});

// ---------------------------------------------------------------------------
// Oyunu başlatma ve soru seçimi
// ---------------------------------------------------------------------------

test('başlat: tam 2 kişi gerekir, yalnız ev sahibi başlatır', () => {
  assert.equal(hatali(u(lobi(1), { tip: 'baslat', id: pid(0) })), 'Bu oyun iki kişilik.');
  assert.equal(hatali(u(lobi(3), { tip: 'baslat', id: pid(0) })), 'Bu oyun iki kişilik.');
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  basarili(u(lobi(2), { tip: 'baslat', id: pid(0) }));
});

test('başlat: 10 soru, benzersiz, tam içerikle, cevap aşaması, puanlar sıfır', () => {
  const d = oyunBaslat();
  assert.equal(d.asama, 'cevap');
  assert.equal(d.tur, 0);
  assert.equal(d.sorular.length, 10);
  assert.equal(new Set(d.sorular.map((q) => q.id)).size, 10);
  for (const q of d.sorular) {
    assert.equal(typeof q.soru, 'string');
    assert.ok(q.secenekler.length >= 2 && q.secenekler.length <= 4);
    assert.equal(q.yazar, null);
  }
  assert.deepEqual(
    d.cevaplar,
    d.sorular.map(() => [null, null])
  );
  assert.deepEqual(
    d.oyuncular.map((o) => o.puan),
    [0, 0]
  );
  assert.deepEqual(d.sorulanlar, d.sorular.map((q) => q.id));
});

test('başlat: aynı tohum aynı sorular, başka tohum başka sıra', () => {
  const a = oyunBaslat({}, 5);
  const b = oyunBaslat({}, 5);
  const c = oyunBaslat({}, 6);
  assert.deepEqual(a.sorular, b.sorular);
  assert.notDeepEqual(
    a.sorular.map((q) => q.id),
    c.sorular.map((q) => q.id)
  );
});

test('başlat: soru sayısı ve konu seçimi uygulanır', () => {
  const bes = oyunBaslat({ soruSayisi: 5 });
  assert.equal(bes.sorular.length, 5);
  const yemek = oyunBaslat({ soruSayisi: 5, konular: ['yemek'] });
  assert.ok(yemek.sorular.every((q) => q.kategori === 'yemek'));
  const iki = oyunBaslat({ soruSayisi: 15, konular: ['yemek', 'hayal'] });
  assert.equal(iki.sorular.length, 9);
  assert.ok(iki.sorular.every((q) => q.kategori === 'yemek' || q.kategori === 'hayal'));
});

test('başlat: kendi sorular açıksa önce onlar gelir, yazarı bilinir', () => {
  let d = lobi(2, { soruSayisi: 5 });
  d = ozelVer(d, 0, [ozelSoru(1), ozelSoru(2)]);
  d = ozelVer(d, 1, [ozelSoru(11)]);
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.sorular.length, 5);
  const ilkUc = d.sorular.slice(0, 3);
  assert.ok(ilkUc.every((q) => q.kategori === 'ozel'));
  assert.deepEqual(ilkUc.map((q) => q.id).sort(), ['ozel-q001', 'ozel-q002', 'ozel-q011']);
  for (const q of ilkUc) {
    assert.equal(q.yazar, q.id === 'ozel-q011' ? 1 : 0);
  }
  assert.ok(d.sorular.slice(3).every((q) => q.kategori !== 'ozel' && q.yazar === null));
});

test('başlat: kendi sorular kapalıysa hiç gelmez', () => {
  let d = lobi(2, { ozel: false });
  d = ozelVer(d, 0, ozelListe(1, 5));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.ok(d.sorular.every((q) => q.kategori !== 'ozel'));
});

test('başlat: kendi sorular sayıdan çoksa iki oyuncunun sorusu da gelir', () => {
  let d = lobi(2, { soruSayisi: 5 });
  d = ozelVer(d, 0, ozelListe(1, 20));
  d = ozelVer(d, 1, ozelListe(100, 20));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.sorular.length, 5);
  assert.ok(d.sorular.every((q) => q.kategori === 'ozel'));
  const yazar0 = d.sorular.filter((q) => q.yazar === 0).length;
  const yazar1 = d.sorular.filter((q) => q.yazar === 1).length;
  assert.equal(yazar0 + yazar1, 5);
  assert.ok(yazar0 >= 2 && yazar1 >= 2);
});

test('başlat: tek oyuncunun sorusu varsa o kadar gelir, kalan hazırdan dolar', () => {
  let d = lobi(2, { soruSayisi: 5 });
  d = ozelVer(d, 1, ozelListe(1, 4));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.sorular.filter((q) => q.kategori === 'ozel').length, 4);
  assert.equal(d.sorular.length, 5);
});

test('başlat: kendi sorunun id çakışması tek soruya iner', () => {
  let d = lobi(2, { soruSayisi: 5 });
  d = ozelVer(d, 0, [ozelSoru(1)]);
  d = ozelVer(d, 1, [ozelSoru(1)]);
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.sorular.filter((q) => q.id === 'ozel-q001').length, 1);
});

test('başlat: seçilen konuda soru yoksa ve kendi soru da yoksa hata', () => {
  const d = lobi(2, { konular: ['bos'] });
  assert.match(hatali(u(d, { tip: 'baslat', id: pid(0) })), /soru yok/);
});

test('başlat: konuda soru yok ama kendi soru varsa oyun kurulur', () => {
  let d = lobi(2, { konular: ['bos'] });
  d = ozelVer(d, 0, ozelListe(1, 3));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.sorular.length, 3);
});

test('başlat: havuz soru sayısından küçükse hepsi gelir', () => {
  const d = oyunBaslat({ soruSayisi: 15, konular: ['hayal'] });
  assert.equal(d.sorular.length, 3);
});

test('başlat: seçilen sorular bankadan kopyalanır (banka değişmez)', () => {
  const once = JSON.stringify(BANKA);
  const d = oyunBaslat();
  d.sorular[0].secenekler.push('Değişti');
  assert.equal(JSON.stringify(BANKA), once);
});

// ---------------------------------------------------------------------------
// Sorulanlar ve Tekrar oyna
// ---------------------------------------------------------------------------

test('sorulanlar: Tekrar oyna soruları tekrarlamaz, havuz bitince sıfırlanıp devam eder', () => {
  let d = oyunBaslat({ soruSayisi: 5 }, 1);
  const goruldu = new Set(d.sorular.map((q) => q.id));
  d = hepsiniOyna(d, () => [[0, 0], [0, 0]]);
  assert.equal(d.asama, 'bitti');
  for (let tur = 2; tur <= 3; tur++) {
    d = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, tur));
    assert.equal(d.sorular.length, 5);
    for (const q of d.sorular) {
      assert.equal(goruldu.has(q.id), false, 'soru tekrarlandı: ' + q.id);
      goruldu.add(q.id);
    }
    d = hepsiniOyna(d, () => [[0, 0], [0, 0]]);
  }
  assert.equal(goruldu.size, 15);
  assert.equal(d.sorulanlar.length, 15);
  // 4. oyunda havuz bitmiş olur: sıfırlanır ve yine 5 soru gelir
  d = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, 9));
  assert.equal(d.sorular.length, 5);
  assert.equal(d.sorulanlar.length, 5);
});

test('sorulanlar: havuz kısmen kalmışsa kalanlar önce gelir, eksik sıfırlamadan tamamlanır', () => {
  let d = oyunBaslat({ soruSayisi: 5, konular: ['aliskanlik'] }, 1);
  d = hepsiniOyna(d, () => [[0, 0], [0, 0]]);
  d = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, 2));
  assert.equal(d.sorular.length, 5);
  assert.equal(new Set(d.sorular.map((q) => q.id)).size, 5, 'aynı oyunda tekrar var');
  assert.equal(d.sorulanlar.length, 5);
});

test('sorulanlar: kendi sorular da tekrarlanmaz', () => {
  let d = lobi(2, { soruSayisi: 5 });
  d = ozelVer(d, 0, ozelListe(1, 10));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }, 1));
  const ilk = d.sorular.map((q) => q.id);
  d = hepsiniOyna(d, () => [[0, 0], [0, 0]]);
  d = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, 2));
  for (const q of d.sorular) {
    assert.equal(ilk.includes(q.id), false);
  }
});

test('tekrar oyna: yalnız ev sahibi, yalnız bitince; puanlar sıfırlanır, ayar kalır', () => {
  const oyunda = oyunBaslat({ soruSayisi: 5 });
  assert.match(hatali(u(oyunda, { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  const bitti = hepsiniOyna(oyunda, () => [[0, 0], [0, 0]]);
  assert.ok(bitti.oyuncular[0].puan > 0);
  hatali(u(bitti, { tip: 'tekrarOyna', id: pid(1) }));
  const yeni = basarili(u(bitti, { tip: 'tekrarOyna', id: pid(0) }));
  assert.equal(yeni.asama, 'cevap');
  assert.equal(yeni.tur, 0);
  assert.deepEqual(
    yeni.oyuncular.map((o) => o.puan),
    [0, 0]
  );
  assert.equal(yeni.ayar.soruSayisi, 5);
  assert.deepEqual(yeni.ayar.konular, bitti.ayar.konular);
  assert.deepEqual(
    yeni.cevaplar,
    yeni.sorular.map(() => [null, null])
  );
});

test('lobiye dön: yalnız ev sahibi; sorular ve puan temizlenir, ayar, sorulanlar ve kendi sorular kalır', () => {
  let d = lobi(2, { soruSayisi: 5 });
  d = ozelVer(d, 1, ozelListe(1, 2));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  d = turOyna(d, [0, 0], [0, 0]);
  assert.match(hatali(u(lobi(2), { tip: 'yeniOyun', id: pid(0) })), /lobide/);
  hatali(u(d, { tip: 'yeniOyun', id: pid(1) }));
  const lobiye = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.deepEqual(lobiye.sorular, []);
  assert.deepEqual(lobiye.cevaplar, []);
  assert.deepEqual(
    lobiye.oyuncular.map((o) => o.puan),
    [0, 0]
  );
  assert.equal(lobiye.ayar.soruSayisi, 5);
  assert.equal(lobiye.oyuncular[1].ozel.length, 2);
  assert.equal(lobiye.sorulanlar.length, 5);
  // Lobide yine yeni oyun başlatılabilir
  const yeni = basarili(u(lobiye, { tip: 'baslat', id: pid(0) }, 4));
  assert.equal(yeni.asama, 'cevap');
});

// ---------------------------------------------------------------------------
// Cevap verme
// ---------------------------------------------------------------------------

test('cevapla: lobide, yabancıya, yanlış tura ve geçersiz seçeneğe izin yok', () => {
  hatali(u(lobi(2), { tip: 'cevapla', id: pid(0), kendi: 0, tahmin: 0 }));
  const d = oyunBaslat();
  const secenekSayisi = d.sorular[0].secenekler.length;
  hatali(u(d, { tip: 'cevapla', id: 'yabanci', tur: 0, kendi: 0, tahmin: 0 }));
  assert.match(hatali(u(d, { tip: 'cevapla', id: pid(0), tur: 3, kendi: 0, tahmin: 0 })), /geçti/);
  for (const kotu of [-1, secenekSayisi, 1.5, '1', null, undefined, NaN]) {
    hatali(u(d, { tip: 'cevapla', id: pid(0), tur: 0, kendi: kotu, tahmin: 0 }));
    hatali(u(d, { tip: 'cevapla', id: pid(0), tur: 0, kendi: 0, tahmin: kotu }));
  }
});

test('cevapla: ilk cevap kaydedilir, sonuç açılmaz, puan değişmez', () => {
  const d = basarili(cevapla(oyunBaslat(), 0, 1, 2));
  assert.equal(d.asama, 'cevap');
  assert.deepEqual(d.cevaplar[0][0], { kendi: 1, tahmin: 2 });
  assert.equal(d.cevaplar[0][1], null);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.equal(turSonucu(d, 0), null);
});

test('cevapla: bir kez cevaplanır, değiştirilemez, aynı cevabı tekrar göndermek zararsız', () => {
  const d = basarili(cevapla(oyunBaslat(), 0, 1, 2));
  assert.match(hatali(cevapla(d, 0, 0, 2)), /Zaten/);
  assert.match(hatali(cevapla(d, 0, 1, 0)), /Zaten/);
  const ayni = basarili(cevapla(d, 0, 1, 2));
  assert.deepEqual(ayni, d);
});

test('cevapla: iki cevap gelince sonuç açılır', () => {
  const d = turOyna(oyunBaslat(), [0, 1], [1, 0]);
  assert.equal(d.asama, 'acik');
  assert.equal(d.tur, 0);
  const sonuc = turSonucu(d, 0);
  assert.deepEqual(sonuc.kendi, [0, 1]);
  assert.deepEqual(sonuc.tahmin, [1, 0]);
  assert.deepEqual(sonuc.dogru, [true, true]);
  assert.equal(sonuc.ayni, false);
});

test('puanlama: her doğru tahmin 1 puan, dört olasılık', () => {
  const taban = oyunBaslat();
  // Oyuncu 0 kendi=0 tahmin=1, oyuncu 1 kendi=1 tahmin=0: ikisi de bildi
  let d = turOyna(taban, [0, 1], [1, 0]);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 1]);
  // Yalnız oyuncu 0 bildi
  d = turOyna(taban, [0, 1], [1, 2]);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 0]);
  // Yalnız oyuncu 1 bildi
  d = turOyna(taban, [0, 2], [1, 0]);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 1]);
  // İkisi de bilemedi
  d = turOyna(taban, [0, 2], [1, 2]);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0]);
});

test('puanlama: aynı cevap verildiyse puan yok ama tahminler yine sayılır', () => {
  // İkisi de kendi=1; tahminler de 1 -> ikisi doğru bilmiş (eşin cevabı 1) -> puan var
  let d = turOyna(oyunBaslat(), [1, 1], [1, 1]);
  assert.equal(turSonucu(d, 0).ayni, true);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [1, 1]);
  // Aynı cevap, tahminler yanlış -> puan yok
  d = turOyna(oyunBaslat(), [1, 0], [1, 2]);
  assert.equal(turSonucu(d, 0).ayni, true);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0]);
});

test('eşzamanlılık: ilk cevap sonrası ikinci oyuncunun eski durumdaki hamlesi güncel durumda geçerli kalır', () => {
  const taban = oyunBaslat();
  // İki telefon da aynı tabandan cevap hazırladı. Oyuncu 0 önce yazdı.
  const a = basarili(cevapla(taban, 0, 0, 1));
  // Oyuncu 1'in yeniden denemesi: güncel durum (a) üzerinde aynı hamle
  const b = basarili(cevapla(a, 1, 1, 0));
  assert.equal(b.asama, 'acik');
  assert.deepEqual(b.oyuncular.map((o) => o.puan), [1, 1]);
  // Ters sırada da aynı sonuç
  const a2 = basarili(cevapla(taban, 1, 1, 0));
  const b2 = basarili(cevapla(a2, 0, 0, 1));
  assert.deepEqual(b2, b);
});

test('cevapla: sonuç açıkken ve bittiğinde yeni cevap verilmez', () => {
  const acik = turOyna(oyunBaslat(), [0, 0], [0, 0]);
  assert.match(hatali(cevapla(acik, 0, 0, 0)), /cevap verilmez/);
  const bitti = hepsiniOyna(oyunBaslat({ soruSayisi: 5 }), () => [[0, 0], [0, 0]]);
  hatali(u(bitti, { tip: 'cevapla', id: pid(0), kendi: 0, tahmin: 0 }));
});

// ---------------------------------------------------------------------------
// Sonraki soru ve bitiş
// ---------------------------------------------------------------------------

test('sonraki: yalnız sonuç açıkken ilerler, herhangi biri basabilir', () => {
  const cevapta = oyunBaslat();
  hatali(sonraki(cevapta));
  const acik = turOyna(cevapta, [0, 0], [0, 0]);
  hatali(u(acik, { tip: 'sonraki', id: 'yabanci', tur: 0 }));
  for (const kim of [0, 1]) {
    const d = basarili(sonraki(acik, kim));
    assert.equal(d.asama, 'cevap');
    assert.equal(d.tur, 1);
    assert.deepEqual(d.cevaplar[1], [null, null]);
  }
});

test('sonraki: iki oyuncu aynı anda basarsa ikincisi zararsız', () => {
  const acik = turOyna(oyunBaslat(), [0, 0], [0, 0]);
  const bir = basarili(u(acik, { tip: 'sonraki', id: pid(0), tur: 0 }));
  // Oyuncu 1 eski tur numarasıyla basar: hata yok, durum aynı kalır
  const iki = basarili(u(bir, { tip: 'sonraki', id: pid(1), tur: 0 }));
  assert.deepEqual(iki, bir);
  assert.equal(iki.tur, 1);
});

test('sonraki: tur numarası verilmese de çalışır', () => {
  const acik = turOyna(oyunBaslat(), [0, 0], [0, 0]);
  const d = basarili(u(acik, { tip: 'sonraki', id: pid(0) }));
  assert.equal(d.tur, 1);
});

test('bitiş: son sorudan sonra bitti aşamasına geçer, tur son soruda kalır', () => {
  const bitti = hepsiniOyna(oyunBaslat({ soruSayisi: 5 }), () => [[0, 0], [0, 0]]);
  assert.equal(bitti.asama, 'bitti');
  assert.equal(bitti.tur, 4);
  hatali(sonraki(bitti));
});

test('bitiş: uyum yüzdesi doğru tahmin / (2 x soru sayısı)', () => {
  // Oyuncu 0 hep bilir (tahmin = eşin cevabı = 1), oyuncu 1 hiç bilemez
  const bitti = hepsiniOyna(oyunBaslat({ soruSayisi: 5 }), () => [[0, 1], [1, 2]]);
  assert.deepEqual(bitti.oyuncular.map((o) => o.puan), [5, 0]);
  assert.equal(uyumYuzdesi(bitti), 50);
  // 10 soruda 7 + 6 = 13 doğru -> %65
  let d = oyunBaslat({ soruSayisi: 10 });
  d.oyuncular[0].puan = 7;
  d.oyuncular[1].puan = 6;
  assert.equal(uyumYuzdesi(d), 65);
  d.oyuncular[0].puan = 10;
  d.oyuncular[1].puan = 10;
  assert.equal(uyumYuzdesi(d), 100);
  d.oyuncular[0].puan = 0;
  d.oyuncular[1].puan = 0;
  assert.equal(uyumYuzdesi(d), 0);
});

test('bitiş: uyum etiketi sınırları', () => {
  assert.equal(uyumEtiketi(100), 'Birbirinizi ezbere biliyorsunuz');
  assert.equal(uyumEtiketi(80), 'Birbirinizi ezbere biliyorsunuz');
  assert.equal(uyumEtiketi(79), 'Epey iyi tanıyorsunuz');
  assert.equal(uyumEtiketi(50), 'Epey iyi tanıyorsunuz');
  assert.equal(uyumEtiketi(49), 'Daha konuşacak çok şey var');
  assert.equal(uyumEtiketi(25), 'Daha konuşacak çok şey var');
  assert.equal(uyumEtiketi(24), 'Tanışmaya yeni başlıyorsunuz');
  assert.equal(uyumEtiketi(0), 'Tanışmaya yeni başlıyorsunuz');
});

test('bitiş: "Bunları konuşun" yalnız en az bir tahmin yanlış olan soruları verir', () => {
  const kalip = (tur) => {
    if (tur === 0) {
      return [[0, 1], [1, 0]]; // ikisi de bildi
    }
    if (tur === 1) {
      return [[0, 2], [1, 0]]; // oyuncu 0 bilemedi
    }
    return [[0, 1], [1, 2]]; // oyuncu 1 bilemedi
  };
  const bitti = hepsiniOyna(oyunBaslat({ soruSayisi: 5 }), kalip);
  const liste = konusulacaklar(bitti);
  assert.deepEqual(
    liste.map((x) => x.tur),
    [1, 2, 3, 4]
  );
  assert.deepEqual(liste[0].kendi, [0, 1]);
  assert.deepEqual(liste[0].dogru, [false, true]);
  assert.deepEqual(liste[1].dogru, [true, false]);
  assert.equal(liste[0].soru.id, bitti.sorular[1].id);
});

test('bitiş: hepsini bilen çift için konuşulacak soru kalmaz', () => {
  const bitti = hepsiniOyna(oyunBaslat({ soruSayisi: 5 }), () => [[0, 1], [1, 0]]);
  assert.deepEqual(konusulacaklar(bitti), []);
  assert.equal(uyumYuzdesi(bitti), 100);
});

// ---------------------------------------------------------------------------
// Genel
// ---------------------------------------------------------------------------

test('bilinmeyen hareket nazikçe reddedilir', () => {
  assert.match(hatali(u(lobi(2), { tip: 'uc-kagit' })), /Bilinmeyen/);
  hatali(u(lobi(2), null));
  hatali(u(lobi(2), {}));
});

test('girdi durumu hiçbir hareketle değişmez (dondurulmuş durumla tam oyun)', () => {
  let d = dondur(lobi(2, { soruSayisi: 5 }));
  d = dondur(ozelVer(d, 0, ozelListe(1, 2)));
  d = dondur(basarili(u(d, { tip: 'baslat', id: pid(0) })));
  while (d.asama !== 'bitti') {
    d = dondur(basarili(cevapla(d, 0, 0, 1)));
    d = dondur(basarili(cevapla(d, 1, 1, 0)));
    d = dondur(basarili(sonraki(d)));
  }
  d = dondur(basarili(u(d, { tip: 'tekrarOyna', id: pid(0) })));
  d = dondur(basarili(u(d, { tip: 'yeniOyun', id: pid(0) })));
  assert.equal(d.asama, 'lobi');
});

test('rastgele oyunlar: puan toplamı doğru tahmin sayısına eşit, oyun hep biter', () => {
  const r = rng(77);
  const rastgeleSayi = (n) => Math.floor(r() * n);
  for (let oyun = 0; oyun < 100; oyun++) {
    let d = lobi(2, { soruSayisi: [5, 10, 15][oyun % 3] });
    d = ozelVer(d, oyun % 2, ozelListe(1, oyun % 7));
    d = basarili(u(d, { tip: 'baslat', id: pid(0) }, oyun + 1));
    let dogru = 0;
    while (d.asama === 'cevap') {
      const n = d.sorular[d.tur].secenekler.length;
      const sirayla = r() < 0.5 ? [0, 1] : [1, 0];
      for (const kim of sirayla) {
        d = basarili(cevapla(d, kim, rastgeleSayi(n), rastgeleSayi(n)));
      }
      assert.equal(d.asama, 'acik');
      const sonuc = turSonucu(d, d.tur);
      dogru += sonuc.dogru.filter(Boolean).length;
      d = basarili(sonraki(d, rastgeleSayi(2)));
    }
    assert.equal(d.asama, 'bitti');
    assert.equal(d.oyuncular[0].puan + d.oyuncular[1].puan, dogru);
    const yuzde = uyumYuzdesi(d);
    assert.ok(yuzde >= 0 && yuzde <= 100);
  }
});

test('gerçek soru bankası: biçim doğru, varsayılan bankayla oyun kurulur', () => {
  const { kategoriler, sorular } = VARSAYILAN_BANKA;
  const kategoriIdleri = kategoriler.map((k) => k.id);
  assert.equal(new Set(kategoriIdleri).size, kategoriler.length);
  assert.equal(new Set(sorular.map((q) => q.id)).size, sorular.length, 'soru id tekrarı var');
  for (const q of sorular) {
    assert.ok(kategoriIdleri.includes(q.kategori), q.id + ': bilinmeyen kategori');
    assert.equal(typeof q.soru, 'string');
    assert.ok(q.soru.length > 0);
    assert.ok(q.secenekler.length >= 2 && q.secenekler.length <= 4, q.id + ': seçenek sayısı');
    assert.equal(new Set(q.secenekler).size, q.secenekler.length, q.id + ': aynı seçenek');
    assert.equal(q.id.startsWith('ozel-'), false);
  }
  let d = yeniOda('a', 'Ali');
  d = basarili(uygula(d, { tip: 'katil', id: 'b', ad: 'Ece' }));
  d = basarili(uygula(d, { tip: 'baslat', id: 'a' }, rng(2)));
  assert.equal(d.sorular.length, 10);
  assert.equal(d.asama, 'cevap');
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

test('yönlendirici: oyun listesi ve yeni oda varsayılanı UNO', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol']
  );
  assert.equal(yonlendirYeniOda('a', 'Ali').oyun, 'uno');
  assert.equal(yonlendirYeniOda('a', 'Ali', 'tanis').oyun, 'tanis');
});

test('yönlendirici: eski UNO odaları (oyun: uno ya da alan yok) çalışmaya devam eder', () => {
  const eski = unoYeniOda('a', 'Ali');
  assert.equal(eski.oyun, 'uno');
  const alansiz = structuredClone(eski);
  delete alansiz.oyun;
  for (const oda of [eski, alansiz]) {
    assert.equal(oyunId(oda), 'uno');
    let d = basarili(yonlendir(oda, { tip: 'katil', id: 'b', ad: 'Ece' }));
    assert.equal(d.oyuncular.length, 2);
    d = basarili(yonlendir(d, { tip: 'baslat', id: 'a' }, () => 0.5));
    assert.equal(d.asama, 'oyun');
    assert.equal(d.oyuncular[0].el.length, 7);
    // Aynı sonucu doğrudan uno motoru da verir
    const dogrudan = unoUygula(unoUygula(oda, { tip: 'katil', id: 'b', ad: 'Ece' }).durum, { tip: 'baslat', id: 'a' }, () => 0.5);
    assert.deepEqual(d, dogrudan.durum);
  }
});

test('yönlendirici: tanis odasındaki hareketler tanis motoruna gider, UNO hareketleri reddedilir', () => {
  let d = yonlendirLobi('tanis', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: 5 } }));
  assert.equal(d.ayar.soruSayisi, 5);
  assert.match(hatali(yonlendir(d, { tip: 'oyna', id: pid(0), kart: 1 })), /Bilinmeyen/);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1)));
  assert.equal(d.asama, 'cevap');
  assert.equal(d.sorular.length, 5);
});

test('yönlendirici: bilinmeyen oyun adı olan oda reddedilir', () => {
  const d = Object.assign(unoYeniOda('a', 'Ali'), { oyun: 'satranc' });
  assert.match(hatali(yonlendir(d, { tip: 'baslat', id: 'a' })), /Bilinmeyen oyun/);
});

test('oyun seçimi: UNO -> tanis aynı oyuncuları, sırayı ve ev sahibini korur', () => {
  let d = yonlendirLobi('uno', 3);
  // Ev sahibi ilk koltukta olmayabilir: ilk oyuncu çıkınca sahip devredilir
  d = basarili(yonlendir(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  const once = structuredClone(d);
  const yeni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'tanis' }));
  assert.deepEqual(d, once, 'girdi değişti');
  assert.equal(yeni.oyun, 'tanis');
  assert.equal(yeni.asama, 'lobi');
  assert.deepEqual(kimlikler(yeni), kimlikler(d));
  assert.equal(yeni.sahip, pid(1));
  assert.equal(yeni.ayar.soruSayisi, 10);
  assert.deepEqual(yeni.sorular, []);
  assert.ok(yeni.oyuncular.every((o) => o.puan === 0 && Array.isArray(o.ozel)));
});

test('oyun seçimi: tanis -> UNO oyuncuları korur, kendi sorular gider, ayarlar varsayılan', () => {
  let d = yonlendirLobi('tanis', 4);
  d = ozelVer(d, 1, ozelListe(1, 2));
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: 15 } }));
  const yeni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  assert.equal(yeni.oyun, 'uno');
  assert.equal(yeni.asama, 'lobi');
  assert.deepEqual(kimlikler(yeni), kimlikler(d));
  assert.equal(yeni.sahip, pid(0));
  assert.equal(yeni.ayar.hedef, 500);
  assert.equal(yeni.ayar.istif, false);
  // Yeni UNO lobisi çalışır
  const oyun = basarili(yonlendir(yeni, { tip: 'baslat', id: pid(0) }, rng(3)));
  assert.equal(oyun.asama, 'oyun');
  assert.equal(oyun.oyuncular.length, 4);
});

test('oyun seçimi: gidip gelince de oyuncular ve ev sahibi aynı kalır', () => {
  const d = yonlendirLobi('uno', 2);
  const tanisa = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'tanis' }));
  const geri = basarili(yonlendir(tanisa, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  assert.deepEqual(geri, d);
});

test('oyun seçimi: yalnız ev sahibi seçer', () => {
  const d = yonlendirLobi('uno', 2);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'tanis' })), /ev sahibi/);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: 'yabanci', oyun: 'tanis' })), /ev sahibi/);
});

test('oyun seçimi: bilinmeyen oyun reddedilir, aynı oyunu seçmek bir şey değiştirmez', () => {
  const d = yonlendirLobi('uno', 2);
  hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'satranc' }));
  hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0) }));
  const ayni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  assert.deepEqual(ayni, d);
});

test('oyun seçimi: UNO oyunu sürerken reddedilir', () => {
  let d = yonlendirLobi('uno', 2);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1)));
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'tanis' })), /lobide/);
});

test('oyun seçimi: tanis oyununun hiçbir aşamasında (cevap, açık, bitti) yapılamaz', () => {
  let d = yonlendirLobi('tanis', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { soruSayisi: 5 } }));
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1)));
  assert.equal(d.asama, 'cevap');
  hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  d = turOyna(d, [0, 0], [0, 0]);
  assert.equal(d.asama, 'acik');
  hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  d = hepsiniOyna(basarili(sonraki(d)), () => [[0, 0], [0, 0]]);
  assert.equal(d.asama, 'bitti');
  hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
});

test('oyun seçimi: bitmiş oyundan Lobiye dön ile lobiye inip oyun değiştirilebilir', () => {
  let d = yonlendirLobi('tanis', 2);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1)));
  d = basarili(yonlendir(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(d.asama, 'lobi');
  const uno = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  assert.equal(uno.oyun, 'uno');
  assert.deepEqual(kimlikler(uno), kimlikler(d));
});

// ---------------------------------------------------------------------------
// Çalıştır
// ---------------------------------------------------------------------------

let gecen = 0;
let kalan = 0;

for (const t of testler) {
  try {
    t.fonksiyon();
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

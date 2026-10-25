// UNO motoru testleri. Çalıştır: node test/uno-test.js
import assert from 'node:assert/strict';
import {
  RENKLER,
  desteKur,
  karistir,
  kartPuani,
  kartSirala,
  oynanabilir,
  atilabilirlik,
  uygula,
  yeniOda,
} from '../uno.js';

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

let kartSayaci = 1000;

// Test için benzersiz id'li kart üretir
function k(renk, tip, sayi = null) {
  kartSayaci += 1;
  return { id: kartSayaci, renk: renk, tip: tip, sayi: sayi };
}

// Boşluk doldurma: desteye konacak, kimseyi şaşırtmayan kartlar
function dolgu(adet) {
  const liste = [];
  for (let i = 0; i < adet; i++) {
    liste.push(k('kirmizi', 'sayi', 1));
  }
  return liste;
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

function pid(i) {
  return 'p' + i;
}

// Lobi kurar (n oyuncu)
function lobi(n, ayar = {}) {
  let d = yeniOda(pid(0), 'Ali');
  for (let i = 1; i < n; i++) {
    d = basarili(uygula(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  d.ayar = Object.assign({}, d.ayar, ayar);
  return d;
}

// Elle kurulmuş bir oyun durumu. Eller, üstteki kart, renk, sıra vs. verilir.
function kur(secenek) {
  const n = secenek.eller.length;
  let d = lobi(n, secenek.ayar || {});
  d = basarili(uygula(d, { tip: 'baslat', id: pid(0) }, rng(1)));
  d.oyuncular.forEach((o, i) => {
    o.el = secenek.eller[i];
    o.uno = false;
    o.puan = (secenek.puanlar && secenek.puanlar[i]) || 0;
  });
  d.atik = (secenek.atikAlt || []).concat([secenek.ust]);
  d.renk = secenek.renk !== undefined ? secenek.renk : secenek.ust.renk;
  d.sira = secenek.sira || 0;
  d.yon = secenek.yon || 1;
  d.dagitici = 0;
  d.deste = secenek.deste !== undefined ? secenek.deste : dolgu(40);
  d.renkBekle = false;
  d.cektiMi = false;
  d.cekilenKart = null;
  d.bekleyen = secenek.bekleyen || 0;
  d.itiraz = null;
  d.yakala = null;
  d.asama = 'oyun';
  return d;
}

function oyna(d, kim, kart, renk) {
  return uygula(d, { tip: 'oyna', id: pid(kim), kart: kart.id, renk: renk });
}

function hareket(d, tip, kim) {
  return uygula(d, { tip: tip, id: pid(kim) });
}

// Tüm kartlar (eller + deste + atık)
function tumKartlar(d) {
  let hepsi = d.deste.concat(d.atik);
  d.oyuncular.forEach((o) => {
    hepsi = hepsi.concat(o.el);
  });
  return hepsi;
}

function elSayisi(d, i) {
  return d.oyuncular[i].el.length;
}

// Tohumlu karıştırmada açılış kartı ne olacak? (n kişilik oyun için)
function acilisTahmin(n, tohum) {
  const deste = karistir(desteKur(), rng(tohum));
  return deste[deste.length - 1 - n * 7];
}

function tohumBul(n, kosul) {
  for (let t = 1; t < 20000; t++) {
    if (kosul(acilisTahmin(n, t))) {
      return t;
    }
  }
  throw new Error('Uygun tohum bulunamadı');
}

function oyunBaslat(n, tohum, ayar = {}) {
  const d = lobi(n, ayar);
  return basarili(uygula(d, { tip: 'baslat', id: pid(0) }, rng(tohum)));
}

// ---------------------------------------------------------------------------
// Deste
// ---------------------------------------------------------------------------

test('deste: 108 kart, benzersiz id, doğru dağılım', () => {
  const deste = desteKur();
  assert.equal(deste.length, 108);
  assert.equal(new Set(deste.map((c) => c.id)).size, 108);
  for (const renk of RENKLER) {
    const renkli = deste.filter((c) => c.renk === renk);
    assert.equal(renkli.length, 25);
    assert.equal(renkli.filter((c) => c.tip === 'sayi' && c.sayi === 0).length, 1);
    for (let s = 1; s <= 9; s++) {
      assert.equal(renkli.filter((c) => c.tip === 'sayi' && c.sayi === s).length, 2);
    }
    assert.equal(renkli.filter((c) => c.tip === 'atla').length, 2);
    assert.equal(renkli.filter((c) => c.tip === 'ters').length, 2);
    assert.equal(renkli.filter((c) => c.tip === 'cek2').length, 2);
  }
  assert.equal(deste.filter((c) => c.tip === 'joker').length, 4);
  assert.equal(deste.filter((c) => c.tip === 'cek4').length, 4);
});

test('karıştırma: aynı tohum aynı sonuç, girdiyi değiştirmez, kart kaybetmez', () => {
  const deste = desteKur();
  const kopya = JSON.stringify(deste);
  const a = karistir(deste, rng(5));
  const b = karistir(deste, rng(5));
  const c = karistir(deste, rng(6));
  assert.equal(JSON.stringify(deste), kopya);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual(a.map((x) => x.id).sort((x, y) => x - y), deste.map((x) => x.id));
});

test('puan değerleri: sayı kendisi, Atla/Ters/+2 20, Joker/+4 50', () => {
  assert.equal(kartPuani(k('mavi', 'sayi', 7)), 7);
  assert.equal(kartPuani(k('mavi', 'sayi', 0)), 0);
  assert.equal(kartPuani(k('mavi', 'atla')), 20);
  assert.equal(kartPuani(k('mavi', 'ters')), 20);
  assert.equal(kartPuani(k('mavi', 'cek2')), 20);
  assert.equal(kartPuani(k(null, 'joker')), 50);
  assert.equal(kartPuani(k(null, 'cek4')), 50);
});

test('kart sıralama: önce renk, sonra değer, jokerler sonda', () => {
  const liste = [k(null, 'joker'), k('mavi', 'sayi', 3), k('kirmizi', 'cek2'), k('kirmizi', 'sayi', 9), k('kirmizi', 'sayi', 2)];
  liste.sort(kartSirala);
  assert.deepEqual(liste.map((c) => c.tip + (c.sayi ?? '')), ['sayi2', 'sayi9', 'cek2', 'sayi3', 'joker']);
});

// ---------------------------------------------------------------------------
// Oda ve başlangıç
// ---------------------------------------------------------------------------

test('lobi: en fazla 4 kişi, 5. kişi kibarca reddedilir', () => {
  const d = lobi(4);
  const mesaj = hatali(uygula(d, { tip: 'katil', id: 'p9', ad: 'Fazla' }));
  assert.match(mesaj, /dolu/);
});

test('lobi: aynı kişi iki kez katılırsa tek koltuk, aynı isim ayrılır', () => {
  let d = lobi(2);
  d = basarili(uygula(d, { tip: 'katil', id: pid(1), ad: 'Başka' }));
  assert.equal(d.oyuncular.length, 2);
  d = basarili(uygula(d, { tip: 'katil', id: 'yeni', ad: 'ali' }));
  assert.equal(d.oyuncular.length, 3);
  assert.notEqual(d.oyuncular[2].ad.toLocaleLowerCase('tr'), 'ali');
});

test('lobi: ad temizlenir ve kısaltılır, boşsa varsayılan', () => {
  let d = yeniOda('a', '   ');
  assert.equal(d.oyuncular[0].ad, 'Oyuncu');
  d = yeniOda('a', 'Çok Uzun Bir İsim Yazıldı');
  assert.ok(d.oyuncular[0].ad.length <= 12);
});

test('lobi: oyun başladıktan sonra yeni gelen katılamaz, eski oyuncu içeri girer', () => {
  const d = oyunBaslat(2, 1);
  const mesaj = hatali(uygula(d, { tip: 'katil', id: 'gec', ad: 'Geç' }));
  assert.match(mesaj, /başladı/);
  basarili(uygula(d, { tip: 'katil', id: pid(1), ad: 'Oyuncu1' }));
});

test('lobi: ayarı sadece ev sahibi değiştirir, geçersiz hedef reddedilir', () => {
  const d = lobi(2);
  hatali(uygula(d, { tip: 'ayarla', id: pid(1), ayar: { istif: true } }));
  const d2 = basarili(uygula(d, { tip: 'ayarla', id: pid(0), ayar: { istif: true, hedef: 200 } }));
  assert.equal(d2.ayar.istif, true);
  assert.equal(d2.ayar.hedef, 200);
  const d3 = basarili(uygula(d2, { tip: 'ayarla', id: pid(0), ayar: { hedef: 0 } }));
  assert.equal(d3.ayar.hedef, 0);
  hatali(uygula(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 123 } }));
});

test('lobi: ayarlar varsayılan olarak +2 yığma kapalı, hedef 500', () => {
  const d = yeniOda('a', 'Ali');
  assert.equal(d.ayar.istif, false);
  assert.equal(d.ayar.hedef, 500);
});

test('lobi: çıkma, ev sahibi çıkarma, ev sahibi devri', () => {
  let d = lobi(3);
  hatali(uygula(d, { tip: 'cikar', id: pid(1), hedef: pid(2) }));
  d = basarili(uygula(d, { tip: 'cikar', id: pid(0), hedef: pid(2) }));
  assert.equal(d.oyuncular.length, 2);
  d = basarili(uygula(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  assert.equal(d.oyuncular.length, 1);
});

test('başlat: sadece ev sahibi, en az 2 kişi', () => {
  const tek = yeniOda(pid(0), 'Ali');
  hatali(uygula(tek, { tip: 'baslat', id: pid(0) }));
  const d = lobi(2);
  hatali(uygula(d, { tip: 'baslat', id: pid(1) }));
  basarili(uygula(d, { tip: 'baslat', id: pid(0) }));
});

test('dağıtım: herkese 7 kart, toplam 108, başlayan dağıtıcıdan sonraki', () => {
  for (const n of [2, 3, 4]) {
    const d = oyunBaslat(n, 11);
    const acilis = d.atik[0];
    const ozel = acilis.tip === 'cek2' || acilis.tip === 'atla' || acilis.tip === 'ters';
    assert.equal(d.asama, 'oyun');
    assert.equal(tumKartlar(d).length, 108);
    assert.equal(new Set(tumKartlar(d).map((c) => c.id)).size, 108);
    d.oyuncular.forEach((o, i) => {
      if (!(acilis.tip === 'cek2' && i === 1)) {
        assert.equal(o.el.length, 7);
      }
    });
    if (!ozel && acilis.tip !== 'joker') {
      assert.equal(d.sira, 1);
    }
  }
});

test('açılış kartı Joker +4 ise geri konur ve tekrar çevrilir', () => {
  const tohum = tohumBul(2, (c) => c.tip === 'cek4');
  const d = oyunBaslat(2, tohum);
  assert.notEqual(d.atik[0].tip, 'cek4');
  assert.equal(d.atik.length, 1);
  assert.equal(tumKartlar(d).length, 108);
  assert.equal(d.oyuncular[0].el.length, 7);
  assert.equal(d.oyuncular[1].el.length, 7);
});

test('açılış kartı hiçbir zaman Joker +4 olmaz (çok sayıda tohum)', () => {
  for (let t = 1; t <= 300; t++) {
    const d = oyunBaslat(3, t);
    assert.notEqual(d.atik[0].tip, 'cek4');
  }
});

test('açılış kartı sayı: sıradaki dağıtıcıdan sonraki, renk kartın rengi', () => {
  const tohum = tohumBul(3, (c) => c.tip === 'sayi');
  const d = oyunBaslat(3, tohum);
  assert.equal(d.sira, 1);
  assert.equal(d.yon, 1);
  assert.equal(d.renk, d.atik[0].renk);
  assert.equal(d.renkBekle, false);
});

test('açılış kartı Joker: ilk oyuncu rengi seçer, sonra oynar', () => {
  const tohum = tohumBul(2, (c) => c.tip === 'joker');
  let d = oyunBaslat(2, tohum);
  assert.equal(d.renkBekle, true);
  assert.equal(d.renk, null);
  assert.equal(d.sira, 1);
  // renk seçilmeden hamle olmaz
  hatali(hareket(d, 'cek', 1));
  hatali(uygula(d, { tip: 'oyna', id: pid(1), kart: d.oyuncular[1].el[0].id, renk: 'mavi' }));
  // yanlış kişi seçemez
  hatali(uygula(d, { tip: 'renkSec', id: pid(0), renk: 'mavi' }));
  // geçersiz renk
  hatali(uygula(d, { tip: 'renkSec', id: pid(1), renk: 'mor' }));
  d = basarili(uygula(d, { tip: 'renkSec', id: pid(1), renk: 'yesil' }));
  assert.equal(d.renk, 'yesil');
  assert.equal(d.renkBekle, false);
  assert.equal(d.sira, 1);
  basarili(hareket(d, 'cek', 1));
});

test('açılış kartı +2: ilk oyuncu 2 kart çeker ve sırasını kaybeder', () => {
  const tohum = tohumBul(3, (c) => c.tip === 'cek2');
  const d = oyunBaslat(3, tohum);
  assert.equal(d.oyuncular[1].el.length, 9);
  assert.equal(d.sira, 2);
  assert.equal(d.renk, d.atik[0].renk);
  assert.equal(tumKartlar(d).length, 108);
});

test('açılış kartı Atla: ilk oyuncu atlanır', () => {
  const tohum = tohumBul(3, (c) => c.tip === 'atla');
  const d = oyunBaslat(3, tohum);
  assert.equal(d.sira, 2);
  assert.equal(d.oyuncular[1].el.length, 7);
  // iki kişide: ilk oyuncu atlanır, dağıtıcı başlar
  const tohum2 = tohumBul(2, (c) => c.tip === 'atla');
  const d2 = oyunBaslat(2, tohum2);
  assert.equal(d2.sira, 0);
});

test('açılış kartı Ters: yön döner ve dağıtıcı başlar (2 kişide de)', () => {
  const tohum = tohumBul(3, (c) => c.tip === 'ters');
  const d = oyunBaslat(3, tohum);
  assert.equal(d.yon, -1);
  assert.equal(d.sira, 0);
  const tohum2 = tohumBul(2, (c) => c.tip === 'ters');
  const d2 = oyunBaslat(2, tohum2);
  assert.equal(d2.yon, -1);
  assert.equal(d2.sira, 0);
});

// ---------------------------------------------------------------------------
// Hangi kart atılabilir
// ---------------------------------------------------------------------------

test('atılabilir: renk, sayı ve simge eşleşmesi', () => {
  const d = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'sayi', 5) });
  const el = [];
  assert.equal(oynanabilir(d, k('mavi', 'sayi', 9), el), true);
  assert.equal(oynanabilir(d, k('kirmizi', 'sayi', 5), el), true);
  assert.equal(oynanabilir(d, k('kirmizi', 'sayi', 6), el), false);
  assert.equal(oynanabilir(d, k('kirmizi', 'atla'), el), false);
  assert.equal(oynanabilir(d, k(null, 'joker'), el), true);

  const d2 = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'atla') });
  assert.equal(oynanabilir(d2, k('kirmizi', 'atla'), el), true);
  assert.equal(oynanabilir(d2, k('kirmizi', 'ters'), el), false);
  const d3 = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'ters') });
  assert.equal(oynanabilir(d3, k('sari', 'ters'), el), true);
  const d4 = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'cek2') });
  assert.equal(oynanabilir(d4, k('yesil', 'cek2'), el), true);
  assert.equal(oynanabilir(d4, k('yesil', 'atla'), el), false);
});

test('atılabilir: Joker sonrası sadece seçilen renk geçerli', () => {
  const d = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k(null, 'joker'), renk: 'yesil' });
  assert.equal(oynanabilir(d, k('yesil', 'sayi', 3), []), true);
  assert.equal(oynanabilir(d, k('mavi', 'sayi', 3), []), false);
  assert.equal(oynanabilir(d, k('yesil', 'cek2'), []), true);
});

test('Joker +4: elde geçerli renk varsa atılamaz (katı kural)', () => {
  const d = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'sayi', 5) });
  const cek4 = k(null, 'cek4');
  assert.equal(oynanabilir(d, cek4, [k('mavi', 'sayi', 3)]), false);
  assert.equal(oynanabilir(d, cek4, [k('mavi', 'atla')]), false);
});

test('Joker +4: sayısı/simgesi uyan başka renk kart ya da başka Joker engel olmaz', () => {
  const d = kur({ eller: [[k('mavi', 'sayi', 1)], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'sayi', 5) });
  const cek4 = k(null, 'cek4');
  assert.equal(oynanabilir(d, cek4, [k('kirmizi', 'sayi', 5)]), true);
  assert.equal(oynanabilir(d, cek4, [k(null, 'joker'), k(null, 'cek4')]), true);
  assert.equal(oynanabilir(d, cek4, [k('kirmizi', 'sayi', 2), k('sari', 'atla')]), true);
});

test('atilabilirlik: evet / blof / hayir', () => {
  const cek4 = k(null, 'cek4');
  const mavi3 = k('mavi', 'sayi', 3);
  const kir7 = k('kirmizi', 'sayi', 7);
  const d = kur({ eller: [[cek4, mavi3, kir7], [k('mavi', 'sayi', 1)]], ust: k('mavi', 'sayi', 5) });
  assert.equal(atilabilirlik(d, pid(0), mavi3), 'evet');
  assert.equal(atilabilirlik(d, pid(0), kir7), 'hayir');
  assert.equal(atilabilirlik(d, pid(0), cek4), 'blof');
  // sıra onda değilse hiçbiri
  assert.equal(atilabilirlik(d, pid(1), d.oyuncular[1].el[0]), 'hayir');
});

// ---------------------------------------------------------------------------
// Sıra ve doğrulama
// ---------------------------------------------------------------------------

test('doğrulama: sıra yanlış kişideyse oyna/çek/pas reddedilir', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({ eller: [[a, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  hatali(oyna(d, 1, d.oyuncular[1].el[0]));
  hatali(hareket(d, 'cek', 1));
  hatali(hareket(d, 'pas', 1));
});

test('doğrulama: elde olmayan kart, atılamayan kart, rengi seçilmeyen Joker', () => {
  const kir = k('kirmizi', 'sayi', 9);
  const joker = k(null, 'joker');
  const d = kur({ eller: [[kir, joker, k('mavi', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  hatali(uygula(d, { tip: 'oyna', id: pid(0), kart: 99999 }));
  hatali(oyna(d, 0, kir));
  hatali(oyna(d, 0, joker));
  hatali(oyna(d, 0, joker, 'mor'));
  basarili(oyna(d, 0, joker, 'sari'));
});

test('doğrulama: bilinmeyen hareket ve lobide oyna', () => {
  const d = lobi(2);
  hatali(uygula(d, { tip: 'uc' }));
  hatali(uygula(d, { tip: 'oyna', id: pid(0), kart: 1 }));
  hatali(uygula(d, { tip: 'cek', id: pid(0) }));
});

test('girdi durumu hiçbir zaman değiştirilmez (başarılı ve hatalı hareketler)', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({ eller: [[a, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  const once = JSON.stringify(d);
  basarili(oyna(d, 0, a));
  hatali(oyna(d, 1, d.oyuncular[1].el[0]));
  basarili(hareket(d, 'cek', 0));
  assert.equal(JSON.stringify(d), once);
});

// ---------------------------------------------------------------------------
// Normal oyun akışı
// ---------------------------------------------------------------------------

test('sayı kartı: atığın üstüne gider, renk değişir, sıra geçer', () => {
  const a = k('kirmizi', 'sayi', 5);
  const d = kur({ eller: [[a, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  const d2 = basarili(oyna(d, 0, a));
  assert.equal(d2.atik[d2.atik.length - 1].id, a.id);
  assert.equal(d2.renk, 'kirmizi');
  assert.equal(d2.sira, 1);
  assert.equal(elSayisi(d2, 0), 1);
});

test('çekme: bir kart çeker, oynayabilirse sadece onu atabilir, yoksa pas', () => {
  const eli1 = k('sari', 'sayi', 2);
  const eli2 = k('sari', 'sayi', 3);
  const cekilecek = k('mavi', 'sayi', 9);
  const d = kur({
    eller: [[eli1, eli2], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
    deste: dolgu(5).concat([cekilecek]),
  });
  // pas için önce çekmek gerekir
  hatali(hareket(d, 'pas', 0));
  const d2 = basarili(hareket(d, 'cek', 0));
  assert.equal(elSayisi(d2, 0), 3);
  assert.equal(d2.cektiMi, true);
  assert.equal(d2.cekilenKart, cekilecek.id);
  assert.equal(d2.sira, 0);
  // iki kez çekemez
  hatali(hareket(d2, 'cek', 0));
  // başka kart atamaz (uysa bile)
  hatali(oyna(d2, 0, eli1));
  // çekilen kartı atabilir
  const d3 = basarili(oyna(d2, 0, cekilecek));
  assert.equal(d3.sira, 1);
  assert.equal(d3.cektiMi, false);
  // ya da pas geçer
  const d4 = basarili(hareket(d2, 'pas', 0));
  assert.equal(d4.sira, 1);
  assert.equal(d4.cektiMi, false);
  assert.equal(elSayisi(d4, 0), 3);
});

test('çekme: atabilecek kartı olsa bile çekebilir', () => {
  const atilabilir = k('mavi', 'sayi', 2);
  const d = kur({ eller: [[atilabilir, k('sari', 'sayi', 1)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  basarili(hareket(d, 'cek', 0));
});

test('çekilen kart atılamıyorsa o kart atılamaz, pas geçilir', () => {
  const cekilecek = k('yesil', 'sayi', 9);
  const d = kur({
    eller: [[k('sari', 'sayi', 2), k('sari', 'sayi', 4)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
    deste: dolgu(3).concat([cekilecek]),
  });
  const d2 = basarili(hareket(d, 'cek', 0));
  hatali(oyna(d2, 0, cekilecek));
  basarili(hareket(d2, 'pas', 0));
});

test('Atla: sıradaki atlanır (3 kişi)', () => {
  const atla = k('mavi', 'atla');
  const d = kur({
    eller: [[atla, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, atla));
  assert.equal(d2.sira, 2);
});

test('Atla: iki kişide sıra yine oynayanda', () => {
  const atla = k('mavi', 'atla');
  const d = kur({ eller: [[atla, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  const d2 = basarili(oyna(d, 0, atla));
  assert.equal(d2.sira, 0);
});

test('Ters: 3 kişide yön döner ve sıra geriye gider', () => {
  const ters = k('mavi', 'ters');
  const d = kur({
    eller: [[k('sari', 'sayi', 2)], [ters, k('sari', 'sayi', 3)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
    sira: 1,
  });
  const d2 = basarili(oyna(d, 1, ters));
  assert.equal(d2.yon, -1);
  assert.equal(d2.sira, 0);
  // yön döndükten sonra 0'dan sonra 2 gelir
  const d3 = kur({
    eller: [[k('mavi', 'sayi', 2), k('sari', 'sayi', 4)], [k('sari', 'sayi', 3)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
    yon: -1,
    sira: 0,
  });
  const d4 = basarili(oyna(d3, 0, d3.oyuncular[0].el[0]));
  assert.equal(d4.sira, 2);
});

test('Ters: iki kişide Atla gibi çalışır', () => {
  const ters = k('mavi', 'ters');
  const d = kur({ eller: [[ters, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  const d2 = basarili(oyna(d, 0, ters));
  assert.equal(d2.sira, 0);
});

test('+2 (yığma kapalı): sıradaki 2 kart çeker ve sırayı kaybeder', () => {
  const cek2 = k('mavi', 'cek2');
  const d = kur({
    eller: [[cek2, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek2));
  assert.equal(elSayisi(d2, 1), 3);
  assert.equal(d2.sira, 2);
  assert.equal(d2.bekleyen, 0);
});

test('+2 (yığma kapalı): +2 üstüne +2 cezayı biriktirmez', () => {
  const cek2 = k('mavi', 'cek2');
  const cek2b = k('sari', 'cek2');
  const d = kur({
    eller: [[cek2, k('sari', 'sayi', 2)], [cek2b, k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek2));
  // p1 zaten 2 kart çekti ve sırasını kaybetti, sıra p0'da
  assert.equal(d2.sira, 0);
  assert.equal(elSayisi(d2, 1), 4);
});

test('Joker: renk seçilir, sıra geçer', () => {
  const joker = k(null, 'joker');
  const d = kur({ eller: [[joker, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]], ust: k('mavi', 'sayi', 5) });
  const d2 = basarili(oyna(d, 0, joker, 'yesil'));
  assert.equal(d2.renk, 'yesil');
  assert.equal(d2.sira, 1);
  assert.equal(d2.atik[d2.atik.length - 1].tip, 'joker');
});

// ---------------------------------------------------------------------------
// Joker +4 ve itiraz
// ---------------------------------------------------------------------------

test('+4 kurala uygun: itiraz bekler, kayıt yasadisi=false', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('kirmizi', 'sayi', 2)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  assert.equal(d2.renk, 'yesil');
  assert.equal(d2.sira, 1);
  assert.deepEqual(d2.itiraz, { hedef: 1, kuran: 0, eskiRenk: 'mavi', yasadisi: false });
  assert.equal(elSayisi(d2, 1), 1);
});

test('+4 blöf: elde eski renk varken atılabilir, yasadisi=true kaydedilir', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('mavi', 'sayi', 2)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  assert.equal(d2.itiraz.yasadisi, true);
  assert.equal(d2.itiraz.eskiRenk, 'mavi');
});

test('+4: bekleyen karar varken hedef başka hareket yapamaz, başkası itiraz edemez', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('kirmizi', 'sayi', 2)], [k('yesil', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  hatali(oyna(d2, 1, d2.oyuncular[1].el[0]));
  hatali(hareket(d2, 'cek', 1));
  hatali(hareket(d2, 'pas', 1));
  hatali(hareket(d2, 'itiraz', 2));
  hatali(hareket(d2, 'kabul', 2));
  hatali(hareket(d2, 'itiraz', 0));
  // itiraz yoksa itiraz/kabul reddedilir
  hatali(hareket(d, 'itiraz', 1));
  hatali(hareket(d, 'kabul', 1));
});

test('itiraz haklı (+4 kurala aykırı): atan 4 çeker, itiraz eden çekmez ve yeni renkle oynar', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('mavi', 'sayi', 2), k('sari', 'sayi', 1)], [k('yesil', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  const d3 = basarili(hareket(d2, 'itiraz', 1));
  assert.equal(elSayisi(d3, 0), 2 + 4);
  assert.equal(elSayisi(d3, 1), 1);
  assert.equal(d3.sira, 1);
  assert.equal(d3.renk, 'yesil');
  assert.equal(d3.itiraz, null);
  // itiraz eden şimdi normal oynayabilir
  basarili(oyna(d3, 1, d3.oyuncular[1].el[0]));
});

test('itiraz haksız (+4 kurala uygun): itiraz eden 6 çeker ve sırayı kaybeder', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('kirmizi', 'sayi', 2), k('sari', 'sayi', 1)], [k('yesil', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  const d3 = basarili(hareket(d2, 'itiraz', 1));
  assert.equal(elSayisi(d3, 1), 1 + 6);
  assert.equal(elSayisi(d3, 0), 2);
  assert.equal(d3.sira, 2);
  assert.equal(d3.renk, 'yesil');
});

test('kabul: hedef 4 kart çeker ve sırayı kaybeder', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('kirmizi', 'sayi', 2), k('sari', 'sayi', 1)], [k('yesil', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  const d3 = basarili(hareket(d2, 'kabul', 1));
  assert.equal(elSayisi(d3, 1), 5);
  assert.equal(d3.sira, 2);
  assert.equal(d3.itiraz, null);
});

test('itiraz: iki kişide haksız itirazdan sonra sıra +4 atana döner', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('kirmizi', 'sayi', 2), k('sari', 'sayi', 1)], [k('yesil', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  const d3 = basarili(hareket(d2, 'itiraz', 1));
  assert.equal(d3.sira, 0);
  assert.equal(elSayisi(d3, 1), 7);
});

// ---------------------------------------------------------------------------
// +2 yığma seçeneği
// ---------------------------------------------------------------------------

test('yığma AÇIK: +2 ceza birikir, sıradaki yalnız +2 koyabilir ya da hepsini çeker', () => {
  const a = k('mavi', 'cek2');
  const b = k('sari', 'cek2');
  const kir = k('kirmizi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('sari', 'sayi', 2)], [b, kir], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
    ayar: { istif: true },
  });
  const d2 = basarili(oyna(d, 0, a));
  assert.equal(d2.bekleyen, 2);
  assert.equal(d2.sira, 1);
  assert.equal(elSayisi(d2, 1), 2);
  // +2 dışındaki hamleler olmaz
  hatali(oyna(d2, 1, kir));
  hatali(hareket(d2, 'pas', 1));
  // +2'nin üstüne farklı renk +2 koyulabilir
  const d3 = basarili(oyna(d2, 1, b));
  assert.equal(d3.bekleyen, 4);
  assert.equal(d3.sira, 2);
  // üçüncü oyuncu hepsini çeker ve sırasını kaybeder
  const d4 = basarili(hareket(d3, 'cek', 2));
  assert.equal(elSayisi(d4, 2), 1 + 4);
  assert.equal(d4.bekleyen, 0);
  assert.equal(d4.sira, 0);
});

test('yığma AÇIK: hedef +2 koymazsa çek ile cezayı alır, sıra sonrakine geçer', () => {
  const a = k('mavi', 'cek2');
  const d = kur({
    eller: [[a, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
    ayar: { istif: true },
  });
  const d2 = basarili(oyna(d, 0, a));
  const d3 = basarili(hareket(d2, 'cek', 1));
  assert.equal(elSayisi(d3, 1), 3);
  assert.equal(d3.sira, 2);
  assert.equal(d3.cektiMi, false);
});

test('yığma AÇIK: +4 hiç yığılmaz', () => {
  const a = k('mavi', 'cek2');
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[a, k('sari', 'sayi', 2)], [cek4, k('kirmizi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
    ayar: { istif: true },
  });
  const d2 = basarili(oyna(d, 0, a));
  hatali(oyna(d2, 1, cek4, 'mavi'));
  assert.equal(atilabilirlik(d2, pid(1), cek4), 'hayir');
});

test('yığma AÇIK: iki kişide yığın döner (p0 +2, p1 +2, p0 6... çeker)', () => {
  const a = k('mavi', 'cek2');
  const b = k('sari', 'cek2');
  const c = k('kirmizi', 'cek2');
  const d = kur({
    eller: [[a, c, k('sari', 'sayi', 2)], [b, k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
    ayar: { istif: true },
  });
  let s = basarili(oyna(d, 0, a));
  s = basarili(oyna(s, 1, b));
  assert.equal(s.bekleyen, 4);
  assert.equal(s.sira, 0);
  s = basarili(oyna(s, 0, c));
  assert.equal(s.bekleyen, 6);
  assert.equal(s.sira, 1);
  s = basarili(hareket(s, 'cek', 1));
  assert.equal(elSayisi(s, 1), 1 + 6);
  assert.equal(s.sira, 0);
});

test('yığma KAPALI: bekleyen hiç artmaz', () => {
  const a = k('mavi', 'cek2');
  const d = kur({
    eller: [[a, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
    ayar: { istif: false },
  });
  const d2 = basarili(oyna(d, 0, a));
  assert.equal(d2.bekleyen, 0);
});

// ---------------------------------------------------------------------------
// Deste bitince
// ---------------------------------------------------------------------------

test('deste biterse atık (en üstteki hariç) karıştırılıp yeni deste olur', () => {
  const cek2 = k('mavi', 'cek2');
  const atik1 = k('sari', 'sayi', 1);
  const atik2 = k('sari', 'sayi', 2);
  const atik3 = k('yesil', 'sayi', 3);
  const tek = k('kirmizi', 'sayi', 4);
  const d = kur({
    eller: [[cek2, k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
    atikAlt: [atik1, atik2, atik3],
    deste: [tek],
  });
  const once = tumKartlar(d).length;
  const d2 = basarili(uygula(d, { tip: 'oyna', id: pid(0), kart: cek2.id }, rng(3)));
  // p1 iki kart çekti: biri eski desteden, biri yenilenen desteden
  assert.equal(elSayisi(d2, 1), 3);
  assert.ok(d2.oyuncular[1].el.some((c) => c.id === tek.id));
  // atık yalnızca en üstteki kart (+2) olarak kaldı
  assert.equal(d2.atik.length, 1);
  assert.equal(d2.atik[0].id, cek2.id);
  assert.equal(tumKartlar(d2).length, once);
  assert.equal(new Set(tumKartlar(d2).map((c) => c.id)).size, once);
  // atıktaki 4 kart (üstteki +2 hariç) yeniden karıştı, 1'i çekildi
  assert.equal(d2.deste.length, 3);
});

test('hem deste hem atık biterse çekmek daha az kart verir, pas yine de geçilir', () => {
  const d = kur({
    eller: [[k('sari', 'sayi', 2), k('sari', 'sayi', 4)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
    deste: [],
  });
  const d2 = basarili(hareket(d, 'cek', 0));
  assert.equal(elSayisi(d2, 0), 2);
  assert.equal(d2.cektiMi, true);
  assert.equal(d2.cekilenKart, null);
  const d3 = basarili(hareket(d2, 'pas', 0));
  assert.equal(d3.sira, 1);
});

test('yığılmış ceza çekilirken destede yeterli kart yoksa eldeki kadar verilir', () => {
  const d = kur({
    eller: [[k('sari', 'sayi', 2)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'cek2'),
    bekleyen: 6,
    ayar: { istif: true },
    sira: 1,
    deste: [k('sari', 'sayi', 7)],
  });
  const d2 = basarili(hareket(d, 'cek', 1));
  assert.equal(elSayisi(d2, 1), 2);
  assert.equal(d2.sira, 0);
  assert.equal(d2.bekleyen, 0);
});

// ---------------------------------------------------------------------------
// UNO ve yakalama
// ---------------------------------------------------------------------------

test('UNO demeden tek karta düşen yakalanır: 2 kart çeker, pencere kapanır', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8), k('sari', 'sayi', 1)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, a));
  assert.equal(d2.yakala, 0);
  // kendini yakalayamaz
  hatali(hareket(d2, 'yakala', 0));
  const d3 = basarili(hareket(d2, 'yakala', 2));
  assert.equal(elSayisi(d3, 0), 3);
  assert.equal(d3.yakala, null);
  assert.equal(d3.oyuncular[0].uno, false);
  // ikinci kez yakalanamaz
  hatali(hareket(d3, 'yakala', 1));
});

test('yakalama: sıradaki oyuncu da yakalayabilir', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, a));
  const d3 = basarili(hareket(d2, 'yakala', 1));
  assert.equal(elSayisi(d3, 0), 3);
});

test('yakalama penceresi: sıradaki oyuncu hareket edince kapanır', () => {
  const a = k('mavi', 'sayi', 3);
  const b = k('mavi', 'sayi', 8);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [b, k('sari', 'sayi', 1), k('sari', 'sayi', 2)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, a));
  assert.equal(d2.yakala, 0);
  const d3 = basarili(oyna(d2, 1, b));
  assert.equal(d3.yakala, null);
  hatali(hareket(d3, 'yakala', 2));
  assert.equal(elSayisi(d3, 0), 1);
});

test('yakalama penceresi: sıradaki kart çekince de kapanır', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [k('sari', 'sayi', 1)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, a));
  const d3 = basarili(hareket(d2, 'cek', 1));
  assert.equal(d3.yakala, null);
});

test('yakalama penceresi: +4 kararı (itiraz/kabul) da pencereyi kapatır', () => {
  const cek4 = k(null, 'cek4');
  const d = kur({
    eller: [[cek4, k('kirmizi', 'sayi', 2)], [k('yesil', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek4, 'yesil'));
  assert.equal(d2.yakala, 0);
  // karar verilmeden başkası yine de yakalayabilir
  basarili(hareket(d2, 'yakala', 2));
  const d3 = basarili(hareket(d2, 'kabul', 1));
  assert.equal(d3.yakala, null);
});

test('UNO: sırası gelen 2 kartla UNO diyebilir; sonra oynayınca yakalanmaz', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(hareket(d, 'uno', 0));
  assert.equal(d2.oyuncular[0].uno, true);
  const d3 = basarili(oyna(d2, 0, a));
  assert.equal(d3.yakala, null);
  hatali(hareket(d3, 'yakala', 1));
});

test('UNO: tek karta düştükten sonra pencere açıkken UNO denebilir', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, a));
  const d3 = basarili(hareket(d2, 'uno', 0));
  assert.equal(d3.oyuncular[0].uno, true);
  assert.equal(d3.yakala, null);
  hatali(hareket(d3, 'yakala', 2));
  // artık tekrar UNO denemez
  hatali(hareket(d3, 'uno', 0));
});

test('UNO: pencere kapandıktan sonra geç kalınan UNO işe yaramaz', () => {
  const a = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[a, k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8), k('sari', 'sayi', 1)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, a));
  const d3 = basarili(oyna(d2, 1, d2.oyuncular[1].el[0]));
  hatali(hareket(d3, 'uno', 0));
});

test('UNO: yanlış zamanda (3 kart, sıra başkasında) denemek hata verir', () => {
  const d = kur({
    eller: [[k('mavi', 'sayi', 3), k('mavi', 'sayi', 4), k('mavi', 'sayi', 6)], [k('mavi', 'sayi', 8), k('sari', 'sayi', 1)]],
    ust: k('mavi', 'sayi', 5),
  });
  hatali(hareket(d, 'uno', 0));
  hatali(hareket(d, 'uno', 1)); // 2 kart ama sırası değil
});

test('UNO: kart çekmek UNO işaretini düşürür', () => {
  const d = kur({
    eller: [[k('sari', 'sayi', 3), k('sari', 'sayi', 4)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(hareket(d, 'uno', 0));
  assert.equal(d2.oyuncular[0].uno, true);
  const d3 = basarili(hareket(d2, 'cek', 0));
  assert.equal(d3.oyuncular[0].uno, false);
});

test('UNO: +2 ile tek karta düşen yakalanabilir, ceza çektiren +2 sonrası pencere açık kalır', () => {
  const cek2 = k('mavi', 'cek2');
  const d = kur({
    eller: [[cek2, k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8)], [k('mavi', 'sayi', 9)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, cek2));
  assert.equal(d2.yakala, 0);
  const d3 = basarili(hareket(d2, 'yakala', 2));
  assert.equal(elSayisi(d3, 0), 3);
});

test('yakalama: yakalanacak kimse yokken hata', () => {
  const d = kur({
    eller: [[k('mavi', 'sayi', 3), k('mavi', 'sayi', 4)], [k('mavi', 'sayi', 8)]],
    ust: k('mavi', 'sayi', 5),
  });
  hatali(hareket(d, 'yakala', 1));
});

// ---------------------------------------------------------------------------
// El sonu, puanlama, oyun sonu
// ---------------------------------------------------------------------------

test('el biter: kazanan rakiplerin kartlarının toplamını alır', () => {
  const son = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [
      [son],
      [k('kirmizi', 'sayi', 7), k('sari', 'atla'), k(null, 'joker')],
      [k(null, 'cek4'), k('mavi', 'sayi', 0), k('yesil', 'ters')],
    ],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(d2.elKazanan, 0);
  assert.equal(d2.elPuani, 7 + 20 + 50 + 50 + 0 + 20);
  assert.equal(d2.oyuncular[0].puan, 147);
  assert.equal(d2.asama, 'el_sonu');
  // el bittikten sonra hamle olmaz
  hatali(hareket(d2, 'cek', 1));
  hatali(oyna(d2, 1, d2.oyuncular[1].el[0]));
});

test('el biter: son kart +2 ise sıradaki yine de 2 kart çeker ve puana girer', () => {
  const son = k('mavi', 'cek2');
  const d = kur({
    eller: [[son], [k('kirmizi', 'sayi', 7)]],
    ust: k('mavi', 'sayi', 5),
    deste: [k('yesil', 'cek2'), k('sari', 'sayi', 4)],
  });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(elSayisi(d2, 1), 3);
  assert.equal(d2.elPuani, 7 + 4 + 20);
  assert.equal(d2.asama, 'el_sonu');
});

test('el biter: son kart +4 ise sıradaki 4 kart çeker (itiraz olmadan) ve puana girer', () => {
  const son = k(null, 'cek4');
  const d = kur({
    eller: [[son], [k('kirmizi', 'sayi', 7)]],
    ust: k('mavi', 'sayi', 5),
    deste: [k('sari', 'sayi', 1), k('sari', 'sayi', 2), k('sari', 'sayi', 3), k('sari', 'sayi', 4)],
  });
  const d2 = basarili(oyna(d, 0, son, 'mavi'));
  assert.equal(elSayisi(d2, 1), 5);
  assert.equal(d2.itiraz, null);
  assert.equal(d2.elPuani, 7 + 1 + 2 + 3 + 4);
});

test('el biter: yığma açıkken son +2, birikmiş cezayla birlikte çektirilir', () => {
  const son = k('mavi', 'cek2');
  const d = kur({
    eller: [[son], [k('kirmizi', 'sayi', 7)]],
    ust: k('mavi', 'cek2'),
    bekleyen: 2,
    ayar: { istif: true },
    deste: dolgu(6),
  });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(elSayisi(d2, 1), 1 + 4);
  assert.equal(d2.bekleyen, 0);
  assert.equal(d2.asama, 'el_sonu');
});

test('el biter: son kart Ters (iki kişi) ya da Atla da eli bitirir', () => {
  const son = k('mavi', 'ters');
  const d = kur({ eller: [[son], [k('kirmizi', 'sayi', 7)]], ust: k('mavi', 'sayi', 5) });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(d2.asama, 'el_sonu');
  assert.equal(d2.elPuani, 7);
});

test('hedefe ulaşan oyunu kazanır, ulaşamazsa el sonu olur', () => {
  const son = k('mavi', 'sayi', 3);
  const hazirla = (hedef, onceki) =>
    kur({
      eller: [[son], [k(null, 'joker'), k(null, 'joker')]],
      ust: k('mavi', 'sayi', 5),
      puanlar: [onceki, 0],
      ayar: { hedef: hedef },
    });
  // Kazanan 100 puan alır (iki Joker)
  const a = basarili(oyna(hazirla(500, 0), 0, son));
  assert.equal(a.asama, 'el_sonu');
  assert.equal(a.oyunKazanan, null);
  const b = basarili(oyna(hazirla(200, 100), 0, son));
  assert.equal(b.asama, 'bitti');
  assert.equal(b.oyunKazanan, 0);
  assert.equal(b.oyuncular[0].puan, 200);
  const c = basarili(oyna(hazirla(200, 99), 0, son));
  assert.equal(c.asama, 'el_sonu');
  const e = basarili(oyna(hazirla(500, 400), 0, son));
  assert.equal(e.asama, 'bitti');
  const f = basarili(oyna(hazirla(500, 399), 0, son));
  assert.equal(f.asama, 'el_sonu');
});

test('Tek el: ilk eldeki kazanan oyunu bitirir', () => {
  const son = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[son], [k('kirmizi', 'sayi', 1)]],
    ust: k('mavi', 'sayi', 5),
    ayar: { hedef: 0 },
  });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(d2.asama, 'bitti');
  assert.equal(d2.oyunKazanan, 0);
});

test('sonraki el: dağıtıcı döner, puanlar kalır, sadece ev sahibi başlatır', () => {
  const son = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[son], [k('kirmizi', 'sayi', 9)], [k('kirmizi', 'sayi', 4)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(d2.oyuncular[0].puan, 13);
  hatali(uygula(d2, { tip: 'sonrakiEl', id: pid(1) }, rng(2)));
  const d3 = basarili(uygula(d2, { tip: 'sonrakiEl', id: pid(0) }, rng(2)));
  assert.equal(d3.asama, 'oyun');
  assert.equal(d3.dagitici, 1);
  assert.equal(d3.oyuncular[0].puan, 13);
  assert.equal(d3.elKazanan, null);
  assert.equal(tumKartlar(d3).length, 108);
  d3.oyuncular.forEach((o) => {
    assert.ok(o.el.length >= 7);
  });
  // oyun sürerken sonraki el istenemez
  hatali(uygula(d3, { tip: 'sonrakiEl', id: pid(0) }, rng(2)));
});

test('sonraki el: dağıtıcıdan sonraki oyuncu başlar (dağıtıcı 1 ise sıra 2)', () => {
  const tohum = tohumBul(3, (c) => c.tip === 'sayi');
  const son = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[son], [k('kirmizi', 'sayi', 9)], [k('kirmizi', 'sayi', 4)]],
    ust: k('mavi', 'sayi', 5),
  });
  const d2 = basarili(oyna(d, 0, son));
  // dağıtıcı ilk elde 0'dı, şimdi 1 olur; başlayan 2
  const d3 = basarili(uygula(d2, { tip: 'sonrakiEl', id: pid(0) }, rng(tohum)));
  assert.equal(d3.dagitici, 1);
  const ac = d3.atik[0];
  if (ac.tip === 'sayi') {
    assert.equal(d3.sira, 2);
  }
});

test('yeni oyun: puanlar sıfırlanır, oyuncular kalır, lobiye dönülür', () => {
  const son = k('mavi', 'sayi', 3);
  const d = kur({
    eller: [[son], [k(null, 'joker')]],
    ust: k('mavi', 'sayi', 5),
    ayar: { hedef: 0 },
  });
  const d2 = basarili(oyna(d, 0, son));
  assert.equal(d2.asama, 'bitti');
  hatali(uygula(d2, { tip: 'yeniOyun', id: pid(1) }));
  const d3 = basarili(uygula(d2, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(d3.asama, 'lobi');
  assert.equal(d3.oyuncular.length, 2);
  assert.equal(d3.oyuncular[0].puan, 0);
  assert.equal(d3.oyuncular[0].el.length, 0);
  assert.equal(d3.ayar.hedef, 0);
  // lobide yeniden başlatılabilir
  const d4 = basarili(uygula(d3, { tip: 'baslat', id: pid(0) }, rng(4)));
  assert.equal(d4.asama, 'oyun');
  assert.equal(d4.oyuncular[0].puan, 0);
});

// ---------------------------------------------------------------------------
// Rastgele oyun: kurallar bozulmadan oyun bitiyor mu?
// ---------------------------------------------------------------------------

// Tek bir geçerli hamle seçer (sıra ve bekleyen kararlara göre)
function botHamlesi(d, r) {
  const sec = (liste) => liste[Math.floor(r() * liste.length)];
  if (d.itiraz) {
    return { tip: r() < 0.5 ? 'itiraz' : 'kabul', id: d.oyuncular[d.itiraz.hedef].id };
  }
  const kim = d.oyuncular[d.sira];
  if (d.renkBekle) {
    return { tip: 'renkSec', id: kim.id, renk: sec(RENKLER) };
  }
  const atilabilirler = kim.el.filter((c) => atilabilirlik(d, kim.id, c) !== 'hayir');
  if (d.cektiMi) {
    if (atilabilirler.length > 0 && r() < 0.8) {
      return { tip: 'oyna', id: kim.id, kart: atilabilirler[0].id, renk: sec(RENKLER) };
    }
    return { tip: 'pas', id: kim.id };
  }
  if (atilabilirler.length > 0 && r() < 0.9) {
    const kart = sec(atilabilirler);
    return { tip: 'oyna', id: kim.id, kart: kart.id, renk: sec(RENKLER) };
  }
  return { tip: 'cek', id: kim.id };
}

test('rastgele oyunlar: kart sayısı hep 108, hamleler geçerli, oyunlar biter', () => {
  let biten = 0;
  const toplam = 120;
  for (let t = 1; t <= toplam; t++) {
    const r = rng(t * 7919);
    const n = 2 + (t % 3);
    const ayar = { istif: t % 2 === 0, hedef: t % 5 === 0 ? 0 : 200 };
    let d = oyunBaslat(n, t, ayar);
    let adim = 0;
    while (d.asama !== 'bitti' && adim < 20000) {
      if (d.asama === 'el_sonu') {
        d = basarili(uygula(d, { tip: 'sonrakiEl', id: pid(0) }, r));
        continue;
      }
      // Ara sıra UNO / yakala dene (hata verebilir, sorun değil)
      if (r() < 0.3) {
        const biri = d.oyuncular[Math.floor(r() * n)].id;
        const sonuc = uygula(d, { tip: r() < 0.5 ? 'uno' : 'yakala', id: biri }, r);
        if (sonuc.ok) {
          d = sonuc.durum;
        }
      }
      const eylem = botHamlesi(d, r);
      d = basarili(uygula(d, eylem, r));
      const hepsi = tumKartlar(d);
      assert.equal(hepsi.length, 108, 'kart sayısı bozuldu');
      assert.equal(new Set(hepsi.map((c) => c.id)).size, 108, 'kart tekrarı var');
      adim += 1;
    }
    if (d.asama === 'bitti') {
      biten += 1;
      assert.ok(d.oyunKazanan !== null);
    }
  }
  assert.equal(biten, toplam, 'bazı oyunlar bitmedi');
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

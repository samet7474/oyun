// "Risk Kulesi" motoru ve oyun yönlendirici testleri. Çalıştır: node test/kule-test.js
import assert from 'node:assert/strict';
import {
  HEDEFLER,
  SIRA_SURESI_MS,
  catlakEtkinMi,
  catlakVarMi,
  istatistikler,
  kuleToplami,
  sirayaKalanMs,
  sirayiGecebilirMi,
  uygula,
  yeniOda,
  zarUret,
} from '../kule.js';
import { OYUNLAR, oyunId, uygula as yonlendir, yeniOda as yonlendirYeniOda } from '../oyunlar.js';

// ---------------------------------------------------------------------------
// Küçük test düzeni
// ---------------------------------------------------------------------------

const testler = [];

function test(ad, fonksiyon) {
  testler.push({ ad: ad, fonksiyon: fonksiyon });
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

const T0 = 1000000; // sahte "şimdi"

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

// Verilen zarı döndüren sabit rastgele sayı üretici
function sabitZar(deger) {
  return function () {
    return (deger - 1) / 6 + 0.01;
  };
}

function u(d, eylem, zar = 3, simdi = T0) {
  return uygula(d, eylem, sabitZar(zar), simdi);
}

// i. oyuncu verilen zarı atar
function at(d, i, zar, simdi = T0) {
  return basarili(u(d, { tip: 'zarAt', id: pid(i) }, zar, simdi));
}

function dur(d, i, simdi = T0) {
  return basarili(u(d, { tip: 'dur', id: pid(i) }, 3, simdi));
}

function catlakAt(d, kim, hedef) {
  return u(d, { tip: 'catlak', id: pid(kim), hedef: pid(hedef) });
}

function dondur(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    Object.values(x).forEach(dondur);
  }
  return x;
}

// n kişilik lobi
function lobi(n) {
  let d = yeniOda(pid(0), 'Ali');
  for (let i = 1; i < n; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  return d;
}

// n kişilik, başlamış oyun
function oyun(n, hedef = 100) {
  let d = lobi(n);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: hedef } }));
  return basarili(u(d, { tip: 'baslat', id: pid(0) }, 3, T0));
}

// ---------------------------------------------------------------------------
// Lobi
// ---------------------------------------------------------------------------

test('lobi: oda kurulur, varsayılan hedef 100, ev sahibi ilk oyuncu', () => {
  const d = yeniOda('a', '  Ali  ');
  assert.equal(d.oyun, 'kule');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, 'a');
  assert.equal(d.oyuncular[0].ad, 'Ali');
  assert.equal(d.ayar.hedef, 100);
  assert.deepEqual(HEDEFLER, [50, 100, 150]);
});

test('lobi: katılma, aynı ad, dolu oda ve çıkma', () => {
  let d = lobi(4);
  assert.equal(d.oyuncular.length, 4);
  assert.match(hatali(u(d, { tip: 'katil', id: 'x', ad: 'Biri' })), /dolu/);
  // aynı kişi tekrar katılırsa değişmez
  assert.deepEqual(basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Oyuncu1' })), d);
  // ev sahibi çıkarsa sahip değişir
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  assert.equal(d.oyuncular.length, 3);
  // ev sahibi olmayan başkasını çıkaramaz
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(2), hedef: pid(3) })), /ev sahibi/);
  d = basarili(u(d, { tip: 'cikar', id: pid(1), hedef: pid(3) }));
  assert.equal(d.oyuncular.length, 2);
});

test('lobi: hedef ayarı yalnız ev sahibi ve geçerli değerlerle', () => {
  const d = lobi(2);
  for (const hedef of HEDEFLER) {
    assert.equal(basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: hedef } })).ayar.hedef, hedef);
  }
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 75 } })), /hedef/i);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { hedef: 50 } })), /ev sahibi/);
});

test('başlat: 2-4 kişi gerekir, yalnız ev sahibi başlatır', () => {
  assert.match(hatali(u(lobi(1), { tip: 'baslat', id: pid(0) })), /En az 2/);
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  for (const n of [2, 3, 4]) {
    const d = oyun(n);
    assert.equal(d.asama, 'oyun');
    assert.equal(d.sira, 0);
    assert.deepEqual(d.kasalar, new Array(n).fill(0));
    assert.deepEqual(d.catlakHakki, new Array(n).fill(1));
    assert.deepEqual(d.catlak, new Array(n).fill(0));
    assert.equal(d.sonHamle, T0);
  }
  assert.match(hatali(u(oyun(2), { tip: 'baslat', id: pid(0) })), /zaten/);
  assert.match(hatali(u(oyun(2), { tip: 'katil', id: 'yeni', ad: 'Y' })), /başladı/);
});

test('girdi durumu değişmez (dondurulmuş durumla)', () => {
  const d = dondur(oyun(3));
  const sonuc = u(d, { tip: 'zarAt', id: pid(0) }, 4);
  assert.equal(sonuc.ok, true);
  assert.equal(d.kule.length, 0);
  assert.notEqual(sonuc.durum, d);
});

// ---------------------------------------------------------------------------
// Zar ve kule
// ---------------------------------------------------------------------------

test('zar üretimi: 1-6 arası, uç değerler taşmaz', () => {
  assert.equal(zarUret(() => 0), 1);
  assert.equal(zarUret(() => 0.9999999), 6);
  assert.equal(zarUret(() => 1), 6);
  for (let v = 1; v <= 6; v++) {
    assert.equal(zarUret(sabitZar(v)), v);
  }
});

test('zar ekleme: çıkan sayı kule katı olur, toplam artar, sıra değişmez', () => {
  let d = oyun(2);
  d = at(d, 0, 4);
  assert.deepEqual(d.kule, [{ sayi: 4, x2: false, deger: 4 }]);
  assert.equal(d.turToplam, 4);
  d = at(d, 0, 6);
  d = at(d, 0, 2);
  assert.equal(d.kule.length, 3);
  assert.equal(d.turToplam, 12);
  assert.equal(kuleToplami(d.kule), 12);
  assert.equal(d.sira, 0);
  assert.equal(d.kasalar[0], 0);
  assert.equal(d.sonOlay.tip, 'zar');
  assert.equal(d.sonOlay.deger, 2);
});

test('1 gelirse kule yıkılır, biriken gider, sıra geçer', () => {
  let d = oyun(2);
  d = at(d, 0, 5);
  d = at(d, 0, 6);
  d = at(d, 0, 1);
  assert.deepEqual(d.kule, []);
  assert.equal(d.turToplam, 0);
  assert.equal(d.kasalar[0], 0);
  assert.equal(d.sira, 1);
  assert.equal(d.yikilma[0], 1);
  assert.equal(d.sonOlay.tip, 'yikildi');
  assert.equal(d.sonOlay.neden, 'bir');
  assert.equal(d.sonOlay.kayip, 11);
  // yıkılan katlar animasyon için olayda saklanır
  assert.deepEqual(d.sonOlay.kat.map((k) => k.sayi), [5, 6]);
});

test('son zar kaydı: zar ve yıkılma bilgisi, araya giren çatlak taş bunu silmez', () => {
  let d = oyun(3);
  assert.equal(d.sonZar, null);
  d = at(d, 0, 5);
  assert.equal(d.sonZar.deger, 5);
  assert.equal(d.sonZar.kim, 0);
  assert.equal(d.sonZar.yikildi, false);
  d = basarili(catlakAt(d, 1, 2));
  assert.equal(d.sonOlay.tip, 'catlak');
  assert.equal(d.sonZar.deger, 5, 'çatlak taş zar kaydını silmez');
  d = at(d, 0, 1);
  assert.equal(d.sonZar.yikildi, true);
  assert.equal(d.sonZar.kat.length, 1);
  assert.equal(d.sonZar.no, d.sonOlay.no);
});

test('ilk zar 1 gelirse de yıkılır (boş kule)', () => {
  let d = oyun(2);
  d = at(d, 0, 1);
  assert.equal(d.sira, 1);
  assert.equal(d.yikilma[0], 1);
  assert.deepEqual(d.sonOlay.kat, []);
});

test('çift kat: bir önceki katla aynı sayı iki kat sayılır', () => {
  let d = oyun(2);
  d = at(d, 0, 4);
  d = at(d, 0, 4);
  assert.deepEqual(d.kule[1], { sayi: 4, x2: true, deger: 8 });
  assert.equal(d.turToplam, 12);
  assert.equal(d.sonOlay.x2, true);
});

test('çift kat: yalnız bir önceki katla kıyaslanır', () => {
  let d = oyun(2);
  d = at(d, 0, 4);
  d = at(d, 0, 3);
  d = at(d, 0, 4); // iki önceki 4 ama bir önceki 3: çift değil
  assert.equal(d.kule[2].x2, false);
  assert.equal(d.turToplam, 11);
});

test('çift kat: üç aynı sayıda ikisi de iki kat sayılır', () => {
  let d = oyun(2);
  d = at(d, 0, 5);
  d = at(d, 0, 5);
  d = at(d, 0, 5);
  assert.deepEqual(d.kule.map((k) => k.x2), [false, true, true]);
  assert.equal(d.turToplam, 5 + 10 + 10);
});

test('çift kat: yeni turda önceki turun katı sayılmaz', () => {
  let d = oyun(2);
  d = at(d, 0, 4);
  d = dur(d, 0);
  d = at(d, 1, 4);
  assert.equal(d.kule[0].x2, false);
});

// ---------------------------------------------------------------------------
// Dur ve kasa
// ---------------------------------------------------------------------------

test('dur: toplam kasaya eklenir, kule temizlenir, sıra geçer', () => {
  let d = oyun(3);
  d = at(d, 0, 6);
  d = at(d, 0, 6);
  d = dur(d, 0);
  assert.equal(d.kasalar[0], 18);
  assert.equal(d.turToplam, 0);
  assert.deepEqual(d.kule, []);
  assert.equal(d.sira, 1);
  assert.equal(d.sonOlay.tip, 'dur');
  assert.equal(d.sonOlay.miktar, 18);
});

test('ilk zarı atmadan durulamaz', () => {
  const d = oyun(2);
  assert.match(hatali(u(d, { tip: 'dur', id: pid(0) })), /zar/);
});

test('kasa turlar boyunca birikir', () => {
  let d = oyun(2);
  d = at(d, 0, 5);
  d = dur(d, 0);
  d = at(d, 1, 3);
  d = dur(d, 1);
  d = at(d, 0, 6);
  d = dur(d, 0);
  assert.equal(d.kasalar[0], 11);
  assert.equal(d.kasalar[1], 3);
  assert.equal(d.sira, 1);
});

test('en yüksek kule ve rekor takip edilir (yıkılan kule de sayılır)', () => {
  let d = oyun(2);
  d = at(d, 0, 2);
  d = at(d, 0, 3);
  d = at(d, 0, 4);
  d = at(d, 0, 1); // 3 katlık kule yıkıldı
  assert.equal(d.enYuksek[0], 3);
  assert.deepEqual(d.rekor, { kat: 3, ad: 'Ali' });
  d = at(d, 1, 2);
  d = at(d, 1, 5);
  d = at(d, 1, 3);
  d = at(d, 1, 6);
  d = at(d, 1, 4);
  assert.deepEqual(d.rekor, { kat: 5, ad: 'Oyuncu1' });
  assert.equal(d.enYuksek[1], 5);
  const ist = istatistikler(d);
  assert.deepEqual(ist.enYuksek, { kat: 5, ad: 'Oyuncu1' });
  assert.deepEqual(ist.enCokYikilan, { adet: 1, ad: 'Ali' });
});

// ---------------------------------------------------------------------------
// Hedef ve oyun sonu
// ---------------------------------------------------------------------------

test('hedefe "dur" ile ulaşan kazanır', () => {
  let d = oyun(2, 50);
  // 6 + 12 + 12 + 12 + 12 = 54
  for (let i = 0; i < 5; i++) {
    d = at(d, 0, 6);
  }
  assert.equal(d.turToplam, 6 + 12 * 4);
  d = dur(d, 0);
  assert.equal(d.asama, 'bitti');
  assert.equal(d.sonuc.kazanan, 0);
  assert.equal(d.sonuc.neden, 'hedef');
  assert.equal(d.kasalar[0], 54);
});

test('hedefe tam eşitlik de kazandırır', () => {
  let d = oyun(2, 50);
  // 5 + 5x2 = 15 ; üç tur: 15 + 15 + 20 = 50
  d = at(d, 0, 5);
  d = at(d, 0, 5);
  d = dur(d, 0); // 15
  d = at(d, 1, 2);
  d = dur(d, 1);
  d = at(d, 0, 5);
  d = at(d, 0, 5);
  d = dur(d, 0); // 30
  d = at(d, 1, 2);
  d = dur(d, 1);
  d = at(d, 0, 4);
  d = at(d, 0, 4);
  d = at(d, 0, 4); // 4 + 8 + 8 = 20
  d = dur(d, 0);
  assert.equal(d.kasalar[0], 50);
  assert.equal(d.asama, 'bitti');
  assert.equal(d.sonuc.kazanan, 0);
});

test('turun ortasında hedef geçilse bile durmadan kazanılmaz', () => {
  let d = oyun(2, 50);
  for (let i = 0; i < 6; i++) {
    d = at(d, 0, 6);
  }
  assert.ok(d.turToplam > 50);
  assert.equal(d.asama, 'oyun');
  assert.equal(d.kasalar[0], 0);
  // yıkılırsa hiçbir şey kazanılmaz
  d = at(d, 0, 1);
  assert.equal(d.asama, 'oyun');
  assert.equal(d.kasalar[0], 0);
});

test('hedefi geçen de kazanır ve diğerleri bir tur daha oynamaz', () => {
  let d = oyun(3, 50);
  d = at(d, 0, 2);
  d = dur(d, 0);
  for (let i = 0; i < 5; i++) {
    d = at(d, 1, 6);
  }
  d = dur(d, 1); // 6 + 4 * 12 = 54
  assert.equal(d.asama, 'bitti');
  assert.equal(d.sonuc.kazanan, 1);
  // oyun bitince hamle yapılamaz
  assert.match(hatali(u(d, { tip: 'zarAt', id: pid(2) })), /sürmüyor/);
  assert.match(hatali(u(d, { tip: 'dur', id: pid(2) })), /sürmüyor/);
});

test('tekrar oyna: yalnız ev sahibi, bitince; kasalar sıfırlanır, başlayan kayar', () => {
  let d = oyun(3, 50);
  for (let i = 0; i < 5; i++) {
    d = at(d, 0, 6);
  }
  d = dur(d, 0);
  assert.equal(d.asama, 'bitti');
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  const yeni = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }));
  assert.equal(yeni.asama, 'oyun');
  assert.deepEqual(yeni.kasalar, [0, 0, 0]);
  assert.equal(yeni.sira, 1);
  assert.equal(yeni.oyunNo, d.oyunNo + 1);
  assert.equal(yeni.ayar.hedef, 50);
  assert.deepEqual(yeni.catlakHakki, [1, 1, 1]);
  assert.equal(yeni.rekor.kat, 0);
  assert.equal(yeni.sonOlay, null);
  // oyun sürerken tekrar oyna olmaz
  assert.match(hatali(u(yeni, { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
});

test('lobiye dön: ev sahibi, her aşamada; ayar ve oyuncular kalır', () => {
  const d = oyun(3, 150);
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  const lobiye = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.equal(lobiye.oyuncular.length, 3);
  assert.equal(lobiye.ayar.hedef, 150);
  assert.deepEqual(lobiye.kasalar, []);
  assert.match(hatali(u(lobiye, { tip: 'yeniOyun', id: pid(0) })), /lobide/);
});

// ---------------------------------------------------------------------------
// Sıra dışı hamle
// ---------------------------------------------------------------------------

test('sıra dışı hamle reddedilir, odada olmayan oyuncu reddedilir', () => {
  const d = oyun(3);
  assert.match(hatali(u(d, { tip: 'zarAt', id: pid(1) })), /Sıra sende değil/);
  assert.match(hatali(u(d, { tip: 'zarAt', id: pid(2) })), /Sıra sende değil/);
  assert.match(hatali(u(d, { tip: 'zarAt', id: 'yabanci' })), /odada değilsin/);
  const at0 = at(d, 0, 4);
  assert.match(hatali(u(at0, { tip: 'dur', id: pid(1) })), /Sıra sende değil/);
  assert.match(hatali(u(lobi(2), { tip: 'zarAt', id: pid(0) })), /sürmüyor/);
  assert.match(hatali(u(d, { tip: 'bilinmeyen', id: pid(0) })), /Bilinmeyen/);
});

// ---------------------------------------------------------------------------
// Çatlak taş
// ---------------------------------------------------------------------------

test('çatlak taş: sırası başında bir rakibe atılır, hak harcanır', () => {
  let d = oyun(2);
  d = basarili(catlakAt(d, 0, 1));
  assert.equal(d.catlakHakki[0], 0);
  assert.equal(d.catlak[1], 2);
  assert.equal(catlakVarMi(d, 1), true);
  assert.equal(catlakEtkinMi(d, 1), true);
  assert.equal(d.sonOlay.tip, 'catlak');
  assert.equal(d.sonOlay.hedef, 1);
});

test('çatlak taş: sırası kendinde değilken atılır (3 kişi, sırası olmayana)', () => {
  let d = oyun(3);
  // sıra p0'da; p1, p2'ye atar
  d = basarili(catlakAt(d, 1, 2));
  assert.equal(d.catlak[2], 2);
  assert.equal(d.catlakHakki[1], 0);
  // sırası olana da atılabilir: bu turu etkilemez, sonraki tura kalır
  d = basarili(catlakAt(d, 2, 0));
  assert.equal(d.catlak[0], 1);
  assert.equal(catlakVarMi(d, 0), true);
  assert.equal(catlakEtkinMi(d, 0), false);
});

test('çatlak taş: oyun başına tek hak', () => {
  let d = oyun(3);
  d = basarili(catlakAt(d, 0, 1));
  assert.match(hatali(catlakAt(d, 0, 2)), /hakkını/);
});

test('çatlak taş: kendine atılamaz, olmayan oyuncuya atılamaz', () => {
  const d = oyun(2);
  assert.match(hatali(catlakAt(d, 0, 0)), /kendine/);
  assert.match(hatali(u(d, { tip: 'catlak', id: pid(0), hedef: 'yok' })), /oyuncu yok/);
  assert.match(hatali(u(d, { tip: 'catlak', id: 'yabanci', hedef: pid(1) })), /odada değilsin/);
  assert.equal(d.catlakHakki[0], 1);
});

test('çatlak taş: sırası gelen oyuncu zar attıktan sonra atamaz', () => {
  let d = oyun(2);
  d = at(d, 0, 4);
  assert.match(hatali(catlakAt(d, 0, 1)), /zar atmadan/);
  // sırası olmayan istediği an atabilir
  const baska = oyun(3);
  const atti = at(baska, 0, 4);
  assert.equal(basarili(catlakAt(atti, 2, 1)).catlak[1], 2);
});

test('çatlak taş: aynı oyuncuya ikinci çatlak atılamaz', () => {
  let d = oyun(3);
  d = basarili(catlakAt(d, 0, 2));
  assert.match(hatali(catlakAt(d, 1, 2)), /zaten bir çatlak/);
  // bekleyen çatlak da sayılır
  d = basarili(catlakAt(d, 2, 0));
  assert.match(hatali(catlakAt(d, 1, 0)), /zaten bir çatlak/);
  assert.equal(d.catlakHakki[1], 1);
});

test('çatlak taş: çatlaklı oyuncuda 2 de kuleyi yıkar', () => {
  let d = oyun(2);
  d = basarili(catlakAt(d, 0, 1));
  d = at(d, 0, 3);
  d = dur(d, 0);
  assert.equal(d.sira, 1);
  d = at(d, 1, 5);
  d = at(d, 1, 2);
  assert.equal(d.sira, 0);
  assert.deepEqual(d.kule, []);
  assert.equal(d.kasalar[1], 0);
  assert.equal(d.sonOlay.tip, 'yikildi');
  assert.equal(d.sonOlay.neden, 'catlak');
  assert.equal(d.sonOlay.deger, 2);
  assert.equal(d.yikilma[1], 1);
});

test('çatlak taş: çatlaklı oyuncuda 1 de yıkar, çatlaksızda 2 yıkmaz', () => {
  // çatlaklı, 1
  let d = oyun(2);
  d = basarili(catlakAt(d, 0, 1));
  d = at(d, 0, 3);
  d = dur(d, 0);
  d = at(d, 1, 1);
  assert.equal(d.sonOlay.neden, 'bir');
  assert.equal(d.sira, 0);
  // çatlaksız, 2
  let e = oyun(2);
  e = at(e, 0, 2);
  assert.equal(e.kule.length, 1);
  assert.equal(e.sira, 0);
});

test('çatlak taş: tur sonunda kalkar (durarak)', () => {
  let d = oyun(2);
  d = basarili(catlakAt(d, 0, 1));
  d = at(d, 0, 3);
  d = dur(d, 0);
  d = at(d, 1, 4);
  assert.equal(catlakEtkinMi(d, 1), true, 'tur sürerken çatlak duruyor');
  d = dur(d, 1);
  assert.equal(d.catlak[1], 0);
  assert.equal(catlakVarMi(d, 1), false);
  // sonraki turunda 2 artık yıkmaz
  d = at(d, 0, 3);
  d = dur(d, 0);
  d = at(d, 1, 2);
  assert.equal(d.kule.length, 1);
});

test('çatlak taş: tur sonunda kalkar (yıkılarak)', () => {
  let d = oyun(2);
  d = basarili(catlakAt(d, 0, 1));
  d = at(d, 0, 3);
  d = dur(d, 0);
  d = at(d, 1, 2); // çatlak yüzünden yıkıldı
  assert.equal(d.catlak[1], 0);
  // sırası olan p0'a şimdi atılırsa bekleyen çatlak olur (p1'in hakkı var)
  const yeni = basarili(catlakAt(d, 1, 0));
  assert.equal(yeni.catlak[0], 1);
});

test('çatlak taş: oynayan oyuncuya atılan çatlak sonraki turunda etkin olur', () => {
  let d = oyun(2);
  // p1, sırası olan p0'a çatlak atar
  d = basarili(catlakAt(d, 1, 0));
  assert.equal(d.catlak[0], 1);
  // p0 bu turda 2 atar: yıkılmaz
  d = at(d, 0, 2);
  assert.equal(d.kule.length, 1);
  d = dur(d, 0);
  // tur bitti: çatlak şimdi etkin
  assert.equal(d.catlak[0], 2);
  d = at(d, 1, 3);
  d = dur(d, 1);
  d = at(d, 0, 2);
  assert.equal(d.sonOlay.neden, 'catlak');
  assert.equal(d.catlak[0], 0);
});

test('çatlak taş: oyunu bitiren oyuncunun çatlağı da kalkar, oyun dışında atılamaz', () => {
  assert.match(hatali(catlakAt(lobi(2), 0, 1)), /sürmüyor/);
  let d = oyun(2, 50);
  d = basarili(catlakAt(d, 1, 0));
  for (let i = 0; i < 5; i++) {
    d = at(d, 0, 6);
  }
  d = dur(d, 0);
  assert.equal(d.asama, 'bitti');
  assert.equal(d.catlak[0], 0);
  assert.match(hatali(catlakAt(d, 1, 0)), /sürmüyor/);
});

// ---------------------------------------------------------------------------
// Sıra döngüsü
// ---------------------------------------------------------------------------

test('sıra döngüsü: 3 kişide 0, 1, 2, 0; yıkılma ve durma ikisi de sırayı geçirir', () => {
  let d = oyun(3);
  d = at(d, 0, 3);
  d = dur(d, 0);
  assert.equal(d.sira, 1);
  d = at(d, 1, 1); // yıkıldı
  assert.equal(d.sira, 2);
  d = at(d, 2, 4);
  d = dur(d, 2);
  assert.equal(d.sira, 0);
});

test('sıra döngüsü: 4 kişide tam tur', () => {
  let d = oyun(4);
  const sirayla = [];
  for (let i = 0; i < 8; i++) {
    sirayla.push(d.sira);
    d = at(d, d.sira, 2);
    d = dur(d, d.sira);
  }
  assert.deepEqual(sirayla, [0, 1, 2, 3, 0, 1, 2, 3]);
});

// ---------------------------------------------------------------------------
// Oyuncu ayrılınca
// ---------------------------------------------------------------------------

test('oyuncu ayrılınca: sırası olan çıkarsa kulesi gider, sıra sonrakine geçer', () => {
  let d = oyun(3);
  d = at(d, 0, 4);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.oyuncular.length, 2);
  assert.equal(d.asama, 'oyun');
  assert.equal(d.oyuncular[d.sira].id, pid(1));
  assert.deepEqual(d.kule, []);
  assert.equal(d.turToplam, 0);
  assert.equal(d.kasalar.length, 2);
  assert.equal(d.catlak.length, 2);
  assert.equal(d.sahip, pid(1));
});

test('oyuncu ayrılınca: sırası öndeki biri çıkarsa sıra aynı oyuncuda kalır', () => {
  let d = oyun(4);
  d = at(d, 0, 2);
  d = dur(d, 0);
  d = at(d, 1, 3);
  d = dur(d, 1);
  assert.equal(d.sira, 2);
  // sırasından önce oturan p0 çıkar: sıra yine p2'de
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.oyuncular[d.sira].id, pid(2));
  // kasalar doğru oyuncuyla gider
  assert.equal(d.kasalar[0], 3); // p1'in kasası
});

test('oyuncu ayrılınca: son sırada olan çıkarsa sıra başa döner', () => {
  let d = oyun(3);
  d = at(d, 0, 2);
  d = dur(d, 0);
  d = at(d, 1, 2);
  d = dur(d, 1);
  assert.equal(d.sira, 2);
  d = basarili(u(d, { tip: 'cikar', id: pid(2) }));
  assert.equal(d.sira, 0);
  assert.equal(d.oyuncular[d.sira].id, pid(0));
});

test('oyuncu ayrılınca: tek kişi kalırsa o kazanır; ev sahibi başkasını çıkarabilir', () => {
  let d = oyun(2);
  d = basarili(u(d, { tip: 'cikar', id: pid(0), hedef: pid(1) }));
  assert.equal(d.asama, 'bitti');
  assert.equal(d.sonuc.kazanan, 0);
  assert.equal(d.sonuc.neden, 'rakipsiz');
  assert.equal(d.oyuncular[0].id, pid(0));
  // bitince çıkılamaz
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(0) })), /çıkılamaz/);
});

test('oyuncu ayrılınca: çatlak ve hak dizileri de küçülür', () => {
  let d = oyun(3);
  d = basarili(catlakAt(d, 0, 2));
  d = basarili(u(d, { tip: 'cikar', id: pid(1) }));
  assert.equal(d.oyuncular.length, 2);
  assert.deepEqual(d.catlak, [0, 2]);
  assert.deepEqual(d.catlakHakki, [0, 1]);
  assert.equal(d.oyuncular[1].id, pid(2));
});

// ---------------------------------------------------------------------------
// Sırayı geç
// ---------------------------------------------------------------------------

test('sırayı geç: 60 saniye dolmadan reddedilir', () => {
  const d = oyun(3);
  assert.equal(sirayiGecebilirMi(d, T0 + SIRA_SURESI_MS - 1), false);
  assert.match(
    hatali(uygula(d, { tip: 'gec', id: pid(1) }, sabitZar(3), T0 + SIRA_SURESI_MS - 1)),
    /süre ver/
  );
  assert.equal(sirayaKalanMs(d, T0 + 10000), SIRA_SURESI_MS - 10000);
  assert.equal(sirayaKalanMs(lobi(2), T0), null);
});

test('sırayı geç: 60 saniye sonra başkası geçirir, kule gider', () => {
  let d = oyun(3);
  d = at(d, 0, 4, T0 + 1000);
  const zaman = T0 + 1000 + SIRA_SURESI_MS;
  assert.equal(sirayiGecebilirMi(d, zaman), true);
  assert.match(hatali(uygula(d, { tip: 'gec', id: pid(0) }, sabitZar(3), zaman)), /Kendi sıranı/);
  d = basarili(uygula(d, { tip: 'gec', id: pid(2) }, sabitZar(3), zaman));
  assert.equal(d.sira, 1);
  assert.deepEqual(d.kule, []);
  assert.equal(d.kasalar[0], 0);
  assert.equal(d.sonOlay.tip, 'gec');
  assert.equal(d.sonHamle, zaman);
  // yeni sıranın süresi baştan başlar
  assert.equal(sirayiGecebilirMi(d, zaman + 1000), false);
});

test('sırayı geç: geçirilen turda etkin çatlak kalkar, bekleyen çatlak sonraki tura kalır', () => {
  let d = oyun(3);
  d = basarili(catlakAt(d, 0, 2)); // p2 etkin çatlak
  d = basarili(catlakAt(d, 1, 0)); // p0 bekleyen çatlak
  d = at(d, 0, 3);
  d = dur(d, 0);
  assert.equal(d.catlak[0], 2);
  d = at(d, 1, 3);
  d = dur(d, 1);
  assert.equal(d.sira, 2);
  d = basarili(uygula(d, { tip: 'gec', id: pid(0) }, sabitZar(3), T0 + SIRA_SURESI_MS));
  assert.equal(d.catlak[2], 0);
  assert.equal(d.sira, 0);
});

test('sırayı geç: her zar atışı süreyi sıfırlar, çatlak taş sıfırlamaz', () => {
  let d = oyun(2);
  d = at(d, 0, 3, T0 + 50000);
  assert.equal(d.sonHamle, T0 + 50000);
  assert.equal(sirayiGecebilirMi(d, T0 + 60000), false);
  assert.equal(sirayiGecebilirMi(d, T0 + 110000), true);
  const e = oyun(2);
  const catlakli = basarili(catlakAt(e, 1, 0));
  assert.equal(catlakli.sonHamle, T0);
});

test('sırayı geç: oyun sürmüyorsa ve odada olmayan için reddedilir', () => {
  const d = oyun(2);
  assert.match(hatali(uygula(d, { tip: 'gec', id: 'yabanci' }, sabitZar(3), T0 + 99999)), /odada değilsin/);
  assert.match(hatali(uygula(lobi(2), { tip: 'gec', id: pid(1) }, sabitZar(3), T0 + 99999)), /sürmüyor/);
});

// ---------------------------------------------------------------------------
// Yönlendirici
// ---------------------------------------------------------------------------

function yonlendirLobi(oyunAdi, n) {
  let d = yonlendirYeniOda(pid(0), 'Ali', oyunAdi);
  for (let i = 1; i < n; i++) {
    d = basarili(yonlendir(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  return d;
}

function kimlikler(d) {
  return d.oyuncular.map((o) => o.id + ':' + o.ad);
}

test('yönlendirici: oyun listesi Risk Kulesi içerir, oda kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element', 'kule']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'kule').ad, 'Risk Kulesi');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'kule');
  assert.equal(d.oyun, 'kule');
  assert.equal(oyunId(d), 'kule');
});

test('yönlendirici: hareketler Risk Kulesi motoruna gider (zaman 8. parametre)', () => {
  let d = yonlendirLobi('kule', 2);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, sabitZar(3), undefined, undefined, undefined, undefined, T0));
  assert.equal(d.asama, 'oyun');
  assert.equal(d.sonHamle, T0);
  d = basarili(yonlendir(d, { tip: 'zarAt', id: pid(0) }, sabitZar(5), undefined, undefined, undefined, undefined, T0));
  assert.equal(d.kule[0].sayi, 5);
  const zaman = T0 + SIRA_SURESI_MS;
  d = basarili(yonlendir(d, { tip: 'gec', id: pid(1) }, sabitZar(5), undefined, undefined, undefined, undefined, zaman));
  assert.equal(d.sira, 1);
  // Başka oyunların hareketleri bu odada reddedilir
  assert.match(hatali(yonlendir(d, { tip: 'oyna', id: pid(0), kart: 1 })), /Bilinmeyen/);
});

test('yönlendirici: Risk Kulesi hareketleri öteki oyun odalarında reddedilir', () => {
  for (const oyunAdi of ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element']) {
    const d = yonlendirLobi(oyunAdi, 2);
    assert.equal(yonlendir(d, { tip: 'zarAt', id: pid(0) }).ok, false);
    assert.equal(yonlendir(d, { tip: 'catlak', id: pid(0), hedef: pid(1) }).ok, false);
    assert.equal(yonlendir(d, { tip: 'dur', id: pid(0) }).ok, false);
  }
});

test('oyun seçimi: Risk Kulesi seçilince oyuncular korunur (2, 3 ve 4 kişi); aşama kuralları', () => {
  for (const n of [2, 3, 4]) {
    const uno = yonlendirLobi('uno', n);
    const kimlik = kimlikler(uno);
    const k = basarili(yonlendir(uno, { tip: 'oyunSec', id: pid(0), oyun: 'kule' }));
    assert.equal(k.oyun, 'kule');
    assert.equal(k.asama, 'lobi');
    assert.deepEqual(kimlikler(k), kimlik);
    assert.equal(k.sahip, pid(0));
  }
  const k = yonlendirLobi('kule', 3);
  const basladi = basarili(yonlendir(k, { tip: 'baslat', id: pid(0) }));
  assert.equal(basladi.kasalar.length, 3);
  // Aynı oyunu seçmek ayarı bozmaz
  const ayarli = basarili(yonlendir(k, { tip: 'ayarla', id: pid(0), ayar: { hedef: 150 } }));
  assert.deepEqual(basarili(yonlendir(ayarli, { tip: 'oyunSec', id: pid(0), oyun: 'kule' })), ayarli);
  assert.match(hatali(yonlendir(k, { tip: 'oyunSec', id: pid(1), oyun: 'uno' })), /ev sahibi/);
  assert.match(hatali(yonlendir(basladi, { tip: 'oyunSec', id: pid(0), oyun: 'uno' })), /lobide/);
  // Risk Kulesi lobisinden öteki oyunlara geçiş kimseyi düşürmez
  const kimlik = kimlikler(k);
  for (const oyunAdi of ['uno', 'tanis', 'kelime', 'aynikafa', 'gorev']) {
    const yeni = basarili(yonlendir(k, { tip: 'oyunSec', id: pid(0), oyun: oyunAdi }));
    assert.equal(yeni.oyun, oyunAdi);
    assert.deepEqual(kimlikler(yeni), kimlik);
  }
  // Gizli Yol ve Taş Kağıt Makas 2 kişilik: 3 kişiyle seçilemez
  assert.equal(yonlendir(k, { tip: 'oyunSec', id: pid(0), oyun: 'gizliyol' }).ok, false);
  assert.equal(yonlendir(k, { tip: 'oyunSec', id: pid(0), oyun: 'element' }).ok, false);
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

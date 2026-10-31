// "Taş Kağıt Makas" motoru ve oyun yönlendirici testleri. Çalıştır: node test/element-test.js
import assert from 'node:assert/strict';
import {
  EL_BUYUKLUGU,
  durumuYenile,
  eskiKartiCevir,
  HEDEFLER,
  desteKur,
  elSirala,
  gorunum,
  kartBilgi,
  kilitliMi,
  lobiKur,
  oynayabilirMi,
  oyunAyristir,
  oyunKazananlari,
  secimHatasi,
  tamDeste,
  turuCoz,
  uygula,
  yeniOda,
} from '../element.js';
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

// Sabit tohumlu sahte rastgelelik (testler tekrarlanabilsin)
function tohumlu(tohum) {
  let x = tohum;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function u(d, eylem, rastgele = tohumlu(7)) {
  return uygula(d, eylem, rastgele);
}

function dondur(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    Object.values(x).forEach(dondur);
  }
  return x;
}

// n kişilik lobi (ilk oyuncu ev sahibi)
function lobi(n = 2) {
  let d = yeniOda(pid(0), 'Ali');
  for (let i = 1; i < n; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  return d;
}

// Başlamış oyun
function oyun(hedef = 30, tohum = 7) {
  let d = lobi(2);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: hedef } }));
  return basarili(u(d, { tip: 'baslat', id: pid(0) }, tohumlu(tohum)));
}

// Seçim aşamasındaki bir oyunun ellerini ve destelerini belirler (testler için)
function elKoy(d, el0, el1, deste0 = [], deste1 = []) {
  const yeni = structuredClone(d);
  yeni.eller = [el0.slice(), el1.slice()];
  yeni.desteler = [deste0.slice(), deste1.slice()];
  yeni.secimler = [null, null];
  return yeni;
}

// İki oyuncu da kilitler, sonuç durumu döner
function oyna(d, kartlar0, kartlar1) {
  let yeni = basarili(u(d, { tip: 'sec', id: pid(0), tur: d.tur, kartlar: kartlar0 }));
  yeni = basarili(u(yeni, { tip: 'sec', id: pid(1), tur: d.tur, kartlar: kartlar1 }));
  return yeni;
}

function sonGecmis(d) {
  return d.gecmis[d.gecmis.length - 1];
}

// Test için tam el: dolgu kartlarla 5'e tamamlanır (dolgu kartlar asla oynanmaz)
const DOLGU = ['tas-1', 'kagit-1', 'makas-1', 'tas-2', 'kagit-2'];

// ---------------------------------------------------------------------------
// Deste ve dağıtım
// ---------------------------------------------------------------------------

test('deste: 18 kart, her şekilden 1-5 ve 3 özel kart, hepsi ayrı', () => {
  const deste = tamDeste();
  assert.equal(deste.length, 18);
  assert.equal(new Set(deste).size, 18);
  for (const sekil of ['tas', 'kagit', 'makas']) {
    for (let deger = 1; deger <= 5; deger++) {
      assert.ok(deste.includes(sekil + '-' + deger), sekil + '-' + deger);
    }
  }
  for (const ozel of ['ters', 'kalkan', 'ikiye']) {
    assert.ok(deste.includes(ozel), ozel);
  }
  for (const kartId of deste) {
    assert.ok(kartBilgi(kartId), kartId);
  }
});

test('deste: karıştırılır ama kartlar aynı kalır, aynı tohum aynı sırayı verir', () => {
  const a = desteKur(tohumlu(1));
  const b = desteKur(tohumlu(1));
  const c = desteKur(tohumlu(2));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.deepEqual(a.slice().sort(), tamDeste().sort());
});

test('kartBilgi: geçersiz kartları tanımaz', () => {
  assert.equal(kartBilgi('tas-6'), null);
  assert.equal(kartBilgi('tas-0'), null);
  assert.equal(kartBilgi('hava-3'), null);
  assert.equal(kartBilgi('tas'), null);
  assert.equal(kartBilgi(5), null);
  assert.deepEqual(kartBilgi('kagit-4'), { tip: 'sekil', sekil: 'kagit', deger: 4 });
  assert.deepEqual(kartBilgi('kalkan'), { tip: 'kalkan' });
});

test('dağıtım: herkes 5 kart çeker, kalan 13 kart destede, eller ayrı destelerden', () => {
  const d = oyun();
  assert.equal(d.asama, 'secim');
  assert.equal(d.tur, 0);
  for (let i = 0; i < 2; i++) {
    assert.equal(d.eller[i].length, EL_BUYUKLUGU);
    assert.equal(d.desteler[i].length, 13);
    assert.deepEqual([...d.eller[i], ...d.desteler[i]].sort(), tamDeste().sort());
    assert.deepEqual(d.atilanlar[i], []);
  }
  assert.deepEqual(d.secimler, [null, null]);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0]);
});

test('dağıtım: iki oyuncunun destesi ayrı karıştırılır', () => {
  const d = oyun();
  assert.notDeepEqual([...d.eller[0], ...d.desteler[0]], [...d.eller[1], ...d.desteler[1]]);
});

test('elSirala: önce şekiller, sonra özel kartlar', () => {
  assert.deepEqual(elSirala(['kalkan', 'makas-2', 'ters', 'tas-5', 'kagit-1', 'tas-1']), [
    'tas-1',
    'tas-5',
    'kagit-1',
    'makas-2',
    'ters',
    'kalkan',
  ]);
});

// ---------------------------------------------------------------------------
// Yenme döngüsü
// ---------------------------------------------------------------------------

function cozKartlar(a, b) {
  return turuCoz(oyunAyristir(a), oyunAyristir(b));
}

test('döngü: kağıt taşı, taş makası, makas kağıdı yener (değerden bağımsız)', () => {
  let s = cozKartlar(['kagit-1'], ['tas-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  s = cozKartlar(['tas-1'], ['makas-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  s = cozKartlar(['makas-2'], ['kagit-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 7);
});

test('döngü: ters yönde de aynı sonuç (kazanan ikinci oyuncu)', () => {
  assert.equal(cozKartlar(['tas-5'], ['kagit-1']).kazanan, 1);
  assert.equal(cozKartlar(['makas-5'], ['tas-1']).kazanan, 1);
  assert.equal(cozKartlar(['kagit-5'], ['makas-1']).kazanan, 1);
});

test('aynı şekil: büyük değer kazanır, puan iki kartın toplamı', () => {
  let s = cozKartlar(['tas-4'], ['tas-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  assert.equal(s.neden, 'deger');
  s = cozKartlar(['kagit-1'], ['kagit-5']);
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 6);
});

test('aynı şekil aynı değer: berabere, puan yok', () => {
  const s = cozKartlar(['makas-3'], ['makas-3']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'berabere');
});

// ---------------------------------------------------------------------------
// Yeni kurallar (Taş Kağıt Makas) ve eski anahtarlar
// ---------------------------------------------------------------------------

test('döngü: kağıt taşı sarar, taş makası kırar, makas kağıdı keser (üç kural, her iki yönde)', () => {
  const kurallar = [
    ['kagit', 'tas'],
    ['tas', 'makas'],
    ['makas', 'kagit'],
  ];
  for (const [yenen, yenilen] of kurallar) {
    assert.equal(cozKartlar([yenen + '-1'], [yenilen + '-5']).kazanan, 0, yenen + ' > ' + yenilen);
    assert.equal(cozKartlar([yenilen + '-5'], [yenen + '-1']).kazanan, 1, yenen + ' > ' + yenilen + ' (ters yön)');
  }
});

test('aynı tür büyük değer: kağıt-5 kağıt-2 yi yener, beraberlikte puan yok', () => {
  const s = cozKartlar(['kagit-5'], ['kagit-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 7);
  assert.equal(cozKartlar(['tas-3'], ['tas-3']).kazanan, -1);
});

test('özel kartlar: Ters Rüzgâr taşı kağıda yendirir, Kalkan puanı iptal eder, İkiye Katla puanı katlar', () => {
  const ters = cozKartlar(['tas-2', 'ters'], ['kagit-3']);
  assert.equal(ters.kazanan, 0);
  assert.equal(ters.tersEtkili, true);
  assert.equal(cozKartlar(['kalkan'], ['makas-5']).puan, 0);
  const iki = cozKartlar(['makas-2', 'ikiye'], ['kagit-3']);
  assert.equal(iki.kazanan, 0);
  assert.equal(iki.puan, 10);
});

test('eski anahtarlar: ates/su/toprak kartları taş/kağıt/makas olur', () => {
  assert.equal(eskiKartiCevir('ates-3'), 'tas-3');
  assert.equal(eskiKartiCevir('su-1'), 'kagit-1');
  assert.equal(eskiKartiCevir('toprak-5'), 'makas-5');
  assert.equal(eskiKartiCevir('ters'), 'ters');
  assert.equal(eskiKartiCevir('tas-2'), 'tas-2');
});

test('eski anahtarlı oyun ortasındaki oda çökmez: durum çevrilir, oyun sürer, girdi değişmez', () => {
  let d = oyun();
  d = elKoy(d, ['su-4', 'ates-1', 'ters', 'kalkan', 'ikiye'], ['toprak-2', 'ates-5', 'su-1', 'ters', 'kalkan']);
  const eski = structuredClone(d);
  eski.gecmis = [{ tur: 0, kartlar: [['ates-2'], ['su-3']], kazanan: 1, puan: 5, neden: 'element', tersEtkili: false, ikiyeEtkili: false }];
  dondur(eski);
  const yeni = durumuYenile(eski);
  assert.deepEqual(yeni.eller[0], ['kagit-4', 'tas-1', 'ters', 'kalkan', 'ikiye']);
  assert.deepEqual(yeni.gecmis[0].kartlar, [['tas-2'], ['kagit-3']]);
  assert.equal(yeni.gecmis[0].neden, 'sekil');
  assert.equal(eski.eller[0][0], 'su-4'); // girdi aynen kaldı
  // eski anahtarlarla seçim yapılabilir ve tur sonuçlanır: su (kağıt) ateşi (taş) yener
  const sonra = oyna(structuredClone(eski), ['su-4'], ['ates-5']);
  assert.equal(sonGecmis(sonra).kazanan, 0);
  assert.equal(sonGecmis(sonra).puan, 9);
  // eski odada gorunum yeni anahtarlarla çalışır
  assert.ok(gorunum(yeni, 0).benim.el.includes('kagit-4'));
  // yeni durumda durumuYenile aynı nesneyi döner
  assert.equal(durumuYenile(yeni), yeni);
});

// ---------------------------------------------------------------------------
// Özel kartlar ve kombinasyonlar
// ---------------------------------------------------------------------------

test('Ters Rüzgâr: yenme döngüsü tersine döner (taş kağıdı yener)', () => {
  let s = cozKartlar(['tas-1', 'ters'], ['kagit-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  assert.equal(s.tersEtkili, true);
  // makas taşı yener (normalde taş makası yener)
  s = cozKartlar(['tas-5'], ['makas-1', 'ters']);
  assert.equal(s.kazanan, 1);
  // kağıt makası yener (normalde makas kağıdı yener)
  s = cozKartlar(['kagit-2', 'ters'], ['makas-4']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
});

test('Ters Rüzgâr: normalde kazanan kartı olan oyuncu kaybeder', () => {
  const s = cozKartlar(['kagit-5', 'ters'], ['tas-1']);
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 6);
});

test('Ters Rüzgâr: aynı şekilde etkisizdir, büyük değer kazanır', () => {
  const s = cozKartlar(['kagit-4', 'ters'], ['kagit-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.neden, 'deger');
  assert.equal(s.tersEtkili, false);
});

test('iki Ters Rüzgâr birbirini götürür (normal kural)', () => {
  const s = cozKartlar(['kagit-1', 'ters'], ['tas-5', 'ters']);
  assert.equal(s.kazanan, 0); // normal: kağıt taşı yener
  assert.equal(s.puan, 6);
  assert.equal(s.tersEtkili, false);
});

test('Kalkan: tek başına, kimse puan almaz', () => {
  let s = cozKartlar(['kalkan'], ['tas-5']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'kalkan');
  s = cozKartlar(['kagit-5', 'ikiye'], ['kalkan']);
  assert.equal(s.puan, 0);
  s = cozKartlar(['kalkan'], ['kalkan']);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'kalkan');
});

test('Kalkan\'a karşı Ters Rüzgâr: Kalkan geçerli, puan yok', () => {
  const s = cozKartlar(['kalkan'], ['tas-1', 'ters']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'kalkan');
  assert.equal(s.tersEtkili, false);
});

test('İkiye Katla: kazanırsa puan iki katı', () => {
  const s = cozKartlar(['kagit-3', 'ikiye'], ['tas-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 10); // (3 + 2) x 2
  assert.equal(s.ikiyeEtkili, true);
});

test('İkiye Katla: kaybederse puan 0, rakibin puanı da iki katlanmaz', () => {
  const s = cozKartlar(['tas-5', 'ikiye'], ['kagit-1']);
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 6); // rakip (5 + 1), katlama yok
  assert.equal(s.ikiyeEtkili, false);
});

test('İkiye Katla: aynı şekilde büyük değerle kazanırsa iki katı', () => {
  const s = cozKartlar(['makas-5', 'ikiye'], ['makas-1']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 12);
});

test('İkiye Katla berabere kalırsa puan yok', () => {
  const s = cozKartlar(['makas-3', 'ikiye'], ['makas-3']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
});

test('İkiye Katla + Ters Rüzgâr: biri her birini oynayabilir, katlama etkili', () => {
  // iki oyuncu: biri İkiye Katla, diğeri Ters Rüzgâr
  // 0: kagit-4 + İkiye Katla, 1: makas-1 + Ters Rüzgâr -> ters: kağıt makası yener, kazanan 0, (4+1) x 2
  let s = cozKartlar(['kagit-4', 'ikiye'], ['makas-1', 'ters']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 10);
  assert.equal(s.tersEtkili, true);
  // ters Rüzgâr oynayan, İkiye Katla oynayana karşı kaybeder: katlama olmaz
  s = cozKartlar(['tas-4', 'ikiye'], ['makas-1', 'ters']);
  // ters: makas taşı yener, kazanan 1, katlama yok
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 5);
  assert.equal(s.ikiyeEtkili, false);
});

test('oynayacak kartı olmayan oyuncuya karşı puan yok', () => {
  const s = turuCoz(oyunAyristir(['kagit-5']), oyunAyristir([]));
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'rakipYok');
});

// ---------------------------------------------------------------------------
// Seçim doğrulama
// ---------------------------------------------------------------------------

const ELIM = ['tas-3', 'kagit-2', 'makas-5', 'ters', 'kalkan'];

test('seçim: tek şekil, Kalkan, şekil + Ters, şekil + İkiye Katla geçerli', () => {
  assert.equal(secimHatasi(ELIM, ['tas-3']), null);
  assert.equal(secimHatasi(ELIM, ['kalkan']), null);
  assert.equal(secimHatasi(ELIM, ['ters', 'kagit-2']), null);
  assert.equal(secimHatasi([...ELIM, 'ikiye'], ['makas-5', 'ikiye']), null);
});

test('seçim: iki özel kart geçersiz', () => {
  assert.match(secimHatasi([...ELIM, 'ikiye'], ['ters', 'ikiye']), /en fazla bir özel/);
  assert.match(secimHatasi([...ELIM, 'ikiye'], ['ters', 'kalkan']), /en fazla bir özel/);
});

test('seçim: Ters Rüzgâr ve İkiye Katla tek başına geçersiz', () => {
  assert.match(secimHatasi(ELIM, ['ters']), /tek başına/);
  assert.match(secimHatasi([...ELIM, 'ikiye'], ['ikiye']), /tek başına/);
});

test('seçim: Kalkan başka kartla oynanmaz', () => {
  assert.match(secimHatasi(ELIM, ['kalkan', 'tas-3']), /Kalkan/);
});

test('seçim: iki şekil, üç kart, aynı kart iki kez ve boş seçim geçersiz', () => {
  assert.match(secimHatasi(ELIM, ['tas-3', 'kagit-2']), /şekil kartı birlikte/);
  assert.match(secimHatasi(ELIM, ['tas-3', 'kagit-2', 'ters']), /En fazla iki/);
  assert.match(secimHatasi(ELIM, ['tas-3', 'tas-3']), /iki kez/);
  assert.match(secimHatasi(ELIM, []), /Önce bir kart/);
  assert.match(secimHatasi(ELIM, undefined), /Önce bir kart/);
});

test('seçim: elde olmayan ve bilinmeyen kart geçersiz', () => {
  assert.match(secimHatasi(ELIM, ['kagit-5']), /elinde yok/);
  assert.match(secimHatasi(ELIM, ['tas-3', 'ikiye']), /elinde yok/);
  assert.match(secimHatasi(ELIM, ['hava-9']), /Bilinmeyen/);
});

test('oynayabilirMi: yalnız Ters ve İkiye Katla kaldıysa oynanamaz', () => {
  assert.equal(oynayabilirMi(['ters', 'ikiye']), false);
  assert.equal(oynayabilirMi([]), false);
  assert.equal(oynayabilirMi(['ters', 'kalkan']), true);
  assert.equal(oynayabilirMi(['ikiye', 'kagit-1']), true);
});

// ---------------------------------------------------------------------------
// Tur akışı (motor üzerinden)
// ---------------------------------------------------------------------------

test('seç: geçersiz oyunlar motordan da reddedilir, durum değişmez', () => {
  let d = oyun();
  d = elKoy(d, ['tas-3', 'ters', 'ikiye', 'kalkan', 'kagit-2'], ['kagit-1', 'kagit-2', 'kagit-3', 'kagit-4', 'kagit-5']);
  dondur(d);
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ters', 'ikiye'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ters'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ikiye'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['makas-5'] })); // elde yok
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['kalkan', 'kagit-2'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: [] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0 }));
  hatali(u(d, { tip: 'sec', id: pid(9), tur: 0, kartlar: ['tas-3'] })); // odada değil
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 5, kartlar: ['tas-3'] })); // eski tur
});

test('seç: kilitlenen seçim değişmez, rakip kilitleyince kartlar açılır', () => {
  let d = elKoy(oyun(), ['kagit-3', ...DOLGU.slice(0, 4)], ['tas-2', ...DOLGU.slice(0, 4)], ['makas-5'], ['makas-4']);
  d = basarili(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['kagit-3'] }));
  assert.equal(d.asama, 'secim');
  assert.equal(kilitliMi(d, 0), true);
  assert.equal(kilitliMi(d, 1), false);
  assert.match(hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['kagit-2'] })), /Zaten seçtin/);
  d = basarili(u(d, { tip: 'sec', id: pid(1), tur: 0, kartlar: ['tas-2'] }));
  assert.equal(d.asama, 'acik');
  const g = sonGecmis(d);
  assert.deepEqual(g.kartlar, [['kagit-3'], ['tas-2']]);
  assert.equal(g.kazanan, 0);
  assert.equal(g.puan, 5);
  assert.equal(d.oyuncular[0].puan, 5);
  assert.equal(d.oyuncular[1].puan, 0);
});

test('puan: kazanan kendi değeri + rakip değeri kadar alır, İkiye Katla ile iki katı', () => {
  let d = elKoy(oyun(), ['kagit-4', 'ikiye', ...DOLGU.slice(0, 3)], ['tas-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['kagit-4', 'ikiye'], ['tas-3']);
  assert.equal(d.oyuncular[0].puan, 14); // (4 + 3) x 2
  assert.equal(sonGecmis(d).ikiyeEtkili, true);
});

test('puan: İkiye Katla kaybederse kazanan normal puan alır, İkiye Katla oynayan 0', () => {
  let d = elKoy(oyun(), ['tas-4', 'ikiye', ...DOLGU.slice(0, 3)], ['kagit-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['tas-4', 'ikiye'], ['kagit-3']);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.equal(d.oyuncular[1].puan, 7);
});

test('Kalkan turunda puan yok ve iki kart da atılır', () => {
  let d = elKoy(oyun(), ['kalkan', ...DOLGU.slice(0, 4)], ['tas-5', 'kagit-5', 'makas-5', ...DOLGU.slice(0, 2)]);
  d = oyna(d, ['kalkan'], ['tas-5']);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0]);
  assert.deepEqual(d.atilanlar[0], ['kalkan']);
  assert.deepEqual(d.atilanlar[1], ['tas-5']);
  assert.equal(d.eller[0].includes('kalkan'), false);
  assert.equal(d.eller[1].includes('tas-5'), false);
  assert.equal(sonGecmis(d).neden, 'kalkan');
});

test('oynanan kartlar atılır, iki kartlık oyunda ikisi de atılır', () => {
  let d = elKoy(oyun(), ['kagit-4', 'ters', ...DOLGU.slice(0, 3)], ['tas-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['ters', 'kagit-4'], ['tas-3']);
  assert.deepEqual(d.atilanlar[0].slice().sort(), ['kagit-4', 'ters']);
  assert.equal(d.eller[0].includes('kagit-4'), false);
  assert.equal(d.eller[0].includes('ters'), false);
});

test('el tamamlama: tur sonunda 5\'e tamamlanır, deste bitmişse tamamlanmaz', () => {
  // 0'ın destesi dolu, 1'in destesi tek kartlık
  let d = elKoy(
    oyun(),
    ['kagit-4', 'ters', ...DOLGU.slice(0, 3)],
    ['tas-3', ...DOLGU.slice(0, 4)],
    ['makas-3', 'makas-4', 'makas-5'],
    ['kagit-5']
  );
  d = oyna(d, ['ters', 'kagit-4'], ['tas-3']);
  // 0 iki kart oynadı: elde 3, destede 3 -> 5'e tamamlanır (iki kart çeker)
  assert.equal(d.eller[0].length, 5);
  assert.deepEqual(d.desteler[0], ['makas-5']);
  // 1 bir kart oynadı: elde 4, destede 1 -> 5
  assert.equal(d.eller[1].length, 5);
  assert.deepEqual(d.desteler[1], []);
});

test('el tamamlama: deste bitmişse el küçülür', () => {
  let d = elKoy(oyun(), ['kagit-1', ...DOLGU.slice(0, 4)], ['tas-1', ...DOLGU.slice(0, 4)]); // desteler boş
  d = oyna(d, ['kagit-1'], ['tas-1']);
  assert.equal(d.eller[0].length, 4);
  assert.equal(d.eller[1].length, 4);
});

test('sonraki: turu ilerletir, seçimler boşalır, geçmişe eklenir', () => {
  let d = elKoy(oyun(), ['kagit-1', ...DOLGU.slice(0, 4)], ['tas-1', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['kagit-1'], ['tas-1']);
  assert.equal(d.gecmis.length, 1);
  assert.match(hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['tas-1'] })), /seçilmez/);
  d = basarili(u(d, { tip: 'sonraki', id: pid(1), tur: 0 })); // ev sahibi olmayan da basabilir
  assert.equal(d.asama, 'secim');
  assert.equal(d.tur, 1);
  assert.deepEqual(d.secimler, [null, null]);
  // ikinci "sonraki" (aynı tur için) zararsız
  const ikinci = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(ikinci.tur, 1);
});

test('sonraki: seçim aşamasında hata verir', () => {
  const d = oyun();
  hatali(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
});

// ---------------------------------------------------------------------------
// Oyun sonu
// ---------------------------------------------------------------------------

test('bitiş: hedef puana ulaşınca son tur açık kalır, sonraki ile bitti olur', () => {
  let d = oyun(20);
  d.oyuncular[0].puan = 16;
  d = elKoy(d, ['kagit-4', 'ikiye', ...DOLGU.slice(0, 3)], ['tas-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['kagit-4', 'ikiye'], ['tas-3']); // +14 -> 30
  assert.equal(d.asama, 'acik');
  assert.equal(d.bitisNedeni, 'hedef');
  d = basarili(u(d, { tip: 'sonraki', id: pid(1), tur: d.tur }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(oyunKazananlari(d), [0]);
  // bitti aşamasında tekrar sonraki zararsız
  assert.equal(basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 })).asama, 'bitti');
});

test('bitiş: hedefin altında oyun sürer', () => {
  let d = oyun(30);
  d = elKoy(d, ['kagit-4', ...DOLGU.slice(0, 4)], ['tas-3', ...DOLGU.slice(0, 4)], ['kagit-5'], ['kagit-5']);
  d = oyna(d, ['kagit-4'], ['tas-3']);
  assert.equal(d.bitisNedeni, null);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'secim');
});

test('bitiş: hedef ayarına göre (20 / 30 / 40)', () => {
  assert.deepEqual(HEDEFLER, [20, 30, 40]);
  for (const hedef of HEDEFLER) {
    let d = oyun(hedef);
    d.oyuncular[1].puan = hedef - 5;
    d = elKoy(d, ['tas-1', ...DOLGU.slice(0, 4)], ['kagit-3', ...DOLGU.slice(0, 4)]);
    d = oyna(d, ['tas-1'], ['kagit-3']); // 1: +4 -> hedef - 1
    assert.equal(d.bitisNedeni, null, 'hedef-1: ' + hedef);
    d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
    d = elKoy(d, ['tas-1', ...DOLGU.slice(0, 4)], ['kagit-1', ...DOLGU.slice(0, 4)]);
    d = oyna(d, ['tas-1'], ['kagit-1']); // 1: +2 -> hedef + 1
    assert.equal(d.bitisNedeni, 'hedef', 'hedef: ' + hedef);
  }
});

test('bitiş: eller boşalınca biter, çok puanlı kazanır', () => {
  let d = oyun(40);
  d.oyuncular[0].puan = 3;
  d.oyuncular[1].puan = 5;
  d = elKoy(d, ['kagit-1'], ['kagit-1']); // son kartlar, desteler boş
  d = oyna(d, ['kagit-1'], ['kagit-1']); // berabere
  assert.equal(d.bitisNedeni, 'eller');
  assert.equal(d.eller[0].length, 0);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(oyunKazananlari(d), [1]);
});

test('bitiş: eller boşalınca puanlar eşitse berabere', () => {
  let d = oyun(40);
  d = elKoy(d, ['kagit-1'], ['kagit-1']);
  d = oyna(d, ['kagit-1'], ['kagit-1']);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(oyunKazananlari(d), [0, 1]);
});

test('bitiş: yalnız Ters Rüzgâr ve İkiye Katla kalan oyuncu oynayamaz, oyun diğerine göre sürer', () => {
  let d = oyun(40);
  d = elKoy(d, ['kagit-1'], ['tas-1', 'kagit-2']);
  d.eller[0].push('ters', 'ikiye');
  d = oyna(d, ['kagit-1'], ['tas-1']);
  // 0'ın elinde yalnız ters ve ikiye kaldı, 1'in elinde kagit-2 var
  assert.equal(d.bitisNedeni, null);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'secim');
  assert.equal(kilitliMi(d, 0), true, '0 kendiliğinden kilitli');
  assert.deepEqual(d.secimler[0].kartlar, []);
  d = basarili(u(d, { tip: 'sec', id: pid(1), tur: 1, kartlar: ['kagit-2'] }));
  assert.equal(d.asama, 'acik');
  assert.equal(sonGecmis(d).neden, 'rakipYok');
  assert.equal(sonGecmis(d).puan, 0);
  // artık ikisi de oynayamaz: oyun biter
  assert.equal(d.bitisNedeni, 'eller');
});

test('tam oyun: baştan sona oynanır ve biter (en fazla 18 tur)', () => {
  const rastgele = tohumlu(99);
  let d = oyun(40, 99);
  let tur = 0;
  while (d.asama !== 'bitti') {
    assert.ok(tur < 40, 'oyun bitmiyor');
    if (d.asama === 'secim') {
      for (let i = 0; i < 2; i++) {
        if (!d.secimler[i]) {
          const oynanabilir = d.eller[i].filter((kartId) => {
            const bilgi = kartBilgi(kartId);
            return bilgi.tip === 'sekil' || bilgi.tip === 'kalkan';
          });
          const secim = oynanabilir[Math.floor(rastgele() * oynanabilir.length)];
          d = basarili(u(d, { tip: 'sec', id: pid(i), tur: d.tur, kartlar: [secim] }));
        }
      }
    } else {
      d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: d.tur }));
    }
    tur += 1;
  }
  assert.ok(d.gecmis.length >= 1 && d.gecmis.length <= 18);
  // tüm kartlar ya atıldı ya elde/destede, kayıp yok
  for (let i = 0; i < 2; i++) {
    const hepsi = [...d.atilanlar[i], ...d.eller[i], ...d.desteler[i]];
    assert.deepEqual(hepsi.sort(), tamDeste().sort());
  }
});

// ---------------------------------------------------------------------------
// Gizlilik
// ---------------------------------------------------------------------------

test('gizlilik: rakibin eli ve kilitli seçimi açılıştan önce gorunum çıktısında yok', () => {
  let d = elKoy(oyun(), ['kagit-3', ...DOLGU.slice(0, 4)], ['makas-5', 'ters', 'kalkan', 'ikiye', 'tas-5']);
  d = basarili(u(d, { tip: 'sec', id: pid(1), tur: 0, kartlar: ['makas-5', 'ters'] }));
  const g = gorunum(d, 0);
  // rakip: yalnız sayılar ve "seçti"
  assert.equal(g.rakip.kilitli, true);
  assert.equal(g.rakip.secim, null);
  assert.equal(g.rakip.elSayisi, 5);
  const metin = JSON.stringify(g);
  for (const gizli of ['makas-5', 'kalkan', 'ikiye', 'tas-5']) {
    assert.equal(metin.includes('"' + gizli + '"'), false, gizli + ' sızdı');
  }
  assert.equal(metin.includes('"ters"'), false, 'ters sızdı');
  // kendi elim görünür
  assert.deepEqual(g.benim.el, elSirala(['kagit-3', ...DOLGU.slice(0, 4)]));
  assert.equal(g.benim.kilitli, false);
});

test('gizlilik: kendi kilitli seçimimi görürüm, rakip seçmediyse "kilitli" değil', () => {
  let d = elKoy(oyun(), ['kagit-3', ...DOLGU.slice(0, 4)], ['makas-5', ...DOLGU.slice(0, 4)]);
  d = basarili(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['kagit-3'] }));
  const benim = gorunum(d, 0);
  assert.deepEqual(benim.benim.secim, ['kagit-3']);
  assert.equal(benim.benim.kilitli, true);
  assert.equal(benim.rakip.kilitli, false);
  const rakipGozuyle = gorunum(d, 1);
  assert.equal(rakipGozuyle.rakip.kilitli, true);
  assert.equal(rakipGozuyle.rakip.secim, null);
  assert.equal(JSON.stringify(rakipGozuyle).includes('kagit-3'), false);
});

test('gizlilik: açılıştan sonra iki seçim de görünür', () => {
  let d = elKoy(oyun(), ['kagit-3', ...DOLGU.slice(0, 4)], ['makas-5', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['kagit-3'], ['makas-5']);
  const g = gorunum(d, 0);
  assert.deepEqual(g.rakip.secim, ['makas-5']);
  assert.deepEqual(g.benim.secim, ['kagit-3']);
});

test('gizlilik: iki oyuncunun bakışı birbirinin elini içermez', () => {
  const d = oyun();
  const g0 = JSON.stringify(gorunum(d, 0));
  for (const kartId of d.eller[1]) {
    if (!d.eller[0].includes(kartId)) {
      assert.equal(g0.includes('"' + kartId + '"'), false);
    }
  }
});

// ---------------------------------------------------------------------------
// Lobi, ayar, katılma
// ---------------------------------------------------------------------------

test('yeni oda: element oyunu, lobi, varsayılan hedef 30', () => {
  const d = yeniOda(pid(0), 'Ali');
  assert.equal(d.oyun, 'element');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, pid(0));
  assert.equal(d.ayar.hedef, 30);
  assert.equal(d.oyuncular.length, 1);
});

test('katılma: en fazla 2 kişi, aynı ad benzersizleşir, oyun başlayınca katılınmaz', () => {
  let d = yeniOda(pid(0), 'Ali');
  d = basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Ali' }));
  assert.equal(d.oyuncular.length, 2);
  assert.notEqual(d.oyuncular[0].ad, d.oyuncular[1].ad);
  assert.match(hatali(u(d, { tip: 'katil', id: pid(2), ad: 'Can' })), /dolu/);
  // aynı kişi tekrar katılırsa zararsız
  assert.equal(basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Ali' })).oyuncular.length, 2);
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.match(hatali(u(d, { tip: 'katil', id: pid(2), ad: 'Can' })), /başladı|dolu/);
});

test('ayar: yalnız ev sahibi ve yalnız lobide, geçersiz hedef reddedilir', () => {
  let d = lobi(2);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { hedef: 20 } })), /ev sahibi/);
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 25 } }));
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 40 } }));
  assert.equal(d.ayar.hedef, 40);
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 20 } })), /başlamadan/);
});

test('başlat: yalnız ev sahibi, tam 2 kişiyle', () => {
  assert.match(hatali(u(lobi(1), { tip: 'baslat', id: pid(0) })), /2 kişi/);
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
});

test('çıkarma: ev sahibi çıkarır, ev sahibi çıkarsa sahiplik geçer, oyun sürerken çıkılmaz', () => {
  let d = lobi(2);
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(0) })), /ev sahibi/);
  d = basarili(u(d, { tip: 'cikar', id: pid(0), hedef: pid(1) }));
  assert.equal(d.oyuncular.length, 1);
  d = lobi(2);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  d = oyun();
  hatali(u(d, { tip: 'cikar', id: pid(1) }));
});

test('tekrar oyna ve lobiye dön: yalnız ev sahibi, puanlar ve eller sıfırlanır', () => {
  let d = oyun(20);
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  d.oyuncular[0].puan = 25;
  d.asama = 'bitti';
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  const yeni = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, tohumlu(3)));
  assert.equal(yeni.asama, 'secim');
  assert.equal(yeni.tur, 0);
  assert.deepEqual(yeni.oyuncular.map((o) => o.puan), [0, 0]);
  assert.deepEqual(yeni.gecmis, []);
  assert.equal(yeni.eller[0].length, 5);
  assert.equal(yeni.bitisNedeni, null);

  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  const lobiyeDon = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiyeDon.asama, 'lobi');
  assert.deepEqual(lobiyeDon.oyuncular.map((o) => o.puan), [0, 0]);
  assert.equal(lobiyeDon.ayar.hedef, 20); // ayarlar kalır
  assert.match(hatali(u(lobiyeDon, { tip: 'yeniOyun', id: pid(0) })), /lobide/);
});

test('girdi durumu değişmez (dondurulmuş durumla çalışır)', () => {
  const d = dondur(oyun());
  const kart = d.eller[0].find((kartId) => kartBilgi(kartId).tip === 'sekil');
  const sonuc = u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: [kart] });
  assert.equal(sonuc.ok, true);
  assert.equal(d.secimler[0], null);
});

test('bilinmeyen hareket reddedilir', () => {
  hatali(u(lobi(2), { tip: 'uç' }));
  hatali(u(lobi(2), undefined));
});

test('lobiKur: verilen oyuncularla boş lobi', () => {
  const d = lobiKur([{ id: 'a', ad: 'A' }, { id: 'b', ad: 'B' }], 'b');
  assert.equal(d.oyun, 'element');
  assert.equal(d.sahip, 'b');
  assert.deepEqual(d.oyuncular, [{ id: 'a', ad: 'A', puan: 0 }, { id: 'b', ad: 'B', puan: 0 }]);
});

// ---------------------------------------------------------------------------
// Yönlendirici
// ---------------------------------------------------------------------------

function yonlendirLobi(oyunId_, n) {
  let d = yonlendirYeniOda(pid(0), 'Ali', oyunId_);
  for (let i = 1; i < n; i++) {
    d = basarili(yonlendir(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  return d;
}

function kimlikler(d) {
  return d.oyuncular.map((o) => o.id + ':' + o.ad);
}

test('yönlendirici: oyun listesi Taş Kağıt Makas içerir, oda kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element', 'kule']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'element').ad, 'Taş Kağıt Makas');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'element');
  assert.equal(d.oyun, 'element');
  assert.equal(oyunId(d), 'element');
  assert.equal(d.asama, 'lobi');
});

test('yönlendirici: hareketler Taş Kağıt Makas motoruna gider', () => {
  let d = yonlendirLobi('element', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 20 } }));
  assert.equal(d.ayar.hedef, 20);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.asama, 'secim');
  const kart = d.eller[0].find((kartId) => kartBilgi(kartId).tip === 'sekil');
  d = basarili(yonlendir(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: [kart] }));
  assert.equal(kilitliMi(d, 0), true);
});

test('yönlendirici: diğer oyunlardan Taş Kağıt Makas seçilir, oyuncular korunur', () => {
  for (const baslangic of ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev']) {
    let d = yonlendirLobi(baslangic, 2);
    const once = kimlikler(d);
    d = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'element' }));
    assert.equal(d.oyun, 'element', baslangic);
    assert.deepEqual(kimlikler(d), once);
    assert.equal(d.sahip, pid(0));
    assert.equal(d.asama, 'lobi');
  }
});

test('yönlendirici: odada 2 den fazla kişi varsa Taş Kağıt Makas seçilemez', () => {
  const d = yonlendirLobi('uno', 3);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'element' })), /2 kişilik/);
  assert.equal(d.oyun, 'uno');
});

test('yönlendirici: Taş Kağıt Makas lobisinden başka oyunlara geçilir, yalnız ev sahibi seçer', () => {
  let d = yonlendirLobi('element', 2);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'uno' })), /ev sahibi/);
  for (const hedef of ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev']) {
    const yeni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: hedef }));
    assert.equal(oyunId(yeni), hedef);
    assert.deepEqual(kimlikler(yeni), kimlikler(d));
  }
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }));
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' })), /lobide/);
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

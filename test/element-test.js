// "Element Düellosu" motoru ve oyun yönlendirici testleri. Çalıştır: node test/element-test.js
import assert from 'node:assert/strict';
import {
  EL_BUYUKLUGU,
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
const DOLGU = ['ates-1', 'su-1', 'toprak-1', 'ates-2', 'su-2'];

// ---------------------------------------------------------------------------
// Deste ve dağıtım
// ---------------------------------------------------------------------------

test('deste: 18 kart, her elementten 1-5 ve 3 özel kart, hepsi ayrı', () => {
  const deste = tamDeste();
  assert.equal(deste.length, 18);
  assert.equal(new Set(deste).size, 18);
  for (const element of ['ates', 'su', 'toprak']) {
    for (let deger = 1; deger <= 5; deger++) {
      assert.ok(deste.includes(element + '-' + deger), element + '-' + deger);
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
  assert.equal(kartBilgi('ates-6'), null);
  assert.equal(kartBilgi('ates-0'), null);
  assert.equal(kartBilgi('hava-3'), null);
  assert.equal(kartBilgi('ates'), null);
  assert.equal(kartBilgi(5), null);
  assert.deepEqual(kartBilgi('su-4'), { tip: 'element', element: 'su', deger: 4 });
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

test('elSirala: önce elementler, sonra özel kartlar', () => {
  assert.deepEqual(elSirala(['kalkan', 'toprak-2', 'ters', 'ates-5', 'su-1', 'ates-1']), [
    'ates-1',
    'ates-5',
    'su-1',
    'toprak-2',
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

test('döngü: su ateşi, ateş toprağı, toprak suyu yener (değerden bağımsız)', () => {
  let s = cozKartlar(['su-1'], ['ates-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  s = cozKartlar(['ates-1'], ['toprak-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  s = cozKartlar(['toprak-2'], ['su-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 7);
});

test('döngü: ters yönde de aynı sonuç (kazanan ikinci oyuncu)', () => {
  assert.equal(cozKartlar(['ates-5'], ['su-1']).kazanan, 1);
  assert.equal(cozKartlar(['toprak-5'], ['ates-1']).kazanan, 1);
  assert.equal(cozKartlar(['su-5'], ['toprak-1']).kazanan, 1);
});

test('aynı element: büyük değer kazanır, puan iki kartın toplamı', () => {
  let s = cozKartlar(['ates-4'], ['ates-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  assert.equal(s.neden, 'deger');
  s = cozKartlar(['su-1'], ['su-5']);
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 6);
});

test('aynı element aynı değer: berabere, puan yok', () => {
  const s = cozKartlar(['toprak-3'], ['toprak-3']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'berabere');
});

// ---------------------------------------------------------------------------
// Özel kartlar ve kombinasyonlar
// ---------------------------------------------------------------------------

test('Ters Rüzgâr: yenme döngüsü tersine döner (ateş suyu yener)', () => {
  let s = cozKartlar(['ates-1', 'ters'], ['su-5']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
  assert.equal(s.tersEtkili, true);
  // toprak ateşi yener (normalde ateş toprağı yener)
  s = cozKartlar(['ates-5'], ['toprak-1', 'ters']);
  assert.equal(s.kazanan, 1);
  // su toprağı yener (normalde toprak suyu yener)
  s = cozKartlar(['su-2', 'ters'], ['toprak-4']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 6);
});

test('Ters Rüzgâr: normalde kazanan kartı olan oyuncu kaybeder', () => {
  const s = cozKartlar(['su-5', 'ters'], ['ates-1']);
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 6);
});

test('Ters Rüzgâr: aynı elementte etkisizdir, büyük değer kazanır', () => {
  const s = cozKartlar(['su-4', 'ters'], ['su-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.neden, 'deger');
  assert.equal(s.tersEtkili, false);
});

test('iki Ters Rüzgâr birbirini götürür (normal kural)', () => {
  const s = cozKartlar(['su-1', 'ters'], ['ates-5', 'ters']);
  assert.equal(s.kazanan, 0); // normal: su ateşi yener
  assert.equal(s.puan, 6);
  assert.equal(s.tersEtkili, false);
});

test('Kalkan: tek başına, kimse puan almaz', () => {
  let s = cozKartlar(['kalkan'], ['ates-5']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'kalkan');
  s = cozKartlar(['su-5', 'ikiye'], ['kalkan']);
  assert.equal(s.puan, 0);
  s = cozKartlar(['kalkan'], ['kalkan']);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'kalkan');
});

test('Kalkan\'a karşı Ters Rüzgâr: Kalkan geçerli, puan yok', () => {
  const s = cozKartlar(['kalkan'], ['ates-1', 'ters']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'kalkan');
  assert.equal(s.tersEtkili, false);
});

test('İkiye Katla: kazanırsa puan iki katı', () => {
  const s = cozKartlar(['su-3', 'ikiye'], ['ates-2']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 10); // (3 + 2) x 2
  assert.equal(s.ikiyeEtkili, true);
});

test('İkiye Katla: kaybederse puan 0, rakibin puanı da iki katlanmaz', () => {
  const s = cozKartlar(['ates-5', 'ikiye'], ['su-1']);
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 6); // rakip (5 + 1), katlama yok
  assert.equal(s.ikiyeEtkili, false);
});

test('İkiye Katla: aynı elementte büyük değerle kazanırsa iki katı', () => {
  const s = cozKartlar(['toprak-5', 'ikiye'], ['toprak-1']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 12);
});

test('İkiye Katla berabere kalırsa puan yok', () => {
  const s = cozKartlar(['toprak-3', 'ikiye'], ['toprak-3']);
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
});

test('İkiye Katla + Ters Rüzgâr: biri her birini oynayabilir, katlama etkili', () => {
  // iki oyuncu: biri İkiye Katla, diğeri Ters Rüzgâr
  // 0: su-4 + İkiye Katla, 1: toprak-1 + Ters Rüzgâr -> ters: su toprağı yener, kazanan 0, (4+1) x 2
  let s = cozKartlar(['su-4', 'ikiye'], ['toprak-1', 'ters']);
  assert.equal(s.kazanan, 0);
  assert.equal(s.puan, 10);
  assert.equal(s.tersEtkili, true);
  // ters Rüzgâr oynayan, İkiye Katla oynayana karşı kaybeder: katlama olmaz
  s = cozKartlar(['ates-4', 'ikiye'], ['toprak-1', 'ters']);
  // ters: toprak ateşi yener, kazanan 1, katlama yok
  assert.equal(s.kazanan, 1);
  assert.equal(s.puan, 5);
  assert.equal(s.ikiyeEtkili, false);
});

test('oynayacak kartı olmayan oyuncuya karşı puan yok', () => {
  const s = turuCoz(oyunAyristir(['su-5']), oyunAyristir([]));
  assert.equal(s.kazanan, -1);
  assert.equal(s.puan, 0);
  assert.equal(s.neden, 'rakipYok');
});

// ---------------------------------------------------------------------------
// Seçim doğrulama
// ---------------------------------------------------------------------------

const ELIM = ['ates-3', 'su-2', 'toprak-5', 'ters', 'kalkan'];

test('seçim: tek element, Kalkan, element + Ters, element + İkiye Katla geçerli', () => {
  assert.equal(secimHatasi(ELIM, ['ates-3']), null);
  assert.equal(secimHatasi(ELIM, ['kalkan']), null);
  assert.equal(secimHatasi(ELIM, ['ters', 'su-2']), null);
  assert.equal(secimHatasi([...ELIM, 'ikiye'], ['toprak-5', 'ikiye']), null);
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
  assert.match(secimHatasi(ELIM, ['kalkan', 'ates-3']), /Kalkan/);
});

test('seçim: iki element, üç kart, aynı kart iki kez ve boş seçim geçersiz', () => {
  assert.match(secimHatasi(ELIM, ['ates-3', 'su-2']), /element kartı birlikte/);
  assert.match(secimHatasi(ELIM, ['ates-3', 'su-2', 'ters']), /En fazla iki/);
  assert.match(secimHatasi(ELIM, ['ates-3', 'ates-3']), /iki kez/);
  assert.match(secimHatasi(ELIM, []), /Önce bir kart/);
  assert.match(secimHatasi(ELIM, undefined), /Önce bir kart/);
});

test('seçim: elde olmayan ve bilinmeyen kart geçersiz', () => {
  assert.match(secimHatasi(ELIM, ['su-5']), /elinde yok/);
  assert.match(secimHatasi(ELIM, ['ates-3', 'ikiye']), /elinde yok/);
  assert.match(secimHatasi(ELIM, ['hava-9']), /Bilinmeyen/);
});

test('oynayabilirMi: yalnız Ters ve İkiye Katla kaldıysa oynanamaz', () => {
  assert.equal(oynayabilirMi(['ters', 'ikiye']), false);
  assert.equal(oynayabilirMi([]), false);
  assert.equal(oynayabilirMi(['ters', 'kalkan']), true);
  assert.equal(oynayabilirMi(['ikiye', 'su-1']), true);
});

// ---------------------------------------------------------------------------
// Tur akışı (motor üzerinden)
// ---------------------------------------------------------------------------

test('seç: geçersiz oyunlar motordan da reddedilir, durum değişmez', () => {
  let d = oyun();
  d = elKoy(d, ['ates-3', 'ters', 'ikiye', 'kalkan', 'su-2'], ['su-1', 'su-2', 'su-3', 'su-4', 'su-5']);
  dondur(d);
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ters', 'ikiye'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ters'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ikiye'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['toprak-5'] })); // elde yok
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['kalkan', 'su-2'] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: [] }));
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 0 }));
  hatali(u(d, { tip: 'sec', id: pid(9), tur: 0, kartlar: ['ates-3'] })); // odada değil
  hatali(u(d, { tip: 'sec', id: pid(0), tur: 5, kartlar: ['ates-3'] })); // eski tur
});

test('seç: kilitlenen seçim değişmez, rakip kilitleyince kartlar açılır', () => {
  let d = elKoy(oyun(), ['su-3', ...DOLGU.slice(0, 4)], ['ates-2', ...DOLGU.slice(0, 4)], ['toprak-5'], ['toprak-4']);
  d = basarili(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['su-3'] }));
  assert.equal(d.asama, 'secim');
  assert.equal(kilitliMi(d, 0), true);
  assert.equal(kilitliMi(d, 1), false);
  assert.match(hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['su-2'] })), /Zaten seçtin/);
  d = basarili(u(d, { tip: 'sec', id: pid(1), tur: 0, kartlar: ['ates-2'] }));
  assert.equal(d.asama, 'acik');
  const g = sonGecmis(d);
  assert.deepEqual(g.kartlar, [['su-3'], ['ates-2']]);
  assert.equal(g.kazanan, 0);
  assert.equal(g.puan, 5);
  assert.equal(d.oyuncular[0].puan, 5);
  assert.equal(d.oyuncular[1].puan, 0);
});

test('puan: kazanan kendi değeri + rakip değeri kadar alır, İkiye Katla ile iki katı', () => {
  let d = elKoy(oyun(), ['su-4', 'ikiye', ...DOLGU.slice(0, 3)], ['ates-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['su-4', 'ikiye'], ['ates-3']);
  assert.equal(d.oyuncular[0].puan, 14); // (4 + 3) x 2
  assert.equal(sonGecmis(d).ikiyeEtkili, true);
});

test('puan: İkiye Katla kaybederse kazanan normal puan alır, İkiye Katla oynayan 0', () => {
  let d = elKoy(oyun(), ['ates-4', 'ikiye', ...DOLGU.slice(0, 3)], ['su-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['ates-4', 'ikiye'], ['su-3']);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.equal(d.oyuncular[1].puan, 7);
});

test('Kalkan turunda puan yok ve iki kart da atılır', () => {
  let d = elKoy(oyun(), ['kalkan', ...DOLGU.slice(0, 4)], ['ates-5', 'su-5', 'toprak-5', ...DOLGU.slice(0, 2)]);
  d = oyna(d, ['kalkan'], ['ates-5']);
  assert.deepEqual(d.oyuncular.map((o) => o.puan), [0, 0]);
  assert.deepEqual(d.atilanlar[0], ['kalkan']);
  assert.deepEqual(d.atilanlar[1], ['ates-5']);
  assert.equal(d.eller[0].includes('kalkan'), false);
  assert.equal(d.eller[1].includes('ates-5'), false);
  assert.equal(sonGecmis(d).neden, 'kalkan');
});

test('oynanan kartlar atılır, iki kartlık oyunda ikisi de atılır', () => {
  let d = elKoy(oyun(), ['su-4', 'ters', ...DOLGU.slice(0, 3)], ['ates-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['ters', 'su-4'], ['ates-3']);
  assert.deepEqual(d.atilanlar[0].slice().sort(), ['su-4', 'ters']);
  assert.equal(d.eller[0].includes('su-4'), false);
  assert.equal(d.eller[0].includes('ters'), false);
});

test('el tamamlama: tur sonunda 5\'e tamamlanır, deste bitmişse tamamlanmaz', () => {
  // 0'ın destesi dolu, 1'in destesi tek kartlık
  let d = elKoy(
    oyun(),
    ['su-4', 'ters', ...DOLGU.slice(0, 3)],
    ['ates-3', ...DOLGU.slice(0, 4)],
    ['toprak-3', 'toprak-4', 'toprak-5'],
    ['su-5']
  );
  d = oyna(d, ['ters', 'su-4'], ['ates-3']);
  // 0 iki kart oynadı: elde 3, destede 3 -> 5'e tamamlanır (iki kart çeker)
  assert.equal(d.eller[0].length, 5);
  assert.deepEqual(d.desteler[0], ['toprak-5']);
  // 1 bir kart oynadı: elde 4, destede 1 -> 5
  assert.equal(d.eller[1].length, 5);
  assert.deepEqual(d.desteler[1], []);
});

test('el tamamlama: deste bitmişse el küçülür', () => {
  let d = elKoy(oyun(), ['su-1', ...DOLGU.slice(0, 4)], ['ates-1', ...DOLGU.slice(0, 4)]); // desteler boş
  d = oyna(d, ['su-1'], ['ates-1']);
  assert.equal(d.eller[0].length, 4);
  assert.equal(d.eller[1].length, 4);
});

test('sonraki: turu ilerletir, seçimler boşalır, geçmişe eklenir', () => {
  let d = elKoy(oyun(), ['su-1', ...DOLGU.slice(0, 4)], ['ates-1', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['su-1'], ['ates-1']);
  assert.equal(d.gecmis.length, 1);
  assert.match(hatali(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['ates-1'] })), /seçilmez/);
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
  d = elKoy(d, ['su-4', 'ikiye', ...DOLGU.slice(0, 3)], ['ates-3', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['su-4', 'ikiye'], ['ates-3']); // +14 -> 30
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
  d = elKoy(d, ['su-4', ...DOLGU.slice(0, 4)], ['ates-3', ...DOLGU.slice(0, 4)], ['su-5'], ['su-5']);
  d = oyna(d, ['su-4'], ['ates-3']);
  assert.equal(d.bitisNedeni, null);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'secim');
});

test('bitiş: hedef ayarına göre (20 / 30 / 40)', () => {
  assert.deepEqual(HEDEFLER, [20, 30, 40]);
  for (const hedef of HEDEFLER) {
    let d = oyun(hedef);
    d.oyuncular[1].puan = hedef - 5;
    d = elKoy(d, ['ates-1', ...DOLGU.slice(0, 4)], ['su-3', ...DOLGU.slice(0, 4)]);
    d = oyna(d, ['ates-1'], ['su-3']); // 1: +4 -> hedef - 1
    assert.equal(d.bitisNedeni, null, 'hedef-1: ' + hedef);
    d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
    d = elKoy(d, ['ates-1', ...DOLGU.slice(0, 4)], ['su-1', ...DOLGU.slice(0, 4)]);
    d = oyna(d, ['ates-1'], ['su-1']); // 1: +2 -> hedef + 1
    assert.equal(d.bitisNedeni, 'hedef', 'hedef: ' + hedef);
  }
});

test('bitiş: eller boşalınca biter, çok puanlı kazanır', () => {
  let d = oyun(40);
  d.oyuncular[0].puan = 3;
  d.oyuncular[1].puan = 5;
  d = elKoy(d, ['su-1'], ['su-1']); // son kartlar, desteler boş
  d = oyna(d, ['su-1'], ['su-1']); // berabere
  assert.equal(d.bitisNedeni, 'eller');
  assert.equal(d.eller[0].length, 0);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(oyunKazananlari(d), [1]);
});

test('bitiş: eller boşalınca puanlar eşitse berabere', () => {
  let d = oyun(40);
  d = elKoy(d, ['su-1'], ['su-1']);
  d = oyna(d, ['su-1'], ['su-1']);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(oyunKazananlari(d), [0, 1]);
});

test('bitiş: yalnız Ters Rüzgâr ve İkiye Katla kalan oyuncu oynayamaz, oyun diğerine göre sürer', () => {
  let d = oyun(40);
  d = elKoy(d, ['su-1'], ['ates-1', 'su-2']);
  d.eller[0].push('ters', 'ikiye');
  d = oyna(d, ['su-1'], ['ates-1']);
  // 0'ın elinde yalnız ters ve ikiye kaldı, 1'in elinde su-2 var
  assert.equal(d.bitisNedeni, null);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'secim');
  assert.equal(kilitliMi(d, 0), true, '0 kendiliğinden kilitli');
  assert.deepEqual(d.secimler[0].kartlar, []);
  d = basarili(u(d, { tip: 'sec', id: pid(1), tur: 1, kartlar: ['su-2'] }));
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
            return bilgi.tip === 'element' || bilgi.tip === 'kalkan';
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
  let d = elKoy(oyun(), ['su-3', ...DOLGU.slice(0, 4)], ['toprak-5', 'ters', 'kalkan', 'ikiye', 'ates-5']);
  d = basarili(u(d, { tip: 'sec', id: pid(1), tur: 0, kartlar: ['toprak-5', 'ters'] }));
  const g = gorunum(d, 0);
  // rakip: yalnız sayılar ve "seçti"
  assert.equal(g.rakip.kilitli, true);
  assert.equal(g.rakip.secim, null);
  assert.equal(g.rakip.elSayisi, 5);
  const metin = JSON.stringify(g);
  for (const gizli of ['toprak-5', 'kalkan', 'ikiye', 'ates-5']) {
    assert.equal(metin.includes('"' + gizli + '"'), false, gizli + ' sızdı');
  }
  assert.equal(metin.includes('"ters"'), false, 'ters sızdı');
  // kendi elim görünür
  assert.deepEqual(g.benim.el, elSirala(['su-3', ...DOLGU.slice(0, 4)]));
  assert.equal(g.benim.kilitli, false);
});

test('gizlilik: kendi kilitli seçimimi görürüm, rakip seçmediyse "kilitli" değil', () => {
  let d = elKoy(oyun(), ['su-3', ...DOLGU.slice(0, 4)], ['toprak-5', ...DOLGU.slice(0, 4)]);
  d = basarili(u(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: ['su-3'] }));
  const benim = gorunum(d, 0);
  assert.deepEqual(benim.benim.secim, ['su-3']);
  assert.equal(benim.benim.kilitli, true);
  assert.equal(benim.rakip.kilitli, false);
  const rakipGozuyle = gorunum(d, 1);
  assert.equal(rakipGozuyle.rakip.kilitli, true);
  assert.equal(rakipGozuyle.rakip.secim, null);
  assert.equal(JSON.stringify(rakipGozuyle).includes('su-3'), false);
});

test('gizlilik: açılıştan sonra iki seçim de görünür', () => {
  let d = elKoy(oyun(), ['su-3', ...DOLGU.slice(0, 4)], ['toprak-5', ...DOLGU.slice(0, 4)]);
  d = oyna(d, ['su-3'], ['toprak-5']);
  const g = gorunum(d, 0);
  assert.deepEqual(g.rakip.secim, ['toprak-5']);
  assert.deepEqual(g.benim.secim, ['su-3']);
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
  const kart = d.eller[0].find((kartId) => kartBilgi(kartId).tip === 'element');
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

test('yönlendirici: oyun listesi Element Düellosu içerir, oda kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'element').ad, 'Element Düellosu');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'element');
  assert.equal(d.oyun, 'element');
  assert.equal(oyunId(d), 'element');
  assert.equal(d.asama, 'lobi');
});

test('yönlendirici: hareketler Element Düellosu motoruna gider', () => {
  let d = yonlendirLobi('element', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 20 } }));
  assert.equal(d.ayar.hedef, 20);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.asama, 'secim');
  const kart = d.eller[0].find((kartId) => kartBilgi(kartId).tip === 'element');
  d = basarili(yonlendir(d, { tip: 'sec', id: pid(0), tur: 0, kartlar: [kart] }));
  assert.equal(kilitliMi(d, 0), true);
});

test('yönlendirici: diğer oyunlardan Element Düellosu seçilir, oyuncular korunur', () => {
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

test('yönlendirici: odada 2 den fazla kişi varsa Element Düellosu seçilemez', () => {
  const d = yonlendirLobi('uno', 3);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'element' })), /2 kişilik/);
  assert.equal(d.oyun, 'uno');
});

test('yönlendirici: Element Düellosu lobisinden başka oyunlara geçilir, yalnız ev sahibi seçer', () => {
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

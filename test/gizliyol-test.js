// "Gizli Yol" motoru ve oyun yönlendirici testleri. Çalıştır: node test/gizliyol-test.js
import assert from 'node:assert/strict';
import {
  PES_HATASI,
  TUR_SAYILARI,
  YOL_UZUNLUKLARI,
  herkesBitti,
  kareUyarisi,
  komsuMu,
  lobiKur,
  oyuncuDurumu,
  oyunKazananlari,
  sonrakiDogruKare,
  uygula,
  yeniOda,
  yolHatasi,
} from '../gizliyol.js';
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

function u(d, eylem) {
  return uygula(d, eylem, Math.random);
}

function dondur(x) {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x);
    Object.values(x).forEach(dondur);
  }
  return x;
}

// Geçerli yollar (satır 0 üst, satır 5 alt)
const YOL_A = [
  [5, 0],
  [5, 1],
  [4, 1],
  [3, 1],
  [3, 2],
  [2, 2],
  [1, 2],
  [0, 2],
];

const YOL_B = [
  [5, 5],
  [4, 5],
  [3, 5],
  [3, 4],
  [2, 4],
  [1, 4],
  [1, 3],
  [0, 3],
];

// 12 kare, kıvrımlı
const YOL_UZUN = [
  [5, 0],
  [5, 1],
  [5, 2],
  [4, 2],
  [4, 1],
  [4, 0],
  [3, 0],
  [2, 0],
  [1, 0],
  [1, 1],
  [1, 2],
  [0, 2],
];

function lobi(ayar = {}, oyuncuSayisi = 2) {
  let d = yeniOda(pid(0), 'Ali');
  for (let i = 1; i < oyuncuSayisi; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: 'Oyuncu' + i }));
  }
  d.ayar = Object.assign({}, d.ayar, ayar);
  return d;
}

// Oyunu başlatır: kurma aşamasında
function baslat(ayar = {}) {
  return basarili(u(lobi(ayar), { tip: 'baslat', id: pid(0) }));
}

function hazirOl(d, i, yol) {
  return basarili(u(d, { tip: 'hazir', id: pid(i), tur: d.tur, yol: yol }));
}

// Bulma aşamasına geçmiş oyun: oyuncu 0'ın yolu A, oyuncu 1'in yolu B
function bulmada(ayar = {}) {
  let d = baslat(ayar);
  d = hazirOl(d, 0, ayar.enAzKare === 12 ? YOL_UZUN : YOL_A);
  d = hazirOl(d, 1, ayar.enAzKare === 12 ? YOL_UZUN : YOL_B);
  return d;
}

function kare(d, i, satir, sutun) {
  return u(d, { tip: 'kare', id: pid(i), tur: d.tur, satir: satir, sutun: sutun });
}

function dokun(d, i, satir, sutun) {
  return basarili(kare(d, i, satir, sutun));
}

// i. oyuncu hiç hata yapmadan rakibin yolunu bulur
function hatasizBul(d, i) {
  let simdi = d;
  while (!oyuncuDurumu(simdi, i).bitti) {
    const hedef = sonrakiDogruKare(simdi, i);
    simdi = dokun(simdi, i, hedef[0], hedef[1]);
  }
  return simdi;
}

// i. oyuncu n kez yanlış basar (başlangıçta, alt satırda, doğru olmayan farklı karelere). En çok 5.
function hataYap(d, i, n) {
  let simdi = d;
  const baslangic = simdi.yollar[1 - i][0];
  let yapilan = 0;
  for (let sutun = 0; sutun < 6 && yapilan < n; sutun++) {
    if (sutun === baslangic[1]) {
      continue;
    }
    simdi = dokun(simdi, i, 5, sutun);
    yapilan += 1;
  }
  assert.equal(yapilan, n, 'hataYap: en çok 5 yanlış başlangıç denenebilir');
  return simdi;
}

// Çok sayıda hatayı tek tek yapmak yerine sayacı doğrudan kurar (yalnız 25 hata testleri için)
function hataSayisiniKur(d, i, n) {
  const kopya = structuredClone(d);
  kopya.bulma[i].hata = n;
  return kopya;
}

// ---------------------------------------------------------------------------
// Yol kuralları
// ---------------------------------------------------------------------------

test('geçerli yollar kabul edilir', () => {
  assert.equal(yolHatasi(YOL_A, 8), null);
  assert.equal(yolHatasi(YOL_B, 8), null);
  assert.equal(yolHatasi(YOL_UZUN, 12), null);
});

test('çapraz adım reddedilir', () => {
  const yol = YOL_A.map((k) => k.slice());
  yol[2] = [4, 2]; // (5,1) -> (4,2) çapraz
  assert.match(yolHatasi(yol, 8), /yan yana ya da alt alta/);
});

test('aynı kareden iki kez geçilemez', () => {
  const yol = [
    [5, 0],
    [5, 1],
    [4, 1],
    [4, 0],
    [5, 0],
    [5, 1],
    [4, 1],
    [3, 1],
    [2, 1],
    [1, 1],
    [0, 1],
  ];
  assert.match(yolHatasi(yol, 8), /iki kez/);
});

test('çok kısa yol reddedilir, ayar uzun ise 12 kare gerekir', () => {
  assert.match(yolHatasi(YOL_A.slice(0, 7), 8), /en az 8|üst satırda/);
  assert.match(yolHatasi(YOL_A, 12), /en az 12/);
  // 6 karelik düz yol geçerli bir yoldur ama 8'den kısadır
  const duz = [
    [5, 2],
    [4, 2],
    [3, 2],
    [2, 2],
    [1, 2],
    [0, 2],
  ];
  assert.match(yolHatasi(duz, 8), /en az 8/);
  assert.equal(yolHatasi(duz, 6), null);
});

test('alt satırdan başlamayan ve üst satırda bitmeyen yol reddedilir', () => {
  const ortadanBaslayan = [
    [4, 0],
    [4, 1],
    [3, 1],
    [3, 2],
    [2, 2],
    [2, 3],
    [1, 3],
    [0, 3],
  ];
  assert.match(yolHatasi(ortadanBaslayan, 8), /alt satırdan başla/);
  const ustteBaslayan = [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
    [2, 2],
    [2, 3],
    [3, 3],
    [4, 3],
  ];
  assert.match(yolHatasi(ustteBaslayan, 8), /alt satırdan başla/);
  // 8 kare, alttan başlıyor ama (1,3) ile bitiyor
  const altaBiten = YOL_A.slice(0, 7).concat([[1, 3]]);
  assert.match(yolHatasi(altaBiten, 8), /üst satırda bitmeli/);
});

test('tahta dışı, bozuk biçim ve boş yol reddedilir', () => {
  assert.match(yolHatasi([], 8), /yol çiz/);
  assert.match(yolHatasi(null, 8), /yol çiz/);
  assert.match(yolHatasi('abc', 8), /yol çiz/);
  assert.match(yolHatasi([[5, 6]], 8), /dışına/);
  assert.match(yolHatasi([[5, -1]], 8), /dışına/);
  assert.match(yolHatasi([[5.5, 1]], 8), /dışına/);
  assert.match(yolHatasi([[5]], 8), /dışına/);
  assert.match(yolHatasi([[6, 0]], 8), /dışına/);
});

test('komsuMu: yan yana ve alt alta komşu, çapraz ve aynı kare değil', () => {
  assert.equal(komsuMu([2, 2], [2, 3]), true);
  assert.equal(komsuMu([2, 2], [3, 2]), true);
  assert.equal(komsuMu([2, 2], [3, 3]), false);
  assert.equal(komsuMu([2, 2], [2, 2]), false);
  assert.equal(komsuMu([2, 2], [2, 4]), false);
});

// ---------------------------------------------------------------------------
// Lobi
// ---------------------------------------------------------------------------

test('yeni oda: gizliyol lobisi, varsayılan ayarlar', () => {
  const d = yeniOda('a', 'Ali');
  assert.equal(d.oyun, 'gizliyol');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, 'a');
  assert.equal(d.ayar.turSayisi, 3);
  assert.equal(d.ayar.enAzKare, 8);
  assert.deepEqual(TUR_SAYILARI, [1, 3, 5]);
  assert.deepEqual(YOL_UZUNLUKLARI, [8, 12]);
});

test('tam 2 oyuncu: üçüncü katılamaz, bir kişiyle başlamaz', () => {
  const d = lobi();
  assert.match(hatali(u(d, { tip: 'katil', id: 'x', ad: 'Üç' })), /dolu/);
  assert.match(hatali(u(yeniOda(pid(0), 'Ali'), { tip: 'baslat', id: pid(0) })), /tam 2/);
});

test('katılma: aynı kişi iki kez eklenmez, aynı ad ayrılır, başlayan oyuna girilmez', () => {
  let d = yeniOda(pid(0), 'Ali');
  d = basarili(u(d, { tip: 'katil', id: pid(0), ad: 'Ali' }));
  assert.equal(d.oyuncular.length, 1);
  d = basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Ali' }));
  assert.equal(d.oyuncular.length, 2);
  assert.notEqual(d.oyuncular[0].ad, d.oyuncular[1].ad);
  const basladi = baslat();
  assert.match(hatali(u(basladi, { tip: 'katil', id: 'x', ad: 'Üç' })), /başladı/);
});

test('ayarlar: yalnız ev sahibi ve lobide, geçersiz değer reddedilir', () => {
  const d = lobi();
  const yeni = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 5, enAzKare: 12 } }));
  assert.equal(yeni.ayar.turSayisi, 5);
  assert.equal(yeni.ayar.enAzKare, 12);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { turSayisi: 1 } })), /ev sahibi/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 2 } })), /tur sayısı/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { enAzKare: 10 } })), /uzunluğu/);
  const basladi = baslat();
  assert.match(hatali(u(basladi, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 1 } })), /başlamadan/);
});

test('çıkma: lobide çıkılır, ev sahibi çıkınca sahiplik geçer, oyun sürerken çıkılmaz', () => {
  let d = lobi();
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.oyuncular.length, 1);
  assert.equal(d.sahip, pid(1));
  assert.match(hatali(u(baslat(), { tip: 'cikar', id: pid(1) })), /sürerken/);
  assert.match(hatali(u(lobi(), { tip: 'cikar', id: pid(1), hedef: pid(0) })), /ev sahibi/);
});

test('başlatma: yalnız ev sahibi, kurma aşaması açılır, yollar ve işaretler boş', () => {
  const d = lobi();
  assert.match(hatali(u(d, { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  const b = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(b.asama, 'kurma');
  assert.equal(b.tur, 0);
  assert.deepEqual(b.yollar, [null, null]);
  assert.deepEqual(b.hazir, [false, false]);
  assert.equal(b.bulma[0].hata, 0);
  assert.match(hatali(u(b, { tip: 'baslat', id: pid(0) })), /zaten/);
});

// ---------------------------------------------------------------------------
// Kurma aşaması
// ---------------------------------------------------------------------------

test('hazır: geçersiz yol durumu değiştirmez', () => {
  const d = baslat();
  const capraz = YOL_A.map((k) => k.slice());
  capraz[3] = [2, 2];
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: capraz })), /yan yana/);
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: YOL_A.slice(0, 5) })), /üst satırda|en az/);
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: undefined })), /yol çiz/);
  assert.equal(d.hazir[0], false);
  assert.equal(d.yollar[0], null);
});

test('hazır: yol kaydedilir, ikisi de hazır olunca bulma başlar', () => {
  let d = baslat();
  d = hazirOl(d, 0, YOL_A);
  assert.equal(d.asama, 'kurma');
  assert.deepEqual(d.hazir, [true, false]);
  assert.deepEqual(d.yollar[0], YOL_A);
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: YOL_A })), /Zaten hazırsın/);
  d = hazirOl(d, 1, YOL_B);
  assert.equal(d.asama, 'bulma');
  assert.deepEqual(d.yollar[1], YOL_B);
});

test('hazır: yol ayardaki uzunluğa uymalı (uzun ayarda 8 kare yetmez)', () => {
  const d = baslat({ enAzKare: 12 });
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: YOL_A })), /en az 12/);
  const yeni = hazirOl(d, 0, YOL_UZUN);
  assert.equal(yeni.hazir[0], true);
});

test('hazır: yanlış tur, odada olmayan ve yanlış aşama', () => {
  const d = baslat();
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 3, yol: YOL_A })), /geçti/);
  assert.match(hatali(u(d, { tip: 'hazir', id: 'yok', tur: 0, yol: YOL_A })), /odada değilsin/);
  assert.match(hatali(u(lobi(), { tip: 'hazir', id: pid(0), yol: YOL_A })), /yol çizilmez/);
});

test('hazirIptal: rakip hazır olmadan yol geri alınır ve değiştirilir', () => {
  let d = baslat();
  d = hazirOl(d, 0, YOL_A);
  d = basarili(u(d, { tip: 'hazirIptal', id: pid(0), tur: 0 }));
  assert.deepEqual(d.hazir, [false, false]);
  assert.equal(d.yollar[0], null);
  d = hazirOl(d, 0, YOL_UZUN);
  assert.deepEqual(d.yollar[0], YOL_UZUN);
  d = hazirOl(d, 1, YOL_B);
  assert.equal(d.asama, 'bulma');
  assert.match(hatali(u(d, { tip: 'hazirIptal', id: pid(0), tur: 0 })), /değişmez/);
});

test('gönderilen yolun kopyası saklanır, sonradan değişse de etkilenmez', () => {
  const yol = YOL_A.map((k) => k.slice());
  let d = baslat();
  d = hazirOl(d, 0, yol);
  yol[0][0] = 0;
  assert.equal(d.yollar[0][0][0], 5);
});

// ---------------------------------------------------------------------------
// Bulma aşaması
// ---------------------------------------------------------------------------

test('bulma: başlangıç yalnız alt satırda aranır, başka satıra dokunmak uyarıdır (hata değil)', () => {
  const d = bulmada();
  const hata = hatali(kare(d, 0, 3, 1));
  assert.match(hata, /alt satır/);
  assert.equal(d.bulma[0].hata, 0);
  assert.equal(kareUyarisi(d, 0, 3, 1).neden, 'baslangic');
});

test('bulma: doğru başlangıç karesi yolu bir kare uzatır', () => {
  let d = bulmada();
  // Oyuncu 0, oyuncu 1'in yolunu arar: başlangıç (5,5)
  d = dokun(d, 0, 5, 5);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 1);
  assert.equal(oyuncuDurumu(d, 0).hata, 0);
  d = dokun(d, 0, 4, 5);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 2);
  // Diğer oyuncunun ilerlemesi ayrıdır
  assert.equal(oyuncuDurumu(d, 1).bulunan, 0);
});

test('bulma: yanlış başlangıç hatadır, kalıcı işaret kalır', () => {
  let d = bulmada();
  d = dokun(d, 0, 5, 0);
  const o = oyuncuDurumu(d, 0);
  assert.equal(o.hata, 1);
  assert.equal(o.bulunan, 0);
  assert.deepEqual(d.bulma[0].yanlislar, [{ satir: 5, sutun: 0, adim: 0 }]);
});

test('bulma: yanlış adım başa döndürür, bulunanlar gizlenir, işaret kalır', () => {
  let d = bulmada();
  d = dokun(d, 0, 5, 5);
  d = dokun(d, 0, 4, 5);
  d = dokun(d, 0, 3, 5);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 3);
  // (3,5)'ten sonra doğru kare (3,4); yanlış komşu (2,5)
  d = dokun(d, 0, 2, 5);
  const o = oyuncuDurumu(d, 0);
  assert.equal(o.bulunan, 0);
  assert.equal(o.hata, 1);
  assert.deepEqual(d.bulma[0].yanlislar, [{ satir: 2, sutun: 5, adim: 3 }]);
  // Yolu baştan yürümek gerekir: önce başlangıç karesi
  assert.match(hatali(kare(d, 0, 4, 5)), /alt satır/);
  d = dokun(d, 0, 5, 5);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 1);
  // Kırmızı işaret hâlâ duruyor
  assert.equal(d.bulma[0].yanlislar.length, 1);
});

test('bulma: komşu olmayan kareye dokunmak hata sayılmaz, yalnız uyarıdır', () => {
  let d = bulmada();
  d = dokun(d, 0, 5, 5);
  assert.match(hatali(kare(d, 0, 2, 2)), /yanındaki/); // uzak kare
  assert.match(hatali(kare(d, 0, 4, 4)), /yanındaki/); // çapraz
  assert.equal(d.bulma[0].hata, 0);
  assert.equal(kareUyarisi(d, 0, 4, 4).neden, 'komsu');
});

test('bulma: aynı yanlış kareye tekrar basmak hata saymaz, yalnız uyarır', () => {
  let d = bulmada();
  d = dokun(d, 0, 5, 0); // yanlış başlangıç
  assert.equal(oyuncuDurumu(d, 0).hata, 1);
  assert.match(hatali(kare(d, 0, 5, 0)), /yanlıştı/);
  assert.equal(oyuncuDurumu(d, 0).hata, 1);
  assert.equal(d.bulma[0].yanlislar.length, 1);
  assert.equal(kareUyarisi(d, 0, 5, 0).neden, 'denendi');
  // Başka bir yanlış kare yine hata sayılır
  d = dokun(d, 0, 5, 1);
  assert.equal(oyuncuDurumu(d, 0).hata, 2);
});

test('bulma: işaretli kare başka adımda ayrıca denenir (işaret yalnız o adım için)', () => {
  // Oyuncu 1'in yolu: (5,0) (4,0) (3,0) (3,1) (4,1) ...
  const yolU = [
    [5, 0],
    [4, 0],
    [3, 0],
    [3, 1],
    [4, 1],
    [4, 2],
    [3, 2],
    [2, 2],
    [1, 2],
    [0, 2],
  ];
  let d = baslat();
  d = hazirOl(d, 0, YOL_A);
  d = hazirOl(d, 1, yolU);
  d = dokun(d, 0, 5, 0);
  d = dokun(d, 0, 4, 0);
  d = dokun(d, 0, 3, 0);
  d = dokun(d, 0, 3, 1);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 4);
  // 4. adımda doğru kare (4,1); yanlış (2,1) deniyoruz
  d = dokun(d, 0, 2, 1);
  assert.equal(oyuncuDurumu(d, 0).hata, 1);
  assert.deepEqual(d.bulma[0].yanlislar[0], { satir: 2, sutun: 1, adim: 4 });
  // Başa dönüldü; (2,1) başka adımda komşu olabilir ama aynı adımda tekrar uyarı verir
  d = dokun(d, 0, 5, 0);
  d = dokun(d, 0, 4, 0);
  d = dokun(d, 0, 3, 0);
  d = dokun(d, 0, 3, 1);
  assert.match(hatali(kare(d, 0, 2, 1)), /yanlıştı/);
  assert.equal(oyuncuDurumu(d, 0).hata, 1);
});

test('bulma: bulunmuş kareye tekrar dokunmak uyarıdır', () => {
  let d = bulmada();
  d = dokun(d, 0, 5, 5);
  d = dokun(d, 0, 4, 5);
  assert.match(hatali(kare(d, 0, 5, 5)), /zaten buldun/);
  assert.match(hatali(kare(d, 0, 4, 5)), /zaten buldun/);
  assert.equal(oyuncuDurumu(d, 0).hata, 0);
});

test('bulma: tahta dışı kare, yanlış tur, yanlış aşama, odada olmayan', () => {
  const d = bulmada();
  assert.match(hatali(kare(d, 0, 9, 9)), /tahtada yok/);
  assert.match(hatali(u(d, { tip: 'kare', id: pid(0), tur: 4, satir: 5, sutun: 5 })), /geçti/);
  assert.match(hatali(u(d, { tip: 'kare', id: 'yok', tur: 0, satir: 5, sutun: 5 })), /odada değilsin/);
  assert.match(hatali(u(baslat(), { tip: 'kare', id: pid(0), tur: 0, satir: 5, sutun: 0 })), /kare seçilmez/);
});

test('bulma: yolun sonuna ulaşan oyuncu bitirir, rakip sürerken tur açılmaz', () => {
  let d = bulmada();
  d = hatasizBul(d, 0);
  const o = oyuncuDurumu(d, 0);
  assert.equal(o.bitti, true);
  assert.equal(o.hata, 0);
  assert.equal(o.bulunan, YOL_B.length);
  assert.equal(d.asama, 'bulma');
  assert.equal(herkesBitti(d), false);
  assert.match(hatali(kare(d, 0, 5, 5)), /bitirdin/);
  // Rakip hâlâ oynayabilir
  d = dokun(d, 1, 5, 0);
  assert.equal(oyuncuDurumu(d, 1).bulunan, 1);
});

test('bulma: iki oyuncu aynı anda oynar, biri diğerinin ilerlemesini bozmaz', () => {
  let d = bulmada();
  d = dokun(d, 0, 5, 5);
  d = dokun(d, 1, 5, 0);
  d = dokun(d, 0, 4, 5);
  d = dokun(d, 1, 5, 1);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 2);
  assert.equal(oyuncuDurumu(d, 1).bulunan, 2);
});

test('bulma: uzun yolda (12 kare) da sonuna kadar gidilir', () => {
  let d = bulmada({ enAzKare: 12 });
  d = hatasizBul(d, 0);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 12);
  assert.equal(oyuncuDurumu(d, 0).bitti, true);
});

// ---------------------------------------------------------------------------
// Tur sonu, oyun sonu
// ---------------------------------------------------------------------------

test('tur sonu: az hata yapan turu alır, yollar ve hatalar açık kalır', () => {
  let d = bulmada({ turSayisi: 3 });
  d = hataYap(d, 1, 2); // oyuncu 1: 2 hata
  d = hatasizBul(d, 0); // oyuncu 0: 0 hata
  assert.equal(d.asama, 'bulma');
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  assert.equal(d.oyuncular[0].puan, 1);
  assert.equal(d.oyuncular[1].puan, 0);
  assert.deepEqual(d.gecmis, [{ hatalar: [0, 2], kazanan: 0 }]);
  // Sonuçta iki yol da ve işaretler durumda
  assert.deepEqual(d.yollar[0], YOL_A);
  assert.deepEqual(d.yollar[1], YOL_B);
  assert.equal(d.bulma[1].yanlislar.length, 2);
});

test('tur sonu: eşit hata berabere, kimse puan almaz', () => {
  let d = bulmada();
  d = hataYap(d, 0, 1);
  d = hataYap(d, 1, 1);
  d = hatasizBul(d, 0);
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  assert.equal(d.gecmis[0].kazanan, -1);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.equal(d.oyuncular[1].puan, 0);
});

test('tur sonu: bitiş sırası kazananı etkilemez', () => {
  let d = bulmada();
  d = hataYap(d, 0, 3);
  d = hatasizBul(d, 0); // ilk bitiren ama çok hatalı
  d = hatasizBul(d, 1);
  assert.equal(d.gecmis[0].kazanan, 1);
  assert.equal(d.oyuncular[1].puan, 1);
});

test('sonraki tur: herhangi biri basabilir, yeni yollar çizilir, işaretler silinir', () => {
  let d = bulmada({ turSayisi: 3 });
  d = hatasizBul(hataYap(d, 1, 1), 0);
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  // Ev sahibi olmayan oyuncu da basabilir
  d = basarili(u(d, { tip: 'sonraki', id: pid(1), tur: 0 }));
  assert.equal(d.asama, 'kurma');
  assert.equal(d.tur, 1);
  assert.deepEqual(d.yollar, [null, null]);
  assert.deepEqual(d.hazir, [false, false]);
  assert.equal(d.bulma[1].hata, 0);
  assert.equal(d.bulma[1].yanlislar.length, 0);
  // Puan ve geçmiş korunur
  assert.equal(d.oyuncular[0].puan, 1);
  assert.equal(d.gecmis.length, 1);
  // İkinci basış (eski tur numarasıyla) zararsız
  const ikinci = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(ikinci.tur, 1);
  assert.equal(ikinci.asama, 'kurma');
});

test('sonraki tur: tur açık değilken hata verir', () => {
  const d = baslat();
  assert.match(hatali(u(d, { tip: 'sonraki', id: pid(0), tur: 0 })), /geçilmez/);
  assert.match(hatali(u(d, { tip: 'sonraki', id: 'yok', tur: 0 })), /odada değilsin/);
});

// Kurma aşamasındaki oyunu bulma ve açığa kadar götürür
function turuOyna(d, hata0, hata1) {
  let simdi = hazirOl(hazirOl(d, 0, YOL_A), 1, YOL_B);
  simdi = hataYap(simdi, 0, hata0);
  simdi = hataYap(simdi, 1, hata1);
  simdi = hatasizBul(simdi, 0);
  simdi = hatasizBul(simdi, 1);
  assert.equal(simdi.asama, 'acik');
  return simdi;
}

test('oyun sonu: 1 turluk oyun biter, kazanan en çok tur alandır', () => {
  let d = baslat({ turSayisi: 1 });
  d = turuOyna(d, 0, 4);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(oyunKazananlari(d), [0]);
});

test('oyun sonu: 3 turluk tam oyun, puanlar ve geçmiş doğru', () => {
  let d = baslat({ turSayisi: 3 });
  d = turuOyna(d, 0, 2); // oyuncu 0 alır
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(d.tur, 1);
  d = turuOyna(d, 3, 1); // oyuncu 1 alır
  d = basarili(u(d, { tip: 'sonraki', id: pid(1), tur: 1 }));
  d = turuOyna(d, 0, 5); // oyuncu 0 alır
  assert.equal(d.asama, 'acik');
  assert.equal(d.tur, 2);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 2 }));
  assert.equal(d.asama, 'bitti');
  assert.equal(d.oyuncular[0].puan, 2);
  assert.equal(d.oyuncular[1].puan, 1);
  assert.deepEqual(oyunKazananlari(d), [0]);
  assert.equal(d.gecmis.length, 3);
  assert.deepEqual(
    d.gecmis.map((g) => g.hatalar),
    [
      [0, 2],
      [3, 1],
      [0, 5],
    ]
  );
  // Bitti aşamasında ikinci "sonraki" zararsız
  const yine = basarili(u(d, { tip: 'sonraki', id: pid(1), tur: 2 }));
  assert.equal(yine.asama, 'bitti');
});

test('oyun sonu: eşit tur sayısı berabere', () => {
  let d = baslat({ turSayisi: 3 });
  d = turuOyna(d, 0, 1); // oyuncu 0
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  d = turuOyna(d, 2, 0); // oyuncu 1
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 1 }));
  d = turuOyna(d, 1, 1); // berabere
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 2 }));
  assert.equal(d.asama, 'bitti');
  assert.equal(d.oyuncular[0].puan, 1);
  assert.equal(d.oyuncular[1].puan, 1);
  assert.deepEqual(oyunKazananlari(d), [0, 1]);
});

test('tekrar oyna: yalnız ev sahibi, bitince; puanlar sıfırlanır, kurma başlar', () => {
  let d = baslat({ turSayisi: 1 });
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  d = turuOyna(d, 0, 3);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  d = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }));
  assert.equal(d.asama, 'kurma');
  assert.equal(d.tur, 0);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.deepEqual(d.gecmis, []);
  assert.deepEqual(d.yollar, [null, null]);
  assert.equal(d.bulma[0].yanlislar.length, 0);
});

test('lobiye dön: ev sahibi her aşamada, ayarlar kalır', () => {
  let d = bulmada({ turSayisi: 5, enAzKare: 12 });
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  d = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(d.asama, 'lobi');
  assert.equal(d.ayar.turSayisi, 5);
  assert.equal(d.ayar.enAzKare, 12);
  assert.deepEqual(d.yollar, []);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(0) })), /lobidesin/);
  // Tekrar başlatılabilir
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.asama, 'kurma');
});

// ---------------------------------------------------------------------------
// Pes etme
// ---------------------------------------------------------------------------

test('pes: 25 hataya ulaşmadan edilmez, ulaşınca edilir ve tur 25 hata sayılır', () => {
  let d = bulmada({ turSayisi: 3 });
  d = hataSayisiniKur(d, 0, 24);
  assert.equal(oyuncuDurumu(d, 0).pesEdebilir, false);
  assert.match(hatali(u(d, { tip: 'pes', id: pid(0), tur: 0 })), /25 hataya/);
  d = hataYap(d, 0, 1); // gerçek bir yanlış kare: 25. hata
  assert.equal(oyuncuDurumu(d, 0).hata, PES_HATASI);
  assert.equal(oyuncuDurumu(d, 0).pesEdebilir, true);
  d = basarili(u(d, { tip: 'pes', id: pid(0), tur: 0 }));
  const o = oyuncuDurumu(d, 0);
  assert.equal(o.pes, true);
  assert.equal(o.bitti, true);
  assert.equal(o.hata, 25);
  assert.equal(o.pesEdebilir, false);
  // Rakibi bekler: tur henüz açılmadı
  assert.equal(d.asama, 'bulma');
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.gecmis[0], { hatalar: [25, 0], kazanan: 1 });
});

test('pes: pes eden oyuncu artık kare seçemez, ikinci pes reddedilir', () => {
  let d = bulmada();
  d = hataSayisiniKur(d, 0, 25);
  d = basarili(u(d, { tip: 'pes', id: pid(0), tur: 0 }));
  assert.match(hatali(kare(d, 0, 5, 5)), /bitirdin/);
  assert.match(hatali(u(d, { tip: 'pes', id: pid(0), tur: 0 })), /bitirdin/);
});

test('pes: iki oyuncu da pes ederse berabere', () => {
  let d = bulmada();
  d = hataSayisiniKur(d, 0, 25);
  d = hataSayisiniKur(d, 1, 27);
  d = basarili(u(d, { tip: 'pes', id: pid(0), tur: 0 }));
  d = basarili(u(d, { tip: 'pes', id: pid(1), tur: 0 }));
  assert.equal(d.asama, 'acik');
  assert.equal(d.gecmis[0].kazanan, -1);
});

// ---------------------------------------------------------------------------
// Genel
// ---------------------------------------------------------------------------

test('girdi durumu hiç değişmez (donmuş durumla çalışır)', () => {
  const d = dondur(bulmada());
  assert.equal(kare(d, 0, 5, 0).ok, true);
  assert.equal(kare(d, 0, 5, 5).ok, true);
  assert.equal(u(d, { tip: 'pes', id: pid(0), tur: 0 }).ok, false);
  const k = dondur(baslat());
  assert.equal(u(k, { tip: 'hazir', id: pid(0), tur: 0, yol: YOL_A }).ok, true);
});

test('bilinmeyen hareket hata verir', () => {
  assert.match(hatali(u(lobi(), { tip: 'uc', id: pid(0) })), /Bilinmeyen/);
  assert.match(hatali(u(lobi(), undefined)), /Bilinmeyen/);
});

test('lobiKur: verilen oyuncularla boş lobi', () => {
  const d = lobiKur(
    [
      { id: 'a', ad: 'Ali' },
      { id: 'b', ad: 'Ayşe' },
    ],
    'a'
  );
  assert.equal(d.oyun, 'gizliyol');
  assert.equal(d.oyuncular.length, 2);
  assert.equal(d.oyuncular[1].puan, 0);
});

// ---------------------------------------------------------------------------
// Yönlendirici
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

test('yönlendirici: oyun listesi Gizli Yol içerir, oda kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'gizliyol').ad, 'Gizli Yol');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'gizliyol');
  assert.equal(d.oyun, 'gizliyol');
  assert.equal(oyunId(d), 'gizliyol');
  assert.equal(d.asama, 'lobi');
});

test('yönlendirici: hareketler Gizli Yol motoruna gider', () => {
  let d = yonlendirLobi('gizliyol', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 1 } }));
  assert.equal(d.ayar.turSayisi, 1);
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.asama, 'kurma');
  d = basarili(yonlendir(d, { tip: 'hazir', id: pid(0), tur: 0, yol: YOL_A }));
  d = basarili(yonlendir(d, { tip: 'hazir', id: pid(1), tur: 0, yol: YOL_B }));
  assert.equal(d.asama, 'bulma');
  d = basarili(yonlendir(d, { tip: 'kare', id: pid(0), tur: 0, satir: 5, sutun: 5 }));
  assert.equal(d.bulma[0].bulunan, 1);
});

test('yönlendirici: diğer oyunlardan Gizli Yol seçilir, oyuncular korunur', () => {
  for (const baslangic of ['uno', 'tanis', 'kelime', 'aynikafa']) {
    let d = yonlendirLobi(baslangic, 2);
    const once = kimlikler(d);
    d = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'gizliyol' }));
    assert.equal(d.oyun, 'gizliyol', baslangic);
    assert.deepEqual(kimlikler(d), once);
    assert.equal(d.sahip, pid(0));
    assert.equal(d.asama, 'lobi');
  }
});

test('yönlendirici: odada 2 den fazla kişi varsa Gizli Yol seçilemez', () => {
  const d = yonlendirLobi('uno', 3);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'gizliyol' })), /2 kişilik/);
  assert.equal(d.oyun, 'uno');
});

test('yönlendirici: Gizli Yol lobisinden başka oyunlara geçilir, yalnız ev sahibi seçer', () => {
  let d = yonlendirLobi('gizliyol', 2);
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'uno' })), /ev sahibi/);
  for (const hedef of ['uno', 'tanis', 'kelime', 'aynikafa']) {
    const yeni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: hedef }));
    assert.equal(oyunId(yeni), hedef);
    assert.deepEqual(kimlikler(yeni), kimlikler(d));
  }
  // Oyun sürerken seçim yapılmaz
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

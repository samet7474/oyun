// "Pazar" motoru ve oyun yönlendirici testleri. Çalıştır: node test/pazar-test.js
import assert from 'node:assert/strict';
import {
  BASLANGIC_ELI,
  EL_SINIRI,
  MEYVELER,
  TEZGAH_BOYU,
  UZUNLUKLAR,
  alabilirMi,
  baslangicFiyatlari,
  bosEl,
  elBoyu,
  kalanHamle,
  kazananlar,
  lobiKur,
  pasMi,
  satilabilirler,
  satisDegeri,
  satisSonrasiFiyat,
  siralama,
  tamDeste,
  uygula,
  yeniOda,
} from '../pazar.js';
import { OYUNLAR, genelVeri, oyunId, uygula as yonlendir, yeniOda as yonlendirYeniOda } from '../oyunlar.js';

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

const ADLAR = ['Ayşe', 'Bora', 'Cem', 'Deniz'];

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

// Karıştırmayı bozmayan sabit rastgele (Fisher-Yates'te hep son eleman yerinde kalır)
function sabit() {
  return 0.999999;
}

function u(d, eylem) {
  return uygula(d, eylem, sabit);
}

// n kişilik lobi
function lobi(n) {
  let d = yeniOda(pid(0), ADLAR[0]);
  for (let i = 1; i < n; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: ADLAR[i] }));
  }
  return d;
}

// n kişilik başlamış oyun
function oyun(n) {
  return basarili(u(lobi(n), { tip: 'baslat', id: pid(0) }));
}

// Elle kurulmuş bir oyun durumu: deste, tezgâh ve eller verilir
function kur(n, { deste = ['elma', 'elma', 'elma', 'elma', 'elma', 'elma'], tezgah, eller, fiyatlar } = {}) {
  const d = structuredClone(oyun(n));
  d.deste = deste.slice();
  d.tezgah = tezgah ? tezgah.slice() : ['muz', 'uzum', 'cilek', 'karpuz', 'elma'];
  d.eller = [];
  for (let i = 0; i < n; i++) {
    d.eller.push(Object.assign(bosEl(), eller && eller[i] ? eller[i] : {}));
  }
  d.fiyatlar = Object.assign(baslangicFiyatlari(), fiyatlar || {});
  d.sonTur = false;
  return d;
}

function toplamKart(d) {
  let t = d.deste.length + d.tezgah.length;
  for (const el of d.eller) {
    t += elBoyu(el);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Kurulum
// ---------------------------------------------------------------------------

test('deste: normal 40, kısa 30 kart; az bulunan meyve pahalı', () => {
  assert.equal(tamDeste('normal').length, 40);
  assert.equal(tamDeste('kisa').length, 30);
  assert.equal(tamDeste().length, 40);
  for (const uzunluk of Object.keys(UZUNLUKLAR)) {
    const adetler = UZUNLUKLAR[uzunluk];
    for (let i = 1; i < MEYVELER.length; i++) {
      assert.ok(MEYVELER[i].baslangic > MEYVELER[i - 1].baslangic);
      assert.ok(adetler[i] <= adetler[i - 1], uzunluk);
    }
  }
  assert.equal(tamDeste('normal').filter((m) => m === 'karpuz').length, 6);
});

test('yeni oda: lobi, varsayılan ayar normal', () => {
  const d = yeniOda(pid(0), '  Ayşe  ');
  assert.equal(d.oyun, 'pazar');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, pid(0));
  assert.equal(d.oyuncular[0].ad, 'Ayşe');
  assert.deepEqual(d.ayar, { uzunluk: 'normal' });
});

test('başlat: 2 kişi; herkese 2 kart, tezgâhta 5, kart kaybolmaz', () => {
  const d = oyun(2);
  assert.equal(d.asama, 'oyun');
  assert.equal(d.sira, 0);
  assert.equal(d.tezgah.length, TEZGAH_BOYU);
  assert.equal(d.eller.length, 2);
  for (const el of d.eller) {
    assert.equal(elBoyu(el), BASLANGIC_ELI);
  }
  assert.equal(toplamKart(d), 40);
  assert.equal(d.deste.length, 40 - 4 - 5);
  assert.deepEqual(d.puanlar, [0, 0]);
  assert.deepEqual(d.fiyatlar, baslangicFiyatlari());
  assert.equal(d.sonTur, false);
  assert.equal(d.oyunNo, 1);
});

test('başlat: 4 kişi ve kısa oyun', () => {
  let d = lobi(4);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { uzunluk: 'kisa' } }));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.eller.length, 4);
  assert.equal(toplamKart(d), 30);
  assert.equal(d.deste.length, 30 - 8 - 5);
});

test('başlat: tek kişiyle, başkası başlatamaz, iki kez başlamaz', () => {
  assert.match(hatali(u(lobi(1), { tip: 'baslat', id: pid(0) })), /En az 2/);
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  assert.match(hatali(u(oyun(2), { tip: 'baslat', id: pid(0) })), /zaten/);
});

test('katılma: en çok 4 kişi, oyun başlayınca katılınmaz, aynı ad değişir', () => {
  const d = lobi(4);
  assert.match(hatali(u(d, { tip: 'katil', id: pid(9), ad: 'Ece' })), /dolu/);
  assert.match(hatali(u(oyun(2), { tip: 'katil', id: pid(9), ad: 'Ece' })), /başladı/);
  const ayni = basarili(u(lobi(1), { tip: 'katil', id: pid(1), ad: 'ayşe' }));
  assert.notEqual(ayni.oyuncular[1].ad.toLowerCase(), 'ayşe');
  // zaten odadaysa hiçbir şey olmaz
  assert.equal(basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Bora' })).oyuncular.length, 4);
});

test('ayar: yalnız ev sahibi, yalnız lobide, geçersiz uzunluk reddedilir', () => {
  const d = lobi(2);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { uzunluk: 'kisa' } })), /ev sahibi/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { uzunluk: 'uzun' } })), /Geçersiz/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { uzunluk: 'toString' } })), /Geçersiz/);
  assert.match(hatali(u(oyun(2), { tip: 'ayarla', id: pid(0), ayar: { uzunluk: 'kisa' } })), /başlamadan/);
});

test('çıkma: lobide serbest, oyun sürerken olmaz; ev sahibi çıkarsa sahiplik geçer', () => {
  const d = lobi(3);
  const cikti = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(cikti.oyuncular.length, 2);
  assert.equal(cikti.sahip, pid(1));
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(2) })), /ev sahibi/);
  assert.match(hatali(u(oyun(2), { tip: 'cikar', id: pid(1) })), /çıkılamaz/);
});

test('girdi durumu değişmez', () => {
  const d = kur(2, { eller: [{ karpuz: 3 }] });
  const kopya = structuredClone(d);
  basarili(u(d, { tip: 'al', id: pid(0), yer: 0 }));
  basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'karpuz' }));
  assert.deepEqual(d, kopya);
});

// ---------------------------------------------------------------------------
// Al
// ---------------------------------------------------------------------------

test('al: kart ele gelir, tezgâh desteden tamamlanır, sıra geçer', () => {
  const d = kur(2, { deste: ['cilek', 'karpuz', 'muz'] });
  const s = basarili(u(d, { tip: 'al', id: pid(0), yer: 1 })); // üzüm
  assert.equal(s.eller[0].uzum, 1);
  assert.deepEqual(s.tezgah, ['muz', 'cilek', 'karpuz', 'elma', 'muz']); // destenin sonundan çekilir
  assert.deepEqual(s.deste, ['cilek', 'karpuz']);
  assert.equal(s.sira, 1);
  assert.equal(s.hamleSayisi, 1);
  assert.equal(s.sonOlay.tip, 'al');
  assert.match(s.haberler[s.haberler.length - 1].metin, /Üzüm aldı/);
});

test('al: sıra başkasındaysa, geçersiz yer, odada değilse reddedilir', () => {
  const d = kur(2);
  assert.match(hatali(u(d, { tip: 'al', id: pid(1), yer: 0 })), /Sıra sende değil/);
  assert.match(hatali(u(d, { tip: 'al', id: pid(0), yer: 5 })), /yok/);
  assert.match(hatali(u(d, { tip: 'al', id: pid(0), yer: -1 })), /yok/);
  assert.match(hatali(u(d, { tip: 'al', id: pid(0), yer: '1' })), /yok/);
  assert.match(hatali(u(d, { tip: 'al', id: pid(0) })), /yok/);
  assert.match(hatali(u(d, { tip: 'al', id: 'yabanci', yer: 0 })), /odada değilsin/);
  assert.match(hatali(u(lobi(2), { tip: 'al', id: pid(0), yer: 0 })), /oyun sürmüyor/);
});

test('al: el sınırı 6 kart; dolu elle alınmaz', () => {
  const d = kur(2, { eller: [{ elma: 2, muz: 2, uzum: 2 }] });
  assert.equal(elBoyu(d.eller[0]), EL_SINIRI);
  assert.equal(alabilirMi(d, 0), false);
  assert.match(hatali(u(d, { tip: 'al', id: pid(0), yer: 0 })), /Elin dolu/);
  // 5 kartla alınır
  const bes = kur(2, { eller: [{ elma: 2, muz: 2, uzum: 1 }] });
  assert.equal(elBoyu(basarili(u(bes, { tip: 'al', id: pid(0), yer: 0 })).eller[0]), 6);
});

// ---------------------------------------------------------------------------
// Sat
// ---------------------------------------------------------------------------

test('sat: adet x fiyat puan; fiyat adet kadar düşer, diğerleri 1 artar ama tavanı geçmez', () => {
  const d = kur(2, {
    eller: [{ karpuz: 3, elma: 1 }],
    fiyatlar: { elma: 1, muz: 4, uzum: 3, cilek: 6, karpuz: 7 },
  });
  assert.equal(satisDegeri(d, 'karpuz', 3), 21);
  assert.equal(satisSonrasiFiyat(d, 'karpuz', 3), 4);
  const s = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'karpuz', adet: 3 }));
  assert.equal(s.puanlar[0], 21);
  assert.equal(s.satilan[0], 3);
  assert.equal(s.eller[0].karpuz, 0);
  assert.equal(s.eller[0].elma, 1);
  assert.deepEqual(s.fiyatlar, { elma: 2, muz: 4, uzum: 4, cilek: 6, karpuz: 4 });
  assert.equal(s.sira, 1);
  assert.equal(s.sonOlay.tip, 'sat');
  assert.equal(s.sonOlay.kazanc, 21);
  assert.equal(s.sonOlay.fiyat, 7);
  assert.equal(s.sonOlay.yeniFiyat, 4);
  assert.deepEqual(s.enIyiSatis, { puan: 21, ad: 'Ayşe', meyve: 'karpuz', adet: 3 });
  // tezgâh ve deste satışta değişmez
  assert.deepEqual(s.tezgah, d.tezgah);
  assert.deepEqual(s.deste, d.deste);
});

test('sat: adet verilmezse hepsi satılır; bir kısmı da satılabilir', () => {
  const d = kur(2, { eller: [{ muz: 4 }] });
  const hepsi = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'muz' }));
  assert.equal(hepsi.puanlar[0], 16);
  assert.equal(hepsi.eller[0].muz, 0);
  assert.equal(hepsi.fiyatlar.muz, 1); // 4 - 4 = 0, taban 1
  const iki = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'muz', adet: 2 }));
  assert.equal(iki.puanlar[0], 8);
  assert.equal(iki.eller[0].muz, 2);
  assert.equal(iki.fiyatlar.muz, 2);
});

test('sat: fiyat 1 tabanının altına inmez', () => {
  const d = kur(2, { eller: [{ elma: 5 }], fiyatlar: { elma: 2 } });
  const s = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'elma' }));
  assert.equal(s.puanlar[0], 10);
  assert.equal(s.fiyatlar.elma, 1);
});

test('sat: ucuzlayan meyve sonraki satışlarla toparlanır', () => {
  let d = kur(2, { eller: [{ karpuz: 2, elma: 2 }, { muz: 2, uzum: 2 }] });
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'karpuz' })); // karpuz 7 -> 5
  assert.equal(d.fiyatlar.karpuz, 5);
  d = basarili(u(d, { tip: 'sat', id: pid(1), meyve: 'muz' })); // karpuz 6
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'elma' })); // karpuz 7
  d = basarili(u(d, { tip: 'sat', id: pid(1), meyve: 'uzum' })); // karpuz tavanda kalır
  assert.equal(d.fiyatlar.karpuz, 7);
  assert.equal(d.fiyatlar.muz, 4); // muz 2'ye düşmüştü, iki satışla geri geldi
});

test('sat: geçersiz satışlar reddedilir', () => {
  const d = kur(2, { eller: [{ karpuz: 1, muz: 3 }] });
  assert.match(hatali(u(d, { tip: 'sat', id: pid(0), meyve: 'karpuz' })), /En az 2/);
  assert.match(hatali(u(d, { tip: 'sat', id: pid(0), meyve: 'muz', adet: 1 })), /En az 2/);
  assert.match(hatali(u(d, { tip: 'sat', id: pid(0), meyve: 'muz', adet: 4 })), /o kadar/);
  assert.match(hatali(u(d, { tip: 'sat', id: pid(0), meyve: 'muz', adet: 2.5 })), /En az 2/);
  assert.match(hatali(u(d, { tip: 'sat', id: pid(0), meyve: 'ananas', adet: 2 })), /meyve yok/);
  assert.match(hatali(u(d, { tip: 'sat', id: pid(0), meyve: 'uzum' })), /En az 2/); // hiç yok
  assert.match(hatali(u(d, { tip: 'sat', id: pid(1), meyve: 'muz' })), /Sıra sende değil/);
  assert.match(hatali(u(d, { tip: 'bilinmez', id: pid(0) })), /Bilinmeyen/);
  assert.deepEqual(satilabilirler(d, 0), ['muz']);
});

test('dolu el her zaman satabilir (5 meyve, 6 kart: en az bir çift)', () => {
  const d = kur(2, { eller: [{ elma: 2, muz: 1, uzum: 1, cilek: 1, karpuz: 1 }] });
  assert.equal(alabilirMi(d, 0), false);
  assert.deepEqual(satilabilirler(d, 0), ['elma']);
  assert.equal(pasMi(d, 0), false);
});

// ---------------------------------------------------------------------------
// Pas
// ---------------------------------------------------------------------------

test('pas: yalnız hamle yokken; yoksa reddedilir', () => {
  const d = kur(2, { deste: [], tezgah: [], eller: [{ elma: 1, muz: 1 }] });
  d.sonTur = true;
  assert.equal(pasMi(d, 0), true);
  const s = basarili(u(d, { tip: 'pas', id: pid(0) }));
  assert.equal(s.sira, 1);
  assert.equal(s.sonOlay.tip, 'pas');
  const yapabilir = kur(2);
  assert.match(hatali(u(yapabilir, { tip: 'pas', id: pid(0) })), /pas geçemezsin/);
  const satabilir = kur(2, { deste: [], tezgah: [], eller: [{ elma: 2 }] });
  assert.match(hatali(u(satabilir, { tip: 'pas', id: pid(0) })), /pas geçemezsin/);
});

// ---------------------------------------------------------------------------
// Oyun sonu
// ---------------------------------------------------------------------------

test('son tur: deste bitince başlar; tur tamamlanınca biter (2 kişi)', () => {
  // Deste son kartında: ilk oyuncu alınca deste biter, ikinci oyuncu son hamlesini yapar
  let d = kur(2, { deste: ['karpuz'], eller: [{ cilek: 2 }, { elma: 2 }] });
  d = basarili(u(d, { tip: 'al', id: pid(0), yer: 0 }));
  assert.equal(d.sonTur, true);
  assert.equal(d.asama, 'oyun');
  assert.equal(d.deste.length, 0);
  assert.equal(d.tezgah.length, 5);
  assert.equal(kalanHamle(d), 1);
  assert.equal(d.sonOlay.tip, 'sonTur');
  assert.match(d.haberler[d.haberler.length - 1].metin, /son tur/);
  d = basarili(u(d, { tip: 'sat', id: pid(1), meyve: 'elma' }));
  assert.equal(d.asama, 'bitti');
  // Ayşe: 0 puan (elinde 2 çilek + 1 muz çürüdü). Bora: 6 puan.
  assert.deepEqual(kazananlar(d), [1]);
  assert.equal(d.sonuc.neden, 'puan');
  const sira = siralama(d);
  assert.equal(sira[0].idx, 1);
  assert.equal(sira[1].curuyen, 3);
  // Bittikten sonra hamle yapılmaz
  assert.match(hatali(u(d, { tip: 'al', id: pid(0), yer: 0 })), /oyun sürmüyor/);
});

test('son tur: tur sonundaki oyuncu desteyi bitirirse oyun hemen biter (herkes eşit hamle)', () => {
  let d = kur(2, { deste: ['muz', 'muz'], eller: [{ karpuz: 2 }, {}] });
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'karpuz' })); // 14 puan
  d = basarili(u(d, { tip: 'al', id: pid(1), yer: 0 })); // deste 1
  assert.equal(d.sonTur, false);
  d = basarili(u(d, { tip: 'al', id: pid(0), yer: 0 })); // deste 0: son tur, Bora'nın hamlesi kaldı
  assert.equal(kalanHamle(d), 1);
  d = basarili(u(d, { tip: 'al', id: pid(1), yer: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.equal(d.hamleSayisi, 4);
  assert.deepEqual(kazananlar(d), [0]);
});

test('son tur: 4 kişide sıra başlayana dönene kadar sürer', () => {
  let d = kur(4, { deste: ['elma'] });
  d = basarili(u(d, { tip: 'al', id: pid(0), yer: 0 })); // deste biter
  assert.equal(d.sonTur, true);
  assert.equal(kalanHamle(d), 3);
  d = basarili(u(d, { tip: 'al', id: pid(1), yer: 0 }));
  assert.equal(kalanHamle(d), 2);
  d = basarili(u(d, { tip: 'al', id: pid(2), yer: 0 }));
  assert.equal(kalanHamle(d), 1);
  assert.equal(d.tezgah.length, 3); // ilk alımda son kartla dolmuştu, sonra hep azalır
  d = basarili(u(d, { tip: 'al', id: pid(3), yer: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.equal(d.tezgah.length, 2);
  // kimse satmadı: hepsi 0 puan, 0 satış -> dörtlü beraberlik
  assert.deepEqual(kazananlar(d), [0, 1, 2, 3]);
  assert.equal(d.sonuc.neden, 'berabere');
});

test('son tur: tezgâh boşalınca hamlesi olmayan pas geçer', () => {
  let d = kur(2, { deste: [], tezgah: ['elma'], eller: [{}, { muz: 1 }] });
  d.sonTur = true;
  d = basarili(u(d, { tip: 'al', id: pid(0), yer: 0 }));
  assert.equal(d.tezgah.length, 0);
  assert.equal(pasMi(d, 1), true);
  assert.match(hatali(u(d, { tip: 'al', id: pid(1), yer: 0 })), /yok/);
  d = basarili(u(d, { tip: 'pas', id: pid(1) }));
  assert.equal(d.asama, 'bitti');
});

test('kazanan: puan eşitse daha çok kart satan kazanır', () => {
  // Ayşe 3 elma x 2 = 6 (3 kart), Bora 2 muz x 3 = 6 (2 kart)
  let d = kur(2, { deste: ['uzum'], eller: [{ elma: 3 }, { muz: 2 }], fiyatlar: { elma: 2, muz: 3 } });
  d.sonTur = true;
  d.deste = [];
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'elma' }));
  // muz fiyatı satış sonrası 3 + 1 = 4 olur: Bora'nın fiyatını önceden ayarla
  d.fiyatlar.muz = 3;
  d = basarili(u(d, { tip: 'sat', id: pid(1), meyve: 'muz' }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(d.puanlar, [6, 6]);
  assert.deepEqual(d.satilan, [3, 2]);
  assert.deepEqual(kazananlar(d), [0]);
  assert.equal(d.sonuc.neden, 'satilan');
});

test('kazanan: puan ve satılan kart eşitse berabere (2 kazanan)', () => {
  let d = kur(2, { eller: [{ elma: 2 }, { elma: 2 }], fiyatlar: { elma: 3 } });
  d.sonTur = true;
  d.deste = [];
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'elma' })); // 6, elma 1
  d.fiyatlar.elma = 3;
  d = basarili(u(d, { tip: 'sat', id: pid(1), meyve: 'elma' })); // 6
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(kazananlar(d), [0, 1]);
  assert.equal(d.sonuc.neden, 'berabere');
});

test('kazanan: 4 kişide iki kişi eşit önde, diğerleri geride', () => {
  let d = kur(4, { eller: [{ elma: 2 }, {}, { elma: 2 }, {}] });
  d.sonTur = true;
  d.deste = [];
  d.fiyatlar.elma = 3;
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'elma' }));
  d = basarili(u(d, { tip: 'al', id: pid(1), yer: 0 }));
  d.fiyatlar.elma = 3;
  d = basarili(u(d, { tip: 'sat', id: pid(2), meyve: 'elma' }));
  d = basarili(u(d, { tip: 'al', id: pid(3), yer: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(kazananlar(d), [0, 2]);
});

test('kazananlar: oyun bitmeden boş', () => {
  assert.deepEqual(kazananlar(lobi(2)), []);
  assert.deepEqual(kazananlar(oyun(2)), []);
});

test('tam oyun: rastgele oynanan 2 ve 4 kişilik oyunlar biter, kart kaybolmaz', () => {
  for (const n of [2, 3, 4]) {
    for (const uzunluk of ['kisa', 'normal']) {
      let tohum = n * 7 + uzunluk.length;
      const rastgele = () => {
        tohum = (tohum * 9301 + 49297) % 233280;
        return tohum / 233280;
      };
      let d = lobi(n);
      d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { uzunluk: uzunluk } }));
      d = basarili(uygula(d, { tip: 'baslat', id: pid(0) }, rastgele));
      const toplam = tamDeste(uzunluk).length;
      let adim = 0;
      let satilanKart = 0;
      while (d.asama === 'oyun') {
        adim += 1;
        assert.ok(adim < 500, 'oyun bitmedi');
        const ben = d.sira;
        const kim = pid(ben);
        const satilir = satilabilirler(d, ben);
        let eylem;
        if (satilir.length > 0 && (!alabilirMi(d, ben) || rastgele() < 0.3)) {
          eylem = { tip: 'sat', id: kim, meyve: satilir[0] };
        } else if (alabilirMi(d, ben)) {
          eylem = { tip: 'al', id: kim, yer: Math.floor(rastgele() * d.tezgah.length) };
        } else {
          eylem = { tip: 'pas', id: kim };
        }
        const once = elBoyu(d.eller[ben]);
        d = basarili(uygula(d, eylem, rastgele));
        if (eylem.tip === 'sat') {
          satilanKart += once - elBoyu(d.eller[ben]);
        }
        assert.equal(toplamKart(d) + satilanKart, toplam);
        for (const m of MEYVELER) {
          assert.ok(d.fiyatlar[m.id] >= 1 && d.fiyatlar[m.id] <= m.baslangic);
        }
      }
      assert.equal(d.asama, 'bitti');
      assert.equal(d.deste.length, 0);
      assert.equal(d.hamleSayisi % n, 0, 'herkes eşit hamle yapmalı');
      assert.ok(kazananlar(d).length >= 1);
    }
  }
});

// ---------------------------------------------------------------------------
// Tekrar oyna ve lobiye dön
// ---------------------------------------------------------------------------

function bitmisOyun() {
  let d = kur(2, { deste: [], eller: [{ karpuz: 2 }, {}] });
  d.sonTur = true;
  d = basarili(u(d, { tip: 'sat', id: pid(0), meyve: 'karpuz' }));
  d = basarili(u(d, { tip: 'al', id: pid(1), yer: 0 }));
  assert.equal(d.asama, 'bitti');
  return d;
}

test('tekrar oyna: yalnız ev sahibi, yalnız oyun bitince; başlayan bir kayar', () => {
  const d = bitmisOyun();
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  assert.match(hatali(u(oyun(2), { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  const yeni = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }));
  assert.equal(yeni.asama, 'oyun');
  assert.equal(yeni.baslayan, 1);
  assert.equal(yeni.sira, 1);
  assert.equal(yeni.oyunNo, 2);
  assert.deepEqual(yeni.puanlar, [0, 0]);
  assert.equal(yeni.sonuc, null);
  assert.equal(toplamKart(yeni), 40);
});

test('lobiye dön: ev sahibi, ayar kalır, alanlar boşalır', () => {
  let d = lobi(2);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { uzunluk: 'kisa' } }));
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  const l = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(l.asama, 'lobi');
  assert.equal(l.ayar.uzunluk, 'kisa');
  assert.deepEqual(l.eller, []);
  assert.deepEqual(l.tezgah, []);
  assert.match(hatali(u(l, { tip: 'yeniOyun', id: pid(0) })), /Zaten/);
});

// ---------------------------------------------------------------------------
// Yönlendirici
// ---------------------------------------------------------------------------

test('yönlendirici: oyun bilgisi listede', () => {
  const bilgi = OYUNLAR.find((o) => o.id === 'pazar');
  assert.ok(bilgi);
  assert.equal(bilgi.ad, 'Pazar');
  assert.equal(bilgi.enAz, 2);
  assert.equal(bilgi.enCok, 4);
  assert.ok(!bilgi.birlikte);
  assert.ok(!bilgi.sinirli);
});

test('yönlendirici: Pazar odası kurulur ve oyuna geçilir', () => {
  const d = yonlendirYeniOda(pid(0), 'Ayşe', 'pazar');
  assert.equal(oyunId(d), 'pazar');
  let k = basarili(yonlendir(d, { tip: 'katil', id: pid(1), ad: 'Bora' }));
  k = basarili(yonlendir(k, { tip: 'baslat', id: pid(0) }));
  assert.equal(k.asama, 'oyun');
  const yer = 0;
  k = basarili(yonlendir(k, { tip: 'al', id: pid(0), yer: yer }));
  assert.equal(k.sira, 1);
});

test('yönlendirici: UNO lobisinden Pazar seçilir, 4 kişiyle de seçilir, oyuncular kalır', () => {
  let d = yonlendirYeniOda(pid(0), 'Ayşe');
  for (let i = 1; i < 4; i++) {
    d = basarili(yonlendir(d, { tip: 'katil', id: pid(i), ad: ADLAR[i] }));
  }
  const p = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'pazar' }));
  assert.equal(p.oyun, 'pazar');
  assert.equal(p.asama, 'lobi');
  assert.deepEqual(
    p.oyuncular.map((o) => o.id),
    [pid(0), pid(1), pid(2), pid(3)]
  );
  assert.equal(p.sahip, pid(0));
  assert.match(hatali(yonlendir(d, { tip: 'oyunSec', id: pid(1), oyun: 'pazar' })), /ev sahibi/);
  // Pazar lobisinden öteki oyunlara geçilir
  for (const oyunAdi of ['uno', 'kelime', 'aynikafa', 'gorev', 'kule']) {
    const yeni = basarili(yonlendir(p, { tip: 'oyunSec', id: pid(0), oyun: oyunAdi }));
    assert.equal(yeni.oyun, oyunAdi);
  }
});

test('yönlendirici: Pazar biterse Kim önde kazananı bir kez sayar; beraberlik kimseye yazılmaz', () => {
  // Kazananlı bitiş
  const once = structuredClone(bitmisOyun());
  // bitmeden önceki durumu yeniden kur: son hamleyi yönlendiriciden geçir
  let d = kur(2, { deste: [], eller: [{ karpuz: 2 }, {}] });
  d.sonTur = true;
  d = basarili(yonlendir(d, { tip: 'sat', id: pid(0), meyve: 'karpuz' }));
  d = basarili(yonlendir(d, { tip: 'al', id: pid(1), yer: 0 }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(kazananlar(d), kazananlar(once));
  const g = genelVeri(d);
  assert.equal(g.biten, 1);
  assert.equal(g.kazanim[pid(0)].sayi, 1);
  assert.equal(g.berabere, 0);

  // Beraberlik
  let b = kur(2, { deste: [] });
  b.sonTur = true;
  b = basarili(yonlendir(b, { tip: 'al', id: pid(0), yer: 0 }));
  b = basarili(yonlendir(b, { tip: 'al', id: pid(1), yer: 0 }));
  assert.equal(b.asama, 'bitti');
  const gb = genelVeri(b);
  assert.equal(gb.biten, 1);
  assert.equal(gb.berabere, 1);
  assert.deepEqual(gb.kazanim, {});
});

test('lobiKur: verilen oyuncularla boş Pazar lobisi', () => {
  const d = lobiKur([{ id: 'a', ad: 'A' }, { id: 'b', ad: 'B' }], 'b');
  assert.equal(d.sahip, 'b');
  assert.equal(d.oyuncular.length, 2);
  assert.equal(d.asama, 'lobi');
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

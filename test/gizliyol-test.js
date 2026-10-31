// "Gizli Yol" motoru ve oyun yönlendirici testleri. Çalıştır: node test/gizliyol-test.js
import assert from 'node:assert/strict';
import {
  BAKMA_SURELERI,
  PES_HATASI,
  SATIR_SAYILARI,
  TUR_SAYILARI,
  eskiDurumMu,
  herkesBitti,
  kareUyarisi,
  kazananlar,
  lobiKur,
  oyuncuDurumu,
  oyunKazananlari,
  satirSayisiOku,
  siradakiSatir,
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

// n satırlık yol: her satırın sütunu (başlangic + satır) % 6
function yolYap(n, baslangic) {
  const yol = [];
  for (let s = 0; s < n; s++) {
    yol.push((baslangic + s) % 6);
  }
  return yol;
}

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

// Bulma aşamasına geçmiş oyun: oyuncu 0'ın yolu başlangıç 0'dan, oyuncu 1'in yolu başlangıç 3'ten
function bulmada(ayar = {}) {
  const n = ayar.satirSayisi || 10;
  let d = baslat(ayar);
  d = hazirOl(d, 0, yolYap(n, 0));
  d = hazirOl(d, 1, yolYap(n, 3));
  return d;
}

function kare(d, i, satir, sutun) {
  return u(d, { tip: 'kare', id: pid(i), tur: d.tur, satir: satir, sutun: sutun });
}

function dokun(d, i, satir, sutun) {
  return basarili(kare(d, i, satir, sutun));
}

function bak(d, i, zaman = 1000) {
  return u(d, { tip: 'bak', id: pid(i), tur: d.tur, zaman: zaman });
}

// i. oyuncunun sıradaki satırında yanlış bir sütun (doğru sütun ve atlananlar dışında, ilk bulunan)
function yanlisSutun(d, i, atla = []) {
  const dogru = sonrakiDogruKare(d, i)[1];
  for (let s = 0; s < 6; s++) {
    if (s !== dogru && !atla.includes(s)) {
      return s;
    }
  }
  return -1;
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

// i. oyuncu sıradaki satırda n kez yanlış basar (en çok 5 farklı kutu)
function hataYap(d, i, n) {
  let simdi = d;
  const satir = sonrakiDogruKare(simdi, i)[0];
  const dogru = sonrakiDogruKare(simdi, i)[1];
  let yapilan = 0;
  for (let sutun = 0; sutun < 6 && yapilan < n; sutun++) {
    if (sutun === dogru) {
      continue;
    }
    simdi = dokun(simdi, i, satir, sutun);
    yapilan += 1;
  }
  assert.equal(yapilan, n, 'hataYap: bir satırda en çok 5 yanlış denenebilir');
  return simdi;
}

// Hata sayacını doğrudan kurar (yalnız 25 hata testleri için)
function hataSayisiniKur(d, i, n) {
  const kopya = structuredClone(d);
  kopya.bulma[i].hata = n;
  return kopya;
}

// ---------------------------------------------------------------------------
// Yol (satır başına bir kutu)
// ---------------------------------------------------------------------------

test('yol: her satırdan bir kutu seçilince geçerli, 8 ve 10 satır', () => {
  assert.equal(yolHatasi(yolYap(10, 0), 10), null);
  assert.equal(yolHatasi(yolYap(8, 2), 8), null);
  // Komşuluk şartı yok: ardışık satırlarda uzak sütunlar serbest
  assert.equal(yolHatasi([0, 5, 0, 5, 0, 5, 0, 5], 8), null);
  assert.equal(yolHatasi([3, 3, 3, 3, 3, 3, 3, 3, 3, 3], 10), null);
});

test('yol: eksik, fazla ya da geçersiz sütunlu yol reddedilir', () => {
  assert.match(yolHatasi(yolYap(9, 0), 10), /her satırdan/i);
  assert.match(yolHatasi(yolYap(11, 0), 10), /her satırdan/i);
  assert.match(yolHatasi(yolYap(10, 0), 8), /8 satır/);
  assert.match(yolHatasi(null, 10), /her satırdan/i);
  assert.match(yolHatasi(undefined, 10), /her satırdan/i);
  const bosluklu = yolYap(10, 0);
  bosluklu[4] = null;
  assert.match(yolHatasi(bosluklu, 10), /her satırdan/i);
  const disarida = yolYap(10, 0);
  disarida[2] = 6;
  assert.match(yolHatasi(disarida, 10), /her satırdan/i);
  disarida[2] = -1;
  assert.notEqual(yolHatasi(disarida, 10), null);
  disarida[2] = 1.5;
  assert.notEqual(yolHatasi(disarida, 10), null);
  disarida[2] = '2';
  assert.notEqual(yolHatasi(disarida, 10), null);
});

// ---------------------------------------------------------------------------
// Oda ve lobi
// ---------------------------------------------------------------------------

test('yeni oda: gizliyol lobisi, varsayılan ayarlar', () => {
  const d = yeniOda('a', 'Ali');
  assert.equal(d.oyun, 'gizliyol');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, 'a');
  assert.deepEqual(d.ayar, { turSayisi: 3, satirSayisi: 10, bakmaSuresi: 5 });
  assert.equal(d.oyuncular.length, 1);
  assert.equal(eskiDurumMu(d), false);
});

test('tam 2 oyuncu: üçüncü katılamaz, bir kişiyle başlamaz', () => {
  const tek = yeniOda(pid(0), 'Ali');
  assert.match(hatali(u(tek, { tip: 'baslat', id: pid(0) })), /2 kişi/);
  const iki = lobi();
  assert.match(hatali(u(iki, { tip: 'katil', id: pid(2), ad: 'Cem' })), /dolu/);
});

test('katılma: aynı kişi iki kez eklenmez, aynı ad ayrılır, başlayan oyuna girilmez', () => {
  const d = lobi({}, 1);
  const ayni = basarili(u(d, { tip: 'katil', id: pid(0), ad: 'Ali' }));
  assert.equal(ayni.oyuncular.length, 1);
  const ikinci = basarili(u(d, { tip: 'katil', id: pid(1), ad: 'Ali' }));
  assert.notEqual(ikinci.oyuncular[0].ad, ikinci.oyuncular[1].ad);
  const baslamis = baslat();
  assert.match(hatali(u(baslamis, { tip: 'katil', id: pid(5), ad: 'Cem' })), /başladı/);
});

test('ayarlar: satır sayısı 8 ya da 10, süre 3/5/10/15, tur 1/3/5', () => {
  assert.deepEqual(SATIR_SAYILARI, [8, 10]);
  assert.deepEqual(BAKMA_SURELERI, [3, 5, 10, 15]);
  assert.deepEqual(TUR_SAYILARI, [1, 3, 5]);
  let d = lobi();
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { satirSayisi: 8 } }));
  assert.equal(d.ayar.satirSayisi, 8);
  assert.equal(d.ayar.bakmaSuresi, 5);
  for (const sure of BAKMA_SURELERI) {
    d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { bakmaSuresi: sure } }));
    assert.equal(d.ayar.bakmaSuresi, sure);
  }
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 5, satirSayisi: 10, bakmaSuresi: 3 } }));
  assert.deepEqual(d.ayar, { turSayisi: 5, satirSayisi: 10, bakmaSuresi: 3 });
});

test('ayarlar: yalnız ev sahibi ve lobide, geçersiz değer reddedilir', () => {
  const d = lobi();
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { turSayisi: 5 } })), /ev sahibi/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 4 } })), /tur/i);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { satirSayisi: 9 } })), /satır/i);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { satirSayisi: 12 } })), /satır/i);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { bakmaSuresi: 7 } })), /süre/i);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { bakmaSuresi: 20 } })), /süre/i);
  const oyunda = baslat();
  assert.match(hatali(u(oyunda, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 5 } })), /başlamadan/);
});

test('çıkma: lobide çıkılır, ev sahibi çıkınca sahiplik geçer, oyun sürerken çıkılmaz', () => {
  const d = lobi();
  const cikti = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(cikti.oyuncular.length, 1);
  assert.equal(cikti.sahip, pid(1));
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(0) })), /ev sahibi/);
  assert.match(hatali(u(baslat(), { tip: 'cikar', id: pid(1) })), /sürerken/);
});

test('başlatma: yalnız ev sahibi, kurma aşaması açılır, yollar ve işaretler boş', () => {
  const d = lobi();
  assert.match(hatali(u(d, { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  const b = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(b.asama, 'kurma');
  assert.equal(b.tur, 0);
  assert.deepEqual(b.yollar, [null, null]);
  assert.deepEqual(b.hazir, [false, false]);
  assert.equal(b.bulma.length, 2);
  b.bulma.forEach((x) => {
    assert.equal(x.bulunan, 0);
    assert.equal(x.hata, 0);
    assert.deepEqual(x.yanlislar, []);
    assert.equal(x.bakti, false);
    assert.equal(x.tahminYapti, false);
    assert.equal(x.bitti, false);
  });
  assert.match(hatali(u(b, { tip: 'baslat', id: pid(0) })), /zaten/);
});

// ---------------------------------------------------------------------------
// Kurma
// ---------------------------------------------------------------------------

test('hazır: eksik satırlı yol reddedilir, durum değişmez', () => {
  const d = baslat();
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: yolYap(9, 0) })), /her satırdan/i);
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: [] })), /her satırdan/i);
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0 })), /her satırdan/i);
  const bosluklu = yolYap(10, 0);
  bosluklu[9] = null;
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: bosluklu })), /her satırdan/i);
  assert.deepEqual(d.hazir, [false, false]);
});

test('hazır: 10 satır ayarında 10, 8 satır ayarında 8 satırlık yol gerekir', () => {
  const on = baslat({ satirSayisi: 10 });
  assert.equal(hazirOl(on, 0, yolYap(10, 1)).hazir[0], true);
  assert.match(hatali(u(on, { tip: 'hazir', id: pid(0), tur: 0, yol: yolYap(8, 1) })), /10 satır/);
  const sekiz = baslat({ satirSayisi: 8 });
  assert.equal(hazirOl(sekiz, 0, yolYap(8, 1)).hazir[0], true);
  assert.match(hatali(u(sekiz, { tip: 'hazir', id: pid(0), tur: 0, yol: yolYap(10, 1) })), /8 satır/);
});

test('hazır: yol kaydedilir, ikisi de hazır olunca bulma başlar', () => {
  let d = baslat();
  d = hazirOl(d, 0, yolYap(10, 0));
  assert.equal(d.asama, 'kurma');
  assert.deepEqual(d.yollar[0], yolYap(10, 0));
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 0, yol: yolYap(10, 1) })), /zaten hazırsın/i);
  d = hazirOl(d, 1, yolYap(10, 3));
  assert.equal(d.asama, 'bulma');
  assert.deepEqual(d.yollar[1], yolYap(10, 3));
});

test('hazır: yanlış tur, odada olmayan ve yanlış aşama', () => {
  const d = baslat();
  assert.match(hatali(u(d, { tip: 'hazir', id: pid(0), tur: 4, yol: yolYap(10, 0) })), /geçti/);
  assert.match(hatali(u(d, { tip: 'hazir', id: 'yok', tur: 0, yol: yolYap(10, 0) })), /odada değilsin/);
  assert.match(hatali(u(lobi(), { tip: 'hazir', id: pid(0), yol: yolYap(10, 0) })), /seçilmez/);
});

test('hazirIptal: rakip hazır olmadan yol geri alınır ve değiştirilir', () => {
  let d = baslat();
  d = hazirOl(d, 0, yolYap(10, 0));
  d = basarili(u(d, { tip: 'hazirIptal', id: pid(0), tur: 0 }));
  assert.equal(d.hazir[0], false);
  assert.equal(d.yollar[0], null);
  d = hazirOl(d, 0, yolYap(10, 2));
  assert.deepEqual(d.yollar[0], yolYap(10, 2));
  // İkisi de hazırsa bulma başladı, yol değişmez
  d = hazirOl(d, 1, yolYap(10, 3));
  assert.match(hatali(u(d, { tip: 'hazirIptal', id: pid(0), tur: 0 })), /değişmez/);
});

test('gönderilen yolun kopyası saklanır, sonradan değişse de etkilenmez', () => {
  const yol = yolYap(10, 0);
  let d = baslat();
  d = hazirOl(d, 0, yol);
  yol[0] = 5;
  assert.equal(d.yollar[0][0], 0);
});

// ---------------------------------------------------------------------------
// Bakma
// ---------------------------------------------------------------------------

test('bak: bulma aşamasında bir kez kullanılır, ikincisi reddedilir', () => {
  let d = bulmada();
  d = basarili(bak(d, 0, 12345));
  const durum = oyuncuDurumu(d, 0);
  assert.equal(durum.bakti, true);
  assert.equal(durum.bakmaZamani, 12345);
  assert.equal(durum.bakabilir, false);
  assert.match(hatali(bak(d, 0)), /zaten baktın/);
  // Rakip bu turda bakmadı, o kendi hakkını kullanabilir
  assert.equal(oyuncuDurumu(d, 1).bakti, false);
  assert.equal(oyuncuDurumu(d, 1).bakabilir, true);
  d = basarili(bak(d, 1, 20000));
  assert.equal(oyuncuDurumu(d, 1).bakti, true);
});

test('bak: yanlış aşama, yanlış tur ve odada olmayan reddedilir', () => {
  assert.match(hatali(u(baslat(), { tip: 'bak', id: pid(0), tur: 0, zaman: 1 })), /bakılmaz/);
  assert.match(hatali(u(lobi(), { tip: 'bak', id: pid(0), zaman: 1 })), /bakılmaz/);
  const d = bulmada();
  assert.match(hatali(u(d, { tip: 'bak', id: pid(0), tur: 3, zaman: 1 })), /geçti/);
  assert.match(hatali(u(d, { tip: 'bak', id: 'yok', tur: 0, zaman: 1 })), /odada değilsin/);
});

test('bak: ilk tahminden sonra bakılamaz (doğru tahmin de hakkı yakar)', () => {
  let d = bulmada();
  const hedef = sonrakiDogruKare(d, 0);
  d = dokun(d, 0, hedef[0], hedef[1]);
  assert.equal(oyuncuDurumu(d, 0).tahminYapti, true);
  assert.equal(oyuncuDurumu(d, 0).bakabilir, false);
  assert.match(hatali(bak(d, 0)), /artık bakamazsın/);
  assert.equal(oyuncuDurumu(d, 0).bakti, false);
  // Rakibin hakkı etkilenmez
  assert.equal(oyuncuDurumu(d, 1).bakabilir, true);
});

test('bak: yanlış tahmin de hakkı yakar', () => {
  let d = bulmada();
  d = dokun(d, 0, 9, yanlisSutun(d, 0));
  assert.match(hatali(bak(d, 0)), /artık bakamazsın/);
});

test('bak: baktıktan sonra tahmin yapılabilir, süre ayarı değerleri hepsi kabul edilir', () => {
  for (const sure of BAKMA_SURELERI) {
    let d = bulmada({ bakmaSuresi: sure });
    assert.equal(d.ayar.bakmaSuresi, sure);
    d = basarili(bak(d, 0, 5));
    const hedef = sonrakiDogruKare(d, 0);
    d = dokun(d, 0, hedef[0], hedef[1]);
    assert.equal(oyuncuDurumu(d, 0).bulunan, 1);
    assert.equal(oyuncuDurumu(d, 0).bakti, true);
  }
});

test('bak: zaman verilmezse null kalır, yine de baktı sayılır', () => {
  let d = bulmada();
  d = basarili(u(d, { tip: 'bak', id: pid(0), tur: 0 }));
  assert.equal(oyuncuDurumu(d, 0).bakti, true);
  assert.equal(oyuncuDurumu(d, 0).bakmaZamani, null);
});

test('bak: bitiren oyuncu bakamaz', () => {
  let d = bulmada();
  d = hatasizBul(d, 0);
  assert.match(hatali(bak(d, 0)), /bitirdin/);
});

test('bak: yeni turda hak yenilenir', () => {
  let d = bulmada();
  d = basarili(bak(d, 0));
  d = hatasizBul(d, 0);
  d = hatasizBul(d, 1);
  d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  d = hazirOl(d, 0, yolYap(10, 0));
  d = hazirOl(d, 1, yolYap(10, 1));
  assert.equal(oyuncuDurumu(d, 0).bakti, false);
  assert.equal(oyuncuDurumu(d, 0).bakabilir, true);
  d = basarili(bak(d, 0));
  assert.equal(oyuncuDurumu(d, 0).bakti, true);
});

// ---------------------------------------------------------------------------
// Çözme
// ---------------------------------------------------------------------------

test('çözme: sıra alt satırdan başlar, doğru kutu satırı geçirir', () => {
  let d = bulmada();
  assert.equal(siradakiSatir(d, 0), 9);
  assert.deepEqual(sonrakiDogruKare(d, 0), [9, d.yollar[1][9]]);
  const hedef = sonrakiDogruKare(d, 0);
  d = dokun(d, 0, hedef[0], hedef[1]);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 1);
  assert.equal(oyuncuDurumu(d, 0).hata, 0);
  assert.equal(siradakiSatir(d, 0), 8);
  assert.deepEqual(sonrakiDogruKare(d, 0), [8, d.yollar[1][8]]);
});

test('çözme: yanlış kutu hata +1, kalıcı işaret, aynı satırda devam (başa dönme yok)', () => {
  let d = bulmada();
  const ilk = sonrakiDogruKare(d, 0);
  d = dokun(d, 0, ilk[0], ilk[1]);
  d = dokun(d, 0, 8, yanlisSutun(d, 0));
  assert.equal(oyuncuDurumu(d, 0).hata, 1);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 1); // bulunan satır korunur
  assert.equal(siradakiSatir(d, 0), 8); // aynı satır
  assert.equal(d.bulma[0].yanlislar.length, 1);
  assert.equal(d.bulma[0].yanlislar[0].satir, 8);
  // Aynı satırda ikinci yanlış, sonra doğru
  const ikinci = yanlisSutun(d, 0, [d.bulma[0].yanlislar[0].sutun]);
  d = dokun(d, 0, 8, ikinci);
  assert.equal(oyuncuDurumu(d, 0).hata, 2);
  const dogru = sonrakiDogruKare(d, 0);
  d = dokun(d, 0, dogru[0], dogru[1]);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 2);
  assert.equal(oyuncuDurumu(d, 0).hata, 2);
  assert.equal(d.bulma[0].yanlislar.length, 2); // işaretler kalır
});

test('çözme: işaretli kutuya tekrar dokunmak hata saymaz, uyarı verir', () => {
  let d = bulmada();
  const yanlis = yanlisSutun(d, 0);
  d = dokun(d, 0, 9, yanlis);
  const once = oyuncuDurumu(d, 0).hata;
  const uyari = kareUyarisi(d, 0, 9, yanlis);
  assert.equal(uyari.neden, 'isaretli');
  assert.match(hatali(kare(d, 0, 9, yanlis)), /yanlıştı/);
  assert.equal(oyuncuDurumu(d, 0).hata, once);
  assert.equal(d.bulma[0].yanlislar.length, 1);
});

test('çözme: sıradaki satır dışına dokunmak hata sayılmaz, yalnız uyarıdır', () => {
  let d = bulmada();
  // Üst satıra atlamak
  assert.equal(kareUyarisi(d, 0, 0, 2).neden, 'sira');
  assert.match(hatali(kare(d, 0, 0, 2)), /Sıra alttan 1\. satırda/);
  assert.match(hatali(kare(d, 0, 5, 2)), /Sıra alttan 1\. satırda/);
  assert.equal(oyuncuDurumu(d, 0).hata, 0);
  assert.equal(oyuncuDurumu(d, 0).tahminYapti, false); // uyarı Bak hakkını yakmaz
  assert.equal(oyuncuDurumu(d, 0).bakabilir, true);
  // Bir satır bulunduktan sonra altındaki satıra dokunmak
  const hedef = sonrakiDogruKare(d, 0);
  d = dokun(d, 0, hedef[0], hedef[1]);
  assert.equal(kareUyarisi(d, 0, 9, 0).neden, 'bulundu');
  assert.match(hatali(kare(d, 0, 9, 0)), /zaten buldun/);
  assert.match(hatali(kare(d, 0, 3, 0)), /Sıra alttan 2\. satırda/);
  assert.equal(oyuncuDurumu(d, 0).hata, 0);
});

test('çözme: tahta dışı kutu, yanlış tur, yanlış aşama, odada olmayan', () => {
  const d = bulmada();
  assert.match(hatali(kare(d, 0, 10, 0)), /tahtada yok/);
  assert.match(hatali(kare(d, 0, -1, 0)), /tahtada yok/);
  assert.match(hatali(kare(d, 0, 9, 6)), /tahtada yok/);
  assert.match(hatali(kare(d, 0, 9, 1.5)), /tahtada yok/);
  assert.match(hatali(u(d, { tip: 'kare', id: pid(0), tur: 7, satir: 9, sutun: 0 })), /geçti/);
  assert.match(hatali(kare(d, 9, 9, 0)), /odada değilsin/);
  assert.match(hatali(u(baslat(), { tip: 'kare', id: pid(0), tur: 0, satir: 9, sutun: 0 })), /seçilmez/);
});

test('çözme: 8 satırlık tahtada alt satır 7, 8. satır yoktur', () => {
  let d = bulmada({ satirSayisi: 8 });
  assert.equal(satirSayisiOku(d), 8);
  assert.equal(siradakiSatir(d, 0), 7);
  assert.match(hatali(kare(d, 0, 8, 0)), /tahtada yok/);
  assert.match(hatali(kare(d, 0, 9, 0)), /tahtada yok/);
  d = hatasizBul(d, 0);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 8);
  assert.equal(oyuncuDurumu(d, 0).bitti, true);
});

test('çözme: 10 satırlık tahtada bütün satırları bulan bitirir', () => {
  let d = bulmada({ satirSayisi: 10 });
  d = hatasizBul(d, 0);
  assert.equal(oyuncuDurumu(d, 0).bulunan, 10);
  assert.equal(oyuncuDurumu(d, 0).bitti, true);
  assert.equal(d.asama, 'bulma'); // rakip sürerken tur açılmaz
  assert.equal(siradakiSatir(d, 0), null);
  assert.match(hatali(kare(d, 0, 0, 0)), /bitirdin/);
});

test('çözme: iki oyuncu aynı anda oynar, biri diğerinin ilerlemesini bozmaz', () => {
  let d = bulmada();
  const a = sonrakiDogruKare(d, 0);
  d = dokun(d, 0, a[0], a[1]);
  d = dokun(d, 1, 9, yanlisSutun(d, 1));
  assert.equal(oyuncuDurumu(d, 0).bulunan, 1);
  assert.equal(oyuncuDurumu(d, 0).hata, 0);
  assert.equal(oyuncuDurumu(d, 1).bulunan, 0);
  assert.equal(oyuncuDurumu(d, 1).hata, 1);
});

test('çözme: hata çok olsa da en sonunda bulan bitirir', () => {
  let d = bulmada();
  d = hataYap(d, 0, 4);
  d = hatasizBul(d, 0);
  assert.equal(oyuncuDurumu(d, 0).bitti, true);
  assert.equal(oyuncuDurumu(d, 0).hata, 4);
});

// ---------------------------------------------------------------------------
// Tur ve oyun sonu
// ---------------------------------------------------------------------------

test('tur sonu: az hata yapan turu alır, yollar ve hatalar açık kalır', () => {
  let d = bulmada();
  d = hataYap(d, 0, 2);
  d = hatasizBul(d, 0);
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.gecmis, [{ hatalar: [2, 0], kazanan: 1 }]);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.equal(d.oyuncular[1].puan, 1);
  assert.equal(d.yollar[0].length, 10);
  assert.equal(d.yollar[1].length, 10);
  assert.equal(d.bulma[0].yanlislar.length, 2);
  assert.equal(herkesBitti(d), true);
});

test('tur sonu: bitiş sırası kazananı etkilemez', () => {
  let d = bulmada();
  d = hatasizBul(d, 1); // rakip önce bitirir
  d = hataYap(d, 0, 1);
  d = hatasizBul(d, 0);
  assert.equal(d.gecmis[0].kazanan, 1);
  let e = bulmada();
  e = hataYap(e, 1, 1);
  e = hatasizBul(e, 0); // 0 önce, hatasız
  e = hatasizBul(e, 1);
  assert.equal(e.gecmis[0].kazanan, 0);
});

test('tur sonu: eşit hata berabere, kimse puan almaz', () => {
  let d = bulmada();
  d = hataYap(d, 0, 1);
  d = hataYap(d, 1, 1);
  d = hatasizBul(d, 0);
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.gecmis, [{ hatalar: [1, 1], kazanan: -1 }]);
  assert.equal(d.oyuncular[0].puan, 0);
  assert.equal(d.oyuncular[1].puan, 0);
  // İkisi de hatasız
  let e = bulmada();
  e = hatasizBul(e, 0);
  e = hatasizBul(e, 1);
  assert.equal(e.gecmis[0].kazanan, -1);
});

test('sonraki tur: herhangi biri basar, yeni yollar seçilir, işaretler ve Bak hakkı sıfırlanır', () => {
  let d = bulmada();
  d = basarili(bak(d, 0));
  d = hataYap(d, 1, 1);
  d = hatasizBul(d, 0);
  d = hatasizBul(d, 1);
  d = basarili(u(d, { tip: 'sonraki', id: pid(1), tur: 0 }));
  assert.equal(d.asama, 'kurma');
  assert.equal(d.tur, 1);
  assert.deepEqual(d.yollar, [null, null]);
  assert.deepEqual(d.hazir, [false, false]);
  assert.equal(d.bulma[0].bakti, false);
  assert.deepEqual(d.bulma[1].yanlislar, []);
  assert.equal(d.oyuncular[0].puan, 1); // puan kalır
  // İkinci basış zararsız
  const ayni = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: 0 }));
  assert.equal(ayni.tur, 1);
});

test('sonraki tur: tur açık değilken hata verir', () => {
  assert.match(hatali(u(bulmada(), { tip: 'sonraki', id: pid(0), tur: 0 })), /geçilmez/);
  assert.match(hatali(u(baslat(), { tip: 'sonraki', id: pid(0), tur: 0 })), /geçilmez/);
  assert.match(hatali(u(bulmada(), { tip: 'sonraki', id: 'yok', tur: 0 })), /odada değilsin/);
});

// n turluk oyunu oynatır: kazananlarListesi[t] = tur t'yi kim alsın (0, 1 ya da -1)
function oyunuOynat(ayar, kazananlarListesi) {
  let d = lobi(ayar);
  d = basarili(u(d, { tip: 'baslat', id: pid(0) }));
  const n = satirSayisiOku(d);
  for (let t = 0; t < kazananlarListesi.length; t++) {
    d = hazirOl(d, 0, yolYap(n, t));
    d = hazirOl(d, 1, yolYap(n, t + 3));
    const k = kazananlarListesi[t];
    if (k === 0) {
      d = hataYap(d, 1, 1);
    } else if (k === 1) {
      d = hataYap(d, 0, 1);
    }
    d = hatasizBul(d, 0);
    d = hatasizBul(d, 1);
    d = basarili(u(d, { tip: 'sonraki', id: pid(0), tur: d.tur }));
  }
  return d;
}

test('oyun sonu: 1 turluk oyun biter, kazanan en çok tur alandır', () => {
  const d = oyunuOynat({ turSayisi: 1 }, [0]);
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(kazananlar(d), [0]);
  assert.deepEqual(oyunKazananlari(d), [0]);
});

test('oyun sonu: 3 turluk tam oyun, puanlar ve geçmiş doğru', () => {
  const d = oyunuOynat({ turSayisi: 3 }, [0, 1, 1]);
  assert.equal(d.asama, 'bitti');
  assert.equal(d.gecmis.length, 3);
  assert.deepEqual(
    d.oyuncular.map((o) => o.puan),
    [1, 2]
  );
  assert.deepEqual(kazananlar(d), [1]);
});

test('oyun sonu: eşit tur sayısı berabere, oyun bitmeden kazanan yok', () => {
  const d = oyunuOynat({ turSayisi: 3 }, [0, 1, -1]);
  assert.deepEqual(kazananlar(d), [0, 1]);
  assert.deepEqual(kazananlar(bulmada()), []);
});

test('oyun sonu: 5 turluk oyun 8 satırla da biter', () => {
  const d = oyunuOynat({ turSayisi: 5, satirSayisi: 8 }, [0, 0, 1, 0, 1]);
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(kazananlar(d), [0]);
});

test('tekrar oyna: yalnız ev sahibi, bitince; puanlar sıfırlanır, kurma başlar', () => {
  const d = oyunuOynat({ turSayisi: 1 }, [0]);
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  const yeni = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }));
  assert.equal(yeni.asama, 'kurma');
  assert.equal(yeni.tur, 0);
  assert.deepEqual(yeni.gecmis, []);
  assert.deepEqual(
    yeni.oyuncular.map((o) => o.puan),
    [0, 0]
  );
  assert.match(hatali(u(bulmada(), { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
});

test('lobiye dön: ev sahibi her aşamada, ayarlar kalır', () => {
  let d = bulmada({ satirSayisi: 8, bakmaSuresi: 15, turSayisi: 5 });
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  d = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(d.asama, 'lobi');
  assert.deepEqual(d.ayar, { turSayisi: 5, satirSayisi: 8, bakmaSuresi: 15 });
  assert.deepEqual(d.yollar, []);
  assert.deepEqual(d.bulma, []);
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(0) })), /lobidesin/);
});

// ---------------------------------------------------------------------------
// Pes
// ---------------------------------------------------------------------------

test('pes: 25 hataya ulaşmadan edilmez, ulaşınca edilir ve tur 25 hata sayılır', () => {
  let d = bulmada();
  assert.match(hatali(u(d, { tip: 'pes', id: pid(0), tur: 0 })), /25 hataya/);
  assert.equal(oyuncuDurumu(d, 0).pesEdebilir, false);
  d = hataSayisiniKur(d, 0, 24);
  assert.equal(oyuncuDurumu(d, 0).pesEdebilir, false);
  d = hataSayisiniKur(d, 0, PES_HATASI);
  assert.equal(oyuncuDurumu(d, 0).pesEdebilir, true);
  d = basarili(u(d, { tip: 'pes', id: pid(0), tur: 0 }));
  assert.equal(oyuncuDurumu(d, 0).bitti, true);
  assert.equal(oyuncuDurumu(d, 0).pes, true);
  assert.equal(oyuncuDurumu(d, 0).hata, 25);
  d = hatasizBul(d, 1);
  assert.equal(d.asama, 'acik');
  assert.deepEqual(d.gecmis[0], { hatalar: [25, 0], kazanan: 1 });
});

test('pes: pes eden oyuncu artık kutu seçemez, ikinci pes reddedilir', () => {
  let d = hataSayisiniKur(bulmada(), 0, 30);
  d = basarili(u(d, { tip: 'pes', id: pid(0), tur: 0 }));
  assert.equal(oyuncuDurumu(d, 0).hata, 25); // 30 değil, 25
  assert.match(hatali(u(d, { tip: 'pes', id: pid(0), tur: 0 })), /bitirdin/);
  assert.match(hatali(kare(d, 0, 9, 0)), /bitirdin/);
});

test('pes: iki oyuncu da pes ederse berabere', () => {
  let d = bulmada();
  d = hataSayisiniKur(d, 0, 25);
  d = hataSayisiniKur(d, 1, 25);
  d = basarili(u(d, { tip: 'pes', id: pid(0), tur: 0 }));
  d = basarili(u(d, { tip: 'pes', id: pid(1), tur: 0 }));
  assert.equal(d.asama, 'acik');
  assert.equal(d.gecmis[0].kazanan, -1);
});

test('gerçek 25 hata: beş satırda beşer yanlışla pes edilebilir hâle gelinir', () => {
  let d = bulmada();
  for (let k = 0; k < 5; k++) {
    d = hataYap(d, 0, 5);
    const dogru = sonrakiDogruKare(d, 0);
    d = dokun(d, 0, dogru[0], dogru[1]);
  }
  assert.equal(oyuncuDurumu(d, 0).hata, 25);
  assert.equal(oyuncuDurumu(d, 0).pesEdebilir, true);
});

// ---------------------------------------------------------------------------
// Genel
// ---------------------------------------------------------------------------

test('girdi durumu hiç değişmez (donmuş durumla çalışır)', () => {
  const d = dondur(bulmada());
  const hedef = sonrakiDogruKare(d, 0);
  const s1 = u(d, { tip: 'kare', id: pid(0), tur: 0, satir: hedef[0], sutun: hedef[1] });
  assert.equal(s1.ok, true);
  const s2 = bak(d, 1);
  assert.equal(s2.ok, true);
  assert.equal(d.bulma[0].bulunan, 0);
  assert.equal(d.bulma[1].bakti, false);
});

test('bilinmeyen hareket hata verir', () => {
  assert.match(hatali(u(bulmada(), { tip: 'uc' })), /Bilinmeyen/);
  assert.match(hatali(u(bulmada(), null)), /Bilinmeyen/);
});

test('lobiKur: verilen oyuncularla boş lobi', () => {
  const d = lobiKur(
    [
      { id: 'a', ad: 'Ali', puan: 7 },
      { id: 'b', ad: 'Bora' },
    ],
    'b'
  );
  assert.equal(d.oyun, 'gizliyol');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, 'b');
  assert.deepEqual(
    d.oyuncular.map((o) => [o.id, o.ad, o.puan]),
    [
      ['a', 'Ali', 0],
      ['b', 'Bora', 0],
    ]
  );
  assert.deepEqual(d.ayar, { turSayisi: 3, satirSayisi: 10, bakmaSuresi: 5 });
});

// ---------------------------------------------------------------------------
// Eski odalarla uyum
// ---------------------------------------------------------------------------

// Eski biçimde (komşu kareli yol, enAzKare ayarı) bir oda
function eskiOda(asama) {
  const d = {
    oyun: 'gizliyol',
    asama: asama,
    sahip: pid(0),
    ayar: { turSayisi: 5, enAzKare: 12 },
    oyuncular: [
      { id: pid(0), ad: 'Ali', puan: 1 },
      { id: pid(1), ad: 'Bora', puan: 0 },
    ],
    tur: 1,
    yollar: [],
    hazir: [],
    bulma: [],
    gecmis: [{ hatalar: [0, 2], kazanan: 0 }],
  };
  if (asama !== 'lobi') {
    d.yollar = [
      [
        [5, 0],
        [4, 0],
      ],
      [
        [5, 1],
        [4, 1],
      ],
    ];
    d.hazir = [true, true];
    d.bulma = [
      { bulunan: 1, hata: 2, yanlislar: [{ satir: 5, sutun: 3, adim: 0 }], bitti: false, pes: false },
      { bulunan: 0, hata: 0, yanlislar: [], bitti: false, pes: false },
    ];
  }
  return d;
}

test('eski oda: eski durum tanınır, okuma yardımcıları çökmez', () => {
  const eski = eskiOda('bulma');
  assert.equal(eskiDurumMu(eski), true);
  assert.equal(satirSayisiOku(eski), 10);
  assert.doesNotThrow(() => oyuncuDurumu(eski, 0));
  assert.equal(eskiDurumMu(yeniOda('a', 'Ali')), false);
});

test('eski oda: lobi sessizce yeni kurallara geçer, eski ayar silinir, tur sayısı kalır', () => {
  const eski = eskiOda('lobi');
  const d = basarili(u(eski, { tip: 'ayarla', id: pid(0), ayar: { bakmaSuresi: 10 } }));
  assert.equal(eskiDurumMu(d), false);
  assert.deepEqual(d.ayar, { turSayisi: 5, satirSayisi: 10, bakmaSuresi: 10 });
  assert.equal(d.ayar.enAzKare, undefined);
  assert.equal(d.tur, 0);
  assert.deepEqual(d.gecmis, []);
  // Eski lobiden doğrudan başlatma da çalışır
  const b = basarili(u(eskiOda('lobi'), { tip: 'baslat', id: pid(0) }));
  assert.equal(b.asama, 'kurma');
  assert.equal(b.ayar.satirSayisi, 10);
  assert.equal(b.ayar.bakmaSuresi, 5);
  assert.equal(b.ayar.turSayisi, 5);
});

test('eski oda: oyun ortasında hareketler hata mesajı verir, çökmez', () => {
  for (const asama of ['kurma', 'bulma', 'acik', 'bitti']) {
    const eski = eskiOda(asama);
    for (const eylem of [
      { tip: 'hazir', id: pid(0), tur: 1, yol: yolYap(10, 0) },
      { tip: 'kare', id: pid(0), tur: 1, satir: 5, sutun: 0 },
      { tip: 'bak', id: pid(0), tur: 1, zaman: 1 },
      { tip: 'pes', id: pid(0), tur: 1 },
      { tip: 'sonraki', id: pid(0), tur: 1 },
      { tip: 'tekrarOyna', id: pid(0) },
      { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 1 } },
    ]) {
      assert.match(hatali(u(eski, eylem)), /eski kurallarla/, asama + ' ' + eylem.tip);
    }
  }
});

test('eski oda: oyun ortasında ev sahibi lobiye dönebilir, yeni kurallarla', () => {
  for (const asama of ['kurma', 'bulma', 'acik', 'bitti']) {
    const eski = eskiOda(asama);
    assert.match(hatali(u(eski, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
    const d = basarili(u(eski, { tip: 'yeniOyun', id: pid(0) }));
    assert.equal(d.asama, 'lobi');
    assert.equal(eskiDurumMu(d), false);
    assert.deepEqual(d.ayar, { turSayisi: 5, satirSayisi: 10, bakmaSuresi: 5 });
    assert.deepEqual(
      d.oyuncular.map((o) => o.puan),
      [0, 0]
    );
    // Lobiden sonra yeni oyun başlar
    const b = basarili(u(d, { tip: 'baslat', id: pid(0) }));
    assert.equal(b.asama, 'kurma');
  }
});

test('eski oda: oyun ortasında katılma isteği (odaya dönen oyuncu) hata vermez', () => {
  const eski = eskiOda('bulma');
  const d = basarili(u(eski, { tip: 'katil', id: pid(1), ad: 'Bora' }));
  assert.equal(d.oyuncular.length, 2);
});

test('eski oda: yönlendirici üzerinden de çökmez', () => {
  const eski = eskiOda('bulma');
  assert.match(hatali(yonlendir(eski, { tip: 'kare', id: pid(0), tur: 1, satir: 5, sutun: 0 })), /eski kurallarla/);
  const d = basarili(yonlendir(eskiOda('lobi'), { tip: 'baslat', id: pid(0) }));
  assert.equal(d.asama, 'kurma');
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
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element', 'kule']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'gizliyol').ad, 'Gizli Yol');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'gizliyol');
  assert.equal(d.oyun, 'gizliyol');
  assert.equal(oyunId(d), 'gizliyol');
  assert.equal(d.ayar.satirSayisi, 10);
  assert.equal(d.ayar.bakmaSuresi, 5);
});

test('yönlendirici: hareketler Gizli Yol motoruna gider (ayarla, hazır, bak, kare)', () => {
  let d = yonlendirLobi('gizliyol', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { satirSayisi: 8, bakmaSuresi: 3 } }));
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }));
  assert.equal(d.asama, 'kurma');
  d = basarili(yonlendir(d, { tip: 'hazir', id: pid(0), tur: 0, yol: yolYap(8, 0) }));
  d = basarili(yonlendir(d, { tip: 'hazir', id: pid(1), tur: 0, yol: yolYap(8, 3) }));
  assert.equal(d.asama, 'bulma');
  d = basarili(yonlendir(d, { tip: 'bak', id: pid(0), tur: 0, zaman: 99 }));
  assert.equal(d.bulma[0].bakti, true);
  const hedef = sonrakiDogruKare(d, 0);
  d = basarili(yonlendir(d, { tip: 'kare', id: pid(0), tur: 0, satir: hedef[0], sutun: hedef[1] }));
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
    assert.equal(eskiDurumMu(d), false);
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

// "Aynı Kafa" motoru ve oyun yönlendirici testleri. Çalıştır: node test/aynikafa-test.js
import assert from 'node:assert/strict';
import {
  MAKS_CEVAP_HARF,
  TUR_SAYILARI,
  cevapAnahtari,
  cevapHatasi,
  cevapTemizle,
  ciftAnahtari,
  enFazlaPuan,
  enGuzelEslesmeler,
  gonderenler,
  toplamPuan,
  turCiftleri,
  turGruplari,
  turPuani,
  uyumYuzdesi,
  uygula,
  yeniOda,
} from '../aynikafa.js';
import { IPUCLARI } from '../aynikafa-ipuclari.js';
import { OYUNLAR, oyunId, uygula as yonlendir, yeniOda as yonlendirYeniOda } from '../oyunlar.js';

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

// Küçük deneme listesi (gerçek ipucu bankası kullanılmaz)
const LISTE = ['Bir meyve söyle.', 'Bir hayvan söyle.', 'Bir renk söyle.', 'Bir şehir söyle.', 'Bir içecek söyle.', 'Bir spor söyle.'];

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

function baslat(n, ayar = {}, tohum = 1) {
  return basarili(u(lobi(n, ayar), { tip: 'baslat', id: pid(0) }, tohum));
}

function cevapla(d, i, cevap, ek = {}) {
  return u(d, Object.assign({ tip: 'cevapla', id: pid(i), tur: d.tur, cevap: cevap }, ek));
}

// Herkes sırayla cevabını gönderir (cevaplar dizisi oyuncu sırasıyla)
function herkesCevapla(d, cevaplar) {
  let son = d;
  cevaplar.forEach((c, i) => {
    son = basarili(cevapla(son, i, c));
  });
  return son;
}

function sayilsin(d, a, b, evet, ek = {}) {
  return u(d, Object.assign({ tip: 'sayilsin', id: pid(0), tur: d.tur, a: a, b: b, sayilsin: evet }, ek));
}

function sonraki(d, i = 0) {
  return u(d, { tip: 'sonraki', id: pid(i), tur: d.tur });
}

// ---------------------------------------------------------------------------
// Cevap karşılaştırma
// ---------------------------------------------------------------------------

test('cevap anahtarı: büyük/küçük harf, baş/son boşluk ve noktalama yok sayılır', () => {
  assert.equal(cevapAnahtari('  Elma  '), cevapAnahtari('elma'));
  assert.equal(cevapAnahtari('ELMA'), cevapAnahtari('elma'));
  assert.equal(cevapAnahtari('elma!'), cevapAnahtari('elma'));
  assert.equal(cevapAnahtari('"elma".'), cevapAnahtari('elma'));
  assert.equal(cevapAnahtari('yeşil   elma'), cevapAnahtari('yeşil elma'));
  assert.notEqual(cevapAnahtari('elma'), cevapAnahtari('yeşil elma'));
  assert.notEqual(cevapAnahtari('elma'), cevapAnahtari('armut'));
});

test('cevap anahtarı: Türkçe büyük/küçük harf kuralları (İ/i, I/ı)', () => {
  assert.equal(cevapAnahtari('İSTANBUL'), cevapAnahtari('istanbul'));
  assert.equal(cevapAnahtari('ISPARTA'), cevapAnahtari('ısparta'));
  assert.equal(cevapAnahtari('ISPARTA'), cevapAnahtari('isparta'));
  assert.equal(cevapAnahtari('İZMİR'), cevapAnahtari('izmir'));
  assert.equal(cevapAnahtari('ÇIKOLATA'), cevapAnahtari('cikolata'));
});

test('cevap anahtarı: Türkçe karakter farkı yok sayılır (kopek = köpek)', () => {
  assert.equal(cevapAnahtari('kopek'), cevapAnahtari('köpek'));
  assert.equal(cevapAnahtari('sut'), cevapAnahtari('süt'));
  assert.equal(cevapAnahtari('cay'), cevapAnahtari('çay'));
  assert.equal(cevapAnahtari('dag'), cevapAnahtari('dağ'));
  assert.equal(cevapAnahtari('sehir'), cevapAnahtari('şehir'));
  assert.equal(cevapAnahtari('kiz'), cevapAnahtari('kız'));
  assert.equal(cevapAnahtari('KÖPEK'), cevapAnahtari('kopek'));
  assert.equal(cevapAnahtari('ŞEKER'), cevapAnahtari('seker'));
  assert.equal(cevapAnahtari('Ağaç'), cevapAnahtari('agac'));
  // Birleşik (NFD) yazılmış harfler de aynı sayılır
  assert.equal(cevapAnahtari('köpek'), cevapAnahtari('kopek'));
  assert.equal(cevapAnahtari('şeker'), cevapAnahtari('seker'));
});

test('cevap anahtarı: boş ya da yalnız noktalama anahtarı boştur', () => {
  assert.equal(cevapAnahtari(''), '');
  assert.equal(cevapAnahtari('   '), '');
  assert.equal(cevapAnahtari('?!...'), '');
  assert.equal(cevapAnahtari(undefined), '');
  assert.equal(cevapAnahtari(null), '');
});

test('cevap temizleme ve hata kontrolü: boş olmaz, 30 harfi geçmez', () => {
  assert.equal(cevapTemizle('  yeşil    elma '), 'yeşil elma');
  assert.equal(cevapHatasi('elma'), null);
  assert.match(cevapHatasi(''), /Boş/);
  assert.match(cevapHatasi('    '), /Boş/);
  assert.match(cevapHatasi('?!'), /harf/);
  assert.equal(cevapHatasi('a'.repeat(MAKS_CEVAP_HARF)), null);
  assert.match(cevapHatasi('a'.repeat(MAKS_CEVAP_HARF + 1)), /30/);
  // Türkçe harfler tek harf sayılır
  assert.equal(cevapHatasi('ş'.repeat(MAKS_CEVAP_HARF)), null);
});

// ---------------------------------------------------------------------------
// İpucu bankası
// ---------------------------------------------------------------------------

test('ipucu bankası: en az 150 benzersiz kısa ipucu', () => {
  assert.ok(IPUCLARI.length >= 150, 'Sadece ' + IPUCLARI.length + ' ipucu var');
  assert.equal(new Set(IPUCLARI).size, IPUCLARI.length);
  for (const ipucu of IPUCLARI) {
    assert.equal(typeof ipucu, 'string');
    assert.ok(ipucu.trim().length > 3 && ipucu.length <= 70, 'Uygunsuz uzunluk: ' + ipucu);
  }
  assert.ok(IPUCLARI.includes('Bir meyve söyle.'));
  assert.ok(IPUCLARI.includes('İlk buluşma için en iyi yer.'));
  assert.ok(IPUCLARI.includes('Birlikte izlenecek film türü.'));
});

// ---------------------------------------------------------------------------
// Lobi ve başlangıç
// ---------------------------------------------------------------------------

test('yeni oda: lobi, ev sahibi, varsayılan 10 tur', () => {
  const d = yeniOda(pid(0), 'Ali');
  assert.equal(d.oyun, 'aynikafa');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, pid(0));
  assert.equal(d.ayar.turSayisi, 10);
  assert.deepEqual(TUR_SAYILARI, [5, 10, 15]);
  assert.equal(d.oyuncular.length, 1);
});

test('katılma: en fazla 4 kişi, aynı ad yeni ad alır, oyun başlayınca girilmez', () => {
  let d = lobi(4);
  assert.equal(d.oyuncular.length, 4);
  assert.match(hatali(u(d, { tip: 'katil', id: 'x', ad: 'Biri' })), /dolu/);
  d = lobi(2);
  d = basarili(u(d, { tip: 'katil', id: 'y', ad: 'Ali' }));
  assert.notEqual(d.oyuncular[2].ad, 'Ali');
  const oyunda = baslat(2);
  assert.match(hatali(u(oyunda, { tip: 'katil', id: 'z', ad: 'Biri' })), /başladı/);
});

test('ayar: yalnız ev sahibi, yalnız lobide, yalnız 5/10/15', () => {
  const d = lobi(2);
  const yeni = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 15 } }));
  assert.equal(yeni.ayar.turSayisi, 15);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { turSayisi: 5 } })), /ev sahibi/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 7 } })), /tur sayısı/i);
  assert.match(hatali(u(baslat(2), { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 5 } })), /başlamadan/);
});

test('başlatma: 2-4 kişi, yalnız ev sahibi; ipuçları seçilir, cevap alanları boş açılır', () => {
  assert.match(hatali(u(lobi(1), { tip: 'baslat', id: pid(0) })), /En az 2/);
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  for (const n of [2, 3, 4]) {
    const d = baslat(n, { turSayisi: 5 });
    assert.equal(d.asama, 'soru');
    assert.equal(d.tur, 0);
    assert.equal(d.ipuclari.length, 5);
    assert.equal(d.cevaplar.length, 5);
    assert.equal(d.cevaplar[0].length, n);
    assert.ok(d.cevaplar.every((satir) => satir.every((c) => c === null)));
    for (const ipucu of d.ipuclari) {
      assert.ok(LISTE.includes(ipucu));
    }
  }
  assert.match(hatali(u(baslat(2), { tip: 'baslat', id: pid(0) })), /başladı/);
});

test('başlatma: boş ipucu listesi hata verir; gerçek banka varsayılandır', () => {
  const bos = uygula(lobi(2), { tip: 'baslat', id: pid(0) }, rng(1), []);
  assert.match(hatali(bos), /boş/);
  const gercek = basarili(uygula(lobi(2), { tip: 'baslat', id: pid(0) }, rng(1)));
  assert.equal(gercek.ipuclari.length, 10);
  for (const ipucu of gercek.ipuclari) {
    assert.ok(IPUCLARI.includes(ipucu));
  }
});

test('girdi durumu değişmez (dondurulmuş durumla her hareket çalışır)', () => {
  const d = dondur(baslat(2, { turSayisi: 5 }));
  const yeni = basarili(cevapla(d, 0, 'elma'));
  assert.equal(d.cevaplar[0][0], null);
  assert.equal(yeni.cevaplar[0][0], 'elma');
  const iki = dondur(herkesCevapla(baslat(2), ['elma', 'yeşil elma']));
  const oylu = basarili(sayilsin(iki, 0, 1, true));
  assert.deepEqual(iki.sayilanlar[0], []);
  assert.deepEqual(oylu.sayilanlar[0], ['0-1']);
  const sonrakiTur = basarili(sonraki(iki));
  assert.equal(iki.asama, 'acik');
  assert.equal(sonrakiTur.asama, 'soru');
});

// ---------------------------------------------------------------------------
// Cevap gönderme
// ---------------------------------------------------------------------------

test('cevap: boş gönderilemez, 30 harften uzun olmaz, odada olmayan gönderemez', () => {
  const d = baslat(2);
  assert.match(hatali(cevapla(d, 0, '')), /Boş/);
  assert.match(hatali(cevapla(d, 0, '   ')), /Boş/);
  assert.match(hatali(cevapla(d, 0, 'a'.repeat(31))), /30/);
  assert.match(hatali(u(d, { tip: 'cevapla', id: 'yabanci', tur: 0, cevap: 'elma' })), /odada değilsin/);
  basarili(cevapla(d, 0, 'a'.repeat(30)));
});

test('cevap: temizlenip saklanır, gönderen herkese görünür, cevap metni değil', () => {
  let d = baslat(3);
  d = basarili(cevapla(d, 1, '  yeşil   elma '));
  assert.equal(d.cevaplar[0][1], 'yeşil elma');
  assert.equal(d.asama, 'soru');
  assert.deepEqual(gonderenler(d, 0), [false, true, false]);
});

test('cevap: açılmadan önce değiştirilebilir, herkes gönderince açılır', () => {
  let d = baslat(3);
  d = basarili(cevapla(d, 0, 'elma'));
  d = basarili(cevapla(d, 0, 'armut'));
  assert.equal(d.cevaplar[0][0], 'armut');
  d = basarili(cevapla(d, 1, 'elma'));
  assert.equal(d.asama, 'soru');
  d = basarili(cevapla(d, 2, 'elma'));
  assert.equal(d.asama, 'acik');
  // Açıldıktan sonra değişmez
  assert.match(hatali(cevapla(d, 0, 'kiraz')), /Şu an/);
});

test('cevap: eski ipucuna gelen cevap reddedilir', () => {
  let d = herkesCevapla(baslat(2), ['a', 'b']);
  d = basarili(sonraki(d));
  assert.equal(d.tur, 1);
  assert.match(hatali(u(d, { tip: 'cevapla', id: pid(0), tur: 0, cevap: 'geç' })), /geçti/);
});

// ---------------------------------------------------------------------------
// Puanlama
// ---------------------------------------------------------------------------

test('puan: 2 kişide aynı cevap 1 puan, farklı cevap 0', () => {
  const ayni = herkesCevapla(baslat(2), ['elma', 'elma']);
  assert.equal(turPuani(ayni, 0), 1);
  assert.equal(toplamPuan(ayni), 1);
  const farkli = herkesCevapla(baslat(2), ['elma', 'armut']);
  assert.equal(turPuani(farkli, 0), 0);
  assert.equal(toplamPuan(farkli), 0);
});

test('puan: 3 kişide en çok 3, 4 kişide hepsi aynıysa 6', () => {
  const uc = herkesCevapla(baslat(3), ['elma', 'elma', 'elma']);
  assert.equal(turPuani(uc, 0), 3);
  const dort = herkesCevapla(baslat(4), ['elma', 'Elma', 'ELMA', 'elma.']);
  assert.equal(turPuani(dort, 0), 6);
  assert.equal(enFazlaPuan(dort), 6);
});

test('puan: kısmi eşleşme, 4 kişide ikili ikili ve üçlü', () => {
  const ikiIki = herkesCevapla(baslat(4), ['elma', 'armut', 'elma', 'armut']);
  assert.equal(turPuani(ikiIki, 0), 2);
  const uclu = herkesCevapla(baslat(4), ['elma', 'elma', 'armut', 'elma']);
  assert.equal(turPuani(uclu, 0), 3);
  const tek = herkesCevapla(baslat(4), ['elma', 'elma', 'armut', 'kiraz']);
  assert.equal(turPuani(tek, 0), 1);
});

test('puan: Türkçe karakter ve harf boyutu farkı eşleşir (kopek = köpek)', () => {
  const d = herkesCevapla(baslat(2), ['kopek', 'KÖPEK']);
  assert.equal(turPuani(d, 0), 1);
  const e = herkesCevapla(baslat(2), ['İstanbul', 'istanbul']);
  assert.equal(turPuani(e, 0), 1);
  const f = herkesCevapla(baslat(2), ['ısparta', 'ISPARTA']);
  assert.equal(turPuani(f, 0), 1);
  const g = herkesCevapla(baslat(2), ['  çay!', 'cay']);
  assert.equal(turPuani(g, 0), 1);
});

test('puan: cevaplar açılmadan önce puan sayılmaz', () => {
  let d = baslat(2);
  d = basarili(cevapla(d, 0, 'elma'));
  assert.equal(toplamPuan(d), 0);
  assert.equal(enFazlaPuan(d), 0);
});

test('eşleşme listesi: kim kiminle eşleşti ve gruplar', () => {
  const d = herkesCevapla(baslat(4), ['elma', 'armut', 'elma', 'kiraz']);
  const cift = turCiftleri(d, 0);
  assert.equal(cift.length, 6);
  const eslesen = cift.filter((c) => c.durum === 'ayni');
  assert.equal(eslesen.length, 1);
  assert.deepEqual([eslesen[0].a, eslesen[0].b], [0, 2]);
  assert.deepEqual(turGruplari(d, 0), [0, -1, 0, -1]);
});

// ---------------------------------------------------------------------------
// "Bunlar aynı sayılsın"
// ---------------------------------------------------------------------------

test('aynı sayılsın: oy puanı anında artırır, geri alınca düşer', () => {
  let d = herkesCevapla(baslat(2), ['elma', 'yeşil elma']);
  assert.equal(toplamPuan(d), 0);
  d = basarili(sayilsin(d, 0, 1, true));
  assert.equal(toplamPuan(d), 1);
  assert.equal(turCiftleri(d, 0)[0].durum, 'oy');
  d = basarili(sayilsin(d, 1, 0, false));
  assert.equal(toplamPuan(d), 0);
  assert.equal(turCiftleri(d, 0)[0].durum, 'yok');
});

test('aynı sayılsın: bir kez basmak yeter, ikinci basış puanı artırmaz, geri alma tekrarı zararsız', () => {
  let d = herkesCevapla(baslat(2), ['elma', 'yeşil elma']);
  d = basarili(sayilsin(d, 0, 1, true));
  d = basarili(sayilsin(d, 0, 1, true));
  assert.equal(toplamPuan(d), 1);
  assert.deepEqual(d.sayilanlar[0], ['0-1']);
  d = basarili(sayilsin(d, 0, 1, false));
  d = basarili(sayilsin(d, 0, 1, false));
  assert.equal(toplamPuan(d), 0);
  assert.deepEqual(d.sayilanlar[0], []);
});

test('aynı sayılsın: herhangi bir oyuncu verebilir (güvene dayalı), odadaki olmayan veremez', () => {
  let d = herkesCevapla(baslat(3), ['elma', 'yeşil elma', 'armut']);
  d = basarili(u(d, { tip: 'sayilsin', id: pid(2), tur: 0, a: 0, b: 1, sayilsin: true }));
  assert.equal(toplamPuan(d), 1);
  assert.match(hatali(u(d, { tip: 'sayilsin', id: 'yabanci', tur: 0, a: 0, b: 1, sayilsin: false })), /odada değilsin/);
});

test('aynı sayılsın: zaten aynı olan çift, geçersiz çift ve yanlış aşama reddedilir', () => {
  let d = herkesCevapla(baslat(3), ['elma', 'elma', 'armut']);
  assert.match(hatali(sayilsin(d, 0, 1, true)), /zaten aynı/);
  assert.match(hatali(sayilsin(d, 0, 0, true)), /Geçersiz/);
  assert.match(hatali(sayilsin(d, 0, 5, true)), /Geçersiz/);
  assert.match(hatali(sayilsin(d, 0, 1.5, true)), /Geçersiz/);
  assert.match(hatali(sayilsin(d, 0, 2, 'evet')), /Geçersiz/);
  const soruda = baslat(2);
  assert.match(hatali(sayilsin(soruda, 0, 1, true)), /Şu an/);
  // Sonraki ipucuna geçilince eski turun oyu değiştirilemez
  d = basarili(sayilsin(d, 0, 2, true));
  d = basarili(sonraki(d));
  assert.equal(d.asama, 'soru');
  assert.match(hatali(u(d, { tip: 'sayilsin', id: pid(0), tur: 0, a: 0, b: 2, sayilsin: false })), /Şu an|geçti/);
});

test('aynı sayılsın: 4 kişide oylar ikili ikili sayılır, gruplar birleşir', () => {
  let d = herkesCevapla(baslat(4), ['elma', 'yeşil elma', 'kırmızı elma', 'armut']);
  assert.equal(toplamPuan(d), 0);
  d = basarili(sayilsin(d, 0, 1, true));
  d = basarili(sayilsin(d, 0, 2, true));
  assert.equal(toplamPuan(d), 2);
  assert.deepEqual(turGruplari(d, 0), [0, 0, 0, -1]);
  // 1-2 ayrıca oylanmadıkça sayılmaz (güvene dayalı ama ikili ikili)
  assert.equal(turCiftleri(d, 0).find((c) => c.anahtar === ciftAnahtari(1, 2)).durum, 'yok');
});

// ---------------------------------------------------------------------------
// Tur akışı, uyum, tekrar oyna
// ---------------------------------------------------------------------------

// Tüm turları verilen cevap kalıbıyla oynar (kalip(tur) -> cevaplar dizisi)
function hepsiniOyna(d, kalip) {
  let son = d;
  while (son.asama !== 'bitti') {
    assert.equal(son.asama, 'soru');
    son = herkesCevapla(son, kalip(son.tur));
    assert.equal(son.asama, 'acik');
    son = basarili(sonraki(son));
  }
  return son;
}

test('akış: herhangi bir oyuncu sonraki ipucuna basar, son ipucundan sonra oyun biter', () => {
  let d = baslat(2, { turSayisi: 5 });
  assert.equal(d.ipuclari.length, 5);
  for (let t = 0; t < 5; t++) {
    assert.equal(d.tur, t);
    d = herkesCevapla(d, ['a', 'a']);
    // Sonrakine basan ev sahibi olmayabilir
    d = basarili(sonraki(d, 1));
  }
  assert.equal(d.asama, 'bitti');
  assert.equal(toplamPuan(d), 5);
});

test('akış: sonraki yalnız açılmış turda; çifte basış zararsız', () => {
  const soruda = baslat(2);
  assert.match(hatali(sonraki(soruda)), /Şu an/);
  let d = herkesCevapla(baslat(2), ['a', 'b']);
  const ilk = basarili(sonraki(d, 0));
  // İkinci oyuncu aynı turun "sonraki"sine geç basar: durum aynı kalır
  const ikinci = u(ilk, { tip: 'sonraki', id: pid(1), tur: 0 });
  assert.deepEqual(basarili(ikinci), ilk);
});

test('uyum: kazanılan / mümkün en fazla puan', () => {
  // 2 kişi, 5 tur: 3 turda eşleşme => %60
  const d = hepsiniOyna(baslat(2, { turSayisi: 5 }), (t) => (t < 3 ? ['x', 'x'] : ['x', 'y']));
  assert.equal(toplamPuan(d), 3);
  assert.equal(enFazlaPuan(d), 5);
  assert.equal(uyumYuzdesi(d), 60);
  // 4 kişi, 5 tur, hepsi hep aynı => %100
  const tam = hepsiniOyna(baslat(4, { turSayisi: 5 }), () => ['x', 'x', 'x', 'x']);
  assert.equal(toplamPuan(tam), 30);
  assert.equal(enFazlaPuan(tam), 30);
  assert.equal(uyumYuzdesi(tam), 100);
  // Hiç eşleşme yok => %0
  const hic = hepsiniOyna(baslat(3, { turSayisi: 5 }), () => ['a', 'b', 'c']);
  assert.equal(uyumYuzdesi(hic), 0);
});

test('uyum: aynı sayılsın oyları uyuma da yansır', () => {
  let d = baslat(2, { turSayisi: 5 });
  for (let t = 0; t < 5; t++) {
    d = herkesCevapla(d, ['elma', 'yeşil elma']);
    d = basarili(sayilsin(d, 0, 1, true));
    d = basarili(sonraki(d));
  }
  assert.equal(uyumYuzdesi(d), 100);
});

test('en güzel eşleşmeler: en çok puan getiren turlar önce, eşleşmeyenler yok', () => {
  let d = baslat(3, { turSayisi: 5 });
  const kaliplar = [
    ['a', 'b', 'c'], // 0 puan
    ['a', 'a', 'c'], // 1 puan
    ['a', 'a', 'a'], // 3 puan
    ['a', 'b', 'c'], // 0 puan
    ['a', 'a', 'c'], // 1 puan
  ];
  d = hepsiniOyna(d, (t) => kaliplar[t]);
  const liste = enGuzelEslesmeler(d);
  assert.deepEqual(
    liste.map((x) => [x.tur, x.puan]),
    [
      [2, 3],
      [1, 1],
      [4, 1],
    ]
  );
  assert.equal(liste[0].ipucu, d.ipuclari[2]);
  assert.deepEqual(
    liste[0].cevaplar.map((c) => c.cevap),
    ['a', 'a', 'a']
  );
  assert.equal(enGuzelEslesmeler(d, 2).length, 2);
});

test('ipuçları: bir oyunda tekrar etmez, odada havuz bitene kadar tekrar gelmez', () => {
  // Liste 6 ipucu; 5'er turluk oyun: ikinci oyunda 1 yeni + 4 eski gelir, ama ilk 5'tekiler tekrar gelmez önce
  const ilk = baslat(2, { turSayisi: 5 });
  assert.equal(new Set(ilk.ipuclari).size, 5);
  const bitti = hepsiniOyna(ilk, () => ['a', 'b']);
  assert.equal(bitti.kullanilanlar.length, 5);
  const ikinci = basarili(u(bitti, { tip: 'tekrarOyna', id: pid(0) }, 7));
  assert.equal(new Set(ikinci.ipuclari).size, 5);
  // Henüz sorulmamış tek ipucu ikinci oyunun ilk sorusudur
  const kalan = LISTE.filter((x) => !ilk.ipuclari.includes(x));
  assert.equal(kalan.length, 1);
  assert.equal(ikinci.ipuclari[0], kalan[0]);
});

test('ipuçları: büyük havuzda iki oyun art arda hiç tekrar içermez', () => {
  const buyuk = Array.from({ length: 20 }, (_, i) => 'İpucu numara ' + i + '.');
  let d = basarili(uygula(lobi(2, { turSayisi: 10 }), { tip: 'baslat', id: pid(0) }, rng(3), buyuk));
  const ilk = d.ipuclari.slice();
  d = herkesCevapla(d, ['a', 'a']);
  // Hızlıca bitir
  while (d.asama !== 'bitti') {
    if (d.asama === 'soru') {
      d = herkesCevapla(d, ['a', 'a']);
    } else {
      d = basarili(sonraki(d));
    }
  }
  d = basarili(uygula(d, { tip: 'tekrarOyna', id: pid(0) }, rng(4), buyuk));
  assert.equal(d.ipuclari.length, 10);
  for (const ipucu of d.ipuclari) {
    assert.ok(!ilk.includes(ipucu), 'Tekrar gelen ipucu: ' + ipucu);
  }
  // Havuz bitince (20 / 10 = 2 oyun) üçüncü oyun baştan başlar, yine bir oyunda tekrar yok
  while (d.asama !== 'bitti') {
    if (d.asama === 'soru') {
      d = herkesCevapla(d, ['a', 'a']);
    } else {
      d = basarili(sonraki(d));
    }
  }
  d = basarili(uygula(d, { tip: 'tekrarOyna', id: pid(0) }, rng(5), buyuk));
  assert.equal(d.ipuclari.length, 10);
  assert.equal(new Set(d.ipuclari).size, 10);
});

test('tekrar oyna: yalnız bitince ve yalnız ev sahibi; puanlar ve cevaplar sıfırlanır', () => {
  const bitti = hepsiniOyna(baslat(2, { turSayisi: 5 }), () => ['x', 'x']);
  assert.match(hatali(u(bitti, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  assert.match(hatali(u(baslat(2), { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  const yeni = basarili(u(bitti, { tip: 'tekrarOyna', id: pid(0) }, 9));
  assert.equal(yeni.asama, 'soru');
  assert.equal(yeni.tur, 0);
  assert.equal(toplamPuan(yeni), 0);
  assert.ok(yeni.cevaplar.every((satir) => satir.every((c) => c === null)));
  assert.ok(yeni.sayilanlar.every((s) => s.length === 0));
  assert.equal(yeni.oyuncular.length, 2);
});

test('lobiye dön: yalnız ev sahibi; her aşamada; çıkarma yalnız lobide', () => {
  const d = herkesCevapla(baslat(3), ['a', 'a', 'a']);
  assert.match(hatali(u(d, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  const lobiye = basarili(u(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.equal(lobiye.oyuncular.length, 3);
  assert.deepEqual(lobiye.cevaplar, []);
  assert.match(hatali(u(lobiye, { tip: 'yeniOyun', id: pid(0) })), /lobidesin/);
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1) })), /sürerken/);
});

test('lobide çıkma: kendi isteğiyle, ev sahibi çıkarır, ev sahibi çıkarsa sahiplik geçer', () => {
  let d = lobi(3);
  d = basarili(u(d, { tip: 'cikar', id: pid(1) }));
  assert.equal(d.oyuncular.length, 2);
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(0) })), /ev sahibi|./);
  d = basarili(u(d, { tip: 'cikar', id: pid(0), hedef: pid(2) }));
  assert.equal(d.oyuncular.length, 1);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.oyuncular.length, 0);
  let e = lobi(2);
  e = basarili(u(e, { tip: 'cikar', id: pid(0) }));
  assert.equal(e.sahip, pid(1));
});

test('bilinmeyen hareket hata verir', () => {
  assert.match(hatali(u(lobi(2), { tip: 'uc', id: pid(0) })), /Bilinmeyen/);
  assert.match(hatali(u(lobi(2), undefined)), /Bilinmeyen/);
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

test('yönlendirici: oyun listesi Aynı Kafa içerir, oda kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'aynikafa').ad, 'Aynı Kafa');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'aynikafa');
  assert.equal(d.oyun, 'aynikafa');
  assert.equal(oyunId(d), 'aynikafa');
});

test('yönlendirici: hareketler Aynı Kafa motoruna gider (ipucu 6. parametre)', () => {
  let d = yonlendirLobi('aynikafa', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 5 } }));
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1), undefined, undefined, LISTE));
  assert.equal(d.asama, 'soru');
  assert.ok(LISTE.includes(d.ipuclari[0]));
  d = basarili(yonlendir(d, { tip: 'cevapla', id: pid(0), tur: 0, cevap: 'elma' }));
  d = basarili(yonlendir(d, { tip: 'cevapla', id: pid(1), tur: 0, cevap: 'Elma!' }));
  assert.equal(d.asama, 'acik');
  assert.equal(toplamPuan(d), 1);
  // Yanlış aşamadaki hareket yönlendiriciden de hata döner
  assert.equal(yonlendir(d, { tip: 'cevapla', id: pid(0), tur: 0, cevap: 'x' }).ok, false);
  // Başka oyunların hareketleri bu odada reddedilir
  assert.match(hatali(yonlendir(d, { tip: 'oyna', id: pid(0), kart: 1 })), /Bilinmeyen/);
  assert.match(hatali(yonlendir(d, { tip: 'tahmin', id: pid(0), tur: 0, kelime: 'kalem' })), /Bilinmeyen/);
});

test('yönlendirici: Aynı Kafa hareketleri öteki oyun odalarında reddedilir', () => {
  for (const oyun of ['uno', 'tanis', 'kelime']) {
    const d = yonlendirLobi(oyun, 2);
    assert.equal(yonlendir(d, { tip: 'cevapla', id: pid(0), tur: 0, cevap: 'elma' }).ok, false);
    assert.equal(yonlendir(d, { tip: 'sayilsin', id: pid(0), tur: 0, a: 0, b: 1, sayilsin: true }).ok, false);
  }
});

test('oyun seçimi: Aynı Kafa seçilince oyuncular korunur; ayar, ev sahibi, aşama kuralları', () => {
  const uno = yonlendirLobi('uno', 4);
  const kimlik = kimlikler(uno);
  const ak = basarili(yonlendir(uno, { tip: 'oyunSec', id: pid(0), oyun: 'aynikafa' }));
  assert.equal(ak.oyun, 'aynikafa');
  assert.equal(ak.asama, 'lobi');
  assert.deepEqual(kimlikler(ak), kimlik);
  assert.equal(ak.sahip, pid(0));
  // Başlatılabilir
  const basladi = basarili(yonlendir(ak, { tip: 'baslat', id: pid(0) }, rng(2), undefined, undefined, LISTE));
  assert.equal(basladi.cevaplar[0].length, 4);
  // Aynı oyunu seçmek ayarı bozmaz
  const ayarli = basarili(yonlendir(ak, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 15 } }));
  const ayni = basarili(yonlendir(ayarli, { tip: 'oyunSec', id: pid(0), oyun: 'aynikafa' }));
  assert.deepEqual(ayni, ayarli);
  // Yalnız ev sahibi, yalnız lobide
  assert.match(hatali(yonlendir(ak, { tip: 'oyunSec', id: pid(1), oyun: 'uno' })), /ev sahibi/);
  assert.match(hatali(yonlendir(basladi, { tip: 'oyunSec', id: pid(0), oyun: 'uno' })), /lobide/);
  // Lobiye dönünce başka oyuna geçilebilir ve geri gelinebilir
  const lobiye = basarili(yonlendir(basladi, { tip: 'yeniOyun', id: pid(0) }));
  const tanis = basarili(yonlendir(lobiye, { tip: 'oyunSec', id: pid(0), oyun: 'tanis' }));
  assert.equal(tanis.oyun, 'tanis');
  const geri = basarili(yonlendir(tanis, { tip: 'oyunSec', id: pid(0), oyun: 'aynikafa' }));
  assert.equal(geri.oyun, 'aynikafa');
  assert.equal(geri.oyuncular.length, 4);
});

test('oyun seçimi: Aynı Kafa lobisinden öteki oyunlara geçiş kimseyi düşürmez', () => {
  const d = yonlendirLobi('aynikafa', 3);
  const kimlik = kimlikler(d);
  for (const oyun of ['uno', 'tanis', 'kelime']) {
    const yeni = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: oyun }));
    assert.equal(yeni.oyun, oyun);
    assert.deepEqual(kimlikler(yeni), kimlik);
  }
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

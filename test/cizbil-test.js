// "Çiz Bil" motoru, tahta yardımcıları ve oyun yönlendirici testleri. Çalıştır: node test/cizbil-test.js
import assert from 'node:assert/strict';
import {
  AKIS_UZUNLUGU,
  EN_DUSUK_PUAN,
  EN_YUKSEK_PUAN,
  MAKS_NOKTA,
  SECENEK_SAYISI,
  SECIM_SURESI,
  TOLERANS_MS,
  cizenPuani,
  kalanMs,
  kazananlar,
  kelimeKalibi,
  mesajGecerliMi,
  mesajUygula,
  noktaTutulsunMu,
  tahminAnahtari,
  tahminDogruMu,
  tahminHatasi,
  tahminPuani,
  tahtaAnahtari,
  tahtaMesaji,
  tahtaNoktasi,
  toplamCizim,
  turNumarasi,
  uygula,
  yakinMi,
  yeniOda,
  yeniTahta,
} from '../cizbil.js';
import { KELIMELER } from '../cizbil-kelimeler.js';
import { genelVeri, oyunId, uygula as yonlendir, yeniOda as yonlendirYeniOda } from '../oyunlar.js';

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
const LISTE = ['elma', 'kedi', 'deniz feneri', 'köpek', 'ağaç', 'güneş', 'ışık'];

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

// Karıştırmayı bozmayan rastgele: karistir() sırayı değiştirmez
const sirali = () => 0.999999;

function u(d, eylem, simdi = T0, liste = LISTE) {
  return uygula(d, eylem, sirali, simdi, liste);
}

// n kişilik lobi (ev sahibi p0)
function lobi(n) {
  let d = yeniOda(pid(0), 'Ayşe');
  for (let i = 1; i < n; i++) {
    d = basarili(u(d, { tip: 'katil', id: pid(i), ad: 'Kişi' + i }));
  }
  return d;
}

// Başlamış oyun (secim aşaması)
function basla(n, ayar) {
  let d = lobi(n);
  if (ayar) {
    d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: ayar }));
  }
  return basarili(u(d, { tip: 'baslat', id: pid(0) }));
}

// Çizen ilk seçeneği seçer; çizim simdi anında başlar
function sec(d, simdi = T0, secim = 0) {
  return basarili(u(d, { tip: 'sec', id: pid(d.cizen), cizim: d.cizim, secim: secim }, simdi));
}

function tahmin(d, i, metin, simdi = T0) {
  return u(d, { tip: 'tahmin', id: pid(i), cizim: d.cizim, metin: metin }, simdi);
}

// Çizimi süre doldurarak bitir
function sureyiBitir(d) {
  const son = d.baslangic + d.ayar.sure * 1000;
  return basarili(u(d, { tip: 'sureBitti', id: pid(0), cizim: d.cizim }, son));
}

function sonraki(d, kim = 0, simdi = T0) {
  return basarili(u(d, { tip: 'sonraki', id: pid(kim), cizim: d.cizim }, simdi));
}

// ---------------------------------------------------------------------------
// Kelime bankası
// ---------------------------------------------------------------------------

test('kelime bankası: en az 150 kelime, tekrarsız, küçük harf, boş yok', () => {
  assert.ok(KELIMELER.length >= 150, 'kelime sayısı ' + KELIMELER.length);
  assert.equal(new Set(KELIMELER).size, KELIMELER.length);
  for (const k of KELIMELER) {
    assert.equal(k, k.trim());
    assert.ok(k.length > 0);
    assert.equal(k, k.toLocaleLowerCase('tr-TR'), k);
    assert.match(k, /^[a-zçğıöşü ]+$/u, k);
  }
});

// ---------------------------------------------------------------------------
// Tahmin karşılaştırma
// ---------------------------------------------------------------------------

test('tahmin: büyük-küçük harf ve Türkçe harfler hoşgörülü', () => {
  assert.equal(tahminDogruMu('köpek', 'köpek'), true);
  assert.equal(tahminDogruMu('KOPEK', 'köpek'), true);
  assert.equal(tahminDogruMu('Köpek', 'köpek'), true);
  assert.equal(tahminDogruMu('agac', 'ağaç'), true);
  assert.equal(tahminDogruMu('AĞAÇ', 'ağaç'), true);
  assert.equal(tahminDogruMu('gunes', 'güneş'), true);
  assert.equal(tahminDogruMu('isik', 'ışık'), true);
  assert.equal(tahminDogruMu('IŞIK', 'ışık'), true);
  assert.equal(tahminDogruMu('İŞİK', 'ışık'), true);
  assert.equal(tahminDogruMu('ışik', 'ışık'), true);
  assert.equal(tahminDogruMu('ŞEKER', 'şeker'), true);
  assert.equal(tahminDogruMu('kâğıt', 'kağıt'), true);
});

test('tahmin: boşluk ve noktalama yok sayılır, yanlış kelime doğru sayılmaz', () => {
  assert.equal(tahminDogruMu('  elma  ', 'elma'), true);
  assert.equal(tahminDogruMu('elma!', 'elma'), true);
  assert.equal(tahminDogruMu('deniz feneri', 'deniz feneri'), true);
  assert.equal(tahminDogruMu('denizfeneri', 'deniz feneri'), true);
  assert.equal(tahminDogruMu('Deniz  Feneri.', 'deniz feneri'), true);
  assert.equal(tahminDogruMu('elmas', 'elma'), false);
  assert.equal(tahminDogruMu('elm', 'elma'), false);
  assert.equal(tahminDogruMu('', 'elma'), false);
  assert.equal(tahminDogruMu('!!!', 'elma'), false);
  assert.equal(tahminAnahtari('Çİçek'), 'cicek');
});

test('tahmin: "çok yakın" bir harf farkında, kısa kelimede değil', () => {
  assert.equal(yakinMi('kopk', 'köpek'), true); // bir harf eksik
  assert.equal(yakinMi('köpeek', 'köpek'), true); // bir harf fazla
  assert.equal(yakinMi('kopak', 'köpek'), true); // bir harf farklı
  assert.equal(yakinMi('köpek', 'köpek'), false); // doğru, yakın değil
  assert.equal(yakinMi('kedi', 'köpek'), false);
  assert.equal(yakinMi('ay', 'at'), false); // kısa kelimede ipucu verme
});

test('tahmin metni denetimi: boş, çok uzun, harfsiz', () => {
  assert.ok(tahminHatasi(''));
  assert.ok(tahminHatasi('   '));
  assert.ok(tahminHatasi('x'.repeat(31)));
  assert.ok(tahminHatasi('...'));
  assert.equal(tahminHatasi('elma'), null);
  assert.equal(tahminHatasi('x'.repeat(30)), null);
});

test('kelime kalıbı: harf sayıları', () => {
  assert.deepEqual(kelimeKalibi('elma'), [4]);
  assert.deepEqual(kelimeKalibi('deniz feneri'), [5, 6]);
  assert.deepEqual(kelimeKalibi('ağaç'), [4]);
});

// ---------------------------------------------------------------------------
// Lobi
// ---------------------------------------------------------------------------

test('yeni oda: lobi, varsayılan ayarlar', () => {
  const d = yeniOda(pid(0), 'Ayşe');
  assert.equal(d.oyun, 'cizbil');
  assert.equal(d.asama, 'lobi');
  assert.equal(d.sahip, pid(0));
  assert.deepEqual(d.ayar, { turSayisi: 2, sure: 75 });
  assert.equal(d.oyuncular.length, 1);
});

test('katılma: en fazla 4 kişi, oyun başlayınca katılınamaz, aynı ad ikileşmez', () => {
  let d = lobi(4);
  hatali(u(d, { tip: 'katil', id: pid(9), ad: 'Beş' }));
  d = lobi(2);
  d = basarili(u(d, { tip: 'katil', id: pid(2), ad: 'ayşe' }));
  assert.notEqual(d.oyuncular[2].ad.toLocaleLowerCase('tr'), 'ayşe');
  const basladi = basla(2);
  hatali(u(basladi, { tip: 'katil', id: pid(5), ad: 'Geç' }));
});

test('ayarlar: yalnız ev sahibi, yalnız geçerli değerler', () => {
  let d = lobi(2);
  d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 3, sure: 60 } }));
  assert.deepEqual(d.ayar, { turSayisi: 3, sure: 60 });
  hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { sure: 90 } }));
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { sure: 45 } }));
  hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 9 } }));
});

test('başlatma: yalnız ev sahibi, en az 2 kişi', () => {
  hatali(u(lobi(1), { tip: 'baslat', id: pid(0) }));
  hatali(u(lobi(2), { tip: 'baslat', id: pid(1) }));
  const d = basla(2);
  assert.equal(d.asama, 'secim');
  assert.equal(d.cizim, 0);
  assert.equal(d.cizen, 0);
  assert.equal(d.secenekler.length, SECENEK_SAYISI);
  assert.equal(d.kelime, '');
  assert.equal(d.baslangic, T0);
});

test('lobide çıkma: ev sahibi çıkınca sıradaki ev sahibi olur; oyun sürerken çıkılmaz', () => {
  let d = lobi(3);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
  hatali(u(basla(2), { tip: 'cikar', id: pid(1) }));
});

// ---------------------------------------------------------------------------
// Kelime seçimi
// ---------------------------------------------------------------------------

test('seçim: yalnız çizen seçer, seçince çizim başlar', () => {
  const d = basla(3);
  hatali(u(d, { tip: 'sec', id: pid(1), cizim: 0, secim: 0 }));
  hatali(u(d, { tip: 'sec', id: pid(0), cizim: 0, secim: 3 }));
  hatali(u(d, { tip: 'sec', id: pid(0), cizim: 0, secim: 'a' }));
  const c = basarili(u(d, { tip: 'sec', id: pid(0), cizim: 0, secim: 1 }, T0 + 5000));
  assert.equal(c.asama, 'cizim');
  assert.equal(c.kelime, d.secenekler[1]);
  assert.equal(c.baslangic, T0 + 5000);
  assert.deepEqual(c.secenekler, []);
  // Çizim başladıktan sonra tekrar seçilemez
  hatali(u(c, { tip: 'sec', id: pid(0), cizim: 0, secim: 0 }));
});

test('seçim süresi: bitmeden "süre bitti" olmaz, bitince ilk kelime alınır', () => {
  const d = basla(2);
  hatali(u(d, { tip: 'sureBitti', id: pid(1), cizim: 0 }, T0 + SECIM_SURESI * 1000 - 1));
  const c = basarili(u(d, { tip: 'sureBitti', id: pid(1), cizim: 0 }, T0 + SECIM_SURESI * 1000));
  assert.equal(c.asama, 'cizim');
  assert.equal(c.kelime, d.secenekler[0]);
  assert.equal(c.baslangic, T0 + SECIM_SURESI * 1000);
});

test('seçenekler: odada sunulan kelime tekrar gelmez, liste bitince baştan başlar', () => {
  // 7 kelimelik liste, her seçimde 3 kelime: ilk iki seçim 6 farklı kelime
  let d = basla(2, { turSayisi: 3 });
  const gorulen = [];
  gorulen.push(...d.secenekler);
  d = sureyiBitir(sec(d));
  d = sonraki(d);
  gorulen.push(...d.secenekler);
  assert.equal(new Set(gorulen).size, 6);
  // Üçüncü seçimde liste azaldı: kalan kelime gelir, az önce sunulanlar gelmez
  const onceki = d.secenekler.slice();
  d = sureyiBitir(sec(d));
  d = sonraki(d);
  assert.equal(d.secenekler.length, 3);
  assert.equal(new Set(d.secenekler).size, 3);
  const kalan = LISTE.find((k) => !gorulen.includes(k));
  assert.ok(d.secenekler.includes(kalan));
  for (const k of onceki) {
    assert.ok(!d.secenekler.includes(k), k + ' art arda geldi');
  }
});

test('boş kelime listesiyle başlatılamaz', () => {
  hatali(uygula(lobi(2), { tip: 'baslat', id: pid(0) }, sirali, T0, []));
});

// ---------------------------------------------------------------------------
// Tahmin ve puanlama
// ---------------------------------------------------------------------------

test('doğru tahmin: hemen bilen en yüksek puanı, çizen yarısını alır', () => {
  let d = sec(basla(3));
  d = basarili(tahmin(d, 1, buyuk(d.kelime), T0));
  assert.deepEqual(d.bilenler, [{ o: 1, puan: EN_YUKSEK_PUAN }]);
  assert.equal(d.oyuncular[1].puan, EN_YUKSEK_PUAN);
  assert.equal(d.oyuncular[0].puan, cizenPuani(EN_YUKSEK_PUAN));
  assert.equal(d.asama, 'cizim'); // bir kişi daha bilmedi
});

function buyuk(metin) {
  return metin.toLocaleUpperCase('tr-TR');
}

test('puan kalan süreye göre: erken bilen çok, geç bilen az alır', () => {
  const d = sec(basla(3, { sure: 60 }));
  assert.equal(tahminPuani(d, T0), EN_YUKSEK_PUAN);
  assert.equal(tahminPuani(d, T0 + 30000), 6);
  assert.equal(tahminPuani(d, T0 + 60000), EN_DUSUK_PUAN);
  assert.equal(tahminPuani(d, T0 + 61000), EN_DUSUK_PUAN); // tolerans içinde de en az puan
  // İki kişi farklı anlarda bilir
  let c = basarili(tahmin(d, 2, d.kelime, T0 + 15000));
  c = basarili(tahmin(c, 1, d.kelime, T0 + 45000));
  assert.deepEqual(c.bilenler, [
    { o: 2, puan: 8 },
    { o: 1, puan: 4 },
  ]);
  assert.ok(c.oyuncular[2].puan > c.oyuncular[1].puan);
  assert.equal(c.oyuncular[0].puan, cizenPuani(8) + cizenPuani(4));
  assert.equal(cizenPuani(5), 3); // yarım yukarı yuvarlanır
});

test('herkes bilince çizim hemen biter, geçmişe yazılır', () => {
  let d = sec(basla(3));
  d = basarili(tahmin(d, 1, d.kelime, T0 + 1000));
  d = basarili(tahmin(d, 2, d.kelime, T0 + 2000));
  assert.equal(d.asama, 'acik');
  const g = d.gecmis[0];
  assert.equal(g.kelime, d.kelime);
  assert.equal(g.cizen, 0);
  assert.deepEqual(
    g.bilenler.map((b) => b.o),
    [1, 2]
  );
  assert.equal(g.cizenPuan, d.oyuncular[0].puan);
});

test('yanlış tahmin akışa düşer, puan değişmez; akış sınırlı', () => {
  let d = sec(basla(2));
  d = basarili(tahmin(d, 1, '  armut  '));
  assert.deepEqual(d.yanlislar, [{ o: 1, metin: 'armut' }]);
  assert.equal(d.oyuncular[1].puan, 0);
  for (let i = 0; i < AKIS_UZUNLUGU + 3; i++) {
    d = basarili(tahmin(d, 1, 'yanlış' + i));
  }
  assert.equal(d.yanlislar.length, AKIS_UZUNLUGU);
  assert.equal(d.yanlislar[d.yanlislar.length - 1].metin, 'yanlış' + (AKIS_UZUNLUGU + 2));
});

test('doğru tahmin akışa yazılmaz', () => {
  let d = sec(basla(3));
  d = basarili(tahmin(d, 1, d.kelime));
  assert.equal(d.yanlislar.length, 0);
  assert.ok(!JSON.stringify(d.bilenler).includes(d.kelime));
});

test('tahmin kuralları: çizen tahmin etmez, bilen bir daha tahmin etmez, eski çizime tahmin geçmez', () => {
  let d = sec(basla(3));
  hatali(tahmin(d, 0, d.kelime));
  d = basarili(tahmin(d, 1, d.kelime));
  hatali(tahmin(d, 1, d.kelime));
  hatali(u(d, { tip: 'tahmin', id: pid(2), cizim: 5, metin: d.kelime }));
  hatali(tahmin(d, 2, ''));
  hatali(u(d, { tip: 'tahmin', id: pid(9), cizim: d.cizim, metin: 'x' }));
  // Seçim aşamasında tahmin yok
  hatali(tahmin(basla(2), 1, 'elma'));
});

test('süre: bitmeden "süre bitti" olmaz; bitince kelime açılır; tolerans sonrası tahmin geçmez', () => {
  const d = sec(basla(2, { sure: 60 }));
  assert.equal(kalanMs(d, T0 + 10000), 50000);
  hatali(u(d, { tip: 'sureBitti', id: pid(1), cizim: 0 }, T0 + 59999));
  // Saat farkı için kısa tolerans: süre bitip "süre bitti" gelmeden yapılan tahmin sayılır
  const gec = basarili(tahmin(d, 1, d.kelime, T0 + 60000 + TOLERANS_MS));
  assert.equal(gec.bilenler[0].puan, EN_DUSUK_PUAN);
  hatali(tahmin(d, 1, d.kelime, T0 + 60000 + TOLERANS_MS + 1));
  const bitti = basarili(u(d, { tip: 'sureBitti', id: pid(1), cizim: 0 }, T0 + 60000));
  assert.equal(bitti.asama, 'acik');
  assert.deepEqual(bitti.gecmis[0].bilenler, []);
  assert.equal(bitti.gecmis[0].cizenPuan, 0);
  // İkinci "süre bitti" zararsız reddedilir
  hatali(u(bitti, { tip: 'sureBitti', id: pid(0), cizim: 0 }, T0 + 61000));
});

// ---------------------------------------------------------------------------
// Tur akışı ve rol dönüşü
// ---------------------------------------------------------------------------

test('rol dönüşü: çizen sırayla döner, her turda herkes bir kez çizer', () => {
  let d = basla(3, { turSayisi: 2 });
  assert.equal(toplamCizim(d), 6);
  const cizenler = [];
  const turlar = [];
  for (let n = 0; n < 6; n++) {
    assert.equal(d.asama, 'secim');
    cizenler.push(d.cizen);
    turlar.push(turNumarasi(d));
    d = sureyiBitir(sec(d));
    d = sonraki(d, (n + 1) % 3);
  }
  assert.deepEqual(cizenler, [0, 1, 2, 0, 1, 2]);
  assert.deepEqual(turlar, [1, 1, 1, 2, 2, 2]);
  assert.equal(d.asama, 'bitti');
  assert.equal(d.gecmis.length, 6);
});

test('sonraki: yalnız açık aşamada; aynı anda iki basış zararsız', () => {
  let d = sec(basla(2));
  hatali(u(d, { tip: 'sonraki', id: pid(1), cizim: 0 }));
  d = sureyiBitir(d);
  const ileri = sonraki(d, 1);
  assert.equal(ileri.cizim, 1);
  assert.equal(ileri.cizen, 1);
  // İkinci basış eski çizim numarasıyla gelir: hiçbir şey değişmez
  const ikinci = basarili(u(ileri, { tip: 'sonraki', id: pid(0), cizim: 0 }));
  assert.equal(ikinci.cizim, 1);
  assert.equal(ikinci.asama, 'secim');
  assert.deepEqual(ikinci.secenekler, ileri.secenekler);
});

test('yeni çizimde bilenler ve yanlışlar sıfırlanır, tahta anahtarı değişir', () => {
  let d = sec(basla(3));
  d = basarili(tahmin(d, 1, 'armut'));
  d = basarili(tahmin(d, 2, d.kelime));
  const ilkAnahtar = tahtaAnahtari(d);
  d = sureyiBitir(d);
  d = sonraki(d);
  d = sec(d, T0 + 100000);
  assert.deepEqual(d.bilenler, []);
  assert.deepEqual(d.yanlislar, []);
  assert.notEqual(tahtaAnahtari(d), ilkAnahtar);
});

// ---------------------------------------------------------------------------
// Oyun sonu
// ---------------------------------------------------------------------------

// İki kişilik tek turluk oyun: önce p0 çizer (p1 bilir/bilmez), sonra p1 çizer (p0 bilir/bilmez)
function ikiKisilikOyun(birinciBilir, ikinciBilir, sn1 = 0, sn2 = 0) {
  let d = basla(2, { turSayisi: 1, sure: 60 });
  d = sec(d, T0);
  if (birinciBilir) {
    d = basarili(tahmin(d, 1, d.kelime, T0 + sn1 * 1000));
  } else {
    d = sureyiBitir(d);
  }
  d = sonraki(d, 0, T0 + 100000);
  d = sec(d, T0 + 100000);
  if (ikinciBilir) {
    d = basarili(tahmin(d, 0, d.kelime, T0 + 100000 + sn2 * 1000));
  } else {
    d = sureyiBitir(d);
  }
  return sonraki(d, 1, T0 + 200000);
}

test('oyun sonu: en çok puanı olan kazanır', () => {
  const d = ikiKisilikOyun(true, true, 0, 30);
  assert.equal(d.asama, 'bitti');
  // p1: 10 (bildi) + 3 (çizdi, p0 6 aldı) = 13; p0: 5 (çizdi) + 6 (bildi) = 11
  assert.equal(d.oyuncular[1].puan, 13);
  assert.equal(d.oyuncular[0].puan, 11);
  assert.deepEqual(kazananlar(d), [1]);
});

test('oyun sonu: eşit puanda beraberlik, kimse bilemezse de beraberlik', () => {
  const esit = ikiKisilikOyun(true, true, 10, 10);
  assert.equal(esit.oyuncular[0].puan, esit.oyuncular[1].puan);
  assert.deepEqual(kazananlar(esit), [0, 1]);
  const bos = ikiKisilikOyun(false, false);
  assert.deepEqual(kazananlar(bos), [0, 1]);
  // Bitmeden kazanan yok
  assert.deepEqual(kazananlar(sec(basla(2))), []);
});

test('tekrar oyna: puanlar sıfırlanır, çıkan kelimeler korunur; lobiye dön', () => {
  const bitti = ikiKisilikOyun(true, false);
  hatali(u(bitti, { tip: 'tekrarOyna', id: pid(1) }));
  const yeni = basarili(u(bitti, { tip: 'tekrarOyna', id: pid(0) }, T0 + 300000));
  assert.equal(yeni.asama, 'secim');
  assert.equal(yeni.cizim, 0);
  assert.deepEqual(
    yeni.oyuncular.map((o) => o.puan),
    [0, 0]
  );
  assert.deepEqual(yeni.gecmis, []);
  for (const k of bitti.kullanilanlar) {
    assert.ok(yeni.kullanilanlar.includes(k) || !yeni.secenekler.includes(k));
  }
  hatali(u(sec(basla(2)), { tip: 'yeniOyun', id: pid(1) }));
  const lobiye = basarili(u(sec(basla(2)), { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.equal(lobiye.kelime, '');
  hatali(u(lobiye, { tip: 'yeniOyun', id: pid(0) }));
});

test('girdi durumu değişmez, bilinmeyen hareket reddedilir', () => {
  const d = sec(basla(2));
  const kopya = structuredClone(d);
  tahmin(d, 1, d.kelime);
  assert.deepEqual(d, kopya);
  hatali(u(d, { tip: 'uc', id: pid(0) }));
});

// ---------------------------------------------------------------------------
// Tahta: canlı çizim parçaları
// ---------------------------------------------------------------------------

function parca(i, b, n, s = 0, a = 'A') {
  return { t: 'parca', a: a, s: s, i: i, r: 0, k: 6, b: b, n: n };
}

test('tahta: parçalar sırayla birleşir, tekrar gelen nokta eklenmez', () => {
  const t = yeniTahta('A');
  assert.equal(mesajUygula(t, parca(0, 0, [10, 10, 20, 20])), 'tamam');
  assert.equal(mesajUygula(t, parca(0, 2, [30, 30])), 'tamam');
  assert.equal(mesajUygula(t, parca(0, 1, [20, 20, 30, 30, 40, 40])), 'tamam'); // ikisi tekrar
  assert.deepEqual(t.cizgiler[0].n, [10, 10, 20, 20, 30, 30, 40, 40]);
  assert.equal(mesajUygula(t, parca(1, 0, [5, 5])), 'tamam');
  assert.equal(t.cizgiler.length, 2);
});

test('tahta: kaçan parça "eksik" der, tam tahta her şeyi yerine koyar', () => {
  const t = yeniTahta('A');
  assert.equal(mesajUygula(t, parca(0, 2, [30, 30])), 'eksik'); // başı yok
  assert.equal(mesajUygula(t, parca(1, 0, [30, 30])), 'eksik'); // 0. çizgi yok
  const tam = { t: 'tahta', a: 'A', s: 0, c: [{ r: 1, k: 14, n: [1, 1, 2, 2, 3, 3] }] };
  assert.equal(mesajUygula(t, tam), 'tamam');
  assert.equal(t.cizgiler.length, 1);
  assert.equal(mesajUygula(t, parca(0, 3, [4, 4])), 'tamam');
  assert.deepEqual(t.cizgiler[0].n, [1, 1, 2, 2, 3, 3, 4, 4]);
  // tahtaMesaji ile geri dönüş
  const t2 = yeniTahta('A');
  assert.equal(mesajUygula(t2, tahtaMesaji(t)), 'tamam');
  assert.deepEqual(t2.cizgiler, t.cizgiler);
});

test('tahta: temizle sayfayı artırır, eski sayfanın geç parçası yok sayılır', () => {
  const t = yeniTahta('A');
  mesajUygula(t, parca(0, 0, [1, 1, 2, 2]));
  assert.equal(mesajUygula(t, { t: 'temizle', a: 'A', s: 1 }), 'tamam');
  assert.equal(t.cizgiler.length, 0);
  assert.equal(t.sayfa, 1);
  assert.equal(mesajUygula(t, parca(0, 2, [3, 3], 0)), 'eski');
  assert.equal(t.cizgiler.length, 0);
  // Temizle kaçtıysa yeni sayfanın ilk parçası tahtayı kendisi temizler
  const t2 = yeniTahta('A');
  mesajUygula(t2, parca(0, 0, [1, 1, 2, 2]));
  assert.equal(mesajUygula(t2, parca(0, 0, [7, 7], 1)), 'tamam');
  assert.deepEqual(t2.cizgiler, [{ r: 0, k: 6, n: [7, 7] }]);
});

test('tahta: geri al son çizgiyi siler, başka çizimin mesajı yok sayılır', () => {
  const t = yeniTahta('A');
  mesajUygula(t, parca(0, 0, [1, 1]));
  mesajUygula(t, parca(1, 0, [2, 2]));
  assert.equal(mesajUygula(t, { t: 'geri', a: 'A', s: 0, i: 1 }), 'tamam');
  assert.equal(t.cizgiler.length, 1);
  assert.equal(mesajUygula(t, parca(1, 0, [9, 9])), 'tamam'); // aynı numarayla yeni çizgi
  assert.deepEqual(t.cizgiler[1].n, [9, 9]);
  assert.equal(mesajUygula(t, parca(2, 0, [1, 1], 0, 'B')), 'eski');
  assert.equal(t.cizgiler.length, 2);
});

test('tahta: bozuk mesaj reddedilir, nokta sınırı aşılmaz', () => {
  assert.equal(mesajGecerliMi(parca(0, 0, [1, 1])), true);
  assert.equal(mesajGecerliMi(parca(0, 0, [1])), false); // tek sayı
  assert.equal(mesajGecerliMi(parca(0, 0, [1, 2000])), false); // tahta dışı
  assert.equal(mesajGecerliMi(parca(0, 0, [1.5, 2])), false);
  assert.equal(mesajGecerliMi({ t: 'parca', a: 'A', s: 0, i: 0, r: 9, k: 6, b: 0, n: [1, 1] }), false);
  assert.equal(mesajGecerliMi({ t: 'tahta', a: 'A', s: 0, c: [{ r: 0, k: 6, n: 'x' }] }), false);
  assert.equal(mesajGecerliMi({ t: 'iste', a: 'A' }), true);
  assert.equal(mesajGecerliMi(null), false);
  const t = yeniTahta('A');
  assert.equal(mesajUygula(t, { t: 'kotu', a: 'A', s: 0 }), 'eski');
  const cok = [];
  for (let i = 0; i < MAKS_NOKTA; i++) {
    cok.push(i % 1000, 5);
  }
  assert.equal(mesajUygula(t, parca(0, 0, cok)), 'tamam');
  assert.equal(mesajUygula(t, parca(1, 0, [1, 1])), 'eski'); // sınır doldu
});

test('tahta noktası ve sadeleştirme', () => {
  assert.deepEqual(tahtaNoktasi(0.5, 0.25), [500, 250]);
  assert.deepEqual(tahtaNoktasi(-0.2, 1.4), [0, 1000]);
  assert.equal(noktaTutulsunMu(100, 100, 101, 102), false);
  assert.equal(noktaTutulsunMu(100, 100, 104, 100), true);
});

// ---------------------------------------------------------------------------
// Yönlendirici (oyunlar.js)
// ---------------------------------------------------------------------------

test('yönlendirici: Çiz Bil seçilir, oynanır ve bitince genel skora yazılır', () => {
  let d = yonlendirYeniOda(pid(0), 'Ayşe');
  d = basarili(yonlendir(d, { tip: 'katil', id: pid(1), ad: 'Ali' }));
  d = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'cizbil' }));
  assert.equal(oyunId(d), 'cizbil');
  assert.equal(d.oyuncular.length, 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { turSayisi: 1 } }));
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, Math.random, undefined, undefined, undefined, undefined, T0));
  assert.equal(d.asama, 'secim');
  assert.ok(d.secenekler.every((k) => KELIMELER.includes(k)));
  const y = (durum, eylem, simdi) =>
    basarili(yonlendir(durum, eylem, Math.random, undefined, undefined, undefined, undefined, simdi));
  // p0 çizer, p1 hemen bilir
  d = y(d, { tip: 'sec', id: pid(0), cizim: 0, secim: 0 }, T0);
  d = y(d, { tip: 'tahmin', id: pid(1), cizim: 0, metin: d.kelime }, T0);
  d = y(d, { tip: 'sonraki', id: pid(1), cizim: 0 }, T0 + 1000);
  // p1 çizer, kimse bilmez
  d = y(d, { tip: 'sec', id: pid(1), cizim: 1, secim: 0 }, T0 + 2000);
  d = y(d, { tip: 'sureBitti', id: pid(0), cizim: 1 }, T0 + 2000 + d.ayar.sure * 1000);
  d = y(d, { tip: 'sonraki', id: pid(0), cizim: 1 }, T0 + 200000);
  assert.equal(d.asama, 'bitti');
  assert.equal(genelVeri(d).kazanim[pid(1)].sayi, 1);
  assert.equal(genelVeri(d).biten, 1);
  // Lobiye dönüp başka oyuna geçince genel skor kalır
  d = basarili(yonlendir(d, { tip: 'yeniOyun', id: pid(0) }));
  d = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  assert.equal(genelVeri(d).kazanim[pid(1)].sayi, 1);
});

test('yönlendirici: 4 kişilik odadan Çiz Bil seçilebilir, 5. kişi katılamaz', () => {
  let d = yonlendirYeniOda(pid(0), 'Ayşe', 'cizbil');
  for (let i = 1; i < 4; i++) {
    d = basarili(yonlendir(d, { tip: 'katil', id: pid(i), ad: 'K' + i }));
  }
  assert.equal(d.oyuncular.length, 4);
  hatali(yonlendir(d, { tip: 'katil', id: pid(4), ad: 'Beş' }));
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

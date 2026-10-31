// "Gizli Görev" motoru ve oyun yönlendirici testleri. Çalıştır: node test/gorev-test.js
import assert from 'node:assert/strict';
import {
  DEGISTIRME_HAKKI,
  GOREV_PUANI,
  MAKS_TAHMIN_HARF,
  YAKALAMA_HAKKI,
  ZORLUKLAR,
  bankaHazirla,
  bekleyenSoruVarMi,
  benimSorularim,
  ekranVerisi,
  kalanMs,
  sonucVerisi,
  sureBittiMi,
  sureYazisi,
  tahminHatasi,
  uygula,
  yeniOda,
} from '../gorev.js';
import { GOREVLER } from '../gorev-gorevler.js';
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

// Küçük deneme listesi: her zorlukta 8 görev (gerçek banka kullanılmaz)
function kucukListe(adet) {
  const liste = [];
  for (const zorluk of ZORLUKLAR) {
    for (let i = 0; i < adet; i++) {
      liste.push({ zorluk: zorluk, metin: zorluk + ' görev ' + i });
    }
  }
  return liste;
}

const LISTE = kucukListe(8);
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

// Deneme listesi ve sabit zamanla hareket uygular
function u(d, eylem, tohum = 1, simdi = T0) {
  return uygula(d, eylem, rng(tohum), LISTE, simdi);
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
function oyun(n, ayar = {}, tohum = 1) {
  let d = lobi(n);
  if (Object.keys(ayar).length > 0) {
    d = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: ayar }));
  }
  return basarili(u(d, { tip: 'baslat', id: pid(0) }, tohum));
}

// i. oyuncu zorluktaki görevi yaptığını söyler, bekleyen onayın numarasını döndürür
function yaptim(d, i, zorluk) {
  const yeni = basarili(u(d, { tip: 'yaptim', id: pid(i), zorluk: zorluk }));
  return { d: yeni, no: yeni.onaylar[yeni.onaylar.length - 1].no };
}

function oyVer(d, i, no, evet) {
  return basarili(u(d, { tip: 'onay', id: pid(i), no: no, evet: evet }));
}

// ---------------------------------------------------------------------------
// Görev bankası
// ---------------------------------------------------------------------------

test('görev bankası: en az 120 görev, zorluklar dengeli, tekrar yok, metinler kısa', () => {
  assert.ok(GOREVLER.length >= 120);
  const sayilar = { kolay: 0, orta: 0, zor: 0 };
  for (const g of GOREVLER) {
    assert.ok(ZORLUKLAR.includes(g.zorluk), g.metin);
    sayilar[g.zorluk] += 1;
    assert.ok(g.metin.length > 8 && g.metin.length <= 90, g.metin);
  }
  for (const zorluk of ZORLUKLAR) {
    assert.ok(sayilar[zorluk] >= 38 && sayilar[zorluk] <= 45, zorluk + ': ' + sayilar[zorluk]);
  }
  assert.equal(new Set(GOREVLER.map((g) => g.metin)).size, GOREVLER.length);
  const banka = bankaHazirla(GOREVLER);
  assert.equal(banka.kolay.length + banka.orta.length + banka.zor.length, GOREVLER.length);
});

test('puanlar: kolay 1, orta 2, zor 3', () => {
  assert.deepEqual(GOREV_PUANI, { kolay: 1, orta: 2, zor: 3 });
});

// ---------------------------------------------------------------------------
// Lobi
// ---------------------------------------------------------------------------

test('bilinmeyen hareket hata verir', () => {
  assert.match(hatali(u(lobi(2), { tip: 'uc', id: pid(0) })), /Bilinmeyen/);
  assert.match(hatali(u(lobi(2), undefined)), /Bilinmeyen/);
});

test('girdi durumu değişmez (donmuş durumla tam oyun akışı)', () => {
  let d = dondur(lobi(3));
  d = dondur(basarili(u(d, { tip: 'baslat', id: pid(0) })));
  const y = yaptim(d, 1, 'orta');
  d = dondur(y.d);
  d = dondur(oyVer(d, 0, y.no, true));
  assert.equal(d.puanlar[1], 2);
});

test('lobi: katılma, ev sahibi çıkarma, 4 kişi sınırı', () => {
  let d = lobi(4);
  assert.match(hatali(u(d, { tip: 'katil', id: 'x', ad: 'Fazla' })), /dolu/);
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1), hedef: pid(2) })), /ev sahibi/);
  d = basarili(u(d, { tip: 'cikar', id: pid(0), hedef: pid(3) }));
  assert.equal(d.oyuncular.length, 3);
  d = basarili(u(d, { tip: 'cikar', id: pid(0) }));
  assert.equal(d.sahip, pid(1));
});

test('ayarlar: yalnız ev sahibi, yalnız lobide, geçerli değerler', () => {
  const d = lobi(2);
  const ayarli = basarili(u(d, { tip: 'ayarla', id: pid(0), ayar: { bitis: 'sure', sure: 60, hedef: 20 } }));
  assert.deepEqual(ayarli.ayar, { bitis: 'sure', hedef: 20, sure: 60 });
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(1), ayar: { hedef: 10 } })), /ev sahibi/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { hedef: 11 } })), /hedef/);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { sure: 7 } })), /süre/i);
  assert.match(hatali(u(d, { tip: 'ayarla', id: pid(0), ayar: { bitis: 'x' } })), /bitiş/);
  const basladi = oyun(2);
  assert.match(hatali(u(basladi, { tip: 'ayarla', id: pid(0), ayar: { hedef: 10 } })), /başlamadan/);
});

test('başlatma: en az 2 kişi, yalnız ev sahibi, yetersiz liste', () => {
  assert.match(hatali(u(lobi(1), { tip: 'baslat', id: pid(0) })), /En az 2/);
  assert.match(hatali(u(lobi(2), { tip: 'baslat', id: pid(1) })), /ev sahibi/);
  const kucuk = kucukListe(1);
  assert.match(hatali(uygula(lobi(2), { tip: 'baslat', id: pid(0) }, rng(1), kucuk, T0)), /yetersiz/);
});

// ---------------------------------------------------------------------------
// Dağıtım
// ---------------------------------------------------------------------------

test('dağıtım: herkese her zorluktan bir görev, kimsede aynı görev yok', () => {
  for (const n of [2, 3, 4]) {
    for (let tohum = 1; tohum <= 10; tohum++) {
      const d = oyun(n, {}, tohum);
      assert.equal(d.asama, 'oyun');
      const hepsi = [];
      for (let i = 0; i < n; i++) {
        for (const zorluk of ZORLUKLAR) {
          const metin = d.eller[i][zorluk];
          assert.ok(metin, 'Görev eksik');
          assert.ok(metin.startsWith(zorluk + ' '), 'Zorluk uymuyor: ' + metin);
          hepsi.push(metin);
        }
      }
      assert.equal(new Set(hepsi).size, hepsi.length);
      assert.deepEqual(d.puanlar, new Array(n).fill(0));
      assert.deepEqual(d.yakalamaHakki, new Array(n).fill(YAKALAMA_HAKKI));
      assert.deepEqual(d.degistirmeHakki, new Array(n).fill(DEGISTIRME_HAKKI));
      assert.equal(d.baslangic, T0);
    }
  }
});

test('dağıtım: farklı tohum farklı görev getirir', () => {
  const a = oyun(2, {}, 1);
  const b = oyun(2, {}, 2);
  assert.notDeepEqual(a.eller, b.eller);
});

test('gerçek bankayla oyun başlar', () => {
  let d = lobi(4);
  d = basarili(uygula(d, { tip: 'baslat', id: pid(0) }, rng(5), GOREVLER, T0));
  assert.equal(d.eller.length, 4);
});

// ---------------------------------------------------------------------------
// Yaptım, onay, ret
// ---------------------------------------------------------------------------

test('yaptım: onay sorusu açılır; aynı görev için tekrar basılamaz, başkası basabilir', () => {
  let d = oyun(2);
  const y = yaptim(d, 0, 'kolay');
  assert.equal(y.d.onaylar.length, 1);
  assert.equal(y.d.onaylar[0].metin, d.eller[0].kolay);
  assert.match(hatali(u(y.d, { tip: 'yaptim', id: pid(0), zorluk: 'kolay' })), /onay bekleniyor/);
  // Başka zorluk serbest
  d = basarili(u(y.d, { tip: 'yaptim', id: pid(0), zorluk: 'zor' }));
  assert.equal(d.onaylar.length, 2);
  // Geçersiz zorluk, odada olmayan
  assert.match(hatali(u(d, { tip: 'yaptim', id: pid(1), zorluk: 'imkansiz' })), /Geçersiz/);
  assert.match(hatali(u(d, { tip: 'yaptim', id: 'yok', zorluk: 'kolay' })), /odada değilsin/);
  assert.match(hatali(u(lobi(2), { tip: 'yaptim', id: pid(0), zorluk: 'kolay' })), /Şu an/);
});

test('2 kişide rakibin cevabı belirler: oldu -> puan, yeni görev aynı zorlukta', () => {
  for (const zorluk of ZORLUKLAR) {
    const d = oyun(2);
    const eski = d.eller[0][zorluk];
    const y = yaptim(d, 0, zorluk);
    const bitti = oyVer(y.d, 1, y.no, true);
    assert.equal(bitti.puanlar[0], GOREV_PUANI[zorluk]);
    assert.equal(bitti.puanlar[1], 0);
    assert.equal(bitti.onaylar.length, 0);
    assert.deepEqual(bitti.tamamlananlar[0], [{ zorluk: zorluk, metin: eski }]);
    const yeni = bitti.eller[0][zorluk];
    assert.notEqual(yeni, eski);
    assert.ok(yeni.startsWith(zorluk + ' '));
    // Yeni görev rakipte de yok
    for (const z of ZORLUKLAR) {
      assert.notEqual(bitti.eller[1][z], yeni);
    }
  }
});

test('2 kişide olmadı: görev oyuncuda kalır, puan yok, tekrar denenebilir', () => {
  const d = oyun(2);
  const y = yaptim(d, 0, 'orta');
  const bitti = oyVer(y.d, 1, y.no, false);
  assert.equal(bitti.puanlar[0], 0);
  assert.equal(bitti.eller[0].orta, d.eller[0].orta);
  assert.equal(bitti.onaylar.length, 0);
  assert.deepEqual(bitti.tamamlananlar[0], []);
  // Tekrar basılabilir
  basarili(u(bitti, { tip: 'yaptim', id: pid(0), zorluk: 'orta' }));
});

test('onay kuralları: kendi görevini onaylayamaz, iki kez oy yok, bitmiş soru zararsız', () => {
  const d = oyun(3);
  const y = yaptim(d, 0, 'kolay');
  assert.match(hatali(u(y.d, { tip: 'onay', id: pid(0), no: y.no, evet: true })), /onaylayamazsın/);
  assert.match(hatali(u(y.d, { tip: 'onay', id: pid(1), no: y.no, evet: 'evet' })), /Geçersiz/);
  const bir = oyVer(y.d, 1, y.no, false);
  assert.match(hatali(u(bir, { tip: 'onay', id: pid(1), no: y.no, evet: true })), /Zaten/);
  // Soru yokken (karar verilmiş) gelen oy zararsızdır
  const bitti = oyVer(bir, 2, y.no, false);
  assert.equal(bitti.onaylar.length, 0);
  basarili(u(bitti, { tip: 'onay', id: pid(2), no: y.no, evet: true }));
});

test('3 kişide çoğunluk: iki oy yeterli; eşitlikte kabul', () => {
  // 3 kişi: iki kişi oy verir. İkisi de evet -> kabul
  let d = oyun(3);
  let y = yaptim(d, 0, 'kolay');
  let s = oyVer(y.d, 1, y.no, true);
  assert.equal(s.puanlar[0], 1);

  // İkisi de hayır -> ret
  y = yaptim(d, 0, 'kolay');
  s = oyVer(y.d, 1, y.no, false);
  assert.equal(s.onaylar.length, 1, 'Eşitlik ihtimali var, soru açık kalmalı');
  s = oyVer(s, 2, y.no, false);
  assert.equal(s.puanlar[0], 0);
  assert.equal(s.onaylar.length, 0);

  // Bir evet, bir hayır -> eşitlik, kabul
  y = yaptim(d, 0, 'zor');
  s = oyVer(y.d, 1, y.no, false);
  s = oyVer(s, 2, y.no, true);
  assert.equal(s.puanlar[0], 3);

  // Sıra değişince de aynı: önce evet gelince kabul
  y = yaptim(d, 0, 'orta');
  s = oyVer(y.d, 2, y.no, true);
  assert.equal(s.puanlar[0], 2);
});

test('4 kişide çoğunluk: 3 oyun ikisi karar verir', () => {
  const d = oyun(4);
  let y = yaptim(d, 0, 'orta');
  let s = oyVer(y.d, 1, y.no, true);
  assert.equal(s.onaylar.length, 1, 'Henüz kesin değil');
  s = oyVer(s, 2, y.no, true);
  assert.equal(s.puanlar[0], 2);
  assert.equal(s.onaylar.length, 0);

  y = yaptim(d, 0, 'orta');
  s = oyVer(y.d, 1, y.no, false);
  s = oyVer(s, 2, y.no, true);
  assert.equal(s.onaylar.length, 1, '1 evet 1 hayır: üçüncü oy belirler');
  s = oyVer(s, 3, y.no, true);
  assert.equal(s.puanlar[0], 2);

  y = yaptim(d, 0, 'orta');
  s = oyVer(y.d, 1, y.no, false);
  s = oyVer(s, 2, y.no, false);
  assert.equal(s.puanlar[0], 0);
  assert.equal(s.onaylar.length, 0);
});

// ---------------------------------------------------------------------------
// Yakalama
// ---------------------------------------------------------------------------

test('yakalama doğru: yakalayan 1 puan alır, görev yanar ve yenisi gelir, hedef puan almaz', () => {
  const d = oyun(2);
  const yanacak = d.eller[1].orta;
  let s = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'Şarkı mırıldanıyor' }));
  assert.equal(s.yakalamaHakki[0], YAKALAMA_HAKKI - 1);
  assert.equal(s.yakalamalar.length, 1);
  assert.equal(s.puanlar[0], 0, 'Cevap gelmeden puan yok');
  const no = s.yakalamalar[0].no;
  s = basarili(u(s, { tip: 'yakalamaCevap', id: pid(1), no: no, evet: true, zorluk: 'orta' }));
  assert.equal(s.puanlar[0], 1);
  assert.equal(s.puanlar[1], 0);
  assert.equal(s.yakalamalar.length, 0);
  assert.notEqual(s.eller[1].orta, yanacak);
  assert.ok(s.eller[1].orta.startsWith('orta '));
  assert.deepEqual(s.tamamlananlar[1], []);
});

test('yakalama yanlış: puan yok, görevler yerinde, hak yine harcanır', () => {
  const d = oyun(2);
  let s = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'Bir şey yapıyor' }));
  s = basarili(u(s, { tip: 'yakalamaCevap', id: pid(1), no: s.yakalamalar[0].no, evet: false }));
  assert.equal(s.puanlar[0], 0);
  assert.deepEqual(s.eller, d.eller);
  assert.equal(s.yakalamaHakki[0], YAKALAMA_HAKKI - 1);
  assert.equal(s.yakalamalar.length, 0);
});

test('yakalama hakkı: oyun başına 3, sonra hata', () => {
  let d = oyun(2);
  for (let i = 0; i < YAKALAMA_HAKKI; i++) {
    d = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'Deneme ' + i }));
    d = basarili(u(d, { tip: 'yakalamaCevap', id: pid(1), no: d.yakalamalar[0].no, evet: false }));
  }
  assert.equal(d.yakalamaHakki[0], 0);
  assert.match(hatali(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'Bir daha' })), /hakkın bitti/);
  // Rakibin hakkı ayrı
  assert.equal(d.yakalamaHakki[1], YAKALAMA_HAKKI);
  basarili(u(d, { tip: 'yakala', id: pid(1), hedef: pid(0), tahmin: 'Bence yapıyor' }));
});

test('yakalama kuralları: kendini, boş, 60 harftan uzun, evet için görev seçmeden, başkasının sorusu', () => {
  const d = oyun(3);
  assert.match(hatali(u(d, { tip: 'yakala', id: pid(0), hedef: pid(0), tahmin: 'x' })), /Kendini/);
  assert.match(hatali(u(d, { tip: 'yakala', id: pid(0), hedef: 'yok', tahmin: 'x' })), /oyuncu yok/);
  assert.match(hatali(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: '   ' })), /boş/);
  assert.match(hatali(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'a'.repeat(MAKS_TAHMIN_HARF + 1) })), /en fazla 60/);
  basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'a'.repeat(MAKS_TAHMIN_HARF) }));
  assert.equal(tahminHatasi('çğüşöı'), null);

  let s = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'şüpheli' }));
  const no = s.yakalamalar[0].no;
  assert.match(hatali(u(s, { tip: 'yakalamaCevap', id: pid(1), no: no, evet: true })), /seç/);
  assert.match(hatali(u(s, { tip: 'yakalamaCevap', id: pid(2), no: no, evet: false })), /sana sorulmadı/);
  assert.match(hatali(u(s, { tip: 'yakala', id: pid(0), hedef: pid(2), tahmin: 'yine' })), /cevap bekliyor/);
  assert.match(hatali(u(s, { tip: 'yakala', id: pid(2), hedef: pid(1), tahmin: 'ben de' })), /zaten bir soru/);
});

test('yakalama: yanan görevin bekleyen onayı düşer', () => {
  const d = oyun(3);
  const y = yaptim(d, 1, 'zor');
  let s = basarili(u(y.d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'Bir şey söylettiriyor' }));
  s = basarili(u(s, { tip: 'yakalamaCevap', id: pid(1), no: s.yakalamalar[0].no, evet: true, zorluk: 'zor' }));
  assert.equal(s.onaylar.length, 0);
  assert.equal(s.puanlar[1], 0);
  assert.equal(s.puanlar[0], 1);
});

// ---------------------------------------------------------------------------
// Görevi değiştir
// ---------------------------------------------------------------------------

test('görevi değiştir: aynı zorlukta yeni görev, hak 1, ikinci kez olmaz', () => {
  const d = oyun(2);
  const eski = d.eller[0].zor;
  let s = basarili(u(d, { tip: 'degistir', id: pid(0), zorluk: 'zor' }));
  assert.notEqual(s.eller[0].zor, eski);
  assert.ok(s.eller[0].zor.startsWith('zor '));
  assert.notEqual(s.eller[0].zor, s.eller[1].zor);
  assert.equal(s.degistirmeHakki[0], 0);
  assert.equal(s.degistirmeHakki[1], 1);
  assert.match(hatali(u(s, { tip: 'degistir', id: pid(0), zorluk: 'kolay' })), /hakkın bitti/);
  assert.equal(s.puanlar[0], 0);
  // Rakip kendi hakkını kullanabilir
  basarili(u(s, { tip: 'degistir', id: pid(1), zorluk: 'kolay' }));
});

test('görevi değiştir: onay beklerken olmaz, geçersiz zorluk olmaz', () => {
  const d = oyun(2);
  const y = yaptim(d, 0, 'kolay');
  assert.match(hatali(u(y.d, { tip: 'degistir', id: pid(0), zorluk: 'kolay' })), /Onay beklerken/);
  assert.match(hatali(u(d, { tip: 'degistir', id: pid(0), zorluk: 'x' })), /Geçersiz/);
});

// ---------------------------------------------------------------------------
// Deste
// ---------------------------------------------------------------------------

test('deste biter, karışıp yeniden dolar; aynı anda aynı görev iki elde olmaz', () => {
  // Her zorlukta 4 görev, 3 oyuncu: deste hızla biter
  const dar = kucukListe(4);
  let d = basarili(uygula(lobi(3), { tip: 'baslat', id: pid(0) }, rng(3), dar, T0));
  for (let tur = 0; tur < 40; tur++) {
    const kim = tur % 3;
    const zorluk = ZORLUKLAR[tur % 3];
    const no0 = d.sayac + 1;
    d = basarili(uygula(d, { tip: 'yaptim', id: pid(kim), zorluk: zorluk }, rng(tur), dar, T0));
    const onayNo = d.onaylar[d.onaylar.length - 1].no;
    assert.ok(onayNo >= no0);
    d = basarili(uygula(d, { tip: 'onay', id: pid((kim + 1) % 3), no: onayNo, evet: true }, rng(tur), dar, T0));
    if (d.asama === 'bitti') {
      break;
    }
    const eldekiler = [];
    for (const el of d.eller) {
      for (const z of ZORLUKLAR) {
        if (el[z]) {
          eldekiler.push(el[z]);
        }
      }
    }
    assert.equal(new Set(eldekiler).size, eldekiler.length, 'Aynı görev iki elde');
  }
  assert.ok(d.tamamlananlar.flat().length > 12, 'Deste dolup oyun sürmeli');
});

test('tekrar oyna: önceki oyunda dağıtılmayan görevler önce gelir', () => {
  const buyuk = kucukListe(20);
  let d = basarili(uygula(lobi(2), { tip: 'baslat', id: pid(0) }, rng(1), buyuk, T0));
  const ilk = new Set();
  d.eller.forEach((el) => ZORLUKLAR.forEach((z) => ilk.add(el[z])));
  d = basarili(uygula(d, { tip: 'bitir', id: pid(0) }, rng(2), buyuk, T0));
  d = basarili(uygula(d, { tip: 'tekrarOyna', id: pid(0) }, rng(2), buyuk, T0));
  assert.equal(d.asama, 'oyun');
  d.eller.forEach((el) => ZORLUKLAR.forEach((z) => assert.ok(!ilk.has(el[z]), 'Aynı görev yine geldi: ' + el[z])));
});

// ---------------------------------------------------------------------------
// Oyun sonu
// ---------------------------------------------------------------------------

// Bir oyuncuya puan kazandırır (2 kişilik oyunda)
function puanKazan(d, i, zorluk) {
  const y = yaptim(d, i, zorluk);
  return oyVer(y.d, i === 0 ? 1 : 0, y.no, true);
}

test('hedef puan: ilk ulaşan kazanır, oyun hemen biter', () => {
  let d = oyun(2, { bitis: 'puan', hedef: 10 });
  // 3 + 3 + 3 = 9, sonra 1 = 10
  for (let i = 0; i < 3; i++) {
    d = puanKazan(d, 0, 'zor');
    assert.equal(d.asama, 'oyun');
  }
  assert.equal(d.puanlar[0], 9);
  d = puanKazan(d, 1, 'zor'); // rakip de puan alsın
  d = puanKazan(d, 0, 'kolay');
  assert.equal(d.asama, 'bitti');
  assert.equal(d.puanlar[0], 10);
  assert.deepEqual(d.sonuc, { neden: 'hedef', kazananlar: [0] });
  assert.equal(d.onaylar.length, 0);
  // Biten oyunda hareket olmaz
  assert.match(hatali(u(d, { tip: 'yaptim', id: pid(1), zorluk: 'kolay' })), /Şu an/);
});

test('hedef puan: yakalamayla da ulaşılabilir', () => {
  let d = oyun(2, { bitis: 'puan', hedef: 10 });
  d.puanlar[0] = 9; // durumu hazırla
  d = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'şarkı' }));
  d = basarili(u(d, { tip: 'yakalamaCevap', id: pid(1), no: d.yakalamalar[0].no, evet: true, zorluk: 'kolay' }));
  assert.equal(d.asama, 'bitti');
  assert.deepEqual(d.sonuc.kazananlar, [0]);
});

test('süre modunda hedef puan bitirmez', () => {
  let d = oyun(2, { bitis: 'sure', sure: 15, hedef: 10 });
  d.puanlar[0] = 12;
  d = puanKazan(d, 0, 'kolay');
  assert.equal(d.asama, 'oyun');
});

test('süre: kalan süre hesabı ve yazısı', () => {
  const d = oyun(2, { bitis: 'sure', sure: 15 });
  assert.equal(kalanMs(d, T0), 15 * 60000);
  assert.equal(kalanMs(d, T0 + 60000), 14 * 60000);
  assert.equal(sureBittiMi(d, T0 + 15 * 60000 - 1), false);
  assert.equal(sureBittiMi(d, T0 + 15 * 60000), true);
  assert.equal(sureYazisi(15 * 60000), '15:00');
  assert.equal(sureYazisi(61000), '01:01');
  assert.equal(sureYazisi(-5000), '00:00');
  // Hedef modunda süre yok
  assert.equal(kalanMs(oyun(2), T0), null);
});

test('süre bitişi: sureBitir en çok puanlıyı kazanan yapar; erken gelirse hata', () => {
  let d = oyun(2, { bitis: 'sure', sure: 15 });
  d = puanKazan(d, 1, 'orta');
  assert.match(hatali(u(d, { tip: 'sureBitir', id: pid(0) }, 1, T0 + 14 * 60000)), /bitmedi/);
  const bitti = basarili(u(d, { tip: 'sureBitir', id: pid(0) }, 1, T0 + 15 * 60000));
  assert.equal(bitti.asama, 'bitti');
  assert.deepEqual(bitti.sonuc, { neden: 'sure', kazananlar: [1] });
  assert.equal(bitti.bitisZamani, T0 + 15 * 60000);
  // İkinci kez gelen zararsız
  basarili(u(bitti, { tip: 'sureBitir', id: pid(1) }, 1, T0 + 16 * 60000));
});

test('süre bitince ilk hamle oyunu bitirir (hamle uygulanmaz)', () => {
  const d = oyun(2, { bitis: 'sure', sure: 15 });
  const gec = T0 + 20 * 60000;
  const bitti = basarili(u(d, { tip: 'yaptim', id: pid(0), zorluk: 'kolay' }, 1, gec));
  assert.equal(bitti.asama, 'bitti');
  assert.equal(bitti.onaylar.length, 0);
  assert.equal(bitti.sonuc.neden, 'sure');
});

test('süre bitişinde beraberlik: eşit puanlıların hepsi kazanan', () => {
  let d = oyun(3, { bitis: 'sure', sure: 15 });
  const bitti = basarili(u(d, { tip: 'sureBitir', id: pid(0) }, 1, T0 + 15 * 60000));
  assert.deepEqual(bitti.sonuc.kazananlar, [0, 1, 2]);
});

test('ev sahibi her an oyunu bitirebilir; başkası bitiremez', () => {
  const d = oyun(3);
  assert.match(hatali(u(d, { tip: 'bitir', id: pid(1) })), /ev sahibi/);
  const bitti = basarili(u(d, { tip: 'bitir', id: pid(0) }));
  assert.equal(bitti.sonuc.neden, 'sahip');
  assert.match(hatali(u(bitti, { tip: 'bitir', id: pid(0) })), /sürmüyor/);
  assert.match(hatali(u(lobi(2), { tip: 'bitir', id: pid(0) })), /sürmüyor/);
});

test('tekrar oyna ve lobiye dön: ev sahibi, ayarlar korunur', () => {
  let d = oyun(2, { bitis: 'sure', sure: 60 });
  d = puanKazan(d, 0, 'kolay');
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(0) })), /bitmedi/);
  d = basarili(u(d, { tip: 'bitir', id: pid(0) }));
  assert.match(hatali(u(d, { tip: 'tekrarOyna', id: pid(1) })), /ev sahibi/);
  const yeni = basarili(u(d, { tip: 'tekrarOyna', id: pid(0) }, 4, T0 + 5000));
  assert.equal(yeni.asama, 'oyun');
  assert.deepEqual(yeni.puanlar, [0, 0]);
  assert.equal(yeni.baslangic, T0 + 5000);
  assert.equal(yeni.ayar.sure, 60);
  assert.deepEqual(yeni.tamamlananlar, [[], []]);

  assert.match(hatali(u(yeni, { tip: 'yeniOyun', id: pid(1) })), /ev sahibi/);
  const lobiye = basarili(u(yeni, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.equal(lobiye.ayar.sure, 60);
  assert.deepEqual(lobiye.eller, []);
  assert.match(hatali(u(lobiye, { tip: 'yeniOyun', id: pid(0) })), /lobidesin/);
});

test('oyun sırasında katılma ve çıkma olmaz', () => {
  const d = oyun(2);
  assert.match(hatali(u(d, { tip: 'katil', id: 'yeni', ad: 'Yeni' })), /başladı/);
  assert.match(hatali(u(d, { tip: 'cikar', id: pid(1) })), /sürerken/);
});

// ---------------------------------------------------------------------------
// Gizlilik yardımcıları
// ---------------------------------------------------------------------------

function elMetinleri(d, i) {
  return ZORLUKLAR.map((z) => d.eller[i][z]);
}

test('gizlilik: ekran verisi başkasının görevlerini içermez', () => {
  for (const n of [2, 3, 4]) {
    const d = oyun(n);
    for (let ben = 0; ben < n; ben++) {
      const veri = ekranVerisi(d, ben);
      const yazi = JSON.stringify(veri);
      // Kendi görevlerim var
      assert.deepEqual(
        veri.gorevler.map((g) => g.metin),
        elMetinleri(d, ben)
      );
      // Başkalarınınkiler yok
      for (let digeri = 0; digeri < n; digeri++) {
        if (digeri === ben) {
          continue;
        }
        for (const metin of elMetinleri(d, digeri)) {
          assert.ok(!yazi.includes(metin), 'Sızdı: ' + metin);
        }
      }
      assert.equal(veri.oyuncular.length, n);
      assert.equal(veri.oyuncular[ben].ben, true);
    }
  }
});

test('gizlilik: onay sorusunda yalnız "Yaptım" denen görev görünür', () => {
  const d = oyun(3);
  const y = yaptim(d, 0, 'orta');
  const veri = ekranVerisi(y.d, 1);
  assert.equal(veri.sorular.onaylar.length, 1);
  assert.equal(veri.sorular.onaylar[0].metin, d.eller[0].orta);
  const yazi = JSON.stringify(veri);
  assert.ok(!yazi.includes(d.eller[0].kolay));
  assert.ok(!yazi.includes(d.eller[0].zor));
  // Yapanın kendi ekranında soru yok
  assert.equal(ekranVerisi(y.d, 0).sorular.onaylar.length, 0);
  assert.equal(ekranVerisi(y.d, 0).gorevler.find((g) => g.zorluk === 'orta').onayBekliyor, true);
});

test('gizlilik: yakalamada yakalayan hedefin görevlerini görmez, hedef kendi görevlerini görür', () => {
  const d = oyun(3);
  const s = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'Bir şey söylettiriyor' }));
  const yakalayan = JSON.stringify(ekranVerisi(s, 0));
  for (const metin of elMetinleri(d, 1)) {
    assert.ok(!yakalayan.includes(metin), 'Yakalayana sızdı');
  }
  assert.equal(ekranVerisi(s, 0).yakalamaBekliyor, true);
  const ucuncu = JSON.stringify(ekranVerisi(s, 2));
  assert.ok(!ucuncu.includes('Bir şey söylettiriyor'), 'Üçüncü kişiye tahmin gitmemeli');
  const hedef = ekranVerisi(s, 1);
  assert.equal(hedef.sorular.yakalamalar.length, 1);
  assert.equal(hedef.sorular.yakalamalar[0].tahmin, 'Bir şey söylettiriyor');
  assert.deepEqual(
    hedef.sorular.yakalamalar[0].gorevler.map((g) => g.metin),
    elMetinleri(d, 1)
  );
});

test('gizlilik: tamamlananlar oyun bitmeden açılmaz, bitince herkese açılır', () => {
  let d = oyun(2);
  const metin = d.eller[0].kolay;
  d = puanKazan(d, 0, 'kolay');
  assert.ok(!JSON.stringify(ekranVerisi(d, 1)).includes(metin), 'Tamamlanan görev rakibe gösterilmedi');
  assert.equal(ekranVerisi(d, 1).oyuncular[0].tamamlanan, 1);
  assert.equal(sonucVerisi(d), null);
  d = basarili(u(d, { tip: 'bitir', id: pid(0) }));
  const sonuc = sonucVerisi(d);
  assert.equal(sonuc.neden, 'sahip');
  assert.deepEqual(sonuc.kazananlar, [0]);
  assert.equal(sonuc.sira[0].ad, 'Ali');
  assert.deepEqual(sonuc.sira[0].tamamlananlar, [{ zorluk: 'kolay', metin: metin }]);
});

test('bekleyen soru: yalnız cevap verecek kişide true', () => {
  const d = oyun(3);
  assert.equal(bekleyenSoruVarMi(d, 0), false);
  const y = yaptim(d, 0, 'kolay');
  assert.equal(bekleyenSoruVarMi(y.d, 0), false);
  assert.equal(bekleyenSoruVarMi(y.d, 1), true);
  assert.equal(bekleyenSoruVarMi(y.d, 2), true);
  const bir = oyVer(y.d, 1, y.no, false);
  assert.equal(bekleyenSoruVarMi(bir, 1), false, 'Oy veren artık sorulmaz');
  assert.equal(bekleyenSoruVarMi(bir, 2), true);
  const s = basarili(u(d, { tip: 'yakala', id: pid(0), hedef: pid(2), tahmin: 'şarkı' }));
  assert.equal(bekleyenSoruVarMi(s, 2), true);
  assert.equal(bekleyenSoruVarMi(s, 1), false);
  assert.equal(benimSorularim(s, 2).yakalamalar.length, 1);
  assert.equal(bekleyenSoruVarMi(lobi(2), 0), false);
  assert.equal(bekleyenSoruVarMi(d, -1), false);
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

test('yönlendirici: oyun listesi Gizli Görev içerir, oda kurulabilir', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element', 'kule']
  );
  assert.equal(OYUNLAR.find((o) => o.id === 'gorev').ad, 'Gizli Görev');
  const d = yonlendirYeniOda(pid(0), 'Ali', 'gorev');
  assert.equal(d.oyun, 'gorev');
  assert.equal(oyunId(d), 'gorev');
});

test('yönlendirici: hareketler Gizli Görev motoruna gider (liste 7., zaman 8. parametre)', () => {
  let d = yonlendirLobi('gorev', 2);
  d = basarili(yonlendir(d, { tip: 'ayarla', id: pid(0), ayar: { bitis: 'sure', sure: 15 } }));
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }, rng(1), undefined, undefined, undefined, LISTE, T0));
  assert.equal(d.asama, 'oyun');
  assert.equal(d.baslangic, T0);
  assert.ok(d.eller[0].kolay.startsWith('kolay '));
  d = basarili(yonlendir(d, { tip: 'yaptim', id: pid(0), zorluk: 'kolay' }, rng(1), undefined, undefined, undefined, LISTE, T0));
  d = basarili(yonlendir(d, { tip: 'onay', id: pid(1), no: d.onaylar[0].no, evet: true }, rng(1), undefined, undefined, undefined, LISTE, T0));
  assert.equal(d.puanlar[0], 1);
  // Süre dolunca yönlendirici üzerinden de biter
  const bitti = basarili(
    yonlendir(d, { tip: 'sureBitir', id: pid(1) }, rng(1), undefined, undefined, undefined, LISTE, T0 + 15 * 60000)
  );
  assert.equal(bitti.asama, 'bitti');
  // Başka oyunların hareketleri bu odada reddedilir
  assert.match(hatali(yonlendir(d, { tip: 'oyna', id: pid(0), kart: 1 })), /Bilinmeyen/);
});

test('yönlendirici: Gizli Görev hareketleri öteki oyun odalarında reddedilir', () => {
  for (const oyunAdi of ['uno', 'tanis', 'kelime', 'aynikafa']) {
    const d = yonlendirLobi(oyunAdi, 2);
    assert.equal(yonlendir(d, { tip: 'yaptim', id: pid(0), zorluk: 'kolay' }).ok, false);
    assert.equal(yonlendir(d, { tip: 'yakala', id: pid(0), hedef: pid(1), tahmin: 'x' }).ok, false);
  }
});

test('oyun seçimi: Gizli Görev seçilince oyuncular korunur (2, 3 ve 4 kişi); ayar ve aşama kuralları', () => {
  for (const n of [2, 3, 4]) {
    const uno = yonlendirLobi('uno', n);
    const kimlik = kimlikler(uno);
    const g = basarili(yonlendir(uno, { tip: 'oyunSec', id: pid(0), oyun: 'gorev' }));
    assert.equal(g.oyun, 'gorev');
    assert.equal(g.asama, 'lobi');
    assert.deepEqual(kimlikler(g), kimlik);
    assert.equal(g.sahip, pid(0));
  }
  const g = yonlendirLobi('gorev', 3);
  const basladi = basarili(yonlendir(g, { tip: 'baslat', id: pid(0) }, rng(2)));
  assert.equal(basladi.eller.length, 3);
  // Aynı oyunu seçmek ayarı bozmaz
  const ayarli = basarili(yonlendir(g, { tip: 'ayarla', id: pid(0), ayar: { hedef: 20 } }));
  assert.deepEqual(basarili(yonlendir(ayarli, { tip: 'oyunSec', id: pid(0), oyun: 'gorev' })), ayarli);
  assert.match(hatali(yonlendir(g, { tip: 'oyunSec', id: pid(1), oyun: 'uno' })), /ev sahibi/);
  assert.match(hatali(yonlendir(basladi, { tip: 'oyunSec', id: pid(0), oyun: 'uno' })), /lobide/);
  // Gizli Görev lobisinden öteki oyunlara geçiş kimseyi düşürmez
  const kimlik = kimlikler(g);
  for (const oyunAdi of ['uno', 'tanis', 'kelime', 'aynikafa']) {
    const yeni = basarili(yonlendir(g, { tip: 'oyunSec', id: pid(0), oyun: oyunAdi }));
    assert.equal(yeni.oyun, oyunAdi);
    assert.deepEqual(kimlikler(yeni), kimlik);
  }
  // Gizli Yol 2 kişilik: 3 kişiyle seçilemez
  assert.equal(yonlendir(g, { tip: 'oyunSec', id: pid(0), oyun: 'gizliyol' }).ok, false);
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

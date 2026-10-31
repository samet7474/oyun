// Ortak özellik testleri: oyun bilgileri, "Kim önde" genel skor ve index.html dosya listesi.
// Çalıştır: node test/genel-test.js
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  OYUNLAR,
  genelGuncelle,
  genelVeri,
  kazananKimlikleri,
  kisiYazisi,
  sigmamaNedeni,
  uygula as yonlendir,
  yeniOda as yonlendirYeniOda,
} from '../oyunlar.js';

const testler = [];

function test(ad, fonksiyon) {
  testler.push({ ad: ad, fonksiyon: fonksiyon });
}

function basarili(sonuc) {
  assert.equal(sonuc.ok, true, 'Başarılı olmalıydı ama hata geldi: ' + sonuc.hata);
  return sonuc.durum;
}

function pid(i) {
  return 'p' + i;
}

// n kişilik, verilen oyunlu bir lobi (ev sahibi p0)
function lobi(oyun, n) {
  let d = yonlendirYeniOda(pid(0), 'Ayşe', 'uno');
  for (let i = 1; i < n; i++) {
    d = basarili(yonlendir(d, { tip: 'katil', id: pid(i), ad: 'Kişi' + i }));
  }
  if (oyun !== 'uno') {
    d = basarili(yonlendir(d, { tip: 'oyunSec', id: pid(0), oyun: oyun }));
  }
  return d;
}

// Gizli Görev'i başlatıp puanları verilen şekilde bitirir (ev sahibi "Oyunu bitir" der)
function gorevBitir(d, puanlar) {
  d = basarili(yonlendir(d, { tip: 'baslat', id: pid(0) }));
  const hazir = structuredClone(d);
  hazir.puanlar = puanlar;
  return basarili(yonlendir(hazir, { tip: 'bitir', id: pid(0) }));
}

// ---------------------------------------------------------------------------
// Oyun bilgileri
// ---------------------------------------------------------------------------

test('oyun listesi: 8 oyun, hepsinde kişi sayısı, açıklama, simge ve renk var', () => {
  assert.deepEqual(
    OYUNLAR.map((o) => o.id),
    ['uno', 'tanis', 'kelime', 'aynikafa', 'gizliyol', 'gorev', 'element', 'kule']
  );
  for (const oyun of OYUNLAR) {
    assert.ok(oyun.ad.length > 0, oyun.id);
    assert.ok(oyun.enAz >= 2 && oyun.enCok >= oyun.enAz && oyun.enCok <= 4, oyun.id);
    assert.ok(oyun.aciklama.length > 5, oyun.id);
    assert.ok(oyun.simge.length > 0, oyun.id);
    assert.match(oyun.renk, /^#[0-9a-f]{6}$/, oyun.id);
    assert.match(oyun.temaRengi, /^#[0-9a-f]{6}$/, oyun.id);
  }
});

test('kişi yazısı ve sığmama nedeni', () => {
  const bul = (id) => OYUNLAR.find((o) => o.id === id);
  assert.equal(kisiYazisi(bul('gizliyol')), '2 kişi');
  assert.equal(kisiYazisi(bul('uno')), '2-4 kişi');
  assert.equal(sigmamaNedeni(bul('gizliyol'), 2), null);
  assert.equal(sigmamaNedeni(bul('gizliyol'), 3), '2 kişiliktir');
  assert.equal(sigmamaNedeni(bul('element'), 4), '2 kişiliktir');
  assert.equal(sigmamaNedeni(bul('tanis'), 3), '2 kişiliktir');
  assert.equal(sigmamaNedeni(bul('uno'), 4), null);
  assert.equal(sigmamaNedeni(bul('uno'), 1), null); // az kişi sorun değil, beklenir
});

test('index.html: kökteki bütün .js dosyaları sürüm listesinde', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const dosyalar = readdirSync(new URL('../', import.meta.url)).filter((ad) => ad.endsWith('.js'));
  assert.ok(dosyalar.length > 20);
  for (const ad of dosyalar) {
    assert.ok(html.includes("'" + ad + "'"), ad + ' index.html sürüm listesinde yok');
  }
  assert.match(html, /const SURUM = '[^']+'/);
});

// ---------------------------------------------------------------------------
// Genel skor
// ---------------------------------------------------------------------------

test('genel skor: eski odada alan yok, boş sayılır', () => {
  const d = yonlendirYeniOda(pid(0), 'Ayşe');
  assert.equal(d.genel, undefined);
  assert.deepEqual(genelVeri(d), { kazanim: {}, biten: 0, berabere: 0, uyumRekoru: null });
});

test('genel skor: biten oyunun tek kazananı bir kez sayılır', () => {
  const bitmis = gorevBitir(lobi('gorev', 2), [5, 2]);
  const g = genelVeri(bitmis);
  assert.equal(g.biten, 1);
  assert.equal(g.kazanim[pid(0)].sayi, 1);
  assert.equal(g.kazanim[pid(0)].ad, 'Ayşe');
  assert.equal(g.kazanim[pid(1)], undefined);
  // aynı bitişi tekrar işlemek (eski zaten bitmiş) hiçbir şeyi değiştirmez
  const kopya = structuredClone(bitmis);
  genelGuncelle(bitmis, kopya);
  assert.deepEqual(genelVeri(kopya), g);
});

test('genel skor: Tekrar oyna, Lobiye dön ve oyun değişimi skoru kaybettirmez', () => {
  const d = gorevBitir(lobi('gorev', 2), [4, 1]);
  assert.equal(genelVeri(d).kazanim[pid(0)].sayi, 1);

  const lobiye = basarili(yonlendir(d, { tip: 'yeniOyun', id: pid(0) }));
  assert.equal(lobiye.asama, 'lobi');
  assert.equal(genelVeri(lobiye).kazanim[pid(0)].sayi, 1);

  const kule = basarili(yonlendir(lobiye, { tip: 'oyunSec', id: pid(0), oyun: 'kule' }));
  assert.equal(kule.oyun, 'kule');
  assert.equal(genelVeri(kule).kazanim[pid(0)].sayi, 1);

  const uno = basarili(yonlendir(kule, { tip: 'oyunSec', id: pid(0), oyun: 'uno' }));
  assert.equal(genelVeri(uno).biten, 1);

  // ikinci oyunu rakip kazanır: iki ayrı kişi tabloda
  const gorev2 = basarili(yonlendir(uno, { tip: 'oyunSec', id: pid(0), oyun: 'gorev' }));
  const ikinci = gorevBitir(gorev2, [0, 3]);
  const g = genelVeri(ikinci);
  assert.equal(g.biten, 2);
  assert.equal(g.kazanim[pid(0)].sayi, 1);
  assert.equal(g.kazanim[pid(1)].sayi, 1);
});

test('genel skor: beraberlik kimseye yazılmaz', () => {
  const d = gorevBitir(lobi('gorev', 2), [3, 3]);
  const g = genelVeri(d);
  assert.equal(g.biten, 1);
  assert.equal(g.berabere, 1);
  assert.deepEqual(g.kazanim, {});
});

test('genel skor: UNO kazananı (sentetik bitiş) ve kazanan kimlikleri', () => {
  const eski = lobi('uno', 3);
  eski.asama = 'oyun';
  const yeni = structuredClone(eski);
  yeni.asama = 'bitti';
  yeni.oyunKazanan = 2;
  assert.deepEqual(kazananKimlikleri(yeni), [pid(2)]);
  genelGuncelle(eski, yeni);
  assert.equal(genelVeri(yeni).kazanim[pid(2)].sayi, 1);
  assert.equal(genelVeri(yeni).biten, 1);
});

test('genel skor: kazanılan oyun sayısı birikir', () => {
  let toplam = lobi('uno', 2);
  for (let i = 0; i < 3; i++) {
    const eski = structuredClone(toplam);
    eski.asama = 'oyun';
    const yeni = structuredClone(eski);
    yeni.asama = 'bitti';
    yeni.oyunKazanan = 1;
    genelGuncelle(eski, yeni);
    toplam = yeni;
    toplam.asama = 'lobi';
  }
  assert.equal(genelVeri(toplam).kazanim[pid(1)].sayi, 3);
  assert.equal(genelVeri(toplam).biten, 3);
});

test('genel skor: Risk Kulesi\'nde rakipler çıkınca kalan kişiye galibiyet yazılmaz', () => {
  const eski = lobi('kule', 2);
  eski.asama = 'oyun';
  const yeni = structuredClone(eski);
  yeni.asama = 'bitti';
  yeni.sonuc = { kazanan: 0, neden: 'rakipsiz' };
  genelGuncelle(eski, yeni);
  assert.deepEqual(genelVeri(yeni).kazanim, {});
  assert.equal(genelVeri(yeni).berabere, 0);

  const gercek = structuredClone(eski);
  gercek.asama = 'bitti';
  gercek.sonuc = { kazanan: 1, neden: 'hedef' };
  genelGuncelle(eski, gercek);
  assert.equal(genelVeri(gercek).kazanim[pid(1)].sayi, 1);
});

test('genel skor: birlikte oynanan oyunda kazanan sayılmaz, uyum rekoru tutulur', () => {
  const eski = lobi('tanis', 2);
  eski.asama = 'acik';
  eski.sorular = [{}, {}];
  eski.oyuncular[0].puan = 1;
  eski.oyuncular[1].puan = 2;
  const yeni = structuredClone(eski);
  yeni.asama = 'bitti';
  genelGuncelle(eski, yeni);
  const g = genelVeri(yeni);
  assert.deepEqual(g.kazanim, {});
  assert.equal(g.biten, 1);
  assert.equal(g.uyumRekoru.yuzde, 75);
  assert.equal(g.uyumRekoru.oyun, 'tanis');

  // daha düşük uyum rekoru bozmaz
  const eski2 = structuredClone(yeni);
  eski2.asama = 'acik';
  const yeni2 = structuredClone(eski2);
  yeni2.asama = 'bitti';
  yeni2.oyuncular[0].puan = 0;
  yeni2.oyuncular[1].puan = 0;
  genelGuncelle(eski2, yeni2);
  assert.equal(genelVeri(yeni2).uyumRekoru.yuzde, 75);
  assert.equal(genelVeri(yeni2).biten, 2);
});

test('genel skor: oyun bitmeden geçişler ve farklı oyuna geçiş sayılmaz', () => {
  const eski = lobi('uno', 2);
  const yeni = structuredClone(eski);
  yeni.asama = 'oyun';
  genelGuncelle(eski, yeni);
  assert.equal(genelVeri(yeni).biten, 0);

  const baska = lobi('kule', 2);
  baska.asama = 'bitti';
  genelGuncelle(eski, baska);
  assert.equal(genelVeri(baska).biten, 0);
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

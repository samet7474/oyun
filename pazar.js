// pazar.js - Saf "Pazar" motoru (2-4 kişi, sırayla).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'al', id: oyuncuId, yer: 2 }, rastgele);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik (rastgele) dışarıdan verilir; yalnız deste karıştırılırken kullanılır, testler sabitler.
//
// Oyun:
//   Ortada 5 açık kartlık bir tezgâh var. Sırası gelen oyuncu tek bir hamle yapar:
//     Al  : tezgâhtan bir kart alır (elinde en fazla 6 kart olur). Tezgâh desteden tamamlanır.
//     Sat : elindeki aynı meyveden en az 2 kartı satar. Kazanç = adet x o meyvenin şu anki fiyatı.
//           Sonra o meyvenin fiyatı satılan adet kadar düşer (en az 1).
//           Diğer bütün meyvelerin fiyatı 1 artar (başlangıç fiyatını geçmez): pazar toparlanır.
//     Pas : yalnız hiçbir hamle yapılamıyorsa (tezgâh boş ve satacak çift yok).
//   Deste bitince son tur başlar: tur tamamlanır (herkes eşit sayıda hamle yapar) ve oyun biter.
//   Elde kalan kartlar çürür, puan getirmez.
//   En çok puanı olan kazanır. Eşitlikte daha çok kart satan kazanır; o da eşitse berabere.
//
// Aşamalar: lobi -> oyun -> bitti
//
// Durum alanları (oyuncuya ait her dizi oyuncular dizisiyle aynı sıradadır):
//   deste            : kapalı deste (meyve kimlikleri); sondan çekilir
//   tezgah           : açık kartlar (en fazla 5 meyve kimliği)
//   eller[i]         : { elma: 2, muz: 0, ... } i. oyuncunun elindeki kart sayıları (herkese açık)
//   fiyatlar         : { elma: 3, ... } şu anki fiyatlar
//   puanlar[i]       : i. oyuncunun puanı
//   satilan[i]       : i. oyuncunun sattığı kart sayısı (beraberlik bozmak için)
//   enIyiSatis       : { puan, ad, meyve, adet } oyundaki en kârlı tek satış
//   sira             : sırası gelen oyuncunun indeksi
//   baslayan         : bu oyunu başlatan oyuncunun indeksi (son tur onun önünde biter)
//   sonTur           : deste bitti mi (son tur sürüyor mu)
//   hamleSayisi      : oyunda yapılan hamle sayısı
//   sonOlay          : en son olay { no, tip, kim, ... }
//   haberler         : herkese açık son olaylar
//   sonuc            : { kazananlar: [indeks], neden }
//   oyunNo           : kaçıncı oyun (Tekrar oyna'da artar)

import { oyuncuIndeks, temizAd, benzersizAd, karistir } from './uno.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const EN_AZ_OYUNCU = 2;
export const MAKS_OYUNCU = 4;

export const TEZGAH_BOYU = 5;
export const EL_SINIRI = 6;
export const EN_AZ_SATIS = 2;
export const BASLANGIC_ELI = 2;
export const TABAN_FIYAT = 1;

// Meyveler: az bulunan meyve pahalıdır. baslangic aynı zamanda fiyatın tavanıdır.
export const MEYVELER = [
  { id: 'elma', ad: 'Elma', simge: '🍎', baslangic: 3 },
  { id: 'muz', ad: 'Muz', simge: '🍌', baslangic: 4 },
  { id: 'uzum', ad: 'Üzüm', simge: '🍇', baslangic: 5 },
  { id: 'cilek', ad: 'Çilek', simge: '🍓', baslangic: 6 },
  { id: 'karpuz', ad: 'Karpuz', simge: '🍉', baslangic: 7 },
];

// Oyun uzunluğu: her meyveden destede kaç kart var (MEYVELER sırasıyla)
export const UZUNLUKLAR = {
  kisa: [7, 7, 6, 5, 5], // 30 kart
  normal: [10, 9, 8, 7, 6], // 40 kart
};
export const VARSAYILAN_UZUNLUK = 'normal';

const MAKS_HABER = 5;

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

export function meyveBilgi(id) {
  return MEYVELER.find((m) => m.id === id);
}

export function meyveAdi(id) {
  const m = meyveBilgi(id);
  return m ? m.ad : id;
}

// Boş el: her meyveden 0
export function bosEl() {
  const el = {};
  for (const m of MEYVELER) {
    el[m.id] = 0;
  }
  return el;
}

// Başlangıç fiyatları
export function baslangicFiyatlari() {
  const f = {};
  for (const m of MEYVELER) {
    f[m.id] = m.baslangic;
  }
  return f;
}

// Elde kaç kart var
export function elBoyu(el) {
  let toplam = 0;
  for (const m of MEYVELER) {
    toplam += el[m.id] || 0;
  }
  return toplam;
}

// Bu uzunluktaki tam deste (karıştırılmamış)
export function tamDeste(uzunluk = VARSAYILAN_UZUNLUK) {
  const adetler = UZUNLUKLAR[uzunluk] || UZUNLUKLAR[VARSAYILAN_UZUNLUK];
  const deste = [];
  MEYVELER.forEach((m, i) => {
    for (let k = 0; k < adetler[i]; k++) {
      deste.push(m.id);
    }
  });
  return deste;
}

// Bu meyveden bu kadar satılırsa kaç puan gelir (satılamıyorsa 0)
export function satisDegeri(d, meyve, adet) {
  if (!meyveBilgi(meyve) || !Number.isInteger(adet) || adet < EN_AZ_SATIS) {
    return 0;
  }
  return adet * d.fiyatlar[meyve];
}

// Bu satıştan sonra o meyvenin fiyatı ne olur
export function satisSonrasiFiyat(d, meyve, adet) {
  return Math.max(TABAN_FIYAT, d.fiyatlar[meyve] - adet);
}

// Oyuncu tezgâhtan kart alabilir mi?
export function alabilirMi(d, idx) {
  return d.tezgah.length > 0 && elBoyu(d.eller[idx]) < EL_SINIRI;
}

// Oyuncunun satabileceği meyveler (en az 2 kartı olanlar)
export function satilabilirler(d, idx) {
  return MEYVELER.map((m) => m.id).filter((id) => d.eller[idx][id] >= EN_AZ_SATIS);
}

// Hiçbir hamle yapamıyor mu? (o zaman yalnız Pas)
export function pasMi(d, idx) {
  return !alabilirMi(d, idx) && satilabilirler(d, idx).length === 0;
}

// Son tur sürüyorsa, oyun bitmeden önce kaç hamle daha yapılacak (bu hamle dahil). Yoksa null.
export function kalanHamle(d) {
  if (d.asama !== 'oyun' || !d.sonTur) {
    return null;
  }
  const n = d.oyuncular.length;
  return ((d.baslayan - d.sira + n - 1) % n) + 1;
}

// Elde kalan (çürüyecek) kart sayısı
export function curuyen(d, idx) {
  return elBoyu(d.eller[idx]);
}

// Biten oyunun sıralaması: puan, sonra satılan kart (ikisi de çoktan aza)
export function siralama(d) {
  return d.oyuncular
    .map((o, i) => ({ idx: i, ad: o.ad, puan: d.puanlar[i], satilan: d.satilan[i], curuyen: curuyen(d, i) }))
    .sort((a, b) => b.puan - a.puan || b.satilan - a.satilan || a.idx - b.idx);
}

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad };
}

// Oyun alanlarının boş hâli (lobide ve "Lobiye dön"de kullanılır)
function bosOyunAlanlari(d) {
  d.deste = [];
  d.tezgah = [];
  d.eller = [];
  d.fiyatlar = baslangicFiyatlari();
  d.puanlar = [];
  d.satilan = [];
  d.enIyiSatis = null;
  d.sira = 0;
  d.sonTur = false;
  d.hamleSayisi = 0;
  d.sonOlay = null;
  d.haberler = [];
  d.sayac = 0;
  d.sonuc = null;
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  const d = {
    oyun: 'pazar',
    asama: 'lobi', // lobi | oyun | bitti
    sahip: sahipId,
    ayar: { uzunluk: VARSAYILAN_UZUNLUK },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    baslayan: 0,
    oyunNo: 0,
  };
  bosOyunAlanlari(d);
  return d;
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// İç yardımcılar
// ---------------------------------------------------------------------------

function olayYaz(d, olay, haber) {
  d.sayac += 1;
  olay.no = d.sayac;
  d.sonOlay = olay;
  if (haber) {
    d.haberler.push({ no: d.sayac, metin: haber });
    if (d.haberler.length > MAKS_HABER) {
      d.haberler = d.haberler.slice(d.haberler.length - MAKS_HABER);
    }
  }
}

// Tezgâhı desteden 5'e tamamlar. Deste biterse son tur başlar.
function tezgahiDoldur(d) {
  while (d.tezgah.length < TEZGAH_BOYU && d.deste.length > 0) {
    d.tezgah.push(d.deste.pop());
  }
  if (d.deste.length === 0 && !d.sonTur && d.asama === 'oyun') {
    d.sonTur = true;
    olayYaz(d, { tip: 'sonTur' }, 'Deste bitti. Bu tur son tur.');
  }
}

function oyunuBitir(d) {
  const sira = siralama(d);
  const ilk = sira[0];
  const kazananlar = sira.filter((s) => s.puan === ilk.puan && s.satilan === ilk.satilan).map((s) => s.idx);
  let neden = 'puan';
  if (kazananlar.length > 1) {
    neden = 'berabere';
  } else if (sira.length > 1 && sira[1].puan === ilk.puan) {
    neden = 'satilan';
  }
  d.asama = 'bitti';
  d.sonuc = { kazananlar: kazananlar, neden: neden };
}

// Hamle bitti: sıra geçer. Son turda sıra başlayana dönecekse oyun biter.
function siraGecir(d) {
  d.hamleSayisi += 1;
  const sonraki = (d.sira + 1) % d.oyuncular.length;
  if (d.sonTur && sonraki === d.baslayan) {
    oyunuBitir(d);
    return;
  }
  d.sira = sonraki;
}

// Oyunu sıfırdan kurar. Hata mesajı ya da null.
function oyunuKur(d, baslayan, rastgele) {
  const n = d.oyuncular.length;
  if (n < EN_AZ_OYUNCU) {
    return 'En az ' + EN_AZ_OYUNCU + ' kişi gerekli.';
  }
  if (n > MAKS_OYUNCU) {
    return 'En fazla ' + MAKS_OYUNCU + ' kişi oynar.';
  }
  bosOyunAlanlari(d);
  d.deste = karistir(tamDeste(d.ayar.uzunluk), rastgele);
  for (let i = 0; i < n; i++) {
    const el = bosEl();
    for (let k = 0; k < BASLANGIC_ELI; k++) {
      el[d.deste.pop()] += 1;
    }
    d.eller.push(el);
    d.puanlar.push(0);
    d.satilan.push(0);
  }
  d.baslayan = baslayan % n;
  d.sira = d.baslayan;
  d.oyunNo += 1;
  d.asama = 'oyun';
  tezgahiDoldur(d);
  return null;
}

// ---------------------------------------------------------------------------
// Hareketler. Her biri klonlanmış durumu değiştirir, hata mesajı ya da null döner.
// ---------------------------------------------------------------------------

function katilIsle(d, e) {
  if (oyuncuIndeks(d, e.id) >= 0) {
    return null; // zaten odada
  }
  if (d.asama !== 'lobi') {
    return 'Oyun başladı, şu an katılamazsın.';
  }
  if (d.oyuncular.length >= MAKS_OYUNCU) {
    return 'Oda dolu (en fazla ' + MAKS_OYUNCU + ' kişi).';
  }
  const ad = benzersizAd(d, temizAd(e.ad));
  d.oyuncular.push(yeniOyuncu(e.id, ad));
  return null;
}

function cikarIsle(d, e) {
  if (d.asama !== 'lobi') {
    return 'Oyun sürerken çıkılamaz.';
  }
  const hedefId = e.hedef || e.id;
  if (hedefId !== e.id && e.id !== d.sahip) {
    return 'Sadece ev sahibi çıkarabilir.';
  }
  const idx = oyuncuIndeks(d, hedefId);
  if (idx < 0) {
    return null;
  }
  d.oyuncular.splice(idx, 1);
  if (d.sahip === hedefId && d.oyuncular.length > 0) {
    d.sahip = d.oyuncular[0].id;
  }
  return null;
}

function ayarlaIsle(d, e) {
  if (d.asama !== 'lobi') {
    return 'Ayar sadece oyun başlamadan değişir.';
  }
  if (e.id !== d.sahip) {
    return 'Ayarı sadece ev sahibi değiştirir.';
  }
  const ayar = e.ayar || {};
  if (ayar.uzunluk !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(UZUNLUKLAR, ayar.uzunluk)) {
      return 'Geçersiz oyun uzunluğu.';
    }
    d.ayar.uzunluk = ayar.uzunluk;
  }
  return null;
}

function baslatIsle(d, e, rastgele) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, 0, rastgele);
}

function tekrarOynaIsle(d, e, rastgele) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  // Her oyunda başlayan kişi bir kayar
  return oyunuKur(d, d.baslayan + 1, rastgele);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Ayar kalır.
function yeniOyunIsle(d, e) {
  if (d.asama === 'lobi') {
    return 'Zaten lobidesin.';
  }
  if (e.id !== d.sahip) {
    return 'Sadece ev sahibi lobiye döndürür.';
  }
  d.asama = 'lobi';
  bosOyunAlanlari(d);
  return null;
}

// Sıra kontrolü ortak: oyuncunun indeksi ya da hata mesajı
function siraKontrol(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return { hata: 'Bu odada değilsin.' };
  }
  if (d.asama !== 'oyun') {
    return { hata: 'Şu an oyun sürmüyor.' };
  }
  if (idx !== d.sira) {
    return { hata: 'Sıra sende değil.' };
  }
  return { idx: idx };
}

// Al: tezgâhtaki bir kartı (yer: 0-4) ele al. Tezgâh desteden tamamlanır.
function alIsle(d, e) {
  const kontrol = siraKontrol(d, e);
  if (kontrol.hata) {
    return kontrol.hata;
  }
  const idx = kontrol.idx;
  if (elBoyu(d.eller[idx]) >= EL_SINIRI) {
    return 'Elin dolu (' + EL_SINIRI + ' kart). Önce sat.';
  }
  const yer = e.yer;
  if (!Number.isInteger(yer) || yer < 0 || yer >= d.tezgah.length) {
    return 'Tezgâhta bu kart yok.';
  }
  const meyve = d.tezgah[yer];
  d.tezgah.splice(yer, 1);
  d.eller[idx][meyve] += 1;
  const ad = d.oyuncular[idx].ad;
  olayYaz(d, { tip: 'al', kim: idx, meyve: meyve }, ad + ' tezgâhtan ' + meyveAdi(meyve) + ' aldı.');
  tezgahiDoldur(d);
  siraGecir(d);
  return null;
}

// Sat: elindeki aynı meyveden en az 2 kartı o anki fiyattan sat.
function satIsle(d, e) {
  const kontrol = siraKontrol(d, e);
  if (kontrol.hata) {
    return kontrol.hata;
  }
  const idx = kontrol.idx;
  const meyve = e.meyve;
  if (!meyveBilgi(meyve)) {
    return 'Böyle bir meyve yok.';
  }
  const elde = d.eller[idx][meyve];
  const adet = e.adet === undefined ? elde : e.adet;
  if (!Number.isInteger(adet) || adet < EN_AZ_SATIS) {
    return 'En az ' + EN_AZ_SATIS + ' kart satmalısın.';
  }
  if (adet > elde) {
    return 'Elinde o kadar ' + meyveAdi(meyve) + ' yok.';
  }
  const fiyat = d.fiyatlar[meyve];
  const kazanc = adet * fiyat;
  d.eller[idx][meyve] -= adet;
  d.puanlar[idx] += kazanc;
  d.satilan[idx] += adet;

  // Satılan meyve ucuzlar, diğerleri toparlanır
  const yeniFiyat = satisSonrasiFiyat(d, meyve, adet);
  for (const m of MEYVELER) {
    if (m.id === meyve) {
      d.fiyatlar[m.id] = yeniFiyat;
    } else {
      d.fiyatlar[m.id] = Math.min(m.baslangic, d.fiyatlar[m.id] + 1);
    }
  }

  const ad = d.oyuncular[idx].ad;
  if (!d.enIyiSatis || kazanc > d.enIyiSatis.puan) {
    d.enIyiSatis = { puan: kazanc, ad: ad, meyve: meyve, adet: adet };
  }
  olayYaz(
    d,
    { tip: 'sat', kim: idx, meyve: meyve, adet: adet, fiyat: fiyat, kazanc: kazanc, yeniFiyat: yeniFiyat },
    ad + ' ' + adet + ' ' + meyveAdi(meyve) + ' sattı, ' + kazanc + ' puan aldı. ' + meyveAdi(meyve) + ' artık ' + yeniFiyat + '.'
  );
  siraGecir(d);
  return null;
}

// Pas: yalnız hiçbir hamle yapılamıyorsa
function pasIsle(d, e) {
  const kontrol = siraKontrol(d, e);
  if (kontrol.hata) {
    return kontrol.hata;
  }
  const idx = kontrol.idx;
  if (!pasMi(d, idx)) {
    return 'Yapabileceğin bir hamle var, pas geçemezsin.';
  }
  olayYaz(d, { tip: 'pas', kim: idx }, d.oyuncular[idx].ad + ' pas geçti.');
  siraGecir(d);
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  al: alIsle,
  sat: satIsle,
  pas: pasIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random) {
  const tip = eylem && eylem.tip;
  const islem = HAREKETLER[tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  const hata = islem(d, eylem, rastgele);
  if (hata) {
    return { ok: false, hata: hata };
  }
  return { ok: true, durum: d };
}

// Biten oyunun kazananları (indeks listesi). Beraberlikte birden çok indeks döner.
export function kazananlar(d) {
  if (d.asama !== 'bitti' || !d.sonuc) {
    return [];
  }
  return d.sonuc.kazananlar.slice();
}

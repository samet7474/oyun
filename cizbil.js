// cizbil.js - Saf "Çiz Bil" motoru (2-4 kişi).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'tahmin', id: oyuncuId, cizim: 0, metin: 'elma' }, rastgele, simdi);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik (rastgele), şimdiki zaman (simdi, ms) ve kelime listesi dışarıdan verilir; testler sabitler.
//
// Oyun: sırası gelen kişi (çizen) 3 kelimeden birini seçer ve parmağıyla çizer. Diğerleri
// (tahminciler) cevabı yazar. Bilen kalan süreye göre puan alır, çizen de her bilen için puan alır.
// Herkes bir kez çizince bir tur biter; ayardaki tur sayısı kadar sürer.
//
// Aşamalar: lobi -> secim -> cizim -> acik -> (secim -> cizim -> acik) ... -> bitti
//   secim : çizen kelimeyi seçiyor (SECIM_SURESI saniye; süre biterse ilk seçenek alınır)
//   cizim : çizen çiziyor, diğerleri tahmin ediyor (ayar.sure saniye)
//   acik  : kelime açıldı, kim bildi ve puanlar görünüyor
//   bitti : son çizimden sonra özet
//
// Çizginin kendisi bu durumda TUTULMAZ: canlı çizim Supabase Realtime broadcast ile gider
// (bkz. cizbil-ekran.js). Durumda yalnız tur, kelime, tahminler ve puan vardır. Aşağıdaki
// "Tahta" bölümü, broadcast ile gelen çizgi parçalarını birleştiren saf yardımcılardır.
//
// Gizli kelime durumda açıkça durur (bu sitedeki diğer oyunlar gibi); ekran tahmincilere göstermez.

import { oyuncuIndeks, temizAd, benzersizAd, karistir } from './uno.js';
import { KELIMELER } from './cizbil-kelimeler.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const EN_AZ_OYUNCU = 2;
export const MAKS_OYUNCU = 4;

export const TUR_SAYILARI = [1, 2, 3]; // her turda herkes bir kez çizer
export const VARSAYILAN_TUR_SAYISI = 2;

export const SURELER = [60, 75, 90]; // bir çizimin süresi (saniye)
export const VARSAYILAN_SURE = 75;

export const SECENEK_SAYISI = 3;
export const SECIM_SURESI = 20; // kelime seçme süresi (saniye)

// Telefon saatleri biraz farklı olabilir: süre bittikten sonra bu kadar ms içinde gelen tahmin kabul edilir
export const TOLERANS_MS = 2000;

export const EN_YUKSEK_PUAN = 10; // hemen bilen
export const EN_DUSUK_PUAN = 2; // son saniyede bilen

export const MAKS_TAHMIN_UZUNLUK = 30;
export const AKIS_UZUNLUGU = 8; // ekranda tutulan son yanlış tahmin sayısı

// ---------------------------------------------------------------------------
// Tahmin karşılaştırma (hoşgörülü)
// ---------------------------------------------------------------------------

// Karşılaştırma anahtarı: büyük/küçük harf, Türkçe harf farkı (ı/i, ş/s, ç/c, ğ/g, ö/o, ü/u),
// şapka (â, î, û), boşluk ve noktalama yok sayılır. "Buz Dolabi" ile "buzdolabı" aynıdır.
export function tahminAnahtari(metin) {
  const ham = metin === undefined || metin === null ? '' : String(metin);
  let s = ham.normalize('NFC').toLocaleLowerCase('tr-TR');
  s = s.replace(/ı/g, 'i');
  // Harf + işarete ayır, işaretleri at (ş -> s, ğ -> g, ö -> o, â -> a ...)
  s = s.normalize('NFD').replace(/\p{M}/gu, '');
  // Yalnız harf ve rakam kalsın
  return s.replace(/[^\p{L}\p{N}]/gu, '');
}

export function tahminDogruMu(tahmin, kelime) {
  const t = tahminAnahtari(tahmin);
  return t.length > 0 && t === tahminAnahtari(kelime);
}

// İki anahtar arasında en fazla 1 harf farkı var mı (bir harf eksik, fazla ya da farklı)
function birHarfFarkli(a, b) {
  if (a === b) {
    return false;
  }
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  const x = [...a];
  const y = [...b];
  let i = 0;
  let j = 0;
  let fark = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      i += 1;
      j += 1;
      continue;
    }
    fark += 1;
    if (fark > 1) {
      return false;
    }
    if (x.length > y.length) {
      i += 1;
    } else if (x.length < y.length) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }
  fark += x.length - i + (y.length - j);
  return fark === 1;
}

// "Çok yakın!" demek için: yanlış ama 1 harf farklı (4 harften uzun kelimelerde)
export function yakinMi(tahmin, kelime) {
  const t = tahminAnahtari(tahmin);
  const k = tahminAnahtari(kelime);
  return k.length >= 4 && birHarfFarkli(t, k);
}

// Tahmincinin gördüğü kalıp: her kelimenin harf sayısı. "deniz feneri" -> [5, 6]
export function kelimeKalibi(kelime) {
  return String(kelime || '')
    .split(/\s+/)
    .filter((parca) => parca.length > 0)
    .map((parca) => [...parca].length);
}

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad, puan: 0 };
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  return {
    oyun: 'cizbil',
    asama: 'lobi', // lobi | secim | cizim | acik | bitti
    sahip: sahipId,
    ayar: {
      turSayisi: VARSAYILAN_TUR_SAYISI,
      sure: VARSAYILAN_SURE,
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    cizim: 0, // kaçıncı çizim (0'dan); çizen = cizim % oyuncu sayısı
    cizen: 0, // çizen oyuncunun indeksi
    secenekler: [], // secim aşamasında çizene sunulan kelimeler
    kelime: '', // çizilen gizli kelime (ekran tahmincilere göstermez)
    baslangic: 0, // aşamanın başladığı an (ms, çizenin ya da hamleyi yapanın saati)
    bilenler: [], // bu çizimde bilenler, bilme sırasıyla: { o: oyuncu indeksi, puan }
    yanlislar: [], // bu çizimin son yanlış tahminleri: { o, metin }
    gecmis: [], // biten çizimler: { kelime, cizen, bilenler: [{ o, puan }], cizenPuan }
    kullanilanlar: [], // bu odada sunulmuş kelimeler (Tekrar oyna'da korunur)
  };
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

// Oyunda toplam kaç çizim var
export function toplamCizim(d) {
  return d.ayar.turSayisi * d.oyuncular.length;
}

// Şu anki tur (1'den): herkes bir kez çizince tur artar
export function turNumarasi(d) {
  return Math.floor(d.cizim / Math.max(1, d.oyuncular.length)) + 1;
}

// Aşamanın süresi (ms): secim ya da cizim
export function asamaSuresiMs(d) {
  if (d.asama === 'secim') {
    return SECIM_SURESI * 1000;
  }
  return d.ayar.sure * 1000;
}

// Aşamanın bitmesine kalan süre (ms). Negatif olabilir. secim ve cizim dışında 0.
export function kalanMs(d, simdi) {
  if (d.asama !== 'secim' && d.asama !== 'cizim') {
    return 0;
  }
  return d.baslangic + asamaSuresiMs(d) - simdi;
}

export function bildiMi(d, idx) {
  return d.bilenler.some((b) => b.o === idx);
}

// Bu çizimde tahmin edecekler (çizen dışındaki herkes)
export function tahminciler(d) {
  const liste = [];
  d.oyuncular.forEach((o, i) => {
    if (i !== d.cizen) {
      liste.push(i);
    }
  });
  return liste;
}

export function herkesBildi(d) {
  return tahminciler(d).every((i) => bildiMi(d, i));
}

// Şu an bilen tahmincinin alacağı puan: kalan süreye göre EN_YUKSEK_PUAN'dan EN_DUSUK_PUAN'a
export function tahminPuani(d, simdi) {
  const sure = d.ayar.sure * 1000;
  const kalan = Math.min(sure, Math.max(0, d.baslangic + sure - simdi));
  return EN_DUSUK_PUAN + Math.round(((EN_YUKSEK_PUAN - EN_DUSUK_PUAN) * kalan) / sure);
}

// Çizen, her bilen için bilenin puanının yarısını (yukarı yuvarlanmış) alır
export function cizenPuani(bilenPuani) {
  return Math.ceil(bilenPuani / 2);
}

// Oyunu en çok puan toplayanlar (indeksler). Eşitlikte birden çok indeks gelir.
export function oyunKazananlari(d) {
  const enCok = Math.max(...d.oyuncular.map((o) => o.puan));
  const liste = [];
  d.oyuncular.forEach((o, i) => {
    if (o.puan === enCok) {
      liste.push(i);
    }
  });
  return liste;
}

// Tahmin metni gönderilebilir mi? Hata metni ya da null. (Arayüz göndermeden önce çağırır.)
export function tahminHatasi(metin) {
  const s = String(metin === undefined || metin === null ? '' : metin).trim();
  if (s.length === 0) {
    return 'Bir şey yaz.';
  }
  if ([...s].length > MAKS_TAHMIN_UZUNLUK) {
    return 'En fazla ' + MAKS_TAHMIN_UZUNLUK + ' harf.';
  }
  if (tahminAnahtari(s).length === 0) {
    return 'Harf yazmalısın.';
  }
  return null;
}

// Canlı çizimin bu çizime ait olduğunu gösteren anahtar (broadcast mesajları bunu taşır).
// Tekrar oynamada da değişsin diye başlangıç anı da eklenir.
export function tahtaAnahtari(d) {
  return d.cizim + ':' + d.baslangic;
}

// ---------------------------------------------------------------------------
// Aşama kurma
// ---------------------------------------------------------------------------

function kelimeHavuzu(kelimeler) {
  const gorulen = new Set();
  const havuz = [];
  for (const ham of Array.isArray(kelimeler) ? kelimeler : []) {
    const k = String(ham || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('tr-TR');
    if (k.length > 0 && !gorulen.has(k)) {
      gorulen.add(k);
      havuz.push(k);
    }
  }
  return havuz;
}

// Çizene seçenekleri sunar. Bu odada sunulmuş kelime tekrar gelmez; havuz azalınca baştan başlar.
function secimKur(d, rastgele, kelimeler, simdi) {
  const havuz = kelimeHavuzu(kelimeler);
  if (havuz.length === 0) {
    return 'Kelime listesi boş.';
  }
  const kullanilan = new Set(d.kullanilanlar);
  let adaylar = havuz.filter((k) => !kullanilan.has(k));
  let kullanilanlar = d.kullanilanlar.slice();
  if (adaylar.length < SECENEK_SAYISI) {
    // Havuz bitiyor: baştan başla (az kalan kelimeler yine öne alınır), az önce sunulanlar gelmesin
    const onceki = new Set(d.secenekler);
    const kalanlar = karistir(adaylar, rastgele);
    const digerleri = karistir(
      havuz.filter((k) => !kalanlar.includes(k) && !onceki.has(k)),
      rastgele
    );
    adaylar = kalanlar.concat(digerleri);
    if (adaylar.length === 0) {
      adaylar = havuz.slice();
    }
    kullanilanlar = [];
  } else {
    adaylar = karistir(adaylar, rastgele);
  }
  const secenekler = adaylar.slice(0, SECENEK_SAYISI);
  d.secenekler = secenekler;
  d.kullanilanlar = kullanilanlar.concat(secenekler.filter((k) => !kullanilanlar.includes(k)));
  d.cizen = d.cizim % d.oyuncular.length;
  d.kelime = '';
  d.bilenler = [];
  d.yanlislar = [];
  d.baslangic = simdi;
  d.asama = 'secim';
  return null;
}

function cizimeBasla(d, kelime, simdi) {
  d.kelime = kelime;
  d.secenekler = [];
  d.baslangic = simdi;
  d.bilenler = [];
  d.yanlislar = [];
  d.asama = 'cizim';
}

// Çizim bitti (herkes bildi ya da süre doldu): sonucu geçmişe yaz, kelimeyi aç.
function cizimiBitir(d) {
  const cizenPuan = d.bilenler.reduce((t, b) => t + cizenPuani(b.puan), 0);
  d.gecmis.push({
    kelime: d.kelime,
    cizen: d.cizen,
    bilenler: d.bilenler.map((b) => ({ o: b.o, puan: b.puan })),
    cizenPuan: cizenPuan,
  });
  d.asama = 'acik';
}

// Oyunu sıfırdan kurar: puanlar sıfırlanır, ilk çizen ilk oyuncudur. Hata mesajı ya da null.
function oyunuKur(d, rastgele, kelimeler, simdi) {
  if (d.oyuncular.length < EN_AZ_OYUNCU) {
    return 'En az ' + EN_AZ_OYUNCU + ' kişi gerekli.';
  }
  if (d.oyuncular.length > MAKS_OYUNCU) {
    return 'En fazla ' + MAKS_OYUNCU + ' kişi oynar.';
  }
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  d.gecmis = [];
  d.cizim = 0;
  d.secenekler = [];
  return secimKur(d, rastgele, kelimeler, simdi);
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
  d.oyuncular.push(yeniOyuncu(e.id, benzersizAd(d, temizAd(e.ad))));
  return null;
}

// Lobide biri çıkar (kendi isteğiyle) ya da ev sahibi birini çıkarır.
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
  if (ayar.turSayisi !== undefined && !TUR_SAYILARI.includes(ayar.turSayisi)) {
    return 'Geçersiz tur sayısı.';
  }
  if (ayar.sure !== undefined && !SURELER.includes(ayar.sure)) {
    return 'Geçersiz süre.';
  }
  if (ayar.turSayisi !== undefined) {
    d.ayar.turSayisi = ayar.turSayisi;
  }
  if (ayar.sure !== undefined) {
    d.ayar.sure = ayar.sure;
  }
  return null;
}

function baslatIsle(d, e, rastgele, simdi, kelimeler) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, rastgele, kelimeler, simdi);
}

function tekrarOynaIsle(d, e, rastgele, simdi, kelimeler) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, rastgele, kelimeler, simdi);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Ayarlar ve çıkmış kelimeler kalır.
function yeniOyunIsle(d, e) {
  if (d.asama === 'lobi') {
    return 'Zaten lobidesin.';
  }
  if (e.id !== d.sahip) {
    return 'Sadece ev sahibi lobiye döndürür.';
  }
  d.asama = 'lobi';
  d.cizim = 0;
  d.cizen = 0;
  d.secenekler = [];
  d.kelime = '';
  d.baslangic = 0;
  d.bilenler = [];
  d.yanlislar = [];
  d.gecmis = [];
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  return null;
}

// Çizen kelimesini seçer: { tip: 'sec', cizim, secim: 0..2 }
function secIsle(d, e, rastgele, simdi) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'secim' || (e.cizim !== undefined && e.cizim !== d.cizim)) {
    return 'Kelime seçme zamanı geçti.';
  }
  if (idx !== d.cizen) {
    return 'Kelimeyi çizen seçer.';
  }
  if (!Number.isInteger(e.secim) || e.secim < 0 || e.secim >= d.secenekler.length) {
    return 'Geçersiz seçim.';
  }
  cizimeBasla(d, d.secenekler[e.secim], simdi);
  return null;
}

// Tahmin: { tip: 'tahmin', cizim, metin }
function tahminIsle(d, e, rastgele, simdi) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'cizim' || (e.cizim !== undefined && e.cizim !== d.cizim)) {
    return 'Bu çizim bitti.';
  }
  if (idx === d.cizen) {
    return 'Çizen tahmin etmez.';
  }
  if (bildiMi(d, idx)) {
    return 'Bunu zaten bildin.';
  }
  if (simdi > d.baslangic + d.ayar.sure * 1000 + TOLERANS_MS) {
    return 'Süre doldu.';
  }
  const sorun = tahminHatasi(e.metin);
  if (sorun) {
    return sorun;
  }
  if (tahminDogruMu(e.metin, d.kelime)) {
    const puan = tahminPuani(d, simdi);
    d.bilenler.push({ o: idx, puan: puan });
    d.oyuncular[idx].puan += puan;
    d.oyuncular[d.cizen].puan += cizenPuani(puan);
    if (herkesBildi(d)) {
      cizimiBitir(d);
    }
    return null;
  }
  // Yanlış tahmin herkesin akışına düşer (doğru cevap hiç yazılmaz)
  d.yanlislar.push({ o: idx, metin: String(e.metin).replace(/\s+/g, ' ').trim() });
  if (d.yanlislar.length > AKIS_UZUNLUGU) {
    d.yanlislar = d.yanlislar.slice(-AKIS_UZUNLUGU);
  }
  return null;
}

// Süre bitti: { tip: 'sureBitti', cizim }. Herkes gönderebilir (çizen sayfadan çıksa da oyun kilitlenmesin).
//   secim: ilk seçenek alınır, çizim başlar
//   cizim: çizim biter, kelime açılır
function sureBittiIsle(d, e, rastgele, simdi) {
  if (oyuncuIndeks(d, e.id) < 0) {
    return 'Bu odada değilsin.';
  }
  if ((d.asama !== 'secim' && d.asama !== 'cizim') || (e.cizim !== undefined && e.cizim !== d.cizim)) {
    return 'Bu çizim bitti.';
  }
  if (kalanMs(d, simdi) > 0) {
    return 'Süre daha bitmedi.';
  }
  if (d.asama === 'secim') {
    cizimeBasla(d, d.secenekler[0], simdi);
    return null;
  }
  cizimiBitir(d);
  return null;
}

// Sonraki çizim. İki kişi aynı anda basarsa ikincisi zararsız geçer (çizim eşleşmez ya da oyun bitti).
function sonrakiIsle(d, e, rastgele, simdi, kelimeler) {
  if (oyuncuIndeks(d, e.id) < 0) {
    return 'Bu odada değilsin.';
  }
  if (e.cizim !== undefined && e.cizim !== d.cizim) {
    return null;
  }
  if (d.asama === 'bitti') {
    return null;
  }
  if (d.asama !== 'acik') {
    return 'Çizim daha bitmedi.';
  }
  if (d.cizim + 1 >= toplamCizim(d)) {
    d.asama = 'bitti';
    return null;
  }
  d.cizim += 1;
  return secimKur(d, rastgele, kelimeler, simdi);
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  sec: secIsle,
  tahmin: tahminIsle,
  sureBitti: sureBittiIsle,
  sonraki: sonrakiIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random, simdi = Date.now(), kelimeler = KELIMELER) {
  const islem = HAREKETLER[eylem && eylem.tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  const hata = islem(d, eylem, rastgele, simdi, kelimeler);
  if (hata) {
    return { ok: false, hata: hata };
  }
  return { ok: true, durum: d };
}

// Biten oyunun kazananları (indeks listesi). Oyun bitmediyse boş; eşitlikte birden çok indeks gelir.
export function kazananlar(d) {
  if (d.asama !== 'bitti') {
    return [];
  }
  return oyunKazananlari(d);
}

// ---------------------------------------------------------------------------
// Tahta: canlı çizimin saf yardımcıları (DOM yok)
//
// Koordinatlar 0..TAHTA_BOYUT tam sayılardır (kare tahta); her telefon kendi boyutuna ölçekler.
// tahta = { anahtar, sayfa, cizgiler: [{ r: renk, k: kalınlık, n: [x0, y0, x1, y1, ...] }] }
//   sayfa: "Temizle"de artar; eski sayfaya ait geç gelen parça yok sayılır.
// Mesajlar (broadcast yükü, t alanı tipini söyler):
//   { t: 'parca', a: anahtar, s: sayfa, i: çizgi no, r, k, b: ilk noktanın sırası, n: [x, y, ...] }
//   { t: 'temizle', a, s: yeni sayfa }
//   { t: 'geri', a, s, i: silinen çizginin numarası }  ("Geri al": çizgi sayısı i'ye iner)
//   { t: 'tahta', a, s, c: cizgiler }  (tam tahta: geç gelen ya da sayfayı yenileyen için)
//   { t: 'iste', a }                    (tam tahtayı iste)
// ---------------------------------------------------------------------------

export const TAHTA_BOYUT = 1000;
export const RENKLER = ['#1d1d1f', '#e0342b', '#1f6fd1', '#2f9e44']; // siyah, kırmızı, mavi, yeşil
export const RENK_ADLARI = ['Siyah', 'Kırmızı', 'Mavi', 'Yeşil'];
export const SILGI = RENKLER.length; // r === SILGI ise beyaz çizilir
export const KALINLIKLAR = [6, 14]; // ince, kalın (tahta birimi)
export const SILGI_KALINLIGI = 44;
export const EN_KALIN = 60;
export const MAKS_NOKTA = 6000; // tahtadaki toplam nokta sınırı (tam tahta mesajı küçük kalsın)
export const MAKS_CIZGI = 400;
export const SADELE_ESIGI = 4; // önceki noktaya bundan yakın nokta atılır

export function yeniTahta(anahtar) {
  return { anahtar: anahtar, sayfa: 0, cizgiler: [] };
}

export function noktaSayisi(tahta) {
  return tahta.cizgiler.reduce((t, c) => t + c.n.length / 2, 0);
}

// Ekran koordinatını (0..1 oran) tahta birimine çevirir ve sınırlar
export function tahtaNoktasi(oranX, oranY) {
  const sinirla = (v) => Math.max(0, Math.min(TAHTA_BOYUT, Math.round(v * TAHTA_BOYUT)));
  return [sinirla(oranX), sinirla(oranY)];
}

// Yeni nokta tutulsun mu? (öncekine çok yakınsa hayır)
export function noktaTutulsunMu(oncekiX, oncekiY, x, y) {
  const dx = x - oncekiX;
  const dy = y - oncekiY;
  return dx * dx + dy * dy >= SADELE_ESIGI * SADELE_ESIGI;
}

function tamSayiMi(v, enAz, enCok) {
  return Number.isInteger(v) && v >= enAz && v <= enCok;
}

function noktalarGecerliMi(n) {
  return (
    Array.isArray(n) &&
    n.length % 2 === 0 &&
    n.length <= MAKS_NOKTA * 2 &&
    n.every((v) => tamSayiMi(v, 0, TAHTA_BOYUT))
  );
}

function cizgiGecerliMi(c) {
  return (
    c &&
    tamSayiMi(c.r, 0, SILGI) &&
    tamSayiMi(c.k, 1, EN_KALIN) &&
    noktalarGecerliMi(c.n) &&
    c.n.length >= 2
  );
}

// Gelen mesaj biçim olarak doğru mu (başka bir istemciden bozuk ya da kötü veri gelirse çizilmesin)
export function mesajGecerliMi(m) {
  if (!m || typeof m !== 'object' || typeof m.a !== 'string') {
    return false;
  }
  if (m.t === 'iste') {
    return true;
  }
  if (!tamSayiMi(m.s, 0, 1e6)) {
    return false;
  }
  if (m.t === 'temizle') {
    return true;
  }
  if (m.t === 'geri') {
    return tamSayiMi(m.i, 0, MAKS_CIZGI);
  }
  if (m.t === 'parca') {
    return (
      tamSayiMi(m.i, 0, MAKS_CIZGI) &&
      tamSayiMi(m.b, 0, MAKS_NOKTA) &&
      tamSayiMi(m.r, 0, SILGI) &&
      tamSayiMi(m.k, 1, EN_KALIN) &&
      noktalarGecerliMi(m.n) &&
      m.n.length >= 2
    );
  }
  if (m.t === 'tahta') {
    return Array.isArray(m.c) && m.c.length <= MAKS_CIZGI && m.c.every(cizgiGecerliMi);
  }
  return false;
}

// Mesajı tahtaya işler (tahtayı değiştirir). Sonuç:
//   'tamam' : işlendi
//   'eski'  : başka çizime ya da eski sayfaya ait, yok sayıldı
//   'eksik' : arada kaçan parça var; tam tahta istenmeli
export function mesajUygula(tahta, m) {
  if (!mesajGecerliMi(m) || m.a !== tahta.anahtar || m.t === 'iste') {
    return 'eski';
  }
  if (m.t === 'tahta') {
    tahta.sayfa = m.s;
    tahta.cizgiler = m.c.map((c) => ({ r: c.r, k: c.k, n: c.n.slice() }));
    return 'tamam';
  }
  if (m.s < tahta.sayfa) {
    return 'eski';
  }
  if (m.s > tahta.sayfa) {
    // Yeni sayfa: temizlenmiş tahta
    tahta.sayfa = m.s;
    tahta.cizgiler = [];
    if (m.t === 'temizle') {
      return 'tamam';
    }
    if (m.t === 'geri') {
      return 'eksik';
    }
  }
  if (m.t === 'temizle') {
    tahta.cizgiler = [];
    return 'tamam';
  }
  if (m.t === 'geri') {
    if (tahta.cizgiler.length > m.i) {
      tahta.cizgiler.length = m.i;
    }
    return 'tamam';
  }
  // parca
  const cizgiler = tahta.cizgiler;
  if (m.i > cizgiler.length) {
    return 'eksik';
  }
  if (m.i === cizgiler.length) {
    if (m.b !== 0) {
      return 'eksik';
    }
    cizgiler.push({ r: m.r, k: m.k, n: [] });
  }
  const cizgi = cizgiler[m.i];
  const mevcut = cizgi.n.length / 2;
  if (m.b > mevcut) {
    return 'eksik';
  }
  // Tekrar gelen noktaları atla, yalnız yenileri ekle
  const yeniBaslangic = (mevcut - m.b) * 2;
  if (yeniBaslangic < m.n.length) {
    if (noktaSayisi(tahta) + (m.n.length - yeniBaslangic) / 2 > MAKS_NOKTA) {
      return 'eski';
    }
    cizgi.n.push(...m.n.slice(yeniBaslangic));
  }
  return 'tamam';
}

// Tahtanın tam hali (gönderilecek 'tahta' mesajı)
export function tahtaMesaji(tahta) {
  return {
    t: 'tahta',
    a: tahta.anahtar,
    s: tahta.sayfa,
    c: tahta.cizgiler.filter((c) => c.n.length >= 2).map((c) => ({ r: c.r, k: c.k, n: c.n.slice() })),
  };
}

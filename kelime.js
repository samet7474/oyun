// kelime.js - Saf "Kelime düellosu" motoru (2-4 kişi, Türkçe Wordle).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'tahmin', id: oyuncuId, tur: 0, kelime: 'kalem' }, rastgele, liste);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik: seçim için kullanılan fonksiyon (0 <= x < 1) dışarıdan verilir.
// Kelime listesi de dışarıdan verilebilir (4. parametre: { cevaplar, gecerli }); testler küçük bir liste kullanır.
//
// Herkes aynı gizli kelimeyi AYNI ANDA ve birbirinden bağımsız tahmin eder (sıra yok).
// Bir tahmin yalnız o oyuncunun kendi satırına bağlıdır; bu yüzden başkası araya yazsa da
// tahmin geçerli kalır ve çakışma sonrası yeniden uygulanabilir.
//
// Aşamalar: lobi -> tur -> acik -> (tur -> acik) ... -> bitti
//   tur   : herkes tahmin yapıyor
//   acik  : herkes bitirdi, kelime ve tahtalar görünüyor
//   bitti : son kelimeden sonra özet
//
// Renk kodları (tahminler[i][j].renkler): 0 = gri, 1 = sarı, 2 = yeşil

import { oyuncuIndeks, temizAd, benzersizAd, karistir } from './uno.js';
import { CEVAPLAR, GECERLI } from './kelimeler.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const VARSAYILAN_LISTE = { cevaplar: CEVAPLAR, gecerli: GECERLI };

export const ALFABE = 'abcçdefgğhıijklmnoöprsştuüvyz';
export const KELIME_UZUNLUK = 5;
export const DENEME_SAYISI = 6;

export const EN_AZ_OYUNCU = 2;
export const MAKS_OYUNCU = 4;

export const TUR_SAYILARI = [3, 5, 7];
export const VARSAYILAN_TUR_SAYISI = 5;

export const GRI = 0;
export const SARI = 1;
export const YESIL = 2;

// ---------------------------------------------------------------------------
// Türkçe metin
// ---------------------------------------------------------------------------

const ALFABE_HARFLERI = new Set([...ALFABE]);

// Küçük harfe çevirir (I -> ı, İ -> i), alfabe dışındakileri atar. Ham metnin küçük hali de döner.
function kucukHarf(metin) {
  const ham = metin === undefined || metin === null ? '' : String(metin);
  return ham.normalize('NFC').toLocaleLowerCase('tr-TR');
}

// Kelimeyi temizler: küçük harf, yalnız 29 harflik Türkçe alfabe.
export function kelimeTemizle(metin) {
  return [...kucukHarf(metin)].filter((harf) => ALFABE_HARFLERI.has(harf)).join('');
}

// Harflere ayırır (birleşik işaretlerden etkilenmesin diye [...kelime])
export function harfler(kelime) {
  return [...kelime];
}

// ---------------------------------------------------------------------------
// Liste yardımcıları (aynı liste için tekrar tekrar hesaplanmasın)
// ---------------------------------------------------------------------------

const cevapOnbellegi = new WeakMap();
const gecerliOnbellegi = new WeakMap();

function diziAl(dizi) {
  return Array.isArray(dizi) ? dizi : [];
}

// Gizli kelime olabilecek temiz, 5 harfli, tekrarsız kelimeler
function cevapHavuzu(liste) {
  const kaynak = diziAl(liste.cevaplar);
  if (!cevapOnbellegi.has(kaynak)) {
    const gorulen = new Set();
    const havuz = [];
    for (const ham of kaynak) {
      const kelime = kelimeTemizle(ham);
      if (harfler(kelime).length === KELIME_UZUNLUK && !gorulen.has(kelime)) {
        gorulen.add(kelime);
        havuz.push(kelime);
      }
    }
    cevapOnbellegi.set(kaynak, havuz);
  }
  return cevapOnbellegi.get(kaynak);
}

// Geçerli sayılan kelimeler
function gecerliKumesi(liste) {
  const kaynak = diziAl(liste.gecerli);
  if (!gecerliOnbellegi.has(kaynak)) {
    const kume = new Set();
    for (const ham of kaynak) {
      kume.add(kelimeTemizle(ham));
    }
    gecerliOnbellegi.set(kaynak, kume);
  }
  return gecerliOnbellegi.get(kaynak);
}

// Cevaplar da geçerli sayılır (liste farklı yazılmış olsa bile)
export function sozlukteVarMi(kelime, liste = VARSAYILAN_LISTE) {
  return gecerliKumesi(liste).has(kelime) || cevapHavuzu(liste).includes(kelime);
}

// ---------------------------------------------------------------------------
// Renklendirme (klasik Wordle, tekrar eden harfler doğru sayılır)
// ---------------------------------------------------------------------------

// tahmin ve cevap temiz, 5 harfli kelimelerdir. [0|1|2, ...] döner.
export function renklendir(tahmin, cevap) {
  const t = harfler(tahmin);
  const c = harfler(cevap);
  const renkler = t.map(() => GRI);
  const kalan = new Map(); // cevapta yeşille eşleşmemiş harflerin sayısı

  // 1. geçiş: doğru yerdekiler
  for (let i = 0; i < t.length; i++) {
    if (t[i] === c[i]) {
      renkler[i] = YESIL;
    } else {
      kalan.set(c[i], (kalan.get(c[i]) || 0) + 1);
    }
  }

  // 2. geçiş: başka yerdekiler, yalnız cevapta kalan sayısı kadar
  for (let i = 0; i < t.length; i++) {
    if (renkler[i] === YESIL) {
      continue;
    }
    const adet = kalan.get(t[i]) || 0;
    if (adet > 0) {
      renkler[i] = SARI;
      kalan.set(t[i], adet - 1);
    }
  }
  return renkler;
}

function hepsiYesil(renkler) {
  return renkler.length === KELIME_UZUNLUK && renkler.every((r) => r === YESIL);
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
    oyun: 'kelime',
    asama: 'lobi', // lobi | tur | acik | bitti
    sahip: sahipId,
    ayar: {
      turSayisi: VARSAYILAN_TUR_SAYISI,
      serbest: false, // true: sözlükte olmayan kelime de kabul
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    tur: 0, // şu anki kelimenin indeksi
    cevap: '', // bu turun gizli kelimesi (ekran tur bitene kadar göstermez)
    tahminler: [], // oyuncu i için [{ kelime, renkler }, ...] (bu turun tahminleri)
    gecmis: [], // biten turlar: { kelime, denemeler: [n | null], kazananlar: [oyuncu indeksi] }
    kullanilanlar: [], // bu odada çıkmış cevaplar (Tekrar oyna'da korunur)
  };
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

// Bir oyuncunun bu turdaki durumu.
//   sayi   : yaptığı tahmin sayısı
//   cozdu  : son tahmini doğru mu
//   bitti  : çözdü ya da 6 hakkı doldu
//   deneme : çözdüyse kaçıncı denemede, yoksa null
export function oyuncuDurumu(d, i) {
  const liste = (d.tahminler && d.tahminler[i]) || [];
  const son = liste[liste.length - 1];
  const cozdu = Boolean(son) && hepsiYesil(son.renkler);
  return {
    sayi: liste.length,
    cozdu: cozdu,
    bitti: cozdu || liste.length >= DENEME_SAYISI,
    deneme: cozdu ? liste.length : null,
  };
}

export function herkesBitti(d) {
  return d.oyuncular.every((o, i) => oyuncuDurumu(d, i).bitti);
}

// Klavye boyaması: harf -> en iyi renk (yeşil > sarı > gri). Hiç denenmemiş harf yoktur.
export function klavyeRenkleri(tahminler) {
  const harita = {};
  for (const tahmin of tahminler || []) {
    const hf = harfler(tahmin.kelime);
    hf.forEach((harf, j) => {
      const renk = tahmin.renkler[j];
      if (harita[harf] === undefined || renk > harita[harf]) {
        harita[harf] = renk;
      }
    });
  }
  return harita;
}

// Oyunu en çok tur kazananlar (indeksler). Kimse puan almadıysa herkes berabere sayılır.
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

// Tahmin yapılabilir mi? { neden, hata } ya da null.
//   neden: harf | kisa | tekrar | sozluk
// Arayüz bunu göndermeden önce çağırır; motor aynı kontrolü hareket sırasında yapar.
export function tahminHatasi(d, idx, ham, zorla = false, liste = VARSAYILAN_LISTE) {
  const kelime = kelimeTemizle(ham);
  if (kelime !== kucukHarf(ham).trim()) {
    return { neden: 'harf', hata: 'Sadece harf yazılır.' };
  }
  if (harfler(kelime).length !== KELIME_UZUNLUK) {
    return { neden: 'kisa', hata: '5 harf gerekli' };
  }
  const onceki = (d.tahminler[idx] || []).some((t) => t.kelime === kelime);
  if (onceki) {
    return { neden: 'tekrar', hata: 'Bunu zaten denedin.' };
  }
  if (!d.ayar.serbest && !zorla && !sozlukteVarMi(kelime, liste)) {
    return { neden: 'sozluk', hata: 'Bu kelime listede yok.' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tur kurma ve bitirme
// ---------------------------------------------------------------------------

// Yeni gizli kelimeyi seçer. Bu odada çıkmış kelime tekrar gelmez; havuz bitince baştan başlar.
// Hata mesajı ya da null.
function turuKur(d, liste, rastgele) {
  const havuz = cevapHavuzu(liste);
  if (havuz.length === 0) {
    return 'Kelime listesi boş.';
  }
  const kullanilan = new Set(d.kullanilanlar);
  let adaylar = havuz.filter((kelime) => !kullanilan.has(kelime));
  let kullanilanlar = d.kullanilanlar.slice();
  if (adaylar.length === 0) {
    // Havuz bitti: baştan başla, ama hemen önceki kelime art arda gelmesin
    kullanilanlar = [];
    adaylar = havuz.filter((kelime) => kelime !== d.cevap);
    if (adaylar.length === 0) {
      adaylar = havuz.slice();
    }
  }
  const secilen = karistir(adaylar, rastgele)[0];
  d.cevap = secilen;
  d.kullanilanlar = kullanilanlar.concat([secilen]);
  d.tahminler = d.oyuncular.map(() => []);
  d.asama = 'tur';
  return null;
}

// Oyunu sıfırdan kurar: puanlar sıfırlanır, ilk kelime seçilir. Hata mesajı ya da null.
function oyunuKur(d, liste, rastgele) {
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
  d.tur = 0;
  return turuKur(d, liste, rastgele);
}

// Herkes bitirdi: kazananları bul, puan ver, sonucu geçmişe yaz, sonucu aç.
function turuBitir(d) {
  const denemeler = d.oyuncular.map((o, i) => oyuncuDurumu(d, i).deneme);
  const cozenler = denemeler.filter((n) => n !== null);
  const kazananlar = [];
  if (cozenler.length > 0) {
    const enAz = Math.min(...cozenler);
    denemeler.forEach((n, i) => {
      if (n === enAz) {
        kazananlar.push(i);
        d.oyuncular[i].puan += 1;
      }
    });
  }
  d.gecmis.push({ kelime: d.cevap, denemeler: denemeler, kazananlar: kazananlar });
  d.asama = 'acik';
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
  if (ayar.serbest !== undefined && typeof ayar.serbest !== 'boolean') {
    return 'Geçersiz ayar.';
  }
  if (ayar.turSayisi !== undefined) {
    d.ayar.turSayisi = ayar.turSayisi;
  }
  if (ayar.serbest !== undefined) {
    d.ayar.serbest = ayar.serbest;
  }
  return null;
}

function baslatIsle(d, e, rastgele, liste) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, liste, rastgele);
}

function tekrarOynaIsle(d, e, rastgele, liste) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, liste, rastgele);
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
  d.tur = 0;
  d.cevap = '';
  d.tahminler = [];
  d.gecmis = [];
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  return null;
}

function tahminIsle(d, e, rastgele, liste) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'tur') {
    return 'Şu an tahmin yapılmaz.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu kelime geçti.';
  }
  if (oyuncuDurumu(d, idx).bitti) {
    return 'Bu kelimeyi bitirdin.';
  }
  const sorun = tahminHatasi(d, idx, e.kelime, e.zorla === true, liste);
  if (sorun) {
    return sorun.hata;
  }
  const kelime = kelimeTemizle(e.kelime);
  d.tahminler[idx].push({ kelime: kelime, renkler: renklendir(kelime, d.cevap) });

  if (herkesBitti(d)) {
    turuBitir(d);
  }
  return null;
}

// Sonraki kelime. İki oyuncu aynı anda basarsa ikincisi zararsız geçer (tur eşleşmez ya da oyun çoktan bitti).
function sonrakiIsle(d, e, rastgele, liste) {
  if (oyuncuIndeks(d, e.id) < 0) {
    return 'Bu odada değilsin.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return null;
  }
  if (d.asama === 'bitti') {
    return null;
  }
  if (d.asama !== 'acik') {
    return 'Şu an sonraki kelimeye geçilmez.';
  }
  if (d.tur + 1 >= d.ayar.turSayisi) {
    d.asama = 'bitti';
    return null;
  }
  d.tur += 1;
  return turuKur(d, liste, rastgele);
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  tahmin: tahminIsle,
  sonraki: sonrakiIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random, liste = VARSAYILAN_LISTE) {
  const islem = HAREKETLER[eylem && eylem.tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  const hata = islem(d, eylem, rastgele, liste);
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

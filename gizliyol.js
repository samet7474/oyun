// gizliyol.js - Saf "Gizli Yol" motoru (tam 2 kişi, aynı anda oynanan yol bulmaca).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'kare', id: oyuncuId, tur: 0, satir: 5, sutun: 2 }, rastgele);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Oyun: 6x6 tahta. Her oyuncu gizli bir yol çizer (alttan üste). Sonra aynı anda
// birbirinin yolunu bulmaya çalışır. Yanlış karede oyuncu başa döner, kırmızı işaret kalır.
// Az hata yapan turu alır.
//
// Konum: satir 0 = üst satır, satir 5 = alt satır; sutun 0..5. Kare [satir, sutun] diye yazılır.
// Rastgelelik bu oyunda yok; imza diğer oyunlarla aynı kalsın diye parametre duruyor.
//
// Aşamalar: lobi -> kurma -> bulma -> acik -> (kurma -> bulma -> acik) ... -> bitti
//   kurma : herkes kendi yolunu çiziyor, "Hazırım" bekleniyor
//   bulma : herkes rakibin yolunu arıyor (sıra yok)
//   acik  : iki yol da açık, tur sonucu
//   bitti : son turdan sonra özet
//
// Yollar durumda tutulur (durum satırı herkese açıktır, bilinen sınır): ekran bulma bitene
// kadar rakibin yolunu hiçbir yerde çizmez.

import { oyuncuIndeks, temizAd, benzersizAd } from './uno.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const TAHTA = 6;
export const ALT_SATIR = TAHTA - 1;
export const UST_SATIR = 0;

export const OYUNCU_SAYISI = 2;

export const TUR_SAYILARI = [1, 3, 5];
export const VARSAYILAN_TUR_SAYISI = 3;

// Yolun kare sayısı bir aralıktadır: kısa 8-10, uzun 12-14.
// Ayarda aralığın alt sınırı saklanır (enAzKare); üst sınır ondan bulunur.
export const YOL_UZUNLUKLARI = [8, 12];
export const VARSAYILAN_YOL_UZUNLUK = 8;
const YOL_ARALIGI_GENISLIK = 2; // alt sınırdan üst sınıra fark

// Eski odalarda kayıtlı ayar değeri ("kısa", "uzun" ya da herhangi bir sayı)
// yeni aralıklardan birine eşlenir. Bilinmeyen değer varsayılan olur.
export function yolAyariniDuzelt(deger) {
  if (YOL_UZUNLUKLARI.includes(deger)) {
    return deger;
  }
  if (typeof deger === 'string') {
    const kucuk = deger.toLocaleLowerCase('tr');
    if (kucuk === 'uzun') {
      return YOL_UZUNLUKLARI[1];
    }
    if (kucuk === 'kısa' || kucuk === 'kisa') {
      return YOL_UZUNLUKLARI[0];
    }
    deger = Number(deger);
  }
  if (typeof deger === 'number' && Number.isFinite(deger)) {
    // Kısa aralığın üstündeki sayılar (11 ve üzeri) uzun sayılır
    return deger > YOL_UZUNLUKLARI[0] + YOL_ARALIGI_GENISLIK ? YOL_UZUNLUKLARI[1] : YOL_UZUNLUKLARI[0];
  }
  return VARSAYILAN_YOL_UZUNLUK;
}

// Ayardaki değerden yolun en az kare sayısı (kısa 8, uzun 12)
export function yolEnAz(ayarDegeri) {
  return yolAyariniDuzelt(ayarDegeri);
}

// Ayardaki değerden yolun en çok kare sayısı (kısa 10, uzun 14)
export function yolEnCok(ayarDegeri) {
  return yolAyariniDuzelt(ayarDegeri) + YOL_ARALIGI_GENISLIK;
}

// Bu kadar hataya ulaşan oyuncu pes edebilir. Pes edince tur bu kadar hata sayılır.
export const PES_HATASI = 25;

// ---------------------------------------------------------------------------
// Kare ve yol yardımcıları
// ---------------------------------------------------------------------------

function tamSayiMi(x) {
  return Number.isInteger(x);
}

// Tahtanın içinde mi?
export function karedeMi(satir, sutun) {
  return tamSayiMi(satir) && tamSayiMi(sutun) && satir >= 0 && satir < TAHTA && sutun >= 0 && sutun < TAHTA;
}

// İki kare yan yana ya da alt alta komşu mu? (çapraz yok)
export function komsuMu(a, b) {
  const fark = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  return fark === 1;
}

export function kareAnahtari(satir, sutun) {
  return satir + ',' + sutun;
}

// Yol geçerli mi? Hata mesajı ya da null.
export function yolHatasi(yol, ayarDegeri = VARSAYILAN_YOL_UZUNLUK) {
  const enAz = yolEnAz(ayarDegeri);
  const enCok = yolEnCok(ayarDegeri);
  if (!Array.isArray(yol) || yol.length === 0) {
    return 'Önce bir yol çiz.';
  }
  const gorulen = new Set();
  for (let i = 0; i < yol.length; i++) {
    const kare = yol[i];
    if (!Array.isArray(kare) || kare.length !== 2 || !karedeMi(kare[0], kare[1])) {
      return 'Yol tahtanın dışına çıkıyor.';
    }
    const anahtar = kareAnahtari(kare[0], kare[1]);
    if (gorulen.has(anahtar)) {
      return 'Aynı kareden iki kez geçilmez.';
    }
    gorulen.add(anahtar);
    if (i > 0 && !komsuMu(yol[i - 1], kare)) {
      return 'Her adım yan yana ya da alt alta olmalı.';
    }
  }
  if (yol.length > enCok) {
    return 'Yol en fazla ' + enCok + ' kare olabilir.';
  }
  if (yol[0][0] !== ALT_SATIR) {
    return 'Yol alt satırdan başlamalı.';
  }
  if (yol[yol.length - 1][0] !== UST_SATIR) {
    return 'Yol üst satırda bitmeli.';
  }
  if (yol.length < enAz) {
    return 'Yol en az ' + enAz + ' kare olmalı.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad, puan: 0 };
}

// Bir oyuncunun bulma ilerlemesi (rakibin yolunu arıyor)
function bosIlerleme() {
  return {
    bulunan: 0, // şu an doğru bulunan kare sayısı (hata yapınca 0'a döner)
    hata: 0, // bu turdaki hata sayısı
    yanlislar: [], // kalıcı kırmızı işaretler: { satir, sutun, adim }
    bitti: false,
    pes: false,
  };
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  return {
    oyun: 'gizliyol',
    asama: 'lobi', // lobi | kurma | bulma | acik | bitti
    sahip: sahipId,
    ayar: {
      turSayisi: VARSAYILAN_TUR_SAYISI,
      enAzKare: VARSAYILAN_YOL_UZUNLUK,
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    tur: 0, // şu anki turun indeksi
    yollar: [], // oyuncu i'nin kendi çizdiği yol: [[satir, sutun], ...] ya da null
    hazir: [], // oyuncu i yolunu "Hazırım" ile onayladı mı
    bulma: [], // oyuncu i'nin, rakibin yolunu arama ilerlemesi
    gecmis: [], // biten turlar: { hatalar: [a, b], kazanan: indeks | -1 }
  };
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

// Rakibin indeksi (2 kişilik oyun)
export function rakipIndeks(i) {
  return 1 - i;
}

// i. oyuncunun bulduğu yolun uzunluğu (rakibin yolunun kare sayısı)
export function hedefUzunluk(d, i) {
  const yol = d.yollar[rakipIndeks(i)];
  return yol ? yol.length : 0;
}

// Bir oyuncunun bu turdaki durumu
export function oyuncuDurumu(d, i) {
  const ilerleme = (d.bulma && d.bulma[i]) || bosIlerleme();
  return {
    bulunan: ilerleme.bulunan,
    hata: ilerleme.hata,
    bitti: ilerleme.bitti,
    pes: ilerleme.pes,
    pesEdebilir: !ilerleme.bitti && ilerleme.hata >= PES_HATASI,
  };
}

export function herkesBitti(d) {
  return d.oyuncular.every((o, i) => oyuncuDurumu(d, i).bitti);
}

export function herkesHazir(d) {
  return d.oyuncular.length === OYUNCU_SAYISI && d.hazir.length === OYUNCU_SAYISI && d.hazir.every(Boolean);
}

// Oyunu en çok tur kazananlar (indeksler). Eşitse ikisi de.
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

// i. oyuncunun bir sonraki doğru karesi (ekran kullanmaz, testler kullanır)
export function sonrakiDogruKare(d, i) {
  const yol = d.yollar[rakipIndeks(i)];
  const ilerleme = d.bulma[i];
  if (!yol || !ilerleme || ilerleme.bulunan >= yol.length) {
    return null;
  }
  return yol[ilerleme.bulunan];
}

// Bu kareye dokunmak mümkün mü? { neden, hata } ya da null.
//   neden: sinir | baslangic | komsu | bulundu | denendi
// Bunlar hata sayılmaz, yalnız uyarıdır. Arayüz göndermeden önce çağırır; motor aynı kontrolü yapar.
export function kareUyarisi(d, i, satir, sutun) {
  if (!karedeMi(satir, sutun)) {
    return { neden: 'sinir', hata: 'Bu kare tahtada yok.' };
  }
  const ilerleme = d.bulma[i];
  const yol = d.yollar[rakipIndeks(i)];
  const bulunanlar = yol.slice(0, ilerleme.bulunan);

  if (bulunanlar.some((k) => k[0] === satir && k[1] === sutun)) {
    return { neden: 'bulundu', hata: 'Bu kareyi zaten buldun.' };
  }
  if (ilerleme.bulunan === 0) {
    if (satir !== ALT_SATIR) {
      return { neden: 'baslangic', hata: 'Önce alt satırda başlangıç karesini bul.' };
    }
  } else {
    const son = bulunanlar[bulunanlar.length - 1];
    if (!komsuMu(son, [satir, sutun])) {
      return { neden: 'komsu', hata: 'Son bulduğun karenin yanındaki bir kareye dokun.' };
    }
  }
  // Aynı yerde aynı yanlışı daha önce yaptıysa tekrar sayılmaz
  const onceki = ilerleme.yanlislar.some((y) => y.satir === satir && y.sutun === sutun && y.adim === ilerleme.bulunan);
  if (onceki) {
    return { neden: 'denendi', hata: 'Bu kare yanlıştı, başka kare dene.' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tur kurma ve bitirme
// ---------------------------------------------------------------------------

// Yeni tura geç: yollar silinir, herkes yolunu baştan çizer
function turuKur(d) {
  d.asama = 'kurma';
  d.yollar = d.oyuncular.map(() => null);
  d.hazir = d.oyuncular.map(() => false);
  d.bulma = d.oyuncular.map(() => bosIlerleme());
}

// Oyunu sıfırdan kurar: puanlar sıfırlanır. Hata mesajı ya da null.
function oyunuKur(d) {
  if (d.oyuncular.length !== OYUNCU_SAYISI) {
    return 'Bu oyun tam ' + OYUNCU_SAYISI + ' kişiyle oynanır.';
  }
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  d.gecmis = [];
  d.tur = 0;
  turuKur(d);
  return null;
}

// İkisi de bitirdi: az hata yapan turu alır, eşitse berabere
function turuBitir(d) {
  const hatalar = d.oyuncular.map((o, i) => d.bulma[i].hata);
  let kazanan = -1;
  if (hatalar[0] < hatalar[1]) {
    kazanan = 0;
  } else if (hatalar[1] < hatalar[0]) {
    kazanan = 1;
  }
  if (kazanan >= 0) {
    d.oyuncular[kazanan].puan += 1;
  }
  d.gecmis.push({ hatalar: hatalar, kazanan: kazanan });
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
  if (d.oyuncular.length >= OYUNCU_SAYISI) {
    return 'Oda dolu (bu oyun 2 kişilik).';
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
  if (ayar.enAzKare !== undefined && !YOL_UZUNLUKLARI.includes(ayar.enAzKare)) {
    return 'Geçersiz yol uzunluğu.';
  }
  if (ayar.turSayisi !== undefined) {
    d.ayar.turSayisi = ayar.turSayisi;
  }
  if (ayar.enAzKare !== undefined) {
    d.ayar.enAzKare = ayar.enAzKare;
  }
  return null;
}

function baslatIsle(d, e) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d);
}

function tekrarOynaIsle(d, e) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Ayarlar kalır.
function yeniOyunIsle(d, e) {
  if (d.asama === 'lobi') {
    return 'Zaten lobidesin.';
  }
  if (e.id !== d.sahip) {
    return 'Sadece ev sahibi lobiye döndürür.';
  }
  d.asama = 'lobi';
  d.tur = 0;
  d.yollar = [];
  d.hazir = [];
  d.bulma = [];
  d.gecmis = [];
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  return null;
}

// Yolunu gönder ve hazır ol
function hazirIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'kurma') {
    return 'Şu an yol çizilmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  if (d.hazir[idx]) {
    return 'Zaten hazırsın.';
  }
  const sorun = yolHatasi(e.yol, d.ayar.enAzKare);
  if (sorun) {
    return sorun;
  }
  d.yollar[idx] = e.yol.map((k) => [k[0], k[1]]);
  d.hazir[idx] = true;
  if (herkesHazir(d)) {
    d.asama = 'bulma';
  }
  return null;
}

// Hazırım'dan vazgeç (rakip henüz hazır değilken yolu değiştirmek için)
function hazirIptalIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'kurma') {
    return 'Yol artık değişmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  d.yollar[idx] = null;
  d.hazir[idx] = false;
  return null;
}

// Rakibin yolunda bir kareye dokun
function kareIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'bulma') {
    return 'Şu an kare seçilmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  const ilerleme = d.bulma[idx];
  if (ilerleme.bitti) {
    return 'Yolu bitirdin.';
  }
  const uyari = kareUyarisi(d, idx, e.satir, e.sutun);
  if (uyari) {
    return uyari.hata;
  }

  const yol = d.yollar[rakipIndeks(idx)];
  const dogru = yol[ilerleme.bulunan];
  if (dogru[0] === e.satir && dogru[1] === e.sutun) {
    ilerleme.bulunan += 1;
    if (ilerleme.bulunan >= yol.length) {
      ilerleme.bitti = true;
    }
  } else {
    // Yanlış: kalıcı işaret, hata +1, başa dön
    ilerleme.yanlislar.push({ satir: e.satir, sutun: e.sutun, adim: ilerleme.bulunan });
    ilerleme.hata += 1;
    ilerleme.bulunan = 0;
  }

  if (herkesBitti(d)) {
    turuBitir(d);
  }
  return null;
}

// Pes et: yalnız 25 hataya ulaşınca. O tur 25 hata sayılır.
function pesIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'bulma') {
    return 'Şu an pes edilmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  const ilerleme = d.bulma[idx];
  if (ilerleme.bitti) {
    return 'Yolu bitirdin.';
  }
  if (ilerleme.hata < PES_HATASI) {
    return PES_HATASI + ' hataya ulaşınca pes edilebilir.';
  }
  ilerleme.hata = PES_HATASI;
  ilerleme.bulunan = 0;
  ilerleme.bitti = true;
  ilerleme.pes = true;
  if (herkesBitti(d)) {
    turuBitir(d);
  }
  return null;
}

// Sonraki tur. İki oyuncu aynı anda basarsa ikincisi zararsız geçer (tur eşleşmez ya da oyun çoktan bitti).
function sonrakiIsle(d, e) {
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
    return 'Şu an sonraki tura geçilmez.';
  }
  if (d.tur + 1 >= d.ayar.turSayisi) {
    d.asama = 'bitti';
    return null;
  }
  d.tur += 1;
  turuKur(d);
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  hazir: hazirIsle,
  hazirIptal: hazirIptalIsle,
  kare: kareIsle,
  pes: pesIsle,
  sonraki: sonrakiIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random) {
  const islem = HAREKETLER[eylem && eylem.tip];
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

// Biten oyunun kazananları (indeks listesi). Oyun bitmediyse boş; eşitlikte birden çok indeks gelir.
export function kazananlar(d) {
  if (d.asama !== 'bitti') {
    return [];
  }
  return oyunKazananlari(d);
}

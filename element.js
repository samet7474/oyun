// element.js - Saf "Element Düellosu" motoru (tam 2 kişi, aynı anda kapalı seçim yapılan kart oyunu).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'sec', id: oyuncuId, tur: 0, kartlar: ['ates-3'] }, rastgele);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Oyun: Üç element var: Ateş, Su, Toprak. Su ateşi söndürür, ateş toprağı yakar, toprak suyu emer.
// Herkesin kendi destesi var: her elementten 1-5 değerli birer kart (15) + 3 özel kart = 18 kart.
//   Ters Rüzgâr : bu tur yenme düzeni tersine döner. Bir element kartıyla birlikte oynanır.
//   Kalkan      : tek başına oynanır. O tur kimse puan almaz.
//   İkiye Katla : bir element kartıyla birlikte oynanır. O kart kazanırsa puan iki katı olur.
// Her turda iki oyuncu aynı anda kapalı seçim yapar. İkisi de kilitleyince kartlar açılır.
// Kazanan, kendi kartının değeri + rakip kartın değeri kadar puan alır.
//
// Kart numaraları: 'ates-3', 'su-1', 'toprak-5', 'ters', 'kalkan', 'ikiye'. Desteler ayrı olduğu için
// iki oyuncuda aynı numaralı kart olabilir; her biri kendi elinde ve kendi destesindedir.
//
// Aşamalar: lobi -> secim -> acik -> (secim -> acik) ... -> bitti
//   secim : iki oyuncu da kart seçiyor; "Oyna" ile kilitlenir
//   acik  : kartlar açık, tur sonucu görünür
//   bitti : oyun özeti
//
// Gizlilik: durum satırı herkese açıktır (bilinen sınır). Ekran yalnız gorunum() çıktısını kullanır:
// rakibin eli ve kilitli seçimi açılıştan önce o çıktıda yoktur.

import { oyuncuIndeks, temizAd, benzersizAd } from './uno.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const OYUNCU_SAYISI = 2;

export const ELEMENTLER = ['ates', 'su', 'toprak'];

export const ELEMENT_ADLARI = {
  ates: 'Ateş',
  su: 'Su',
  toprak: 'Toprak',
};

// Kim kimi yener: anahtar yenen, değer yenilen (su ateşi söndürür, ateş toprağı yakar, toprak suyu emer)
export const YENER = {
  su: 'ates',
  ates: 'toprak',
  toprak: 'su',
};

export const OZEL_KARTLAR = ['ters', 'kalkan', 'ikiye'];

export const OZEL_ADLARI = {
  ters: 'Ters Rüzgâr',
  kalkan: 'Kalkan',
  ikiye: 'İkiye Katla',
};

export const EN_KUCUK_DEGER = 1;
export const EN_BUYUK_DEGER = 5;

export const EL_BUYUKLUGU = 5;

export const HEDEFLER = [20, 30, 40];
export const VARSAYILAN_HEDEF = 30;

// ---------------------------------------------------------------------------
// Kart yardımcıları
// ---------------------------------------------------------------------------

// Bir kartın bilgisi: { tip: 'element', element, deger } | { tip: 'ters' | 'kalkan' | 'ikiye' } | null
export function kartBilgi(kartId) {
  if (typeof kartId !== 'string') {
    return null;
  }
  if (OZEL_KARTLAR.includes(kartId)) {
    return { tip: kartId };
  }
  const parcalar = kartId.split('-');
  if (parcalar.length !== 2 || !ELEMENTLER.includes(parcalar[0])) {
    return null;
  }
  const deger = Number(parcalar[1]);
  if (!Number.isInteger(deger) || deger < EN_KUCUK_DEGER || deger > EN_BUYUK_DEGER) {
    return null;
  }
  return { tip: 'element', element: parcalar[0], deger: deger };
}

export function kartAdi(kartId) {
  const bilgi = kartBilgi(kartId);
  if (!bilgi) {
    return '';
  }
  if (bilgi.tip === 'element') {
    return ELEMENT_ADLARI[bilgi.element] + ' ' + bilgi.deger;
  }
  return OZEL_ADLARI[bilgi.tip];
}

// Karıştırılmamış tam deste: 15 element kartı + 3 özel kart = 18
export function tamDeste() {
  const deste = [];
  for (const element of ELEMENTLER) {
    for (let deger = EN_KUCUK_DEGER; deger <= EN_BUYUK_DEGER; deger++) {
      deste.push(element + '-' + deger);
    }
  }
  for (const ozel of OZEL_KARTLAR) {
    deste.push(ozel);
  }
  return deste;
}

// Fisher-Yates karıştırma. Rastgelelik dışarıdan gelir (testte sabitlenebilir).
function karistir(liste, rastgele) {
  const kopya = liste.slice();
  for (let i = kopya.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    const gecici = kopya[i];
    kopya[i] = kopya[j];
    kopya[j] = gecici;
  }
  return kopya;
}

export function desteKur(rastgele = Math.random) {
  return karistir(tamDeste(), rastgele);
}

// Elin ekranda düzgün durması için sıralaması: önce elementler (ateş, su, toprak, küçükten büyüğe), sonra özel kartlar
export function elSirala(el) {
  const sira = (kartId) => {
    const bilgi = kartBilgi(kartId);
    if (!bilgi) {
      return 1000;
    }
    if (bilgi.tip === 'element') {
      return ELEMENTLER.indexOf(bilgi.element) * 10 + bilgi.deger;
    }
    return 100 + OZEL_KARTLAR.indexOf(bilgi.tip);
  };
  return el.slice().sort((a, b) => sira(a) - sira(b));
}

// ---------------------------------------------------------------------------
// Seçim kuralları ve tur çözümü (saf yardımcılar)
// ---------------------------------------------------------------------------

// Bir seçim geçerli mi? Hata mesajı ya da null.
//   el: oyuncunun elindeki kart numaraları, kartlar: seçtiği kart numaraları
export function secimHatasi(el, kartlar) {
  if (!Array.isArray(kartlar) || kartlar.length === 0) {
    return 'Önce bir kart seç.';
  }
  if (kartlar.length > 2) {
    return 'En fazla iki kart oynanır.';
  }
  if (new Set(kartlar).size !== kartlar.length) {
    return 'Aynı kartı iki kez seçemezsin.';
  }
  const bilgiler = [];
  for (const kartId of kartlar) {
    const bilgi = kartBilgi(kartId);
    if (!bilgi) {
      return 'Bilinmeyen kart.';
    }
    if (!el.includes(kartId)) {
      return 'Bu kart elinde yok.';
    }
    bilgiler.push(bilgi);
  }
  const elementSayisi = bilgiler.filter((b) => b.tip === 'element').length;
  const ozelSayisi = bilgiler.length - elementSayisi;

  if (ozelSayisi > 1) {
    return 'Bir turda en fazla bir özel kart oynanır.';
  }
  if (bilgiler.length === 1) {
    if (bilgiler[0].tip === 'ters') {
      return 'Ters Rüzgâr tek başına oynanmaz. Yanına bir element kartı seç.';
    }
    if (bilgiler[0].tip === 'ikiye') {
      return 'İkiye Katla tek başına oynanmaz. Yanına bir element kartı seç.';
    }
    return null; // tek element kartı ya da Kalkan
  }
  // İki kart: bir element + bir özel kart
  if (elementSayisi !== 1) {
    return 'İki element kartı birlikte oynanmaz.';
  }
  if (bilgiler.some((b) => b.tip === 'kalkan')) {
    return 'Kalkan tek başına oynanır.';
  }
  return null;
}

// Bir seçimi ayrıştırır. kartlar boşsa oyuncunun oynayacak kartı yok demektir.
export function oyunAyristir(kartlar) {
  const oyun = {
    kartlar: kartlar.slice(),
    bos: kartlar.length === 0,
    kalkan: false,
    ters: false,
    ikiye: false,
    element: null,
    deger: 0,
  };
  for (const kartId of kartlar) {
    const bilgi = kartBilgi(kartId);
    if (!bilgi) {
      continue;
    }
    if (bilgi.tip === 'element') {
      oyun.element = bilgi.element;
      oyun.deger = bilgi.deger;
    } else if (bilgi.tip === 'kalkan') {
      oyun.kalkan = true;
    } else if (bilgi.tip === 'ters') {
      oyun.ters = true;
    } else if (bilgi.tip === 'ikiye') {
      oyun.ikiye = true;
    }
  }
  return oyun;
}

// a elementi b elementini yener mi? (normal düzen)
export function yenerMi(a, b) {
  return YENER[a] === b;
}

// İki seçimi karşılaştırır. { kazanan: 0 | 1 | -1, puan, neden, tersEtkili, ikiyeEtkili }
//   neden: kalkan | rakipYok | element | deger | berabere
export function turuCoz(a, b) {
  const ters = a.ters !== b.ters; // iki ters birbirini götürür
  const sonuc = { kazanan: -1, puan: 0, neden: 'berabere', tersEtkili: ters, ikiyeEtkili: false };

  if (a.kalkan || b.kalkan) {
    sonuc.neden = 'kalkan';
    sonuc.tersEtkili = false;
    return sonuc;
  }
  if (a.bos || b.bos) {
    sonuc.neden = 'rakipYok';
    sonuc.tersEtkili = false;
    return sonuc;
  }

  let kazanan = -1;
  if (a.element !== b.element) {
    sonuc.neden = 'element';
    const aYener = ters ? yenerMi(b.element, a.element) : yenerMi(a.element, b.element);
    kazanan = aYener ? 0 : 1;
  } else if (a.deger !== b.deger) {
    sonuc.neden = 'deger';
    sonuc.tersEtkili = false; // aynı elementte yenme döngüsü işlemez, büyük değer kazanır
    kazanan = a.deger > b.deger ? 0 : 1;
  } else {
    sonuc.tersEtkili = false;
    return sonuc; // berabere
  }

  const kazananOyun = kazanan === 0 ? a : b;
  let puan = a.deger + b.deger;
  if (kazananOyun.ikiye) {
    puan *= 2;
    sonuc.ikiyeEtkili = true;
  }
  sonuc.kazanan = kazanan;
  sonuc.puan = puan;
  return sonuc;
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
    oyun: 'element',
    asama: 'lobi', // lobi | secim | acik | bitti
    sahip: sahipId,
    ayar: {
      hedef: VARSAYILAN_HEDEF,
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    tur: 0, // şu anki turun indeksi
    desteler: [], // oyuncu i'nin çekme destesi (kalan kartlar, üstteki başta)
    eller: [], // oyuncu i'nin eli
    atilanlar: [], // oyuncu i'nin atılan kartları
    secimler: [], // oyuncu i'nin kilitlediği seçim: { kartlar: [...] } ya da null
    gecmis: [], // biten turlar: { tur, kartlar: [[...], [...]], kazanan, puan, neden, tersEtkili, ikiyeEtkili }
    bitisNedeni: null, // null | 'hedef' | 'eller' (son tur açıkken oyunun biteceğini söyler)
  };
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

export function rakipIndeks(i) {
  return 1 - i;
}

// Eldeki kartlarla oynanabilecek bir hamle var mı? (bir element kartı ya da Kalkan)
export function oynayabilirMi(el) {
  return el.some((kartId) => {
    const bilgi = kartBilgi(kartId);
    return bilgi && (bilgi.tip === 'element' || bilgi.tip === 'kalkan');
  });
}

// Oyuncunun bu tur kilitli seçimi var mı?
export function kilitliMi(d, i) {
  return Boolean(d.secimler && d.secimler[i]);
}

// Oyunu en çok puanı olanlar (indeksler). Eşitse ikisi de.
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

// Ekranın kullanacağı GİZLİLİĞE UYGUN görünüm: ben kimim ise onun gözünden.
// Rakibin eli ve kilitli seçimi, kartlar açılmadan önce bu çıktıda YOKTUR (yalnız sayılar ve "seçti" bilgisi).
export function gorunum(d, ben) {
  const rakip = rakipIndeks(ben);
  const acik = d.asama === 'acik' || d.asama === 'bitti';
  const benimSecim = d.secimler && d.secimler[ben] ? d.secimler[ben].kartlar.slice() : null;
  let rakipSecim = null;
  if (acik && d.secimler && d.secimler[rakip]) {
    rakipSecim = d.secimler[rakip].kartlar.slice();
  }
  return {
    benim: {
      el: d.eller[ben] ? elSirala(d.eller[ben]) : [],
      desteSayisi: d.desteler[ben] ? d.desteler[ben].length : 0,
      secim: benimSecim,
      kilitli: benimSecim !== null,
    },
    rakip: {
      elSayisi: d.eller[rakip] ? d.eller[rakip].length : 0,
      desteSayisi: d.desteler[rakip] ? d.desteler[rakip].length : 0,
      kilitli: Boolean(d.secimler && d.secimler[rakip]),
      secim: rakipSecim, // açılıştan önce hep null
    },
  };
}

// ---------------------------------------------------------------------------
// Tur kurma ve bitirme
// ---------------------------------------------------------------------------

// Elini 5'e tamamlar (deste bitmişse tamamlamaz)
function elTamamla(d, i) {
  while (d.eller[i].length < EL_BUYUKLUGU && d.desteler[i].length > 0) {
    d.eller[i].push(d.desteler[i].shift());
  }
}

// Yeni tura geç: seçimler boşalır. Oynayacak kartı olmayan oyuncu kendiliğinden boş seçimle kilitlenir.
function turuKur(d) {
  d.asama = 'secim';
  d.secimler = d.oyuncular.map((o, i) => (oynayabilirMi(d.eller[i]) ? null : { kartlar: [] }));
}

// Oyunu sıfırdan kurar: puanlar sıfırlanır, desteler karışır, herkes 5 kart çeker. Hata mesajı ya da null.
function oyunuKur(d, rastgele) {
  if (d.oyuncular.length !== OYUNCU_SAYISI) {
    return 'Bu oyun tam ' + OYUNCU_SAYISI + ' kişiyle oynanır.';
  }
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  d.desteler = d.oyuncular.map(() => desteKur(rastgele));
  d.eller = d.oyuncular.map(() => []);
  d.atilanlar = d.oyuncular.map(() => []);
  d.gecmis = [];
  d.tur = 0;
  d.bitisNedeni = null;
  d.oyuncular.forEach((o, i) => elTamamla(d, i));
  turuKur(d);
  return null;
}

// İki oyuncu da kilitledi: kartlar açılır, puan işlenir, kartlar atılır, eller tamamlanır
function turuBitir(d) {
  const oyunlar = d.secimler.map((s) => oyunAyristir(s.kartlar));
  const sonuc = turuCoz(oyunlar[0], oyunlar[1]);

  if (sonuc.kazanan >= 0) {
    d.oyuncular[sonuc.kazanan].puan += sonuc.puan;
  }
  d.gecmis.push({
    tur: d.tur,
    kartlar: d.secimler.map((s) => s.kartlar.slice()),
    kazanan: sonuc.kazanan,
    puan: sonuc.puan,
    neden: sonuc.neden,
    tersEtkili: sonuc.tersEtkili,
    ikiyeEtkili: sonuc.ikiyeEtkili,
  });

  // Oynanan kartlar elden çıkıp atılır
  d.oyuncular.forEach((o, i) => {
    for (const kartId of d.secimler[i].kartlar) {
      const yer = d.eller[i].indexOf(kartId);
      if (yer >= 0) {
        d.eller[i].splice(yer, 1);
        d.atilanlar[i].push(kartId);
      }
    }
    elTamamla(d, i);
  });

  // Oyun bitiyor mu?
  d.bitisNedeni = null;
  if (d.oyuncular.some((o) => o.puan >= d.ayar.hedef)) {
    d.bitisNedeni = 'hedef';
  } else if (d.eller.every((el) => !oynayabilirMi(el))) {
    d.bitisNedeni = 'eller';
  }
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
  if (ayar.hedef !== undefined && !HEDEFLER.includes(ayar.hedef)) {
    return 'Geçersiz hedef puan.';
  }
  if (ayar.hedef !== undefined) {
    d.ayar.hedef = ayar.hedef;
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
  return oyunuKur(d, rastgele);
}

function tekrarOynaIsle(d, e, rastgele) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, rastgele);
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
  d.desteler = [];
  d.eller = [];
  d.atilanlar = [];
  d.secimler = [];
  d.gecmis = [];
  d.bitisNedeni = null;
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  return null;
}

// Seçimini kilitle. Kilitlenen seçim geri alınmaz. İkisi de kilitleyince kartlar açılır.
function secIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'secim') {
    return 'Şu an kart seçilmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  if (d.secimler[idx]) {
    return 'Zaten seçtin.';
  }
  const sorun = secimHatasi(d.eller[idx], e.kartlar);
  if (sorun) {
    return sorun;
  }
  d.secimler[idx] = { kartlar: e.kartlar.slice() };
  if (d.secimler.every(Boolean)) {
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
  if (d.bitisNedeni) {
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
  sec: secIsle,
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

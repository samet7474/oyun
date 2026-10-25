// tanis.js - Saf "Beni ne kadar tanıyorsun" motoru (iki kişilik).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'cevapla', id: oyuncuId, tur: 0, kendi: 1, tahmin: 2 }, rastgele);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik: karıştırma fonksiyonu (0 <= x < 1) dışarıdan verilir.
// Soru bankası da dışarıdan verilebilir (4. parametre); testler küçük bir banka kullanır.
//
// Aşamalar: lobi -> cevap -> acik -> (cevap -> acik) ... -> bitti
//   cevap : iki oyuncu da soruya cevap veriyor (kendi cevabı + eşinin cevabı tahmini)
//   acik  : ikisi de cevapladı, sonuç görünüyor
//   bitti : son sorudan sonra özet

import { karistir, oyuncuIndeks, temizAd, benzersizAd } from './uno.js';
import { KATEGORILER, SORULAR } from './sorular.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const VARSAYILAN_BANKA = { kategoriler: KATEGORILER, sorular: SORULAR };

// Lobide en fazla 4 kişi durabilir (UNO'ya geçilebilsin diye); oyun tam 2 kişiyle başlar.
export const MAKS_OYUNCU = 4;
export const OYUN_KISI = 2;

export const SORU_SAYILARI = [5, 10, 15];
export const VARSAYILAN_SORU_SAYISI = 10;

// Oyuncunun kendi yazdığı sorular
export const MAKS_OZEL = 50;
export const MAKS_SORU_HARF = 70;
export const MAKS_SECENEK_HARF = 28;
export const EN_AZ_SECENEK = 2;
export const EN_COK_SECENEK = 4;

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad, puan: 0, ozel: [] };
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId, banka = VARSAYILAN_BANKA) {
  return {
    oyun: 'tanis',
    asama: 'lobi', // lobi | cevap | acik | bitti
    sahip: sahipId,
    ayar: {
      soruSayisi: VARSAYILAN_SORU_SAYISI,
      konular: banka.kategoriler.map((kategori) => kategori.id),
      ozel: true, // kendi sorularımız da gelsin
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    sorular: [], // bu oyunun soruları (tam içerikle)
    cevaplar: [], // sorular[t] için [oyuncu0, oyuncu1]; her biri null ya da { kendi, tahmin }
    tur: 0, // şu anki sorunun indeksi
    sorulanlar: [], // bu odada sorulmuş soru id'leri (Tekrar oyna'da korunur)
  };
}

export function yeniOda(sahipId, sahipAd, banka = VARSAYILAN_BANKA) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId, banka);
}

// ---------------------------------------------------------------------------
// Kendi sorularımız ("Sorularım")
// ---------------------------------------------------------------------------

function metinTemizle(metin) {
  const ham = metin === undefined || metin === null ? '' : String(metin);
  return ham.replace(/\s+/g, ' ').trim();
}

const OZEL_ID_DESENI = /^ozel-[a-z0-9]{4,24}$/;

// Yeni bir kendi-soru id'si: ozel-k3j9x0a1bc
export function ozelIdUret(rastgele = Math.random) {
  const harfler = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'ozel-';
  for (let i = 0; i < 10; i++) {
    id += harfler[Math.floor(rastgele() * harfler.length)];
  }
  return id;
}

// Soru ve seçenekler uygun mu? Hata mesajı ya da null.
export function ozelSoruHatasi(soru, secenekler) {
  const metin = metinTemizle(soru);
  if (metin === '') {
    return 'Sorunu yaz.';
  }
  if (metin.length > MAKS_SORU_HARF) {
    return 'Soru en fazla ' + MAKS_SORU_HARF + ' harf olabilir.';
  }
  if (!Array.isArray(secenekler) || secenekler.length < EN_AZ_SECENEK) {
    return 'En az ' + EN_AZ_SECENEK + ' seçenek yaz.';
  }
  if (secenekler.length > EN_COK_SECENEK) {
    return 'En fazla ' + EN_COK_SECENEK + ' seçenek olur.';
  }
  const gorulen = new Set();
  for (const ham of secenekler) {
    const secenek = metinTemizle(ham);
    if (secenek === '') {
      return 'Boş seçenek olmaz.';
    }
    if (secenek.length > MAKS_SECENEK_HARF) {
      return 'Seçenek en fazla ' + MAKS_SECENEK_HARF + ' harf olabilir.';
    }
    const anahtar = secenek.toLocaleLowerCase('tr');
    if (gorulen.has(anahtar)) {
      return 'Aynı seçenek iki kez olmaz.';
    }
    gorulen.add(anahtar);
  }
  return null;
}

// Listeyi temizler: bozuk olanları atar, boşlukları düzeltir, en çok MAKS_OZEL tutar.
// Temizlenmiş liste tekrar temizlenirse aynı kalır.
export function ozelTemizle(liste) {
  if (!Array.isArray(liste)) {
    return [];
  }
  const gorulen = new Set();
  const sonuc = [];
  for (const q of liste) {
    if (!q || typeof q !== 'object') {
      continue;
    }
    if (typeof q.id !== 'string' || !OZEL_ID_DESENI.test(q.id) || gorulen.has(q.id)) {
      continue;
    }
    const secenekler = Array.isArray(q.secenekler) ? q.secenekler.map(metinTemizle) : [];
    if (ozelSoruHatasi(q.soru, secenekler)) {
      continue;
    }
    gorulen.add(q.id);
    sonuc.push({ id: q.id, soru: metinTemizle(q.soru), secenekler: secenekler });
    if (sonuc.length >= MAKS_OZEL) {
      break;
    }
  }
  return sonuc;
}

// İki listeyi karşılaştırmak için düz yazı. (Veritabanı nesne anahtar sırasını değiştirebilir,
// o yüzden JSON.stringify ile karşılaştırılmaz.)
export function ozelAnahtar(liste) {
  return (liste || [])
    .map((q) => q.id + '\u0001' + q.soru + '\u0001' + q.secenekler.join('\u0002'))
    .join('\u0003');
}

// ---------------------------------------------------------------------------
// Soru seçimi
// ---------------------------------------------------------------------------

// Her oyuncunun kendi listesi ayrı döner (adil pay için). Aynı id iki kez gelmez.
function ozelListeleri(d) {
  const gorulen = new Set();
  return d.oyuncular.map((o, i) => {
    const liste = [];
    for (const q of o.ozel || []) {
      if (gorulen.has(q.id)) {
        continue;
      }
      gorulen.add(q.id);
      liste.push({ id: q.id, kategori: 'ozel', soru: q.soru, secenekler: q.secenekler.slice(), yazar: i });
    }
    return liste;
  });
}

function hazirListe(d, banka) {
  return banka.sorular
    .filter((q) => d.ayar.konular.includes(q.kategori))
    .map((q) => ({ id: q.id, kategori: q.kategori, soru: q.soru, secenekler: q.secenekler.slice(), yazar: null }));
}

// Önce kendi sorular (iki oyuncudan yarı yarıya, karışık), sonra hazır sorular. Karışık seçer.
// atla: sorulmuş sayılan id'ler (Set).
function sirayla(ozel, hazir, sayi, atla, rastgele) {
  const kota = Math.ceil(sayi / 2);
  let ozelSecilen = [];
  let ozelYedek = [];
  for (const liste of ozel) {
    const taze = karistir(
      liste.filter((q) => !atla.has(q.id)),
      rastgele
    );
    ozelSecilen = ozelSecilen.concat(taze.slice(0, kota));
    ozelYedek = ozelYedek.concat(taze.slice(kota));
  }
  if (ozelSecilen.length < sayi) {
    ozelSecilen = ozelSecilen.concat(karistir(ozelYedek, rastgele).slice(0, sayi - ozelSecilen.length));
  }
  ozelSecilen = karistir(ozelSecilen, rastgele).slice(0, sayi);

  const kalan = sayi - ozelSecilen.length;
  const hazirTaze = hazir.filter((q) => !atla.has(q.id));
  const hazirSecilen = karistir(hazirTaze, rastgele).slice(0, kalan);
  return ozelSecilen.concat(hazirSecilen);
}

// Oyunun sorularını seçer. Havuz biterse sorulanlar sıfırlanır ve kalan yerler doldurulur.
function soruSec(d, banka, rastgele) {
  const sayi = d.ayar.soruSayisi;
  const ozel = d.ayar.ozel ? ozelListeleri(d) : [];
  const hazir = hazirListe(d, banka);

  let sorulanlar = d.sorulanlar.slice();
  let secilen = sirayla(ozel, hazir, sayi, new Set(sorulanlar), rastgele);

  if (secilen.length < sayi) {
    // Havuz bitti: yeni tur başlasın
    sorulanlar = [];
    const simdiki = new Set(secilen.map((q) => q.id));
    const ek = sirayla(ozel, hazir, sayi - secilen.length, simdiki, rastgele);
    secilen = secilen.concat(ek);
  }
  return {
    sorular: secilen,
    sorulanlar: sorulanlar.concat(secilen.map((q) => q.id)),
  };
}

// Sorular seçilir, puanlar sıfırlanır, ilk soru açılır. Hata mesajı ya da null.
function oyunuKur(d, banka, rastgele) {
  if (d.oyuncular.length !== OYUN_KISI) {
    return 'Bu oyun iki kişilik.';
  }
  const secim = soruSec(d, banka, rastgele);
  if (secim.sorular.length === 0) {
    return 'Seçtiğin konularda soru yok. Başka konu aç ya da kendi sorunu ekle.';
  }
  d.sorular = secim.sorular;
  d.sorulanlar = secim.sorulanlar;
  d.cevaplar = secim.sorular.map(() => [null, null]);
  d.tur = 0;
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  d.asama = 'cevap';
  return null;
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

// Bir sorunun sonucu. İki oyuncu da cevaplamadıysa null.
//   kendi[i]  : i. oyuncunun kendi cevabı
//   tahmin[i] : i. oyuncunun eşi için tahmini
//   dogru[i]  : i. oyuncunun tahmini doğru mu
//   ayni      : iki kendi cevap aynı mı
export function turSonucu(d, t) {
  const c = d.cevaplar[t];
  if (!c || !c[0] || !c[1]) {
    return null;
  }
  return {
    kendi: [c[0].kendi, c[1].kendi],
    tahmin: [c[0].tahmin, c[1].tahmin],
    dogru: [c[0].tahmin === c[1].kendi, c[1].tahmin === c[0].kendi],
    ayni: c[0].kendi === c[1].kendi,
  };
}

// Uyum yüzdesi: doğru tahminler / (2 x soru sayısı)
export function uyumYuzdesi(d) {
  const soruSayisi = d.sorular.length;
  if (soruSayisi === 0) {
    return 0;
  }
  const toplam = d.oyuncular.reduce((t, o) => t + o.puan, 0);
  return Math.round((100 * toplam) / (2 * soruSayisi));
}

export function uyumEtiketi(yuzde) {
  if (yuzde >= 80) {
    return 'Birbirinizi ezbere biliyorsunuz';
  }
  if (yuzde >= 50) {
    return 'Epey iyi tanıyorsunuz';
  }
  if (yuzde >= 25) {
    return 'Daha konuşacak çok şey var';
  }
  return 'Tanışmaya yeni başlıyorsunuz';
}

// En az bir tahminin yanlış çıktığı sorular: konuşmaya değer olanlar
export function konusulacaklar(d) {
  const liste = [];
  d.sorular.forEach((soru, t) => {
    const sonuc = turSonucu(d, t);
    if (sonuc && (!sonuc.dogru[0] || !sonuc.dogru[1])) {
      liste.push({ tur: t, soru: soru, kendi: sonuc.kendi, dogru: sonuc.dogru });
    }
  });
  return liste;
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

function ayarlaIsle(d, e, rastgele, banka) {
  if (d.asama !== 'lobi') {
    return 'Ayar sadece oyun başlamadan değişir.';
  }
  if (e.id !== d.sahip) {
    return 'Ayarı sadece ev sahibi değiştirir.';
  }
  const ayar = e.ayar || {};
  if (ayar.soruSayisi !== undefined && !SORU_SAYILARI.includes(ayar.soruSayisi)) {
    return 'Geçersiz soru sayısı.';
  }
  let konular = null;
  if (ayar.konular !== undefined) {
    const tum = banka.kategoriler.map((kategori) => kategori.id);
    if (!Array.isArray(ayar.konular) || ayar.konular.some((id) => !tum.includes(id))) {
      return 'Geçersiz konu.';
    }
    // Bankadaki sırayla, tekrarsız
    konular = tum.filter((id) => ayar.konular.includes(id));
    if (konular.length === 0) {
      return 'En az bir konu açık kalmalı.';
    }
  }
  if (ayar.soruSayisi !== undefined) {
    d.ayar.soruSayisi = ayar.soruSayisi;
  }
  if (konular) {
    d.ayar.konular = konular;
  }
  if (ayar.ozel !== undefined) {
    d.ayar.ozel = Boolean(ayar.ozel);
  }
  return null;
}

// Oyuncu kendi sorularını odaya bildirir (yalnız lobide, yalnız kendi listesi).
function ozelSorularIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'lobi') {
    return 'Sorular sadece lobide güncellenir.';
  }
  if (!Array.isArray(e.sorular)) {
    return 'Soru listesi geçersiz.';
  }
  d.oyuncular[idx].ozel = ozelTemizle(e.sorular);
  return null;
}

function baslatIsle(d, e, rastgele, banka) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, banka, rastgele);
}

function tekrarOynaIsle(d, e, rastgele, banka) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, banka, rastgele);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Ayarlar ve sorulanlar kalır.
function yeniOyunIsle(d, e) {
  if (d.asama === 'lobi') {
    return 'Zaten lobidesin.';
  }
  if (e.id !== d.sahip) {
    return 'Sadece ev sahibi lobiye döndürür.';
  }
  d.asama = 'lobi';
  d.sorular = [];
  d.cevaplar = [];
  d.tur = 0;
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  return null;
}

function secenekGecerli(soru, secenek) {
  return Number.isInteger(secenek) && secenek >= 0 && secenek < soru.secenekler.length;
}

// Herkes kendi cevabını ve eşinin cevabı için tahminini tek seferde gönderir.
function cevaplaIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'cevap') {
    return 'Şu an cevap verilmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu soru geçti.';
  }
  const soru = d.sorular[d.tur];
  if (!secenekGecerli(soru, e.kendi) || !secenekGecerli(soru, e.tahmin)) {
    return 'Önce iki cevabı da seç.';
  }
  const onceki = d.cevaplar[d.tur][idx];
  if (onceki) {
    // Aynı cevap tekrar gelirse (bağlantı koptu, yeniden denendi) sorun yok
    if (onceki.kendi === e.kendi && onceki.tahmin === e.tahmin) {
      return null;
    }
    return 'Zaten cevapladın.';
  }
  d.cevaplar[d.tur][idx] = { kendi: e.kendi, tahmin: e.tahmin };

  const esinKaydi = d.cevaplar[d.tur][1 - idx];
  if (esinKaydi) {
    // İkisi de cevapladı: puanla ve sonucu aç
    d.oyuncular.forEach((o, i) => {
      const benimTahminim = d.cevaplar[d.tur][i].tahmin;
      const esinCevabi = d.cevaplar[d.tur][1 - i].kendi;
      if (benimTahminim === esinCevabi) {
        o.puan += 1;
      }
    });
    d.asama = 'acik';
  }
  return null;
}

// Sonraki soru. İki oyuncu aynı anda basarsa ikincisi zararsız geçer (tur eşleşmez).
function sonrakiIsle(d, e) {
  if (oyuncuIndeks(d, e.id) < 0) {
    return 'Bu odada değilsin.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return null;
  }
  if (d.asama !== 'acik') {
    return 'Şu an sonraki soruya geçilmez.';
  }
  if (d.tur + 1 >= d.sorular.length) {
    d.asama = 'bitti';
  } else {
    d.tur += 1;
    d.asama = 'cevap';
  }
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  ozelSorular: ozelSorularIsle,
  baslat: baslatIsle,
  cevapla: cevaplaIsle,
  sonraki: sonrakiIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random, banka = VARSAYILAN_BANKA) {
  const islem = HAREKETLER[eylem && eylem.tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  const hata = islem(d, eylem, rastgele, banka);
  if (hata) {
    return { ok: false, hata: hata };
  }
  return { ok: true, durum: d };
}

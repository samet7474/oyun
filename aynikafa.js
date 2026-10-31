// aynikafa.js - Saf "Aynı Kafa" motoru (2-4 kişi, birlikte oynanan oyun).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'cevapla', id: oyuncuId, tur: 0, cevap: 'elma' }, rastgele, ipuclari);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik: karıştırma için kullanılan fonksiyon (0 <= x < 1) dışarıdan verilir.
// İpucu listesi de dışarıdan verilebilir (4. parametre); testler küçük bir liste kullanır.
//
// Oyun: herkese aynı ipucu gelir, herkes cevabını gizlice yazar, hepsi gönderince cevaplar açılır.
// Aynı cevabı veren her ikili takıma 1 puan getirir. Puan takımın ortak puanıdır.
//
// Aşamalar: lobi -> soru -> acik -> (soru -> acik) ... -> bitti
//   soru  : herkes cevabını yazıyor (gönderilen cevap açılmadan önce değiştirilebilir)
//   acik  : herkes gönderdi, cevaplar ve eşleşmeler görünüyor
//   bitti : son ipucundan sonra özet
//
// Durum alanları (cevap ve eşleşmeler tur numarasıyla tutulur):
//   ipuclari[t]    : t. turun ipucu (oyun başlarken hepsi seçilir)
//   cevaplar[t][i] : i. oyuncunun cevabı, henüz göndermediyse null
//   sayilanlar[t]  : "Bunlar aynı sayılsın" denen ikililer, '0-2' biçiminde (küçük indeks önce)

import { oyuncuIndeks, temizAd, benzersizAd, karistir } from './uno.js';
import { IPUCLARI } from './aynikafa-ipuclari.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const VARSAYILAN_IPUCLARI = IPUCLARI;

export const EN_AZ_OYUNCU = 2;
export const MAKS_OYUNCU = 4;

export const TUR_SAYILARI = [5, 10, 15];
export const VARSAYILAN_TUR_SAYISI = 10;

export const MAKS_CEVAP_HARF = 30;

// ---------------------------------------------------------------------------
// Cevap metni
// ---------------------------------------------------------------------------

// Görünen cevap: baş/son boşluk gider, araya giren boşluklar teke iner.
export function cevapTemizle(ham) {
  const metin = ham === undefined || ham === null ? '' : String(ham);
  return metin.replace(/\s+/g, ' ').trim();
}

// Karşılaştırma anahtarı: iki cevap bu anahtarla aynıysa "aynı" sayılır.
//   büyük/küçük harf yok sayılır (Türkçe kurallarıyla: İ -> i, I -> ı)
//   Türkçe harf farkı yok sayılır (ş/s, ç/c, ğ/g, ü/u, ö/o, ı/i)
//   noktalama yok sayılır, baş/son boşluk yok sayılır
export function cevapAnahtari(ham) {
  const metin = ham === undefined || ham === null ? '' : String(ham);
  let anahtar = metin.normalize('NFC').toLocaleLowerCase('tr-TR');
  anahtar = anahtar.replace(/ı/g, 'i');
  // Harf + aksan işaretine ayır, işaretleri at (ş -> s, ğ -> g ...)
  anahtar = anahtar.normalize('NFD').replace(/\p{M}/gu, '');
  // Harf, rakam ve boşluk dışındakileri (noktalama, simge) at
  anahtar = anahtar.replace(/[^\p{L}\p{N}\s]/gu, '');
  return anahtar.replace(/\s+/g, ' ').trim();
}

// Cevap gönderilebilir mi? Hata mesajı ya da null.
export function cevapHatasi(ham) {
  const cevap = cevapTemizle(ham);
  if (cevap === '') {
    return 'Boş cevap gönderilemez.';
  }
  if ([...cevap].length > MAKS_CEVAP_HARF) {
    return 'Cevap en fazla ' + MAKS_CEVAP_HARF + ' harf olabilir.';
  }
  if (cevapAnahtari(cevap) === '') {
    return 'Cevapta harf ya da rakam olmalı.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad };
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  return {
    oyun: 'aynikafa',
    asama: 'lobi', // lobi | soru | acik | bitti
    sahip: sahipId,
    ayar: {
      turSayisi: VARSAYILAN_TUR_SAYISI,
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    tur: 0, // şu anki ipucunun indeksi
    ipuclari: [], // bu oyunun ipuçları, sırayla
    cevaplar: [], // cevaplar[tur][oyuncu]: cevap metni ya da null
    sayilanlar: [], // sayilanlar[tur]: elle "aynı sayılsın" denen ikililer
    kullanilanlar: [], // bu odada sorulmuş ipuçları (Tekrar oyna'da korunur)
  };
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

// Bir ikilinin anahtarı: küçük indeks önce
export function ciftAnahtari(a, b) {
  return Math.min(a, b) + '-' + Math.max(a, b);
}

// n kişide ikili sayısı (bir turda alınabilecek en çok puan)
export function ciftSayisi(n) {
  return (n * (n - 1)) / 2;
}

// t. turun cevapları açıldı mı (oyun o turu geçmiş ya da açmış mı)
export function turAcildi(d, t) {
  if (t < 0 || t >= d.cevaplar.length) {
    return false;
  }
  if (t < d.tur) {
    return true;
  }
  return t === d.tur && (d.asama === 'acik' || d.asama === 'bitti');
}

// Bu turda kimler cevap gönderdi (yalnız evet/hayır, cevap metni değil)
export function gonderenler(d, t) {
  const liste = d.cevaplar[t] || [];
  return d.oyuncular.map((o, i) => liste[i] !== null && liste[i] !== undefined);
}

export function herkesGonderdi(d, t) {
  return gonderenler(d, t).every((evet) => evet);
}

// t. turdaki bütün ikililer ve durumları.
//   durum: 'ayni' (cevaplar aynı), 'oy' (elle aynı sayıldı), 'yok' (eşleşmedi)
export function turCiftleri(d, t) {
  const cevaplar = d.cevaplar[t] || [];
  const oylar = (d.sayilanlar && d.sayilanlar[t]) || [];
  const liste = [];
  for (let a = 0; a < d.oyuncular.length; a++) {
    for (let b = a + 1; b < d.oyuncular.length; b++) {
      const anahtar = ciftAnahtari(a, b);
      let durum = 'yok';
      const ca = cevaplar[a];
      const cb = cevaplar[b];
      if (typeof ca === 'string' && typeof cb === 'string' && cevapAnahtari(ca) === cevapAnahtari(cb)) {
        durum = 'ayni';
      } else if (oylar.includes(anahtar)) {
        durum = 'oy';
      }
      liste.push({ a: a, b: b, anahtar: anahtar, durum: durum });
    }
  }
  return liste;
}

// t. turda kazanılan puan (açılmamış turda 0)
export function turPuani(d, t) {
  if (!turAcildi(d, t)) {
    return 0;
  }
  return turCiftleri(d, t).filter((c) => c.durum !== 'yok').length;
}

// Takımın toplam puanı (açılmış turların toplamı)
export function toplamPuan(d) {
  let toplam = 0;
  for (let t = 0; t < d.cevaplar.length; t++) {
    toplam += turPuani(d, t);
  }
  return toplam;
}

// Şimdiye kadar açılan turlarda alınabilecek en çok puan
export function enFazlaPuan(d) {
  let acilan = 0;
  for (let t = 0; t < d.cevaplar.length; t++) {
    if (turAcildi(d, t)) {
      acilan += 1;
    }
  }
  return acilan * ciftSayisi(d.oyuncular.length);
}

// Uyum yüzdesi: kazanılan / alınabilecek en çok puan (0-100, yuvarlanmış)
export function uyumYuzdesi(d) {
  const enFazla = enFazlaPuan(d);
  if (enFazla === 0) {
    return 0;
  }
  return Math.round((toplamPuan(d) / enFazla) * 100);
}

export function uyumEtiketi(yuzde) {
  if (yuzde >= 80) {
    return 'Aynı kafadasınız!';
  }
  if (yuzde >= 50) {
    return 'Epey benzer düşünüyorsunuz';
  }
  if (yuzde >= 25) {
    return 'Biraz yaklaştınız';
  }
  return 'Daha yeni ısınıyorsunuz';
}

// t. turda eşleşen oyuncuları gruplara ayırır: grup[i] = grup numarası ya da -1 (kimseyle eşleşmedi).
// Eşleşen ikililer aynı grupta olur (A-B ve B-C eşleştiyse üçü de aynı grup).
export function turGruplari(d, t) {
  const n = d.oyuncular.length;
  const ata = [];
  for (let i = 0; i < n; i++) {
    ata.push(i);
  }
  function kok(i) {
    let x = i;
    while (ata[x] !== x) {
      x = ata[x];
    }
    return x;
  }
  const esleseni = new Array(n).fill(false);
  for (const cift of turCiftleri(d, t)) {
    if (cift.durum !== 'yok') {
      esleseni[cift.a] = true;
      esleseni[cift.b] = true;
      ata[kok(cift.a)] = kok(cift.b);
    }
  }
  const numaralar = new Map();
  const grup = [];
  for (let i = 0; i < n; i++) {
    if (!esleseni[i]) {
      grup.push(-1);
      continue;
    }
    const k = kok(i);
    if (!numaralar.has(k)) {
      numaralar.set(k, numaralar.size);
    }
    grup.push(numaralar.get(k));
  }
  return grup;
}

// En güzel eşleşmeler: en çok puan getiren turlar (puan > 0), çoktan aza; eşitlikte önce gelen tur.
// Her öğe: { tur, ipucu, puan, cevaplar: [{ ad, cevap }] }
export function enGuzelEslesmeler(d, sayi = 5) {
  const liste = [];
  for (let t = 0; t < d.cevaplar.length; t++) {
    const puan = turPuani(d, t);
    if (puan > 0) {
      liste.push({
        tur: t,
        ipucu: d.ipuclari[t],
        puan: puan,
        cevaplar: d.oyuncular.map((o, i) => ({ ad: o.ad, cevap: d.cevaplar[t][i] })),
      });
    }
  }
  liste.sort((x, y) => y.puan - x.puan || x.tur - y.tur);
  return liste.slice(0, sayi);
}

// ---------------------------------------------------------------------------
// Oyunu kurma
// ---------------------------------------------------------------------------

// Oyun için turSayisi kadar ipucu seçer. Bu odada sorulmuş ipucu, havuz bitene kadar tekrar gelmez.
// Hata mesajı ya da null.
function ipuclariniSec(d, ipuclari, rastgele) {
  const havuz = [];
  const gorulen = new Set();
  for (const ham of Array.isArray(ipuclari) ? ipuclari : []) {
    const ipucu = cevapTemizle(ham);
    if (ipucu !== '' && !gorulen.has(ipucu)) {
      gorulen.add(ipucu);
      havuz.push(ipucu);
    }
  }
  if (havuz.length === 0) {
    return 'İpucu listesi boş.';
  }
  const sayi = Math.min(d.ayar.turSayisi, havuz.length);
  const kullanilan = new Set(d.kullanilanlar);
  const yeniler = karistir(
    havuz.filter((ipucu) => !kullanilan.has(ipucu)),
    rastgele
  );

  if (yeniler.length >= sayi) {
    d.ipuclari = yeniler.slice(0, sayi);
    d.kullanilanlar = d.kullanilanlar.concat(d.ipuclari);
    return null;
  }

  // Havuz bitti: kalan yeniler önce gelir, sonra baştan başlanır
  const eskiler = karistir(
    havuz.filter((ipucu) => kullanilan.has(ipucu)),
    rastgele
  );
  const yenidenGelen = eskiler.slice(0, sayi - yeniler.length);
  d.ipuclari = yeniler.concat(yenidenGelen);
  d.kullanilanlar = yenidenGelen;
  return null;
}

// Oyunu sıfırdan kurar: ipuçları seçilir, ilk soru açılır. Hata mesajı ya da null.
function oyunuKur(d, ipuclari, rastgele) {
  if (d.oyuncular.length < EN_AZ_OYUNCU) {
    return 'En az ' + EN_AZ_OYUNCU + ' kişi gerekli.';
  }
  if (d.oyuncular.length > MAKS_OYUNCU) {
    return 'En fazla ' + MAKS_OYUNCU + ' kişi oynar.';
  }
  const hata = ipuclariniSec(d, ipuclari, rastgele);
  if (hata) {
    return hata;
  }
  d.tur = 0;
  d.cevaplar = d.ipuclari.map(() => d.oyuncular.map(() => null));
  d.sayilanlar = d.ipuclari.map(() => []);
  d.asama = 'soru';
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
  if (ayar.turSayisi !== undefined) {
    d.ayar.turSayisi = ayar.turSayisi;
  }
  return null;
}

function baslatIsle(d, e, rastgele, ipuclari) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, ipuclari, rastgele);
}

function tekrarOynaIsle(d, e, rastgele, ipuclari) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, ipuclari, rastgele);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Ayarlar ve sorulmuş ipuçları kalır.
function yeniOyunIsle(d, e) {
  if (d.asama === 'lobi') {
    return 'Zaten lobidesin.';
  }
  if (e.id !== d.sahip) {
    return 'Sadece ev sahibi lobiye döndürür.';
  }
  d.asama = 'lobi';
  d.tur = 0;
  d.ipuclari = [];
  d.cevaplar = [];
  d.sayilanlar = [];
  return null;
}

// Cevabı gönderir. Açılmadan önce tekrar göndererek değiştirilebilir.
function cevaplaIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'soru') {
    return 'Şu an cevap yazılmaz.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu ipucu geçti.';
  }
  const hata = cevapHatasi(e.cevap);
  if (hata) {
    return hata;
  }
  d.cevaplar[d.tur][idx] = cevapTemizle(e.cevap);
  if (herkesGonderdi(d, d.tur)) {
    d.asama = 'acik';
  }
  return null;
}

// "Bunlar aynı sayılsın" oyu. e.sayilsin true ise ekler, false ise geri alır.
// Güvene dayalıdır: herhangi bir oyuncu verebilir, onay gerekmez. Puan anında değişir.
function sayilsinIsle(d, e) {
  if (oyuncuIndeks(d, e.id) < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'acik') {
    return 'Şu an eşleşme değiştirilemez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu ipucu geçti.';
  }
  const n = d.oyuncular.length;
  const gecerli = (x) => Number.isInteger(x) && x >= 0 && x < n;
  if (!gecerli(e.a) || !gecerli(e.b) || e.a === e.b) {
    return 'Geçersiz ikili.';
  }
  if (typeof e.sayilsin !== 'boolean') {
    return 'Geçersiz hareket.';
  }
  const anahtar = ciftAnahtari(e.a, e.b);
  const cift = turCiftleri(d, d.tur).find((c) => c.anahtar === anahtar);
  if (cift.durum === 'ayni') {
    return 'Bu cevaplar zaten aynı.';
  }
  const liste = d.sayilanlar[d.tur];
  const varMi = liste.includes(anahtar);
  if (e.sayilsin && !varMi) {
    liste.push(anahtar);
  }
  if (!e.sayilsin && varMi) {
    d.sayilanlar[d.tur] = liste.filter((x) => x !== anahtar);
  }
  return null;
}

// Sonraki ipucu. İki oyuncu aynı anda basarsa ikincisi zararsız geçer (tur eşleşmez ya da oyun çoktan bitti).
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
    return 'Şu an sonraki ipucuna geçilmez.';
  }
  if (d.tur + 1 >= d.ipuclari.length) {
    d.asama = 'bitti';
    return null;
  }
  d.tur += 1;
  d.asama = 'soru';
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  cevapla: cevaplaIsle,
  sayilsin: sayilsinIsle,
  sonraki: sonrakiIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random, ipuclari = VARSAYILAN_IPUCLARI) {
  const islem = HAREKETLER[eylem && eylem.tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  const hata = islem(d, eylem, rastgele, ipuclari);
  if (hata) {
    return { ok: false, hata: hata };
  }
  return { ok: true, durum: d };
}

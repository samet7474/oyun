// kule.js - Saf "Risk Kulesi" motoru (2-4 kişi, sırayla).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'zarAt', id: oyuncuId }, rastgele, simdi);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik (rastgele) ve şimdiki zaman (simdi, milisaniye) dışarıdan verilir; testler ikisini de sabitler.
// Zarı atan istemci sonucu üretir: zar değeri bu motorun içinde rastgele() ile çıkar.
//
// Oyun: sırası gelen oyuncu zar atar, çıkan sayı kulesine bir kat olur.
//   1 gelirse kule yıkılır, turda biriken her şey gider.
//   Bir önceki katla aynı sayı gelirse (1 hariç) o kat iki kat sayılır.
//   "Dur" denirse kulenin toplamı kasaya eklenir. Kasası hedefe ulaşan kazanır.
//   Çatlak taş: her oyuncu oyun boyunca bir kez bir rakibe atar; rakibin bir sonraki turunda 1 de 2 de kuleyi yıkar.
//
// Aşamalar: lobi -> oyun -> bitti
//
// Durum alanları (oyuncuya ait her dizi oyuncular dizisiyle aynı sıradadır):
//   kasalar[i]       : i. oyuncunun kasası
//   sira             : sırası gelen oyuncunun indeksi
//   kule             : turdaki katlar [{ sayi, x2, deger }]
//   turToplam        : turdaki kulenin toplamı
//   catlak[i]        : 0 yok, 1 bekliyor (oyuncu şu an oynuyor, sonraki turu çatlaklı olacak), 2 etkin
//   catlakHakki[i]   : kalan çatlak taş hakkı (başta 1)
//   enYuksek[i]      : i. oyuncunun kurduğu en yüksek kule (kat sayısı)
//   yikilma[i]       : i. oyuncunun kulesinin kaç kez yıkıldığı
//   rekor            : { kat, ad } oyundaki en yüksek kule
//   sonOlay          : en son olay { no, tip, kim, ... }
//   sonZar           : en son atılan zar { no, kim, deger, yikildi, neden, x2, kat } (ekranda zar ve yıkılma animasyonu için;
//                      çatlak taş gibi araya giren olaylar bunu silmez)
//   haberler         : herkese açık son olaylar
//   sonHamle         : sırada son hamlenin yapıldığı an (ms); 60 sn geçerse "Sırayı geç" açılır
//   oyunNo           : kaçıncı oyun (Tekrar oyna'da artar), animasyon anahtarı için

import { oyuncuIndeks, temizAd, benzersizAd } from './uno.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const EN_AZ_OYUNCU = 2;
export const MAKS_OYUNCU = 4;

export const HEDEFLER = [50, 100, 150];
export const VARSAYILAN_HEDEF = 100;

// Sırası gelen oyuncu bu kadar süre hamle yapmazsa diğerleri sırayı geçirebilir
export const SIRA_SURESI_MS = 60000;

// Bu zarlar kuleyi yıkar: normalde yalnız 1, çatlak varsa 1 ve 2
export const YIKAN_ZAR = 1;
export const CATLAK_YIKAN_ZAR = 2;

const MAKS_HABER = 5;

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad };
}

// Oyun alanlarının boş hâli (lobide ve "Lobiye dön"de kullanılır)
function bosOyunAlanlari(d) {
  d.kasalar = [];
  d.sira = 0;
  d.kule = [];
  d.turToplam = 0;
  d.catlak = [];
  d.catlakHakki = [];
  d.enYuksek = [];
  d.yikilma = [];
  d.rekor = { kat: 0, ad: '' };
  d.sonOlay = null;
  d.sonZar = null;
  d.haberler = [];
  d.sayac = 0;
  d.sonHamle = null;
  d.sonuc = null;
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  const d = {
    oyun: 'kule',
    asama: 'lobi', // lobi | oyun | bitti
    sahip: sahipId,
    ayar: { hedef: VARSAYILAN_HEDEF },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    baslayan: 0, // oyunu ilk başlatan sıranın indeksi (Tekrar oyna'da bir kayar)
    oyunNo: 0,
  };
  bosOyunAlanlari(d);
  return d;
}

export function yeniOda(sahipId, sahipAd) {
  return lobiKur([{ id: sahipId, ad: temizAd(sahipAd) }], sahipId);
}

// ---------------------------------------------------------------------------
// Okuma yardımcıları (arayüz ve testler için)
// ---------------------------------------------------------------------------

// Sırası gelen oyuncunun hamlesine kaç ms kaldı (negatifse süre doldu). Oyun sürmüyorsa null.
export function sirayaKalanMs(d, simdi) {
  if (d.asama !== 'oyun' || typeof d.sonHamle !== 'number') {
    return null;
  }
  return d.sonHamle + SIRA_SURESI_MS - simdi;
}

// "Sırayı geç" açılmış mı?
export function sirayiGecebilirMi(d, simdi) {
  const kalan = sirayaKalanMs(d, simdi);
  return kalan !== null && kalan <= 0;
}

// Turdaki kulenin toplamı
export function kuleToplami(kule) {
  let toplam = 0;
  for (const kat of kule) {
    toplam += kat.deger;
  }
  return toplam;
}

// Bu oyuncunun şu anki turunda 1 ve 2 kuleyi yıkar mı?
export function catlakEtkinMi(d, idx) {
  return d.catlak[idx] === 2;
}

// Üstünde (bekleyen ya da etkin) çatlak olan oyuncu mu?
export function catlakVarMi(d, idx) {
  return d.catlak[idx] > 0;
}

// Oyunun kazananı (yoksa null)
export function kazananIndeks(d) {
  if (d.asama !== 'bitti' || !d.sonuc) {
    return null;
  }
  return d.sonuc.kazanan;
}

// Oyun sonu istatistikleri
export function istatistikler(d) {
  let enYuksek = { kat: 0, ad: '' };
  let enCokYikilan = { adet: 0, ad: '' };
  d.oyuncular.forEach((o, i) => {
    if (d.enYuksek[i] > enYuksek.kat) {
      enYuksek = { kat: d.enYuksek[i], ad: o.ad };
    }
    if (d.yikilma[i] > enCokYikilan.adet) {
      enCokYikilan = { adet: d.yikilma[i], ad: o.ad };
    }
  });
  if (d.rekor.kat > enYuksek.kat) {
    enYuksek = { kat: d.rekor.kat, ad: d.rekor.ad };
  }
  return {
    enYuksek: enYuksek.kat > 0 ? enYuksek : null,
    enCokYikilan: enCokYikilan.adet > 0 ? enCokYikilan : null,
  };
}

// ---------------------------------------------------------------------------
// İç yardımcılar
// ---------------------------------------------------------------------------

// Zar: 1-6 (rastgele 0 ile 1 arasında bir sayı verir)
export function zarUret(rastgele) {
  const sayi = Math.floor(rastgele() * 6) + 1;
  return Math.min(6, Math.max(1, sayi));
}

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

// Sıradaki oyuncunun turu biter: kule temizlenir, çatlak kalkar ya da etkinleşir, sıra sonrakine geçer.
function turuBitir(d, simdi) {
  const p = d.sira;
  if (d.catlak[p] === 2) {
    d.catlak[p] = 0;
  } else if (d.catlak[p] === 1) {
    d.catlak[p] = 2;
  }
  d.kule = [];
  d.turToplam = 0;
  d.sira = (p + 1) % d.oyuncular.length;
  d.sonHamle = simdi;
}

// Oyunu sıfırdan kurar. Hata mesajı ya da null.
function oyunuKur(d, baslayan, simdi) {
  const n = d.oyuncular.length;
  if (n < EN_AZ_OYUNCU) {
    return 'En az ' + EN_AZ_OYUNCU + ' kişi gerekli.';
  }
  if (n > MAKS_OYUNCU) {
    return 'En fazla ' + MAKS_OYUNCU + ' kişi oynar.';
  }
  bosOyunAlanlari(d);
  for (let i = 0; i < n; i++) {
    d.kasalar.push(0);
    d.catlak.push(0);
    d.catlakHakki.push(1);
    d.enYuksek.push(0);
    d.yikilma.push(0);
  }
  d.baslayan = baslayan % n;
  d.sira = d.baslayan;
  d.sonHamle = simdi;
  d.oyunNo += 1;
  d.asama = 'oyun';
  return null;
}

function oyunuBitir(d, kazanan, neden) {
  d.asama = 'bitti';
  d.kule = [];
  d.turToplam = 0;
  d.sonuc = { kazanan: kazanan, neden: neden };
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

// Biri çıkar (kendi isteğiyle) ya da ev sahibi birini çıkarır.
// Lobide serbest; oyun sürerken de çıkılabilir ki sayfayı kapatan biri oyunu kilitlemesin.
function cikarIsle(d, e, rastgele, simdi) {
  if (d.asama === 'bitti') {
    return 'Oyun bitince çıkılamaz. Lobiye dönülünce çıkabilirsin.';
  }
  const hedefId = e.hedef || e.id;
  if (hedefId !== e.id && e.id !== d.sahip) {
    return 'Sadece ev sahibi çıkarabilir.';
  }
  const idx = oyuncuIndeks(d, hedefId);
  if (idx < 0) {
    return null;
  }
  const oyundaMi = d.asama === 'oyun';
  d.oyuncular.splice(idx, 1);
  if (d.sahip === hedefId && d.oyuncular.length > 0) {
    d.sahip = d.oyuncular[0].id;
  }
  if (!oyundaMi) {
    return null;
  }

  // Oyuncuya ait diziler de küçülür
  d.kasalar.splice(idx, 1);
  d.catlak.splice(idx, 1);
  d.catlakHakki.splice(idx, 1);
  d.enYuksek.splice(idx, 1);
  d.yikilma.splice(idx, 1);

  if (d.oyuncular.length < 2) {
    // Tek kişi kaldı: o kazanır (kimse kalmadıysa kazanan yok)
    oyunuBitir(d, d.oyuncular.length === 1 ? 0 : null, 'rakipsiz');
    return null;
  }

  if (idx < d.sira) {
    d.sira -= 1;
  } else if (idx === d.sira) {
    // Sırası olan çıktı: kulesi gider, sıra ondan sonra gelene geçer (aynı indekste kalır)
    d.kule = [];
    d.turToplam = 0;
    d.sira = idx % d.oyuncular.length;
    d.sonHamle = simdi;
  }
  if (d.baslayan >= d.oyuncular.length) {
    d.baslayan = 0;
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
  if (ayar.hedef !== undefined) {
    if (!HEDEFLER.includes(ayar.hedef)) {
      return 'Geçersiz hedef puan.';
    }
    d.ayar.hedef = ayar.hedef;
  }
  return null;
}

function baslatIsle(d, e, rastgele, simdi) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, 0, simdi);
}

function tekrarOynaIsle(d, e, rastgele, simdi) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  // Her oyunda başlayan kişi bir kayar
  return oyunuKur(d, d.baslayan + 1, simdi);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Hedef ayarı kalır.
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

// Zar at: çıkan sayı kuleye kat olur; 1 gelirse (çatlakta 2 de) kule yıkılır.
function zarAtIsle(d, e, rastgele, simdi) {
  const kontrol = siraKontrol(d, e);
  if (kontrol.hata) {
    return kontrol.hata;
  }
  const idx = kontrol.idx;
  const ad = d.oyuncular[idx].ad;
  const zar = zarUret(rastgele);
  const catlakli = catlakEtkinMi(d, idx);
  const yikilir = zar === YIKAN_ZAR || (catlakli && zar === CATLAK_YIKAN_ZAR);

  if (yikilir) {
    const dusen = d.kule.map((kat) => ({ sayi: kat.sayi, x2: kat.x2, deger: kat.deger }));
    const kayip = d.turToplam;
    const neden = zar === YIKAN_ZAR ? 'bir' : 'catlak';
    d.yikilma[idx] += 1;
    olayYaz(
      d,
      { tip: 'yikildi', kim: idx, deger: zar, neden: neden, kat: dusen, kayip: kayip },
      neden === 'bir'
        ? ad + ' 1 attı, kulesi yıkıldı.'
        : ad + ' ' + zar + ' attı. Çatlak taş yüzünden kulesi yıkıldı.'
    );
    d.sonZar = { no: d.sayac, kim: idx, deger: zar, yikildi: true, neden: neden, x2: false, kat: dusen };
    turuBitir(d, simdi);
    return null;
  }

  // Bir önceki katla aynı sayı: bu kat iki kat sayılır
  const onceki = d.kule.length > 0 ? d.kule[d.kule.length - 1] : null;
  const ikiKat = onceki !== null && onceki.sayi === zar;
  const kat = { sayi: zar, x2: ikiKat, deger: ikiKat ? zar * 2 : zar };
  d.kule.push(kat);
  d.turToplam += kat.deger;
  d.sonHamle = simdi;

  if (d.kule.length > d.enYuksek[idx]) {
    d.enYuksek[idx] = d.kule.length;
  }
  if (d.kule.length > d.rekor.kat) {
    d.rekor = { kat: d.kule.length, ad: ad };
  }
  olayYaz(
    d,
    { tip: 'zar', kim: idx, deger: zar, x2: ikiKat },
    ad + ' ' + zar + ' attı' + (ikiKat ? ' (iki kat, ' + kat.deger + ' sayıldı).' : '.')
  );
  d.sonZar = { no: d.sayac, kim: idx, deger: zar, yikildi: false, neden: null, x2: ikiKat, kat: [] };
  return null;
}

// Dur: kulenin toplamı kasaya eklenir. Hedefe ulaşan kazanır.
function durIsle(d, e, rastgele, simdi) {
  const kontrol = siraKontrol(d, e);
  if (kontrol.hata) {
    return kontrol.hata;
  }
  const idx = kontrol.idx;
  if (d.kule.length === 0) {
    return 'Önce bir zar atmalısın.';
  }
  const ad = d.oyuncular[idx].ad;
  const eklenen = d.turToplam;
  d.kasalar[idx] += eklenen;
  olayYaz(d, { tip: 'dur', kim: idx, miktar: eklenen }, ad + ' durdu, kasasına ' + eklenen + ' ekledi.');
  if (d.kasalar[idx] >= d.ayar.hedef) {
    d.kule = [];
    d.turToplam = 0;
    d.catlak[idx] = 0;
    d.sonHamle = simdi;
    oyunuBitir(d, idx, 'hedef');
    return null;
  }
  turuBitir(d, simdi);
  return null;
}

// Çatlak taş: bir rakibin bir sonraki turunda 1 ve 2 kuleyi yıkar. Oyun başına herkesin bir hakkı var.
function catlakIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an oyun sürmüyor.';
  }
  if (d.catlakHakki[idx] <= 0) {
    return 'Çatlak taş hakkını zaten kullandın.';
  }
  const hedef = oyuncuIndeks(d, e.hedef);
  if (hedef < 0) {
    return 'Böyle bir oyuncu yok.';
  }
  if (hedef === idx) {
    return 'Çatlak taşı kendine atamazsın.';
  }
  if (idx === d.sira && d.kule.length > 0) {
    return 'Çatlak taşı zar atmadan önce atabilirsin.';
  }
  if (d.catlak[hedef] > 0) {
    return 'Bu oyuncunun üstünde zaten bir çatlak taş var.';
  }
  d.catlakHakki[idx] -= 1;
  // Hedef şu an oynuyorsa çatlak bu turu etkilemez, bir sonraki turuna kalır
  d.catlak[hedef] = hedef === d.sira ? 1 : 2;
  olayYaz(
    d,
    { tip: 'catlak', kim: idx, hedef: hedef },
    d.oyuncular[idx].ad + ', ' + d.oyuncular[hedef].ad + ' için çatlak taş attı.'
  );
  return null;
}

// Sırayı geç: sıradaki oyuncu 60 saniyedir hamle yapmadıysa başkası sırayı geçirir. Kulesi gider.
function gecIsle(d, e, rastgele, simdi) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an oyun sürmüyor.';
  }
  if (idx === d.sira) {
    return 'Kendi sıranı geçemezsin.';
  }
  if (!sirayiGecebilirMi(d, simdi)) {
    return 'Sıradaki oyuncuya biraz daha süre ver.';
  }
  const ad = d.oyuncular[d.sira].ad;
  olayYaz(d, { tip: 'gec', kim: d.sira }, ad + ' gelmedi, sıra geçti.');
  turuBitir(d, simdi);
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  zarAt: zarAtIsle,
  dur: durIsle,
  catlak: catlakIsle,
  gec: gecIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
// simdi: şimdiki zaman (ms). Verilmezse Date.now() her çağrıda taze alınır.
export function uygula(durum, eylem, rastgele = Math.random, simdi = Date.now()) {
  const tip = eylem && eylem.tip;
  const islem = HAREKETLER[tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  const hata = islem(d, eylem, rastgele, simdi);
  if (hata) {
    return { ok: false, hata: hata };
  }
  return { ok: true, durum: d };
}

// Biten oyunun kazananları (indeks listesi). Rakipler çıkıp kalan tek kişi "kazanır" ama bu sayılmaz.
export function kazananlar(d) {
  if (d.asama !== 'bitti' || !d.sonuc || d.sonuc.neden === 'rakipsiz') {
    return [];
  }
  const kazanan = kazananIndeks(d);
  if (kazanan === null || kazanan === undefined) {
    return [];
  }
  return [kazanan];
}

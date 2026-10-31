// gorev.js - Saf "Gizli Görev" motoru (2-4 kişi).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'yaptim', id: oyuncuId, zorluk: 'kolay' }, rastgele, gorevler, simdi);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik (rastgele), görev listesi (gorevler) ve şimdiki zaman (simdi, milisaniye) dışarıdan verilir;
// böylece testler her şeyi sabitleyebilir.
//
// Oyun: ekranın dışında, insanlar konuşurken ya da mesajlaşırken oynanır. Herkesin elinde 3 gizli görev vardır
// (bir kolay, bir orta, bir zor). Görevini yaptığını düşünen "Yaptım"a basar, diğerleri onaylar ya da reddeder.
// Biri rakibin görev yaptığını fark ederse "Yakaladım" der.
//
// Aşamalar: lobi -> oyun -> bitti
//
// Durum alanları (oyuncuya ait her dizi oyuncular dizisiyle aynı sıradadır):
//   puanlar[i]          : i. oyuncunun puanı
//   eller[i]            : { kolay, orta, zor } her zorlukta elde duran görevin metni (deste bittiyse null)
//   tamamlananlar[i]    : [{ zorluk, metin }] onaylanan görevler (oyun bitince herkese açılır)
//   yakalamaHakki[i]    : kalan yakalama hakkı
//   degistirmeHakki[i]  : kalan "Görevi değiştir" hakkı
//   desteler            : { kolay, orta, zor } henüz çekilmemiş görev metinleri (sondan çekilir)
//   onaylar             : bekleyen "Yaptım" onayları [{ no, kim, zorluk, metin, oylar }]
//   yakalamalar         : bekleyen "Yakaladım" soruları [{ no, yakalayan, hedef, tahmin }]
//   haberler            : herkese açık son olaylar (görev metni içermez)
//   baslangic           : oyunun başladığı an (ms), süre buna göre sayılır

import { oyuncuIndeks, temizAd, benzersizAd, karistir } from './uno.js';
import { GOREVLER } from './gorev-gorevler.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const VARSAYILAN_GOREVLER = GOREVLER;

export const EN_AZ_OYUNCU = 2;
export const MAKS_OYUNCU = 4;

export const ZORLUKLAR = ['kolay', 'orta', 'zor'];
export const ZORLUK_ADLARI = { kolay: 'Kolay', orta: 'Orta', zor: 'Zor' };
export const GOREV_PUANI = { kolay: 1, orta: 2, zor: 3 };

export const YAKALAMA_HAKKI = 3;
export const DEGISTIRME_HAKKI = 1;
export const MAKS_TAHMIN_HARF = 60;
export const YAKALAMA_PUANI = 1;

export const HEDEFLER = [10, 15, 20];
export const SURELER = [15, 30, 60]; // dakika
export const VARSAYILAN_BITIS = 'puan'; // puan | sure
export const VARSAYILAN_HEDEF = 15;
export const VARSAYILAN_SURE = 30;

const MAKS_HABER = 6;

// Oyun sırasında süreyi kontrol eden hareketler
const OYUN_HAREKETLERI = ['yaptim', 'onay', 'yakala', 'yakalamaCevap', 'degistir', 'sureBitir'];

// ---------------------------------------------------------------------------
// Metin yardımcıları
// ---------------------------------------------------------------------------

export function tahminTemizle(ham) {
  const metin = ham === undefined || ham === null ? '' : String(ham);
  return metin.replace(/\s+/g, ' ').trim();
}

// Tahmin gönderilebilir mi? Hata mesajı ya da null.
export function tahminHatasi(ham) {
  const tahmin = tahminTemizle(ham);
  if (tahmin === '') {
    return 'Tahmin boş olamaz.';
  }
  if ([...tahmin].length > MAKS_TAHMIN_HARF) {
    return 'Tahmin en fazla ' + MAKS_TAHMIN_HARF + ' harf olabilir.';
  }
  return null;
}

// Görev listesini zorluğa göre gruplar; aynı metin bir kez sayılır.
export function bankaHazirla(gorevler) {
  const banka = { kolay: [], orta: [], zor: [] };
  const gorulen = new Set();
  for (const gorev of Array.isArray(gorevler) ? gorevler : []) {
    if (!gorev || !ZORLUKLAR.includes(gorev.zorluk)) {
      continue;
    }
    const metin = tahminTemizle(gorev.metin);
    if (metin === '' || gorulen.has(metin)) {
      continue;
    }
    gorulen.add(metin);
    banka[gorev.zorluk].push(metin);
  }
  return banka;
}

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad };
}

// Oyun alanlarının boş hâli (lobide ve "Lobiye dön"de kullanılır)
function bosOyunAlanlari(d) {
  d.puanlar = [];
  d.eller = [];
  d.tamamlananlar = [];
  d.yakalamaHakki = [];
  d.degistirmeHakki = [];
  d.desteler = { kolay: [], orta: [], zor: [] };
  d.onaylar = [];
  d.yakalamalar = [];
  d.haberler = [];
  d.sayac = 0;
  d.baslangic = null;
  d.bitisZamani = null;
  d.sonuc = null;
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  const d = {
    oyun: 'gorev',
    asama: 'lobi', // lobi | oyun | bitti
    sahip: sahipId,
    ayar: {
      bitis: VARSAYILAN_BITIS,
      hedef: VARSAYILAN_HEDEF,
      sure: VARSAYILAN_SURE,
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    gorulenler: [], // bu odada dağıtılmış görevler (Tekrar oyna'da yenileri önce gelir)
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

// Oyunda kalan süre (ms). Süre ayarı yoksa ya da oyun sürmüyorsa null.
export function kalanMs(d, simdi) {
  if (d.asama !== 'oyun' || d.ayar.bitis !== 'sure' || typeof d.baslangic !== 'number') {
    return null;
  }
  return d.baslangic + d.ayar.sure * 60000 - simdi;
}

export function sureBittiMi(d, simdi) {
  const kalan = kalanMs(d, simdi);
  return kalan !== null && kalan <= 0;
}

// Kalan süreyi "24:31" biçiminde yazar (negatifse 00:00).
export function sureYazisi(ms) {
  const toplam = Math.max(0, Math.ceil(ms / 1000));
  const dakika = Math.floor(toplam / 60);
  const saniye = toplam % 60;
  return String(dakika).padStart(2, '0') + ':' + String(saniye).padStart(2, '0');
}

// Oyuncunun "Yaptım" dediği, cevabı bekleyen görev var mı?
export function onayBekliyorMu(d, kim, zorluk) {
  return d.onaylar.some((o) => o.kim === kim && o.zorluk === zorluk);
}

// Bu oyuncunun cevaplaması gereken onaylar ve yakalama soruları.
// Yalnız o oyuncuya gösterilmesi gereken bilgiyi içerir:
//   onay: sadece "Yaptım" denen tek görev; yakalama: tahmin ve soruya cevap verecek oyuncunun kendi görevleri.
export function benimSorularim(d, idx) {
  const onaylar = [];
  for (const o of d.onaylar) {
    if (o.kim !== idx && o.oylar[idx] === undefined) {
      onaylar.push({ no: o.no, ad: d.oyuncular[o.kim].ad, zorluk: o.zorluk, metin: o.metin });
    }
  }
  const yakalamalar = [];
  for (const y of d.yakalamalar) {
    if (y.hedef === idx) {
      const gorevler = [];
      for (const zorluk of ZORLUKLAR) {
        const metin = d.eller[idx][zorluk];
        if (metin) {
          gorevler.push({ zorluk: zorluk, metin: metin });
        }
      }
      yakalamalar.push({ no: y.no, ad: d.oyuncular[y.yakalayan].ad, tahmin: y.tahmin, gorevler: gorevler });
    }
  }
  return { onaylar: onaylar, yakalamalar: yakalamalar };
}

// Bir oyuncuyu cevap bekleyen bir soru var mı? (titreşim ve başlık bildirimi için)
export function bekleyenSoruVarMi(d, idx) {
  if (!d || d.asama !== 'oyun' || idx < 0) {
    return false;
  }
  const sorular = benimSorularim(d, idx);
  return sorular.onaylar.length > 0 || sorular.yakalamalar.length > 0;
}

// Oyun sırasında ekranın kullanacağı bilgi. Başkasının görevleri bunun içinde YOKTUR.
// (Onay sorusundaki görev, "Yaptım" denen tek görevdir ve soruyu cevaplayanlara bilerek gösterilir.)
export function ekranVerisi(d, idx) {
  const oyuncular = d.oyuncular.map((o, i) => ({
    id: o.id,
    ad: o.ad,
    puan: d.puanlar[i],
    tamamlanan: d.tamamlananlar[i].length,
    yakalamaHakki: d.yakalamaHakki[i],
    ben: i === idx,
  }));
  const gorevler = ZORLUKLAR.map((zorluk) => ({
    zorluk: zorluk,
    puan: GOREV_PUANI[zorluk],
    metin: d.eller[idx][zorluk],
    onayBekliyor: onayBekliyorMu(d, idx, zorluk),
  }));
  return {
    oyuncular: oyuncular,
    gorevler: gorevler,
    degistirmeHakki: d.degistirmeHakki[idx],
    yakalamaHakki: d.yakalamaHakki[idx],
    yakalamaBekliyor: d.yakalamalar.some((y) => y.yakalayan === idx),
    sorular: benimSorularim(d, idx),
    haberler: d.haberler.slice(),
  };
}

// Oyun bitince herkesin tamamladığı görevler (oyun bitmeden null: gizli kalır).
export function sonucVerisi(d) {
  if (d.asama !== 'bitti') {
    return null;
  }
  const sira = d.oyuncular.map((o, i) => ({
    idx: i,
    ad: o.ad,
    puan: d.puanlar[i],
    tamamlananlar: d.tamamlananlar[i].map((t) => ({ zorluk: t.zorluk, metin: t.metin })),
  }));
  sira.sort((a, b) => b.puan - a.puan || a.idx - b.idx);
  return { sira: sira, kazananlar: d.sonuc.kazananlar.slice(), neden: d.sonuc.neden };
}

// ---------------------------------------------------------------------------
// Görev çekme ve dağıtma
// ---------------------------------------------------------------------------

// Şu an herhangi birinin elinde duran görev metinleri
function tutulanlar(d) {
  const kume = new Set();
  for (const el of d.eller) {
    for (const zorluk of ZORLUKLAR) {
      if (el[zorluk]) {
        kume.add(el[zorluk]);
      }
    }
  }
  return kume;
}

// Desteden aynı zorlukta yeni görev çeker. Deste bitmişse eldekiler hariç bankadan karıştırıp doldurur.
// Çekilecek görev kalmadıysa null.
function gorevCek(d, zorluk, banka, rastgele) {
  if (d.desteler[zorluk].length === 0) {
    const eldekiler = tutulanlar(d);
    d.desteler[zorluk] = karistir(
      banka[zorluk].filter((metin) => !eldekiler.has(metin)),
      rastgele
    );
  }
  if (d.desteler[zorluk].length === 0) {
    return null;
  }
  const metin = d.desteler[zorluk].pop();
  d.gorulenler.push(metin);
  return metin;
}

function haberYaz(d, metin) {
  d.sayac += 1;
  d.haberler.push({ no: d.sayac, metin: metin });
  if (d.haberler.length > MAKS_HABER) {
    d.haberler = d.haberler.slice(d.haberler.length - MAKS_HABER);
  }
}

// ---------------------------------------------------------------------------
// Oyunu kurma ve bitirme
// ---------------------------------------------------------------------------

// Oyunu sıfırdan kurar: desteler karışır, herkese her zorluktan bir görev dağıtılır. Hata mesajı ya da null.
function oyunuKur(d, gorevler, rastgele, simdi) {
  const n = d.oyuncular.length;
  if (n < EN_AZ_OYUNCU) {
    return 'En az ' + EN_AZ_OYUNCU + ' kişi gerekli.';
  }
  if (n > MAKS_OYUNCU) {
    return 'En fazla ' + MAKS_OYUNCU + ' kişi oynar.';
  }
  const banka = bankaHazirla(gorevler);
  for (const zorluk of ZORLUKLAR) {
    if (banka[zorluk].length < n) {
      return 'Görev listesi yetersiz.';
    }
  }

  bosOyunAlanlari(d);

  // Bu odada daha önce dağıtılmayanlar önce gelir (sondan çekildiği için sona konur)
  for (const zorluk of ZORLUKLAR) {
    let gorulenler = new Set(d.gorulenler);
    let yeniler = banka[zorluk].filter((metin) => !gorulenler.has(metin));
    if (yeniler.length < n + 6) {
      // Neredeyse hepsi görülmüş: bu zorluğun geçmişi sıfırlanır
      const buZorluk = new Set(banka[zorluk]);
      d.gorulenler = d.gorulenler.filter((metin) => !buZorluk.has(metin));
      gorulenler = new Set(d.gorulenler);
      yeniler = banka[zorluk].filter((metin) => !gorulenler.has(metin));
    }
    const eskiler = banka[zorluk].filter((metin) => gorulenler.has(metin));
    d.desteler[zorluk] = karistir(eskiler, rastgele).concat(karistir(yeniler, rastgele));
  }

  for (let i = 0; i < n; i++) {
    d.puanlar.push(0);
    d.tamamlananlar.push([]);
    d.yakalamaHakki.push(YAKALAMA_HAKKI);
    d.degistirmeHakki.push(DEGISTIRME_HAKKI);
    const el = { kolay: null, orta: null, zor: null };
    for (const zorluk of ZORLUKLAR) {
      el[zorluk] = gorevCek(d, zorluk, banka, rastgele);
    }
    d.eller.push(el);
  }
  d.baslangic = simdi;
  d.asama = 'oyun';
  return null;
}

// En yüksek puanlı oyuncuların indeksleri (beraberlikte hepsi)
function kazananlariBul(d) {
  const enYuksek = Math.max(...d.puanlar);
  const liste = [];
  d.puanlar.forEach((puan, i) => {
    if (puan === enYuksek) {
      liste.push(i);
    }
  });
  return liste;
}

function oyunuBitir(d, neden, simdi) {
  d.asama = 'bitti';
  d.onaylar = [];
  d.yakalamalar = [];
  d.bitisZamani = simdi;
  d.sonuc = { neden: neden, kazananlar: kazananlariBul(d) };
}

// Hedef puana ulaşan olduysa oyunu bitirir (yalnız "Hedef puan" ayarında)
function hedefKontrol(d, simdi) {
  if (d.asama !== 'oyun' || d.ayar.bitis !== 'puan') {
    return;
  }
  if (d.puanlar.some((puan) => puan >= d.ayar.hedef)) {
    oyunuBitir(d, 'hedef', simdi);
  }
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
  if (ayar.bitis !== undefined && ayar.bitis !== 'puan' && ayar.bitis !== 'sure') {
    return 'Geçersiz bitiş ayarı.';
  }
  if (ayar.hedef !== undefined && !HEDEFLER.includes(ayar.hedef)) {
    return 'Geçersiz hedef puan.';
  }
  if (ayar.sure !== undefined && !SURELER.includes(ayar.sure)) {
    return 'Geçersiz süre.';
  }
  if (ayar.bitis !== undefined) {
    d.ayar.bitis = ayar.bitis;
  }
  if (ayar.hedef !== undefined) {
    d.ayar.hedef = ayar.hedef;
  }
  if (ayar.sure !== undefined) {
    d.ayar.sure = ayar.sure;
  }
  return null;
}

function baslatIsle(d, e, rastgele, gorevler, simdi) {
  if (d.asama !== 'lobi') {
    return 'Oyun zaten başladı.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, gorevler, rastgele, simdi);
}

function tekrarOynaIsle(d, e, rastgele, gorevler, simdi) {
  if (d.asama !== 'bitti') {
    return 'Oyun daha bitmedi.';
  }
  if (e.id !== d.sahip) {
    return 'Tekrar oynamayı sadece ev sahibi başlatır.';
  }
  return oyunuKur(d, gorevler, rastgele, simdi);
}

// Lobiye dön: ev sahibi, oyunun her aşamasında. Ayarlar ve dağıtılmış görev geçmişi kalır.
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

// Ev sahibi oyunu her an bitirebilir.
function bitirIsle(d, e, rastgele, gorevler, simdi) {
  if (d.asama !== 'oyun') {
    return 'Oyun sürmüyor.';
  }
  if (e.id !== d.sahip) {
    return 'Oyunu sadece ev sahibi bitirir.';
  }
  oyunuBitir(d, 'sahip', simdi);
  return null;
}

// Süre bittiyse ilk gelen istemci oyunu bitirir. Oyun zaten bittiyse zararsız geçer.
function sureBitirIsle(d, e, rastgele, gorevler, simdi) {
  if (oyuncuIndeks(d, e.id) < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return null;
  }
  if (!sureBittiMi(d, simdi)) {
    return 'Süre daha bitmedi.';
  }
  oyunuBitir(d, 'sure', simdi);
  return null;
}

// Oyuncu bir görevi yaptığını söyler; diğerlerinin ekranına onay sorusu düşer.
function yaptimIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an görev yapılmaz.';
  }
  if (!ZORLUKLAR.includes(e.zorluk)) {
    return 'Geçersiz görev.';
  }
  const metin = d.eller[idx][e.zorluk];
  if (!metin) {
    return 'Bu görev şu an yok.';
  }
  if (onayBekliyorMu(d, idx, e.zorluk)) {
    return 'Bu görev için onay bekleniyor.';
  }
  d.sayac += 1;
  d.onaylar.push({ no: d.sayac, kim: idx, zorluk: e.zorluk, metin: metin, oylar: {} });
  return null;
}

// Rakibin "Yaptım" sorusuna cevap. Karar verilince görev puanı verilir ya da görev oyuncuda kalır.
function onayIsle(d, e, rastgele, gorevler, simdi) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an onay verilmez.';
  }
  if (typeof e.evet !== 'boolean') {
    return 'Geçersiz hareket.';
  }
  const onay = d.onaylar.find((o) => o.no === e.no);
  if (!onay) {
    return null; // soru çoktan karara bağlandı, zararsız
  }
  if (onay.kim === idx) {
    return 'Kendi görevini sen onaylayamazsın.';
  }
  if (onay.oylar[idx] !== undefined) {
    return 'Zaten cevap verdin.';
  }
  onay.oylar[idx] = e.evet;

  // Oy verecek kişi sayısı: yapan hariç herkes. Eşitlikte kabul edilir.
  const oyVerecek = d.oyuncular.length - 1;
  const evetler = Object.values(onay.oylar).filter((v) => v === true).length;
  const hayirlar = Object.values(onay.oylar).filter((v) => v === false).length;
  let karar = null;
  if (evetler * 2 >= oyVerecek) {
    karar = true;
  } else if (hayirlar * 2 > oyVerecek) {
    karar = false;
  }
  if (karar === null) {
    return null;
  }

  d.onaylar = d.onaylar.filter((o) => o.no !== onay.no);
  const ad = d.oyuncular[onay.kim].ad;
  if (!karar) {
    haberYaz(d, ad + ' bir görevi yaptığını söyledi ama onaylanmadı.');
    return null;
  }
  const puan = GOREV_PUANI[onay.zorluk];
  d.puanlar[onay.kim] += puan;
  d.tamamlananlar[onay.kim].push({ zorluk: onay.zorluk, metin: onay.metin });
  d.eller[onay.kim][onay.zorluk] = gorevCek(d, onay.zorluk, bankaHazirla(gorevler), rastgele);
  haberYaz(d, ad + ' bir görevi tamamladı (+' + puan + ').');
  hedefKontrol(d, simdi);
  return null;
}

// Yakaladım: bir rakipten şüphelenip tahmin yazar. Hak, tahmin gönderilince harcanır.
function yakalaIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an yakalanmaz.';
  }
  const hedef = oyuncuIndeks(d, e.hedef);
  if (hedef < 0) {
    return 'Böyle bir oyuncu yok.';
  }
  if (hedef === idx) {
    return 'Kendini yakalayamazsın.';
  }
  if (d.yakalamaHakki[idx] <= 0) {
    return 'Yakalama hakkın bitti.';
  }
  const hata = tahminHatasi(e.tahmin);
  if (hata) {
    return hata;
  }
  if (d.yakalamalar.some((y) => y.yakalayan === idx)) {
    return 'Önceki tahminin cevap bekliyor.';
  }
  if (d.yakalamalar.some((y) => y.hedef === hedef)) {
    return 'Bu kişiye zaten bir soru soruldu. Biraz bekle.';
  }
  d.yakalamaHakki[idx] -= 1;
  d.sayac += 1;
  d.yakalamalar.push({ no: d.sayac, yakalayan: idx, hedef: hedef, tahmin: tahminTemizle(e.tahmin) });
  return null;
}

// Şüphelenilen kişinin cevabı: "Evet, bu görevimdi" (görevi seçer) ya da "Hayır".
function yakalamaCevapIsle(d, e, rastgele, gorevler, simdi) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an cevap verilmez.';
  }
  const yakalama = d.yakalamalar.find((y) => y.no === e.no);
  if (!yakalama) {
    return null; // soru çoktan kapandı, zararsız
  }
  if (yakalama.hedef !== idx) {
    return 'Bu soru sana sorulmadı.';
  }
  if (typeof e.evet !== 'boolean') {
    return 'Geçersiz hareket.';
  }
  const yakalayanAd = d.oyuncular[yakalama.yakalayan].ad;
  const hedefAd = d.oyuncular[idx].ad;

  if (!e.evet) {
    d.yakalamalar = d.yakalamalar.filter((y) => y.no !== yakalama.no);
    haberYaz(d, yakalayanAd + ' ' + hedefAd + ' için yakaladım dedi ama tutmadı.');
    return null;
  }

  if (!ZORLUKLAR.includes(e.zorluk) || !d.eller[idx][e.zorluk]) {
    return 'Hangi görevin olduğunu seç.';
  }
  d.yakalamalar = d.yakalamalar.filter((y) => y.no !== yakalama.no);
  // Yanan görev puansızdır; bekleyen onayı varsa o da düşer
  d.onaylar = d.onaylar.filter((o) => !(o.kim === idx && o.zorluk === e.zorluk));
  d.eller[idx][e.zorluk] = gorevCek(d, e.zorluk, bankaHazirla(gorevler), rastgele);
  d.puanlar[yakalama.yakalayan] += YAKALAMA_PUANI;
  haberYaz(d, yakalayanAd + ' ' + hedefAd + ' kişisini yakaladı (+' + YAKALAMA_PUANI + ').');
  hedefKontrol(d, simdi);
  return null;
}

// Beğenilmeyen görevi aynı zorlukta yenisiyle değiştirir (oyun başına 1 hak).
function degistirIsle(d, e, rastgele, gorevler) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'oyun') {
    return 'Şu an görev değişmez.';
  }
  if (!ZORLUKLAR.includes(e.zorluk)) {
    return 'Geçersiz görev.';
  }
  if (!d.eller[idx][e.zorluk]) {
    return 'Bu görev şu an yok.';
  }
  if (d.degistirmeHakki[idx] <= 0) {
    return 'Değiştirme hakkın bitti.';
  }
  if (onayBekliyorMu(d, idx, e.zorluk)) {
    return 'Onay beklerken görev değişmez.';
  }
  const yeni = gorevCek(d, e.zorluk, bankaHazirla(gorevler), rastgele);
  if (yeni === null) {
    return 'Yeni görev kalmadı.';
  }
  d.eller[idx][e.zorluk] = yeni;
  d.degistirmeHakki[idx] -= 1;
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  yaptim: yaptimIsle,
  onay: onayIsle,
  yakala: yakalaIsle,
  yakalamaCevap: yakalamaCevapIsle,
  degistir: degistirIsle,
  bitir: bitirIsle,
  sureBitir: sureBitirIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Tek giriş noktası. Girdi durumu değişmez.
// simdi: şimdiki zaman (ms). Verilmezse Date.now() her çağrıda taze alınır.
export function uygula(durum, eylem, rastgele = Math.random, gorevler = VARSAYILAN_GOREVLER, simdi = Date.now()) {
  const tip = eylem && eylem.tip;
  const islem = HAREKETLER[tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);

  // Süre dolduysa oyun hareketi uygulanmaz: oyun bu hareketle biter ("ilk hamle yapan bitirir")
  if (OYUN_HAREKETLERI.includes(tip) && sureBittiMi(d, simdi)) {
    if (oyuncuIndeks(d, eylem.id) < 0) {
      return { ok: false, hata: 'Bu odada değilsin.' };
    }
    oyunuBitir(d, 'sure', simdi);
    return { ok: true, durum: d };
  }

  const hata = islem(d, eylem, rastgele, gorevler, simdi);
  if (hata) {
    return { ok: false, hata: hata };
  }
  return { ok: true, durum: d };
}

// Biten oyunun kazananları (indeks listesi). Oyun bitmediyse boş; eşitlikte birden çok indeks gelir.
export function kazananlar(d) {
  if (d.asama !== 'bitti' || !d.sonuc) {
    return [];
  }
  return d.sonuc.kazananlar.slice();
}

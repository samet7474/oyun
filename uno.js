// uno.js - Saf UNO motoru.
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'oyna', id: oyuncuId, kart: 12, renk: 'mavi' }, rastgele);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Rastgelelik: karıştırma için kullanılan fonksiyon (0 <= x < 1) dışarıdan verilir,
// böylece testler her seferinde aynı sonucu alır.

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const RENKLER = ['kirmizi', 'sari', 'yesil', 'mavi'];

export const RENK_ADLARI = {
  kirmizi: 'Kırmızı',
  sari: 'Sarı',
  yesil: 'Yeşil',
  mavi: 'Mavi',
};

export const MAKS_OYUNCU = 4;
export const EL_BOYU = 7;

// Hedef puan seçenekleri. 0 = "Tek el" (tek el oyunu bitirir).
export const HEDEFLER = [500, 200, 0];

// Kart tipleri: sayi, atla, ters, cek2, joker, cek4

// ---------------------------------------------------------------------------
// Deste ve kartlar
// ---------------------------------------------------------------------------

// 108 kartlık desteyi sırayla kurar. Her kartın benzersiz bir id'si vardır (0-107).
export function desteKur() {
  const deste = [];
  let sayac = 0;

  function ekle(renk, tip, sayi) {
    deste.push({ id: sayac, renk: renk, tip: tip, sayi: sayi });
    sayac += 1;
  }

  for (const renk of RENKLER) {
    // Her renkte bir tane 0
    ekle(renk, 'sayi', 0);
    // 1-9 arası ikişer tane
    for (let s = 1; s <= 9; s++) {
      ekle(renk, 'sayi', s);
      ekle(renk, 'sayi', s);
    }
    // Atla, Ters, +2 ikişer tane
    for (let i = 0; i < 2; i++) {
      ekle(renk, 'atla', null);
      ekle(renk, 'ters', null);
      ekle(renk, 'cek2', null);
    }
  }

  // 4 Joker ve 4 Joker +4 (renksiz)
  for (let i = 0; i < 4; i++) {
    ekle(null, 'joker', null);
  }
  for (let i = 0; i < 4; i++) {
    ekle(null, 'cek4', null);
  }

  return deste;
}

// Fisher-Yates karıştırma. Yeni bir dizi döndürür.
export function karistir(dizi, rastgele = Math.random) {
  const yeni = dizi.slice();
  for (let i = yeni.length - 1; i > 0; i--) {
    const j = Math.floor(rastgele() * (i + 1));
    const gecici = yeni[i];
    yeni[i] = yeni[j];
    yeni[j] = gecici;
  }
  return yeni;
}

// Bir kartın el sonu puan değeri.
export function kartPuani(kart) {
  if (kart.tip === 'sayi') {
    return kart.sayi;
  }
  if (kart.tip === 'joker' || kart.tip === 'cek4') {
    return 50;
  }
  return 20;
}

// Eli göstermek için sıralama: önce renk, sonra değer. Jokerler en sonda.
export function kartSirala(a, b) {
  const sira = { sayi: 0, atla: 1, ters: 2, cek2: 3, joker: 4, cek4: 5 };
  const ra = a.renk ? RENKLER.indexOf(a.renk) : 99;
  const rb = b.renk ? RENKLER.indexOf(b.renk) : 99;
  if (ra !== rb) {
    return ra - rb;
  }
  if (a.tip !== b.tip) {
    return sira[a.tip] - sira[b.tip];
  }
  return (a.sayi || 0) - (b.sayi || 0);
}

// ---------------------------------------------------------------------------
// Oda ve oyuncu
// ---------------------------------------------------------------------------

function yeniOyuncu(id, ad) {
  return { id: id, ad: ad, el: [], puan: 0, uno: false };
}

// Boş bir lobi durumu kurar.
export function yeniOda(sahipId, sahipAd) {
  return {
    oyun: 'uno',
    asama: 'lobi', // lobi | oyun | el_sonu | bitti
    sahip: sahipId,
    ayar: { istif: false, hedef: 500 },
    oyuncular: [yeniOyuncu(sahipId, temizAd(sahipAd))],
    deste: [], // son eleman destenin üstüdür
    atik: [], // son eleman atık destenin üstüdür
    yon: 1, // 1 = ileri, -1 = geri
    sira: 0, // sırası gelen oyuncunun indeksi
    dagitici: 0,
    renk: null, // geçerli renk
    renkBekle: false, // açılış kartı Joker ise ilk oyuncu renk seçecek
    cektiMi: false, // bu tur kart çekildi mi
    cekilenKart: null, // çekilen kartın id'si (yalnız onu atabilir)
    bekleyen: 0, // +2 yığını (yalnız yığma açıkken)
    itiraz: null, // { hedef, kuran, eskiRenk, yasadisi }
    yakala: null, // UNO demeyen oyuncunun indeksi (yakalama penceresi)
    elNo: 0,
    elKazanan: null,
    elPuani: 0,
    oyunKazanan: null,
    olay: null, // son olay (arayüz bunu yazıya çevirir)
  };
}

function temizAd(ad) {
  let s = String(ad || '').replace(/\s+/g, ' ').trim();
  s = s.slice(0, 12).trim();
  if (s === '') {
    s = 'Oyuncu';
  }
  return s;
}

// Aynı isimde iki kişi olmasın.
function benzersizAd(d, ad) {
  let aday = ad;
  let n = 2;
  const kucuk = (x) => x.toLocaleLowerCase('tr');
  while (d.oyuncular.some((o) => kucuk(o.ad) === kucuk(aday))) {
    aday = ad.slice(0, 9) + ' ' + n;
    n += 1;
  }
  return aday;
}

export function oyuncuIndeks(d, id) {
  return d.oyuncular.findIndex((o) => o.id === id);
}

// Verilen indeksten adim kadar ilerideki oyuncu (yöne göre).
function sonraki(d, idx, adim = 1) {
  const n = d.oyuncular.length;
  return (((idx + d.yon * adim) % n) + n) % n;
}

function olayYaz(d, olay) {
  const no = d.olay ? d.olay.no + 1 : 1;
  d.olay = Object.assign({ no: no }, olay);
}

// ---------------------------------------------------------------------------
// Kart çekme (deste bitince atığı karıştırır)
// ---------------------------------------------------------------------------

function desteyiYenile(d, rastgele) {
  if (d.atik.length <= 1) {
    return;
  }
  const ust = d.atik.pop();
  d.deste = karistir(d.atik, rastgele);
  d.atik = [ust];
}

// Oyuncuya adet kadar kart verir. Gerçekten verilen kartları döndürür.
function kartCek(d, idx, adet, rastgele) {
  const cekilen = [];
  for (let i = 0; i < adet; i++) {
    if (d.deste.length === 0) {
      desteyiYenile(d, rastgele);
    }
    if (d.deste.length === 0) {
      break; // hem deste hem atık bitti
    }
    const kart = d.deste.pop();
    d.oyuncular[idx].el.push(kart);
    cekilen.push(kart);
  }
  if (cekilen.length > 0) {
    // Kart çeken kişinin UNO işareti düşer
    d.oyuncular[idx].uno = false;
  }
  return cekilen;
}

// ---------------------------------------------------------------------------
// Kart kuralları
// ---------------------------------------------------------------------------

// Kart, geçerli renge / sayıya / simgeye uyuyor mu?
// Joker +4 için katı kural: elde geçerli renkte kart olmamalı.
export function oynanabilir(d, kart, el) {
  if (kart.tip === 'joker') {
    return true;
  }
  if (kart.tip === 'cek4') {
    return !el.some((k) => k.renk === d.renk);
  }
  if (kart.renk === d.renk) {
    return true;
  }
  const ust = d.atik[d.atik.length - 1];
  if (ust && ust.tip === kart.tip) {
    if (kart.tip === 'sayi') {
      return ust.sayi === kart.sayi;
    }
    return true; // atla/atla, ters/ters, +2/+2
  }
  return false;
}

// Arayüz için: bu oyuncu bu kartı şimdi atabilir mi?
// 'evet'  : normal olarak atılabilir
// 'blof'  : Joker +4, kuralına aykırı (elde geçerli renk var) ama atılabilir; itiraz edilirse ceza yer
// 'hayir' : atılamaz
export function atilabilirlik(d, oyuncuId, kart) {
  if (d.asama !== 'oyun') {
    return 'hayir';
  }
  const idx = oyuncuIndeks(d, oyuncuId);
  if (idx < 0 || d.sira !== idx || d.renkBekle || d.itiraz) {
    return 'hayir';
  }
  if (d.cektiMi && kart.id !== d.cekilenKart) {
    return 'hayir';
  }
  if (d.bekleyen > 0) {
    return kart.tip === 'cek2' ? 'evet' : 'hayir';
  }
  const el = d.oyuncular[idx].el;
  if (oynanabilir(d, kart, el)) {
    return 'evet';
  }
  if (kart.tip === 'cek4') {
    return 'blof';
  }
  return 'hayir';
}

// ---------------------------------------------------------------------------
// Ortak kontroller
// ---------------------------------------------------------------------------

// Sıra isteyen hareketler (oyna, çek, pas) için ortak kontrol. Hata mesajı ya da null.
function siraKontrol(d, idx) {
  if (d.asama !== 'oyun') {
    return 'Şu an oyun yok.';
  }
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.sira !== idx) {
    return 'Sıra sende değil.';
  }
  if (d.renkBekle) {
    return 'Önce rengi seç.';
  }
  if (d.itiraz) {
    return 'Önce itiraz et ya da kabul et.';
  }
  return null;
}

// Eli bitiren oyuncuya puan yazar, eli ya da oyunu kapatır.
function elBitir(d, kazanan) {
  let puan = 0;
  d.oyuncular.forEach((o, i) => {
    if (i !== kazanan) {
      puan += o.el.reduce((toplam, k) => toplam + kartPuani(k), 0);
    }
  });
  d.oyuncular[kazanan].puan += puan;
  d.elKazanan = kazanan;
  d.elPuani = puan;
  d.yakala = null;
  d.itiraz = null;
  d.bekleyen = 0;
  d.cektiMi = false;
  d.cekilenKart = null;

  const hedefeVardi = d.ayar.hedef === 0 || d.oyuncular[kazanan].puan >= d.ayar.hedef;
  if (hedefeVardi) {
    d.asama = 'bitti';
    d.oyunKazanan = kazanan;
  } else {
    d.asama = 'el_sonu';
  }
}

// Yeni el kurar: karıştır, 7'şer dağıt, açılış kartını çevir.
function elBaslat(d, rastgele) {
  const n = d.oyuncular.length;
  let deste = karistir(desteKur(), rastgele);

  d.oyuncular.forEach((o) => {
    o.el = [];
    o.uno = false;
  });
  for (let tur = 0; tur < EL_BOYU; tur++) {
    for (let i = 0; i < n; i++) {
      d.oyuncular[i].el.push(deste.pop());
    }
  }

  // Açılış kartı Joker +4 ise desteye geri koy, karıştır, tekrar çevir.
  let acilis = deste.pop();
  while (acilis.tip === 'cek4') {
    deste.push(acilis);
    deste = karistir(deste, rastgele);
    acilis = deste.pop();
  }

  d.deste = deste;
  d.atik = [acilis];
  d.yon = 1;
  d.renk = acilis.renk;
  d.renkBekle = false;
  d.cektiMi = false;
  d.cekilenKart = null;
  d.bekleyen = 0;
  d.itiraz = null;
  d.yakala = null;
  d.elKazanan = null;
  d.elPuani = 0;
  d.oyunKazanan = null;
  d.asama = 'oyun';
  d.elNo += 1;

  const ilk = (d.dagitici + 1) % n;
  d.sira = ilk;
  const olay = { tip: 'el', kart: acilis, kim: ilk, etki: 'yok' };

  if (acilis.tip === 'joker') {
    // İlk oyuncu rengi seçer
    d.renk = null;
    d.renkBekle = true;
    olay.etki = 'renk';
  } else if (acilis.tip === 'cek2') {
    // İlk oyuncu 2 kart çeker, sırasını kaybeder
    const cekilen = kartCek(d, ilk, 2, rastgele);
    d.sira = sonraki(d, ilk);
    olay.etki = 'cek';
    olay.hedef = ilk;
    olay.adet = cekilen.length;
  } else if (acilis.tip === 'atla') {
    // İlk oyuncu atlanır
    d.sira = sonraki(d, ilk);
    olay.etki = 'atla';
    olay.hedef = ilk;
  } else if (acilis.tip === 'ters') {
    // Yön döner, dağıtıcı başlar (2 kişide de dağıtıcı başlar)
    d.yon = -1;
    d.sira = d.dagitici;
    olay.etki = 'ters';
    olay.kim = d.dagitici;
  }

  olayYaz(d, olay);
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
    return 'Oda dolu (en fazla 4 kişi).';
  }
  const ad = benzersizAd(d, temizAd(e.ad));
  d.oyuncular.push(yeniOyuncu(e.id, ad));
  if (d.oyuncular.length === 1) {
    d.sahip = e.id;
  }
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
  if (ayar.istif !== undefined) {
    d.ayar.istif = Boolean(ayar.istif);
  }
  if (ayar.hedef !== undefined) {
    if (!HEDEFLER.includes(ayar.hedef)) {
      return 'Geçersiz hedef puan.';
    }
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
  if (d.oyuncular.length < 2) {
    return 'En az 2 kişi gerekli.';
  }
  d.oyuncular.forEach((o) => {
    o.puan = 0;
  });
  d.dagitici = 0;
  d.elNo = 0;
  elBaslat(d, rastgele);
  return null;
}

function sonrakiElIsle(d, e, rastgele) {
  if (d.asama !== 'el_sonu') {
    return 'Şu an yeni el başlatılamaz.';
  }
  if (e.id !== d.sahip) {
    return 'Sonraki eli sadece ev sahibi başlatır.';
  }
  d.dagitici = (d.dagitici + 1) % d.oyuncular.length;
  elBaslat(d, rastgele);
  return null;
}

function yeniOyunIsle(d, e) {
  if (d.asama === 'lobi') {
    return 'Zaten lobidesin.';
  }
  if (e.id !== d.sahip) {
    return 'Sadece ev sahibi yeni oyun başlatır.';
  }
  d.asama = 'lobi';
  d.oyuncular.forEach((o) => {
    o.el = [];
    o.puan = 0;
    o.uno = false;
  });
  d.deste = [];
  d.atik = [];
  d.yon = 1;
  d.sira = 0;
  d.dagitici = 0;
  d.renk = null;
  d.renkBekle = false;
  d.cektiMi = false;
  d.cekilenKart = null;
  d.bekleyen = 0;
  d.itiraz = null;
  d.yakala = null;
  d.elNo = 0;
  d.elKazanan = null;
  d.elPuani = 0;
  d.oyunKazanan = null;
  d.olay = null;
  return null;
}

// Açılış kartı Joker ise ilk oyuncu rengi seçer.
function renkSecIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (d.asama !== 'oyun' || !d.renkBekle) {
    return 'Şu an renk seçilmez.';
  }
  if (idx !== d.sira) {
    return 'Sıra sende değil.';
  }
  if (!RENKLER.includes(e.renk)) {
    return 'Bir renk seç.';
  }
  d.renk = e.renk;
  d.renkBekle = false;
  olayYaz(d, { tip: 'renk', kim: idx, renk: e.renk });
  return null;
}

function oynaIsle(d, e, rastgele) {
  const idx = oyuncuIndeks(d, e.id);
  const hata = siraKontrol(d, idx);
  if (hata) {
    return hata;
  }
  const o = d.oyuncular[idx];
  const kart = o.el.find((k) => k.id === e.kart);
  if (!kart) {
    return 'Bu kart elinde yok.';
  }
  if (d.cektiMi && kart.id !== d.cekilenKart) {
    return 'Sadece çektiğin kartı atabilirsin.';
  }
  if (d.bekleyen > 0 && kart.tip !== 'cek2') {
    return 'Ya +2 at ya da kartları çek.';
  }
  if (atilabilirlik(d, e.id, kart) === 'hayir') {
    return 'Bu kartı atamazsın.';
  }
  const renkliJoker = kart.tip === 'joker' || kart.tip === 'cek4';
  if (renkliJoker && !RENKLER.includes(e.renk)) {
    return 'Bir renk seç.';
  }

  // --- Hareket geçerli, uygula ---
  const eskiRenk = d.renk;
  o.el = o.el.filter((k) => k.id !== kart.id);
  d.atik.push(kart);
  d.renk = renkliJoker ? e.renk : kart.renk;
  d.cektiMi = false;
  d.cekilenKart = null;
  d.yakala = null; // sıradaki oyuncunun hareketi UNO yakalama penceresini kapatır

  const n = d.oyuncular.length;
  const bitti = o.el.length === 0;
  const sonraki1 = sonraki(d, idx, 1);
  const olay = { tip: 'oyna', kim: idx, kart: kart, renk: d.renk, etki: 'yok' };

  if (kart.tip === 'sayi' || kart.tip === 'joker') {
    d.sira = sonraki1;
  } else if (kart.tip === 'atla') {
    olay.etki = 'atla';
    olay.hedef = sonraki1;
    d.sira = sonraki(d, idx, 2);
  } else if (kart.tip === 'ters') {
    d.yon = -d.yon;
    olay.etki = 'ters';
    if (n === 2) {
      // İki kişide Ters = Atla: sıra yine oynayanda
      olay.hedef = sonraki(d, idx, 1);
      d.sira = idx;
    } else {
      d.sira = sonraki(d, idx, 1);
    }
  } else if (kart.tip === 'cek2') {
    if (d.ayar.istif && !bitti) {
      // Yığma: ceza birikir, sıradaki ya +2 koyar ya hepsini çeker
      d.bekleyen += 2;
      olay.etki = 'yigin';
      olay.hedef = sonraki1;
      olay.adet = d.bekleyen;
      d.sira = sonraki1;
    } else {
      const adet = d.bekleyen + 2;
      d.bekleyen = 0;
      const cekilen = kartCek(d, sonraki1, adet, rastgele);
      olay.etki = 'cek';
      olay.hedef = sonraki1;
      olay.adet = cekilen.length;
      d.sira = sonraki(d, idx, 2);
    }
  } else if (kart.tip === 'cek4') {
    if (bitti) {
      // Eli bitiren +4: sıradaki yine de 4 kart çeker (puanı etkiler), itiraz yok
      const cekilen = kartCek(d, sonraki1, 4, rastgele);
      olay.etki = 'cek';
      olay.hedef = sonraki1;
      olay.adet = cekilen.length;
      d.sira = sonraki(d, idx, 2);
    } else {
      // Sıradaki oyuncu itiraz edebilir. Eski rengi ve elde o renk var mıydı, hatırla.
      d.itiraz = {
        hedef: sonraki1,
        kuran: idx,
        eskiRenk: eskiRenk,
        yasadisi: o.el.some((k) => k.renk === eskiRenk),
      };
      olay.etki = 'cek4bekle';
      olay.hedef = sonraki1;
      d.sira = sonraki1;
    }
  }

  olayYaz(d, olay);

  if (bitti) {
    elBitir(d, idx);
  } else if (o.el.length === 1 && !o.uno) {
    // UNO demeden tek karta düştü: yakalanabilir
    d.yakala = idx;
  }
  return null;
}

function cekIsle(d, e, rastgele) {
  const idx = oyuncuIndeks(d, e.id);
  const hata = siraKontrol(d, idx);
  if (hata) {
    return hata;
  }
  if (d.cektiMi) {
    return 'Bu tur zaten kart çektin. Kartı at ya da pas geç.';
  }
  d.yakala = null;

  if (d.bekleyen > 0) {
    // Yığılmış +2'leri çek, sırayı kaybet
    const cekilen = kartCek(d, idx, d.bekleyen, rastgele);
    d.bekleyen = 0;
    d.sira = sonraki(d, idx, 1);
    olayYaz(d, { tip: 'cek', kim: idx, adet: cekilen.length, ceza: true });
  } else {
    const cekilen = kartCek(d, idx, 1, rastgele);
    d.cektiMi = true;
    d.cekilenKart = cekilen.length > 0 ? cekilen[0].id : null;
    olayYaz(d, { tip: 'cek', kim: idx, adet: cekilen.length, ceza: false });
  }
  return null;
}

function pasIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  const hata = siraKontrol(d, idx);
  if (hata) {
    return hata;
  }
  if (!d.cektiMi) {
    return 'Pas için önce kart çekmelisin.';
  }
  d.yakala = null;
  d.cektiMi = false;
  d.cekilenKart = null;
  d.sira = sonraki(d, idx, 1);
  olayYaz(d, { tip: 'pas', kim: idx });
  return null;
}

function unoIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (d.asama !== 'oyun' || idx < 0) {
    return 'Şu an UNO denmez.';
  }
  const o = d.oyuncular[idx];
  if (o.uno) {
    return 'Zaten UNO dedin.';
  }
  const kendiSirasinda2Kart = d.sira === idx && o.el.length === 2;
  const pencereAcik = o.el.length === 1 && d.yakala === idx;
  if (!kendiSirasinda2Kart && !pencereAcik) {
    return 'Şimdi UNO diyemezsin.';
  }
  o.uno = true;
  if (pencereAcik) {
    d.yakala = null;
  }
  olayYaz(d, { tip: 'uno', kim: idx });
  return null;
}

function yakalaIsle(d, e, rastgele) {
  const idx = oyuncuIndeks(d, e.id);
  if (d.asama !== 'oyun' || idx < 0) {
    return 'Şu an yakalanmaz.';
  }
  if (d.yakala === null) {
    return 'Yakalanacak kimse yok.';
  }
  if (d.yakala === idx) {
    return 'Kendini yakalayamazsın.';
  }
  const hedef = d.yakala;
  d.yakala = null;
  const cekilen = kartCek(d, hedef, 2, rastgele);
  olayYaz(d, { tip: 'yakala', kim: idx, hedef: hedef, adet: cekilen.length });
  return null;
}

// +4 oynanan kişi dışında yalnızca hedef oyuncu itiraz edebilir
function itirazKontrol(d, idx) {
  if (d.asama !== 'oyun' || !d.itiraz) {
    return 'Şu an itiraz edilecek bir şey yok.';
  }
  if (idx !== d.itiraz.hedef) {
    return 'Bu karar sana ait değil.';
  }
  return null;
}

function itirazIsle(d, e, rastgele) {
  const idx = oyuncuIndeks(d, e.id);
  const hata = itirazKontrol(d, idx);
  if (hata) {
    return hata;
  }
  const it = d.itiraz;
  d.itiraz = null;
  d.yakala = null;

  if (it.yasadisi) {
    // +4 kurala aykırıydı: atan 4 kart çeker, itiraz eden normal oynar
    const cekilen = kartCek(d, it.kuran, 4, rastgele);
    olayYaz(d, { tip: 'itiraz', kim: idx, hedef: it.kuran, sonuc: 'yasadisi', adet: cekilen.length });
  } else {
    // +4 kurala uygundu: itiraz eden 6 kart çeker, sırasını kaybeder
    const cekilen = kartCek(d, idx, 6, rastgele);
    d.sira = sonraki(d, idx, 1);
    olayYaz(d, { tip: 'itiraz', kim: idx, hedef: it.kuran, sonuc: 'yasal', adet: cekilen.length });
  }
  return null;
}

function kabulIsle(d, e, rastgele) {
  const idx = oyuncuIndeks(d, e.id);
  const hata = itirazKontrol(d, idx);
  if (hata) {
    return hata;
  }
  const it = d.itiraz;
  d.itiraz = null;
  d.yakala = null;
  const cekilen = kartCek(d, idx, 4, rastgele);
  d.sira = sonraki(d, idx, 1);
  olayYaz(d, { tip: 'kabul', kim: idx, hedef: it.kuran, adet: cekilen.length });
  return null;
}

const HAREKETLER = {
  katil: katilIsle,
  cikar: cikarIsle,
  ayarla: ayarlaIsle,
  baslat: baslatIsle,
  sonrakiEl: sonrakiElIsle,
  yeniOyun: yeniOyunIsle,
  renkSec: renkSecIsle,
  oyna: oynaIsle,
  cek: cekIsle,
  pas: pasIsle,
  uno: unoIsle,
  yakala: yakalaIsle,
  itiraz: itirazIsle,
  kabul: kabulIsle,
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

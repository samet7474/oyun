// gizliyol.js - Saf "Gizli Yol" motoru (tam 2 kişi, aynı anda oynanan hafıza ve zekâ oyunu).
// DOM yok, Supabase yok. Durum girer, yeni durum çıkar (girdi hiç değişmez).
//
// Kullanım:
//   const sonuc = uygula(durum, { tip: 'kare', id: oyuncuId, tur: 0, satir: 9, sutun: 2 }, rastgele);
//   sonuc.ok === true  -> sonuc.durum yeni durumdur
//   sonuc.ok === false -> sonuc.hata kısa bir Türkçe mesajdır
//
// Oyun: Tahta 6 sütun, 8 ya da 10 satırdır (ayar). Her oyuncu her satırdan tam bir kutu seçer:
// bu onun gizli yoludur. Sonra herkes rakibin yolunu alttan yukarı bulmaya çalışır.
// Çözmeye başlamadan önce bir kez "Bak" ile rakibin yolunu ayardaki süre kadar görebilir.
// Yanlış kutu kalıcı çarpı olur, hata +1, oyuncu aynı satırda devam eder. Az hata yapan turu alır.
//
// Konum: satir 0 = üst satır, satir (satirSayisi - 1) = alt satır; sutun 0..5.
// Yol, satır sırasıyla sütun numaralarının listesidir: yol[satir] = sutun (uzunluğu satirSayisi).
// Rastgelelik bu oyunda yok; imza diğer oyunlarla aynı kalsın diye parametre duruyor.
//
// Aşamalar: lobi -> kurma -> bulma -> acik -> (kurma -> bulma -> acik) ... -> bitti
//   kurma : herkes kendi yolunu seçiyor, "Hazırım" bekleniyor
//   bulma : herkes rakibin yolunu arıyor (sıra yok)
//   acik  : iki yol da açık, tur sonucu
//   bitti : son turdan sonra özet
//
// Yollar durumda tutulur (durum satırı herkese açıktır, bilinen sınır): ekran, Bak süresi dışında
// rakibin yolunu hiçbir yerde çizmez.

import { oyuncuIndeks, temizAd, benzersizAd } from './uno.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

export const SUTUN_SAYISI = 6;

export const SATIR_SAYILARI = [8, 10];
export const VARSAYILAN_SATIR_SAYISI = 10;

// Bak süresi (saniye)
// Bak süresi kaydırıcıyla saniye saniye seçilir
export const EN_AZ_BAKMA_SURESI = 1;
export const EN_COK_BAKMA_SURESI = 20;
export const VARSAYILAN_BAKMA_SURESI = 5;

export const OYUNCU_SAYISI = 2;

export const TUR_SAYILARI = [1, 3, 5];
export const VARSAYILAN_TUR_SAYISI = 3;

// Bu kadar hataya ulaşan oyuncu pes edebilir. Pes edince tur bu kadar hata sayılır.
export const PES_HATASI = 25;

// Yeni kurallı odaların işareti. Bu işaret yoksa oda eski (komşu kareli yol) biçimindedir.
export const KURAL = 'satir';

// ---------------------------------------------------------------------------
// Ayar ve eski oda yardımcıları
// ---------------------------------------------------------------------------

// Oda eski biçimde mi? (eski ayar enAzKare ve kare listesi yolları)
export function eskiDurumMu(d) {
  return Boolean(d) && d.kural !== KURAL;
}

// Ayardan satır sayısı (geçersizse varsayılan)
export function satirSayisiOku(d) {
  const deger = d && d.ayar ? d.ayar.satirSayisi : undefined;
  return SATIR_SAYILARI.includes(deger) ? deger : VARSAYILAN_SATIR_SAYISI;
}

// Ayardan Bak süresi (geçersizse varsayılan)
export function bakmaSuresiOku(d) {
  const deger = d && d.ayar ? d.ayar.bakmaSuresi : undefined;
  return bakmaSuresiGecerli(deger) ? deger : VARSAYILAN_BAKMA_SURESI;
}

// 1 ile 20 arasında tam sayı mı?
export function bakmaSuresiGecerli(deger) {
  return Number.isInteger(deger) && deger >= EN_AZ_BAKMA_SURESI && deger <= EN_COK_BAKMA_SURESI;
}

// Ayardan tur sayısı (geçersizse varsayılan)
export function turSayisiOku(d) {
  const deger = d && d.ayar ? d.ayar.turSayisi : undefined;
  return TUR_SAYILARI.includes(deger) ? deger : VARSAYILAN_TUR_SAYISI;
}

// Eski bir odayı yeni kurallara çevirir: eski ayar silinir, yenisi varsayılan olur, tur sayısı kalır.
function kuraliYenile(d) {
  d.kural = KURAL;
  d.ayar = {
    turSayisi: turSayisiOku(d),
    satirSayisi: VARSAYILAN_SATIR_SAYISI,
    bakmaSuresi: VARSAYILAN_BAKMA_SURESI,
  };
  d.tur = 0;
  d.yollar = [];
  d.hazir = [];
  d.bulma = [];
  d.gecmis = [];
}

// ---------------------------------------------------------------------------
// Kutu ve yol yardımcıları
// ---------------------------------------------------------------------------

function tamSayiMi(x) {
  return Number.isInteger(x);
}

export function sutundaMi(sutun) {
  return tamSayiMi(sutun) && sutun >= 0 && sutun < SUTUN_SAYISI;
}

// Tahtanın içinde mi?
export function karedeMi(satir, sutun, satirSayisi = VARSAYILAN_SATIR_SAYISI) {
  return tamSayiMi(satir) && satir >= 0 && satir < satirSayisi && sutundaMi(sutun);
}

export function kareAnahtari(satir, sutun) {
  return satir + ',' + sutun;
}

// Yol geçerli mi? Hata mesajı ya da null. Her satırdan tam bir kutu seçilmeli.
export function yolHatasi(yol, satirSayisi = VARSAYILAN_SATIR_SAYISI) {
  if (!Array.isArray(yol)) {
    return 'Önce her satırdan bir kutu seç.';
  }
  if (yol.length !== satirSayisi) {
    return 'Her satırdan bir kutu seçmelisin (' + satirSayisi + ' satır).';
  }
  for (let s = 0; s < yol.length; s++) {
    if (!sutundaMi(yol[s])) {
      return 'Her satırdan bir kutu seçmelisin.';
    }
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
    bulunan: 0, // doğru bulunan satır sayısı (alttan sayılır)
    hata: 0, // bu turdaki hata sayısı
    yanlislar: [], // kalıcı kırmızı işaretler: { satir, sutun }
    bakti: false, // Bak hakkını kullandı mı
    bakmaZamani: null, // Bak'a basılan an (ms, o oyuncunun saati)
    tahminYapti: false, // en az bir tahmin yaptı mı (Bak hakkı yanar)
    bitti: false,
    pes: false,
  };
}

// Verilen oyuncularla (id, ad) boş bir lobi kurar. Oyun değiştirirken de bu kullanılır.
export function lobiKur(oyuncular, sahipId) {
  return {
    oyun: 'gizliyol',
    kural: KURAL,
    asama: 'lobi', // lobi | kurma | bulma | acik | bitti
    sahip: sahipId,
    ayar: {
      turSayisi: VARSAYILAN_TUR_SAYISI,
      satirSayisi: VARSAYILAN_SATIR_SAYISI,
      bakmaSuresi: VARSAYILAN_BAKMA_SURESI,
    },
    oyuncular: oyuncular.map((o) => yeniOyuncu(o.id, o.ad)),
    tur: 0, // şu anki turun indeksi
    yollar: [], // oyuncu i'nin kendi seçtiği yol: [sutun, ...] ya da null
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

// Bir oyuncunun bu turdaki durumu
export function oyuncuDurumu(d, i) {
  const ilerleme = (d.bulma && d.bulma[i]) || bosIlerleme();
  return {
    bulunan: ilerleme.bulunan,
    hata: ilerleme.hata,
    bitti: ilerleme.bitti,
    pes: ilerleme.pes,
    bakti: ilerleme.bakti,
    bakmaZamani: ilerleme.bakmaZamani,
    tahminYapti: ilerleme.tahminYapti,
    bakabilir: !ilerleme.bitti && !ilerleme.bakti && !ilerleme.tahminYapti,
    pesEdebilir: !ilerleme.bitti && ilerleme.hata >= PES_HATASI,
  };
}

// i. oyuncunun şu an aradığı satır (üst satır 0). Bitirdiyse null.
export function siradakiSatir(d, i) {
  const ilerleme = d.bulma && d.bulma[i];
  if (!ilerleme || ilerleme.bitti || ilerleme.bulunan >= satirSayisiOku(d)) {
    return null;
  }
  return satirSayisiOku(d) - 1 - ilerleme.bulunan;
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

// i. oyuncunun sıradaki satırdaki doğru kutusu: [satir, sutun] (ekran kullanmaz, testler kullanır)
export function sonrakiDogruKare(d, i) {
  const satir = siradakiSatir(d, i);
  const yol = d.yollar[rakipIndeks(i)];
  if (satir === null || !yol) {
    return null;
  }
  return [satir, yol[satir]];
}

// Bu kutuya dokunmak hata sayılır mı? Hata değilse { neden, hata } (yalnız uyarı), değilse null.
//   neden: sinir | sira | bulundu | isaretli
// Arayüz göndermeden önce çağırır; motor aynı kontrolü yapar.
export function kareUyarisi(d, i, satir, sutun) {
  const satirSayisi = satirSayisiOku(d);
  if (!karedeMi(satir, sutun, satirSayisi)) {
    return { neden: 'sinir', hata: 'Bu kutu tahtada yok.' };
  }
  const ilerleme = d.bulma[i];
  const sirada = satirSayisi - 1 - ilerleme.bulunan;
  if (satir > sirada) {
    return { neden: 'bulundu', hata: 'Bu satırı zaten buldun.' };
  }
  if (satir !== sirada) {
    return { neden: 'sira', hata: 'Sıra alttan ' + (ilerleme.bulunan + 1) + '. satırda. Önce onu bul.' };
  }
  if (ilerleme.yanlislar.some((y) => y.satir === satir && y.sutun === sutun)) {
    return { neden: 'isaretli', hata: 'Bu kutu yanlıştı, başka kutu dene.' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tur kurma ve bitirme
// ---------------------------------------------------------------------------

// Yeni tura geç: yollar silinir, herkes yolunu baştan seçer
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
  if (ayar.satirSayisi !== undefined && !SATIR_SAYILARI.includes(ayar.satirSayisi)) {
    return 'Geçersiz satır sayısı.';
  }
  if (ayar.bakmaSuresi !== undefined && !bakmaSuresiGecerli(ayar.bakmaSuresi)) {
    return 'Geçersiz bakma süresi.';
  }
  if (ayar.turSayisi !== undefined) {
    d.ayar.turSayisi = ayar.turSayisi;
  }
  if (ayar.satirSayisi !== undefined) {
    d.ayar.satirSayisi = ayar.satirSayisi;
  }
  if (ayar.bakmaSuresi !== undefined) {
    d.ayar.bakmaSuresi = ayar.bakmaSuresi;
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
    return 'Şu an yol seçilmez.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  if (d.hazir[idx]) {
    return 'Zaten hazırsın.';
  }
  const sorun = yolHatasi(e.yol, satirSayisiOku(d));
  if (sorun) {
    return sorun;
  }
  d.yollar[idx] = e.yol.slice();
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

// Bak: rakibin yolunu görme hakkı. Her turda bir kez, tahminden önce.
// Yolun ne zaman gizleneceğini ekran kendi saatine göre bulur; motor yalnız "baktı" bilgisini tutar.
function bakIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'bulma') {
    return 'Şu an bakılmaz.';
  }
  if (e.tur !== undefined && e.tur !== d.tur) {
    return 'Bu tur geçti.';
  }
  const ilerleme = d.bulma[idx];
  if (ilerleme.bitti) {
    return 'Yolu bitirdin.';
  }
  if (ilerleme.bakti) {
    return 'Bu turda zaten baktın.';
  }
  if (ilerleme.tahminYapti) {
    return 'Tahmine başladın, artık bakamazsın.';
  }
  ilerleme.bakti = true;
  ilerleme.bakmaZamani = Number.isFinite(e.zaman) ? e.zaman : null;
  return null;
}

// Rakibin yolunda bir kutuya dokun
function kareIsle(d, e) {
  const idx = oyuncuIndeks(d, e.id);
  if (idx < 0) {
    return 'Bu odada değilsin.';
  }
  if (d.asama !== 'bulma') {
    return 'Şu an kutu seçilmez.';
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

  // İlk tahmin Bak hakkını yakar
  ilerleme.tahminYapti = true;

  const yol = d.yollar[rakipIndeks(idx)];
  if (yol[e.satir] === e.sutun) {
    ilerleme.bulunan += 1;
    if (ilerleme.bulunan >= satirSayisiOku(d)) {
      ilerleme.bitti = true;
    }
  } else {
    // Yanlış: kalıcı işaret, hata +1, aynı satırda devam
    ilerleme.yanlislar.push({ satir: e.satir, sutun: e.sutun });
    ilerleme.hata += 1;
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
  bak: bakIsle,
  kare: kareIsle,
  pes: pesIsle,
  sonraki: sonrakiIsle,
  tekrarOyna: tekrarOynaIsle,
  yeniOyun: yeniOyunIsle,
};

// Eski odada oyun ortasında bunlar çalışır (oyun verisine dokunmazlar)
const ESKI_ODADA_SERBEST = ['katil', 'cikar', 'yeniOyun'];

// Tek giriş noktası. Girdi durumu değişmez.
export function uygula(durum, eylem, rastgele = Math.random) {
  const islem = HAREKETLER[eylem && eylem.tip];
  if (!islem) {
    return { ok: false, hata: 'Bilinmeyen hareket.' };
  }
  const d = structuredClone(durum);
  if (eskiDurumMu(d)) {
    if (d.asama === 'lobi') {
      // Eski lobi sessizce yeni kurallara geçer
      kuraliYenile(d);
    } else if (!ESKI_ODADA_SERBEST.includes(eylem.tip)) {
      return { ok: false, hata: 'Bu oda eski kurallarla başlamıştı. Ev sahibi lobiye dönüp yeniden başlatmalı.' };
    }
  }
  const hata = islem(d, eylem, rastgele);
  if (hata) {
    return { ok: false, hata: hata };
  }
  if (eskiDurumMu(d)) {
    // Eski odadan lobiye dönüldü: yeni kurallara geç
    kuraliYenile(d);
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

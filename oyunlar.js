// oyunlar.js - Oyun yönlendirici.
// Odadaki durum.oyun alanına bakıp hareketi doğru motora verir ve oyun seçimini ('oyunSec') yapar.
// app.js hareketleri yalnız buradan geçirir. DOM yok, Supabase yok.
//
// Eski odalar durum.oyun = 'uno' ile kurulmuştu; alan hiç yoksa da UNO sayılır.

import * as uno from './uno.js';
import * as tanis from './tanis.js';
import * as kelime from './kelime.js';
import * as aynikafa from './aynikafa.js';
import * as gizliyol from './gizliyol.js';
import * as gorev from './gorev.js';
import * as element from './element.js';
import * as kule from './kule.js';

// Her oyunun bilgisi tek yerden gelir (lobideki oyun kartları bunu kullanır).
//   enAz, enCok : kaç kişiyle oynanır
//   aciklama    : kartta görünen tek cümle
//   simge       : kartın simgesi (emoji)
//   renk        : kartın vurgu rengi (oyunun tema rengiyle uyumlu)
//   temaRengi   : tarayıcı üst çubuğu rengi (oyun odasının arka planı)
//   sinirli     : true ise odada fazla kişi varken oyun seçilemez (motor da reddeder)
//   birlikte    : true ise oyuncular birbirine karşı değil, birlikte oynar (kazanan yok)
export const OYUNLAR = [
  {
    id: 'uno',
    ad: 'UNO',
    enAz: 2,
    enCok: 4,
    aciklama: 'Kartını at, ilk bitiren kazanır.',
    simge: '🃏',
    renk: '#ffd23f',
    temaRengi: '#0c2f26',
  },
  {
    id: 'tanis',
    ad: 'Beni ne kadar tanıyorsun',
    enAz: 2,
    enCok: 2,
    aciklama: 'Birbirinizin cevaplarını tahmin edin.',
    simge: '💞',
    renk: '#ffb89e',
    temaRengi: '#241437',
    birlikte: true,
  },
  {
    id: 'kelime',
    ad: 'Kelime düellosu',
    enAz: 2,
    enCok: 4,
    aciklama: 'Aynı gizli kelimeyi önce kim bulacak?',
    simge: '🔤',
    renk: '#5ec8b8',
    temaRengi: '#0f1c22',
  },
  {
    id: 'aynikafa',
    ad: 'Aynı Kafa',
    enAz: 2,
    enCok: 4,
    aciklama: 'Aynı cevabı yazın, birlikte puan toplayın.',
    simge: '🧠',
    renk: '#ff9a6c',
    temaRengi: '#3a1812',
    birlikte: true,
  },
  {
    id: 'gizliyol',
    ad: 'Gizli Yol',
    enAz: 2,
    enCok: 2,
    aciklama: 'Rakibinin gizli yolunu hatırla ve bul.',
    simge: '🧭',
    renk: '#6fb7ff',
    temaRengi: '#0a1428',
    sinirli: true,
  },
  {
    id: 'gorev',
    ad: 'Gizli Görev',
    enAz: 2,
    enCok: 4,
    aciklama: 'Gizli görevini fark ettirmeden yap.',
    simge: '🕵️',
    renk: '#e6b422',
    temaRengi: '#17181d',
  },
  {
    id: 'element',
    ad: 'Taş Kağıt Makas',
    enAz: 2,
    enCok: 2,
    aciklama: 'Taş, kağıt, makas: kartını gizlice seç.',
    simge: '✊',
    renk: '#ffd45e',
    temaRengi: '#0f3a4a',
    sinirli: true,
  },
  {
    id: 'kule',
    ad: 'Risk Kulesi',
    enAz: 2,
    enCok: 4,
    aciklama: 'Zar at, kuleni yükselt, yıkılmadan dur.',
    simge: '🎲',
    renk: '#ffb454',
    temaRengi: '#3a1410',
  },
];

// Oyunun bilgisi (bilinmiyorsa undefined)
export function oyunBilgisi(id) {
  return OYUNLAR.find((oyun) => oyun.id === id);
}

// "2 kişi" ya da "2-4 kişi"
export function kisiYazisi(oyun) {
  if (oyun.enAz === oyun.enCok) {
    return oyun.enCok + ' kişi';
  }
  return oyun.enAz + '-' + oyun.enCok + ' kişi';
}

// Odadaki kişi sayısı bu oyuna sığmıyorsa nedenini yazar, sığıyorsa null döner.
// (Az kişi sorun değil: lobide birileri gelmeyi bekleyebilir.)
export function sigmamaNedeni(oyun, kisiSayisi) {
  if (kisiSayisi > oyun.enCok) {
    if (oyun.enAz === oyun.enCok) {
      return oyun.enCok + ' kişiliktir';
    }
    return 'En çok ' + oyun.enCok + ' kişi';
  }
  return null;
}

export function oyunBilinir(id) {
  return OYUNLAR.some((oyun) => oyun.id === id);
}

// Durumun hangi oyuna ait olduğu
export function oyunId(durum) {
  if (durum && durum.oyun) {
    return durum.oyun;
  }
  return 'uno';
}

// Yeni odanın lobisi. Varsayılan UNO.
export function yeniOda(sahipId, sahipAd, oyun = 'uno') {
  if (oyun === 'tanis') {
    return tanis.yeniOda(sahipId, sahipAd);
  }
  if (oyun === 'kelime') {
    return kelime.yeniOda(sahipId, sahipAd);
  }
  if (oyun === 'aynikafa') {
    return aynikafa.yeniOda(sahipId, sahipAd);
  }
  if (oyun === 'gizliyol') {
    return gizliyol.yeniOda(sahipId, sahipAd);
  }
  if (oyun === 'gorev') {
    return gorev.yeniOda(sahipId, sahipAd);
  }
  if (oyun === 'element') {
    return element.yeniOda(sahipId, sahipAd);
  }
  if (oyun === 'kule') {
    return kule.yeniOda(sahipId, sahipAd);
  }
  return uno.yeniOda(sahipId, sahipAd);
}

// Aynı oyuncularla (id, ad, sıra) ve aynı ev sahibiyle seçilen oyunun taze lobisi.
function lobiyiDegistir(durum, oyun) {
  const oyuncular = durum.oyuncular.map((o) => ({ id: o.id, ad: o.ad }));
  if (oyun === 'tanis') {
    return tanis.lobiKur(oyuncular, durum.sahip);
  }
  if (oyun === 'kelime') {
    return kelime.lobiKur(oyuncular, durum.sahip);
  }
  if (oyun === 'aynikafa') {
    return aynikafa.lobiKur(oyuncular, durum.sahip);
  }
  if (oyun === 'gizliyol') {
    return gizliyol.lobiKur(oyuncular, durum.sahip);
  }
  if (oyun === 'gorev') {
    return gorev.lobiKur(oyuncular, durum.sahip);
  }
  if (oyun === 'element') {
    return element.lobiKur(oyuncular, durum.sahip);
  }
  if (oyun === 'kule') {
    return kule.lobiKur(oyuncular, durum.sahip);
  }
  const ilk = oyuncular[0];
  let yeni = uno.yeniOda(ilk.id, ilk.ad);
  for (let i = 1; i < oyuncular.length; i++) {
    const sonuc = uno.uygula(yeni, { tip: 'katil', id: oyuncular[i].id, ad: oyuncular[i].ad });
    if (!sonuc.ok) {
      return null;
    }
    yeni = sonuc.durum;
  }
  yeni.sahip = durum.sahip;
  return yeni;
}

// ---------------------------------------------------------------------------
// Genel skor ("Kim önde"): odada oynanan bütün oyunların kazananları.
//   durum.genel = {
//     kazanim: { [oyuncuId]: { ad, sayi } }, // kim kaç oyun kazandı
//     biten: n,                               // biten oyun sayısı (birlikte oynananlar dahil)
//     berabere: n,                            // beraberlikle biten (kimseye yazılmayan) oyun sayısı
//     uyumRekoru: { yuzde, oyun } | null,     // birlikte oynanan oyunlarda en iyi uyum
//   }
// Alan oyun değişince ve "Tekrar oyna"da kaybolmaz; bir oyun 'bitti' aşamasına
// ilk geçtiği anda bir kez sayılır. Eşitlikle biten oyun kimseye yazılmaz.
// ---------------------------------------------------------------------------

const MOTORLAR = { uno, tanis, kelime, aynikafa, gizliyol, gorev, element, kule };

// Eski odada genel skor yoktur: boş bir tane gibi davranırız.
export function genelVeri(durum) {
  const g = durum && durum.genel ? durum.genel : {};
  return {
    kazanim: g.kazanim || {},
    biten: g.biten || 0,
    berabere: g.berabere || 0,
    uyumRekoru: g.uyumRekoru || null,
  };
}

// Yeni durum (yeni lobi gibi) genel skoru taşımıyorsa eskisinden kopyalar.
function genelKopyala(eski, yeni) {
  if (eski && eski.genel && yeni && !yeni.genel) {
    yeni.genel = structuredClone(eski.genel);
  }
}

// Oyunun kazananları, oyuncu kimlikleriyle. Birlikte oynanan oyunlarda boş.
export function kazananKimlikleri(durum) {
  const motor = MOTORLAR[oyunId(durum)];
  if (!motor || !motor.kazananlar) {
    return [];
  }
  return motor
    .kazananlar(durum)
    .filter((i) => durum.oyuncular[i])
    .map((i) => durum.oyuncular[i].id);
}

// Eski durumdan yeni duruma geçerken oyun yeni bittiyse genel skoru günceller (yeniyi değiştirir).
export function genelGuncelle(eski, yeni) {
  genelKopyala(eski, yeni);
  if (!eski || !yeni || oyunId(eski) !== oyunId(yeni)) {
    return;
  }
  if (eski.asama === 'bitti' || yeni.asama !== 'bitti') {
    return; // zaten bitmişti ya da henüz bitmedi: tekrar sayma
  }
  const g = genelVeri(yeni);
  g.biten += 1;
  const motor = MOTORLAR[oyunId(yeni)];
  const bilgi = oyunBilgisi(oyunId(yeni));
  if (bilgi && bilgi.birlikte) {
    const yuzde = motor.uyumYuzdesi(yeni);
    if (!g.uyumRekoru || yuzde > g.uyumRekoru.yuzde) {
      g.uyumRekoru = { yuzde: yuzde, oyun: oyunId(yeni) };
    }
  } else {
    const kazananlar = kazananKimlikleri(yeni);
    if (kazananlar.length === 1) {
      const kisi = yeni.oyuncular.find((o) => o.id === kazananlar[0]);
      const onceki = g.kazanim[kisi.id];
      g.kazanim[kisi.id] = { ad: kisi.ad, sayi: (onceki ? onceki.sayi : 0) + 1 };
    } else if (kazananlar.length > 1) {
      g.berabere += 1;
    }
  }
  yeni.genel = g;
}

function oyunSec(durum, eylem) {
  if (!oyunBilinir(eylem.oyun)) {
    return { ok: false, hata: 'Bilinmeyen oyun.' };
  }
  if (eylem.id !== durum.sahip) {
    return { ok: false, hata: 'Oyunu sadece ev sahibi seçer.' };
  }
  if (durum.asama !== 'lobi') {
    return { ok: false, hata: 'Oyun sadece lobide değişir.' };
  }
  if (oyunId(durum) === eylem.oyun) {
    return { ok: true, durum: structuredClone(durum) };
  }
  if (durum.oyuncular.length === 0) {
    return { ok: false, hata: 'Odada kimse yok.' };
  }
  const bilgi = oyunBilgisi(eylem.oyun);
  if (bilgi.sinirli && durum.oyuncular.length > bilgi.enCok) {
    if (bilgi.enAz === bilgi.enCok) {
      return { ok: false, hata: bilgi.ad + ' ' + bilgi.enCok + ' kişiliktir. Önce fazla kişileri çıkar.' };
    }
    return { ok: false, hata: bilgi.ad + ' en çok ' + bilgi.enCok + ' kişiyle oynanır.' };
  }
  const yeni = lobiyiDegistir(durum, eylem.oyun);
  if (!yeni) {
    return { ok: false, hata: 'Oyun değiştirilemedi.' };
  }
  genelKopyala(durum, yeni);
  return { ok: true, durum: yeni };
}

// Tek giriş noktası. Girdi durumu değişmez.
// banka: yalnız "Beni ne kadar tanıyorsun" için soru bankası (testler küçük bir banka verir).
// kelimeListesi: yalnız "Kelime düellosu" için { cevaplar, gecerli } (testler küçük bir liste verir).
// ipuclari: yalnız "Aynı Kafa" için ipucu dizisi (testler küçük bir liste verir).
// gorevler, simdi: "Gizli Görev" için görev listesi; simdi (şimdiki zaman, ms) "Risk Kulesi" için de kullanılır; testler sabitler.
export function uygula(durum, eylem, rastgele, banka, kelimeListesi, ipuclari, gorevler, simdi) {
  const sonuc = motoruCalistir(durum, eylem, rastgele, banka, kelimeListesi, ipuclari, gorevler, simdi);
  if (sonuc.ok && sonuc.durum) {
    genelGuncelle(durum, sonuc.durum);
  }
  return sonuc;
}

function motoruCalistir(
  durum,
  eylem,
  rastgele = Math.random,
  banka = undefined,
  kelimeListesi = undefined,
  ipuclari = undefined,
  gorevler = undefined,
  simdi = undefined
) {
  if (eylem && eylem.tip === 'oyunSec') {
    return oyunSec(durum, eylem);
  }
  const oyun = oyunId(durum);
  if (oyun === 'tanis') {
    return tanis.uygula(durum, eylem, rastgele, banka);
  }
  if (oyun === 'kelime') {
    return kelime.uygula(durum, eylem, rastgele, kelimeListesi);
  }
  if (oyun === 'aynikafa') {
    return aynikafa.uygula(durum, eylem, rastgele, ipuclari);
  }
  if (oyun === 'gizliyol') {
    return gizliyol.uygula(durum, eylem, rastgele);
  }
  if (oyun === 'gorev') {
    return gorev.uygula(durum, eylem, rastgele, gorevler, simdi);
  }
  if (oyun === 'element') {
    return element.uygula(durum, eylem, rastgele);
  }
  if (oyun === 'kule') {
    return kule.uygula(durum, eylem, rastgele, simdi);
  }
  if (oyun === 'uno') {
    return uno.uygula(durum, eylem, rastgele);
  }
  return { ok: false, hata: 'Bilinmeyen oyun.' };
}

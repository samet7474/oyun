// oyunlar.js - Oyun yönlendirici.
// Odadaki durum.oyun alanına bakıp hareketi doğru motora verir ve oyun seçimini ('oyunSec') yapar.
// app.js hareketleri yalnız buradan geçirir. DOM yok, Supabase yok.
//
// Eski odalar durum.oyun = 'uno' ile kurulmuştu; alan hiç yoksa da UNO sayılır.

import * as uno from './uno.js';
import * as tanis from './tanis.js';
import * as kelime from './kelime.js';

export const OYUNLAR = [
  { id: 'uno', ad: 'UNO' },
  { id: 'tanis', ad: 'Beni ne kadar tanıyorsun' },
  { id: 'kelime', ad: 'Kelime düellosu' },
];

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
  const yeni = lobiyiDegistir(durum, eylem.oyun);
  if (!yeni) {
    return { ok: false, hata: 'Oyun değiştirilemedi.' };
  }
  return { ok: true, durum: yeni };
}

// Tek giriş noktası. Girdi durumu değişmez.
// banka: yalnız "Beni ne kadar tanıyorsun" için soru bankası (testler küçük bir banka verir).
// kelimeListesi: yalnız "Kelime düellosu" için { cevaplar, gecerli } (testler küçük bir liste verir).
export function uygula(durum, eylem, rastgele = Math.random, banka = undefined, kelimeListesi = undefined) {
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
  if (oyun === 'uno') {
    return uno.uygula(durum, eylem, rastgele);
  }
  return { ok: false, hata: 'Bilinmeyen oyun.' };
}

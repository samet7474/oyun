// app.js - Ekranlar, çizim ve Supabase senkronu.
// Oyun kuralları uno.js ve tanis.js içindedir, hareketler oyunlar.js üzerinden geçer;
// burada sadece göstermek ve eşitlemek var. "Beni ne kadar tanıyorsun" ekranları tanis-ekran.js'te.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { uygula, oyunId, oyunBilinir, OYUNLAR } from './oyunlar.js';
import { tanisEkraniKur } from './tanis-ekran.js';
import {
  yeniOda,
  atilabilirlik,
  kartSirala,
  oyuncuIndeks,
  RENKLER,
  RENK_ADLARI,
  MAKS_OYUNCU,
} from './uno.js';

const TABLO = 'oyun_odalari';
const BASLIK = 'Oyun Masası';

// I, O, Q yok: karışmasın
const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ';

const db = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const kok = document.getElementById('app');

// ---------------------------------------------------------------------------
// Tarayıcı deposu (localStorage kapalı olabilir, o yüzden try/catch)
// ---------------------------------------------------------------------------

const bellekDeposu = {};

function depoOku(anahtar) {
  try {
    return localStorage.getItem(anahtar);
  } catch (hata) {
    return bellekDeposu[anahtar] || null;
  }
}

function depoYaz(anahtar, deger) {
  try {
    localStorage.setItem(anahtar, deger);
  } catch (hata) {
    bellekDeposu[anahtar] = deger;
  }
}

function rastgeleId() {
  try {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (hata) {
    // aşağıdaki yedeğe geç
  }
  return 'o' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function oyuncuIdAl() {
  let id = depoOku('uno.oyuncuId');
  if (!id) {
    id = rastgeleId();
    depoYaz('uno.oyuncuId', id);
  }
  return id;
}

// ---------------------------------------------------------------------------
// Uygulama durumu
// ---------------------------------------------------------------------------

const istemci = {
  oyuncuId: oyuncuIdAl(),
  ad: depoOku('uno.ad') || '',
  onKod: '', // başlangıç ekranındaki kod kutusu
  kod: null, // içinde olduğumuz oda
  durum: null, // oyunun son hali (uno.js durumu)
  surum: 0,
  kanal: null,
  kanalHazir: false,
  sonBasari: 0, // son başarılı sunucu cevabı (ms)
  mesgul: false, // bir hareket gönderiliyor
  gecis: false, // odaya katılırken ya da odadan çıkarken true
  modal: null, // { tur: 'renk' | 'blof', kart }
  gorulenEl: new Set(), // yeni gelen kartları animasyonlamak için
  sonAtikId: null,
};

// "Beni ne kadar tanıyorsun" ekranları. Ortak yardımcıları ona veriyoruz.
const tanisEkran = tanisEkraniKur({
  el: el,
  istemci: istemci,
  hamle: hamle,
  mesajGoster: mesajGoster,
  render: render,
  benimIndeks: benimIndeks,
  ustCubuk: ustCubuk,
  depoOku: depoOku,
  depoYaz: depoYaz,
});

// ---------------------------------------------------------------------------
// Küçük yardımcılar
// ---------------------------------------------------------------------------

// DOM öğesi üretir: el('div', { class: 'x', onclick: fn }, 'metin', çocuk)
function el(etiket, ozellikler, ...cocuklar) {
  const dugum = document.createElement(etiket);
  const ozel = ozellikler || {};
  for (const anahtar of Object.keys(ozel)) {
    const deger = ozel[anahtar];
    if (deger === null || deger === undefined || deger === false) {
      continue;
    }
    if (anahtar === 'class') {
      dugum.className = deger;
    } else if (anahtar.startsWith('on')) {
      dugum.addEventListener(anahtar.slice(2), deger);
    } else if (anahtar === 'html') {
      // Sadece kodun içindeki sabit SVG'ler için
      dugum.innerHTML = deger;
    } else if (deger === true) {
      dugum.setAttribute(anahtar, '');
    } else {
      dugum.setAttribute(anahtar, deger);
    }
  }
  for (const cocuk of cocuklar.flat()) {
    if (cocuk === null || cocuk === undefined || cocuk === false) {
      continue;
    }
    if (typeof cocuk === 'object' && cocuk.nodeType) {
      dugum.append(cocuk);
    } else {
      dugum.append(document.createTextNode(String(cocuk)));
    }
  }
  return dugum;
}

let toastZamanlayici = null;

function mesajGoster(metin) {
  const kutu = document.getElementById('toast');
  if (!kutu) {
    return;
  }
  kutu.textContent = metin;
  kutu.classList.add('goster');
  clearTimeout(toastZamanlayici);
  toastZamanlayici = setTimeout(() => {
    kutu.classList.remove('goster');
  }, 2600);
}

function kodTemizle(metin) {
  let sonuc = '';
  for (const harf of String(metin || '').toUpperCase()) {
    if (KOD_HARFLERI.includes(harf)) {
      sonuc += harf;
    }
  }
  return sonuc.slice(0, 4);
}

function kodUret() {
  let kod = '';
  for (let i = 0; i < 4; i++) {
    kod += KOD_HARFLERI[Math.floor(Math.random() * KOD_HARFLERI.length)];
  }
  return kod;
}

function kodHashten() {
  return kodTemizle(location.hash.replace('#', ''));
}

function benimIndeks() {
  if (!istemci.durum) {
    return -1;
  }
  return oyuncuIndeks(istemci.durum, istemci.oyuncuId);
}

function odaLinki() {
  return location.origin + location.pathname + '#' + istemci.kod;
}

function zamanAsimi(vaat, ms) {
  return new Promise((coz, red) => {
    const sayac = setTimeout(() => {
      red(new Error('zaman asimi'));
    }, ms);
    vaat.then(
      (deger) => {
        clearTimeout(sayac);
        coz(deger);
      },
      (hata) => {
        clearTimeout(sayac);
        red(hata);
      }
    );
  });
}

// ---------------------------------------------------------------------------
// Supabase: oda kur, katıl, hareket gönder, eşitle
// ---------------------------------------------------------------------------

async function satirGetir(kod) {
  const yanit = await zamanAsimi(db.from(TABLO).select('kod, oyun, durum, surum').eq('kod', kod).maybeSingle(), 10000);
  if (yanit.error) {
    throw yanit.error;
  }
  istemci.sonBasari = Date.now();
  return yanit.data;
}

function adiAl() {
  const ad = istemci.ad.replace(/\s+/g, ' ').trim();
  if (ad === '') {
    mesajGoster('Önce adını yaz.');
    return null;
  }
  return ad;
}

// Satırdaki oyun bilinen bir oyun mu? (Oyun adı durum.oyun içindedir; eski odalar 'uno'.)
function odaGecerliMi(satir) {
  return Boolean(satir.durum) && oyunBilinir(oyunId(satir.durum));
}

async function odaKur() {
  const ad = adiAl();
  if (!ad || istemci.mesgul) {
    return;
  }
  istemci.mesgul = true;
  try {
    for (let deneme = 0; deneme < 6; deneme++) {
      const kod = kodUret();
      const durum = yeniOda(istemci.oyuncuId, ad);
      const yanit = await zamanAsimi(
        db.from(TABLO).insert({ kod: kod, oyun: 'uno', durum: durum, surum: 1 }).select(),
        10000
      );
      if (yanit.error) {
        if (yanit.error.code === '23505') {
          continue; // bu kod dolu, başka kod dene
        }
        throw yanit.error;
      }
      istemci.sonBasari = Date.now();
      odaBaglan(kod, { durum: durum, surum: 1 });
      return;
    }
    mesajGoster('Oda kurulamadı, tekrar dene.');
  } catch (hata) {
    mesajGoster('Bağlanamadım. İnterneti kontrol et.');
  } finally {
    istemci.mesgul = false;
  }
}

async function odayaKatil(kodHam) {
  const kod = kodTemizle(kodHam);
  if (kod.length !== 4) {
    mesajGoster('Kod 4 harf olmalı.');
    return;
  }
  const ad = adiAl();
  if (!ad || istemci.mesgul) {
    return;
  }
  istemci.mesgul = true;
  istemci.gecis = true;
  try {
    const satir = await satirGetir(kod);
    if (!satir || !odaGecerliMi(satir)) {
      mesajGoster('Böyle bir oda yok.');
      return;
    }
    // Zaten bu odada oturuyorsak koltuğa dön
    if (oyuncuIndeks(satir.durum, istemci.oyuncuId) >= 0) {
      odaBaglan(kod, satir);
      return;
    }
    // Yeni oyuncu olarak katıl
    istemci.kod = kod;
    istemci.durum = satir.durum;
    istemci.surum = satir.surum;
    const sonuc = await eylemDene({ tip: 'katil', id: istemci.oyuncuId, ad: ad }, true);
    if (!sonuc.ok || benimIndeks() < 0) {
      istemci.kod = null;
      istemci.durum = null;
      istemci.surum = 0;
      render();
      return;
    }
    odaBaglan(kod, { durum: istemci.durum, surum: istemci.surum });
  } catch (hata) {
    istemci.kod = null;
    istemci.durum = null;
    mesajGoster('Bağlanamadım. İnterneti kontrol et.');
  } finally {
    istemci.mesgul = false;
    istemci.gecis = false;
  }
}

// Odaya girmiş sayılırız: durumu al, dinlemeye başla, ekranı çiz
function odaBaglan(kod, satir) {
  istemci.kod = kod;
  istemci.durum = satir.durum;
  istemci.surum = satir.surum;
  istemci.modal = null;
  istemci.gorulenEl = new Set();
  istemci.sonAtikId = null;
  tanisEkran.sifirla();
  try {
    history.replaceState(null, '', '#' + kod);
  } catch (hata) {
    location.hash = kod;
  }
  abonelikKur();
  render();
}

function abonelikKapat() {
  if (istemci.kanal && db) {
    db.removeChannel(istemci.kanal);
  }
  istemci.kanal = null;
  istemci.kanalHazir = false;
}

function abonelikKur() {
  abonelikKapat();
  const kod = istemci.kod;
  istemci.kanal = db
    .channel('oda-' + kod + '-' + Date.now())
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: TABLO, filter: 'kod=eq.' + kod },
      (yuk) => {
        if (yuk.new && yuk.new.kod === istemci.kod) {
          kabulEt(yuk.new);
        }
      }
    )
    .subscribe((durum) => {
      istemci.kanalHazir = durum === 'SUBSCRIBED';
      baglantiGuncelle();
      if (durum === 'SUBSCRIBED') {
        // Abonelik kurulana kadar kaçan bir şey olduysa yakala
        yenile();
      }
    });
}

// Sunucudan gelen satırı kabul et (eski ya da aynı sürümse yok say)
function kabulEt(satir) {
  if (!satir || !satir.durum || satir.surum <= istemci.surum) {
    return;
  }
  const eskiDurum = istemci.durum;
  istemci.durum = satir.durum;
  istemci.surum = satir.surum;
  istemci.sonBasari = Date.now();
  sirabildirimi(eskiDurum, satir.durum);
  render();
}

async function yenile() {
  if (!istemci.kod || !db) {
    return;
  }
  try {
    const satir = await satirGetir(istemci.kod);
    if (satir) {
      kabulEt(satir);
    }
  } catch (hata) {
    istemci.sonBasari = 0;
  }
  baglantiGuncelle();
}

// Hareketi uygula ve sunucuya yaz. Çakışma olursa güncel hali çekip bir kez daha dener.
async function eylemDene(eylem, ilkDeneme) {
  const sonuc = uygula(istemci.durum, eylem);
  if (!sonuc.ok) {
    if (ilkDeneme || eylem.tip === 'katil') {
      mesajGoster(sonuc.hata);
    }
    return { ok: false, hata: sonuc.hata };
  }
  const eskiSurum = istemci.surum;
  let yanit;
  try {
    yanit = await zamanAsimi(
      db
        .from(TABLO)
        .update({ durum: sonuc.durum, surum: eskiSurum + 1, guncellendi: new Date().toISOString() })
        .eq('kod', istemci.kod)
        .eq('surum', eskiSurum)
        .select(),
      10000
    );
  } catch (hata) {
    yanit = { error: hata };
  }
  if (yanit.error) {
    istemci.sonBasari = 0;
    baglantiGuncelle();
    mesajGoster('Bağlantı sorunu. Tekrar dene.');
    return { ok: false, hata: 'baglanti' };
  }
  if (yanit.data && yanit.data.length > 0) {
    kabulEt(yanit.data[0]);
    return { ok: true };
  }
  // Sıfır satır: biri bizden önce hamle yaptı. Güncel hali al.
  await yenile();
  if (ilkDeneme) {
    return eylemDene(eylem, false);
  }
  if (eylem.tip !== 'ozelSorular') {
    mesajGoster('Aynı anda hamle yapıldı. Tekrar dene.');
  }
  return { ok: false, hata: 'cakisma' };
}

// Ekrandan gelen her hareket buradan geçer
// Sonuç: { ok: true } ya da { ok: false, hata }
async function hamle(eylem) {
  if (istemci.mesgul || !istemci.durum) {
    return { ok: false, hata: 'mesgul' };
  }
  istemci.mesgul = true;
  try {
    return await eylemDene(Object.assign({ id: istemci.oyuncuId }, eylem), true);
  } finally {
    istemci.mesgul = false;
  }
}

async function odadanCik() {
  istemci.gecis = true;
  if (istemci.durum && istemci.durum.asama === 'lobi' && benimIndeks() >= 0) {
    await hamle({ tip: 'cikar' });
  }
  istemci.gecis = false;
  abonelikKapat();
  istemci.kod = null;
  istemci.durum = null;
  istemci.surum = 0;
  istemci.modal = null;
  istemci.onKod = '';
  document.title = BASLIK;
  tanisEkran.sifirla();
  try {
    history.replaceState(null, '', location.pathname + location.search);
  } catch (hata) {
    location.hash = '';
  }
  render();
}

// ---------------------------------------------------------------------------
// Bağlantı göstergesi
// ---------------------------------------------------------------------------

function baglantiBagliMi() {
  if (istemci.kanalHazir) {
    return true;
  }
  return Date.now() - istemci.sonBasari < 9000;
}

function baglantiGuncelle() {
  const bagli = baglantiBagliMi();
  document.querySelectorAll('[data-baglanti]').forEach((oge) => {
    oge.querySelector('.nokta').classList.toggle('bagli', bagli);
    oge.querySelector('.yazi').textContent = bagli ? 'bağlı' : 'bağlantı yok';
  });
}

function baglantiGostergesi() {
  const bagli = baglantiBagliMi();
  return el(
    'span',
    { class: 'baglanti', 'data-baglanti': '1' },
    el('span', { class: bagli ? 'nokta bagli' : 'nokta' }),
    el('span', { class: 'yazi' }, bagli ? 'bağlı' : 'bağlantı yok')
  );
}

// UNO'da sıra, "Beni ne kadar tanıyorsun"da soru bizi bekliyorsa true
function benimSiramMi(d) {
  if (!d) {
    return false;
  }
  const idx = oyuncuIndeks(d, istemci.oyuncuId);
  if (idx < 0) {
    return false;
  }
  if (d.oyun === 'tanis') {
    return d.asama === 'cevap' && !d.cevaplar[d.tur][idx];
  }
  return d.asama === 'oyun' && d.sira === idx;
}

// Sıra bize geçince titret ve sekme başlığını değiştir
function sirabildirimi(eskiDurum, yeniDurum) {
  const benimSiram = benimSiramMi(yeniDurum);
  const eskiBenimSiram = benimSiramMi(eskiDurum) && eskiDurum.oyun === yeniDurum.oyun;
  document.title = benimSiram ? 'Sıra sende - ' + BASLIK : BASLIK;
  if (benimSiram && !eskiBenimSiram) {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch (hata) {
      // titreşim yoksa sorun değil
    }
  }
}

// Yedek yoklama: kanal çalışmıyorsa 4 saniyede bir sor
setInterval(() => {
  if (istemci.kod && !istemci.kanalHazir) {
    yenile();
  } else {
    baglantiGuncelle();
  }
}, 4000);

// Telefon kilidi açılınca ya da sekmeye dönünce hemen güncelle
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && istemci.kod) {
    yenile();
  }
});

window.addEventListener('online', () => {
  if (istemci.kod) {
    yenile();
  }
});

window.addEventListener('hashchange', () => {
  if (!istemci.kod) {
    istemci.onKod = kodHashten();
    render();
  }
});

// ---------------------------------------------------------------------------
// Kart çizimi (sadece CSS ve küçük SVG)
// ---------------------------------------------------------------------------

const SVG_ATLA =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round">' +
  '<circle cx="12" cy="12" r="8.5"/>' +
  '<line x1="6" y1="18" x2="18" y2="6"/>' +
  '</svg>';

const SVG_TERS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 8h15"/>' +
  '<path d="M14 4l4 4-4 4"/>' +
  '<path d="M21 16H6"/>' +
  '<path d="M10 12l-4 4 4 4"/>' +
  '</svg>';

// Kartın simgesi: düğüm döndürür
function simgeCiz(kart, kose) {
  if (kart.tip === 'atla') {
    return el('span', { class: 'sim', html: SVG_ATLA });
  }
  if (kart.tip === 'ters') {
    return el('span', { class: 'sim', html: SVG_TERS });
  }
  if (kart.tip === 'cek2') {
    return el('span', { class: 'sim' }, '+2');
  }
  if (kart.tip === 'cek4') {
    return el('span', { class: 'sim' }, '+4');
  }
  if (kart.tip === 'joker') {
    return kose ? el('span', { class: 'joker-nokta' }) : null;
  }
  return el('span', { class: 'sim' }, String(kart.sayi));
}

function kartCiz(kart, ekSinif) {
  const renkSinifi = kart.renk ? 'renk-' + kart.renk : 'renk-siyah';
  const siniflar = ['kart', renkSinifi, 'tip-' + kart.tip];
  if (ekSinif) {
    siniflar.push(ekSinif);
  }
  return el(
    'div',
    { class: siniflar.join(' ') },
    el('span', { class: 'oval' }),
    el('span', { class: 'orta' }, simgeCiz(kart, false)),
    el('span', { class: 'kose ust' }, simgeCiz(kart, true)),
    el('span', { class: 'kose alt' }, simgeCiz(kart, true))
  );
}

function arkaKartCiz() {
  return el('div', { class: 'kart arka' }, el('span', { class: 'arka-yazi' }, 'UNO'));
}

// ---------------------------------------------------------------------------
// Olay yazısı ("Ayşe +2 attı, 2 kart çektin")
// ---------------------------------------------------------------------------

function kartAdi(kart) {
  if (kart.tip === 'joker') {
    return 'Joker';
  }
  if (kart.tip === 'cek4') {
    return '+4';
  }
  const renk = RENK_ADLARI[kart.renk];
  if (kart.tip === 'sayi') {
    return renk + ' ' + kart.sayi;
  }
  if (kart.tip === 'atla') {
    return renk + ' Atla';
  }
  if (kart.tip === 'ters') {
    return renk + ' Ters';
  }
  return renk + ' +2';
}

function olayMetni(d, benIdx) {
  const o = d.olay;
  if (!o) {
    return 'Oyun başladı.';
  }
  const ad = (i) => d.oyuncular[i].ad;
  const ben = (i) => i === benIdx;
  const kim = (i) => (ben(i) ? 'Sen' : ad(i));
  // Fiil: 3. tekil ya da 2. tekil
  const fiil = (i, ucuncu, ikinci) => (ben(i) ? ikinci : ucuncu);
  // "2 kart çektin" ya da "Ayşe 2 kart çekti"
  const cekti = (i, adet) => (ben(i) ? adet + ' kart çektin' : ad(i) + ' ' + adet + ' kart çekti');
  const atlandi = (i) => (ben(i) ? 'sıran atlandı' : ad(i) + ' atlandı');

  if (o.tip === 'oyna') {
    let metin = kim(o.kim) + ' ' + kartAdi(o.kart) + ' ' + fiil(o.kim, 'attı', 'attın');
    if (o.kart.tip === 'joker') {
      metin += ', renk ' + RENK_ADLARI[o.renk];
    }
    if (o.etki === 'atla') {
      metin += ', ' + atlandi(o.hedef);
    } else if (o.etki === 'ters') {
      metin += '. Yön döndü';
      if (o.hedef !== undefined) {
        metin += ', ' + atlandi(o.hedef);
      }
    } else if (o.etki === 'cek') {
      metin += ', ' + cekti(o.hedef, o.adet);
    } else if (o.etki === 'yigin') {
      metin += '. Yığın ' + o.adet + ' kart oldu';
    } else if (o.etki === 'cek4bekle') {
      metin += ', renk ' + RENK_ADLARI[o.renk] + '. ';
      metin += ben(o.hedef) ? 'İtiraz edebilirsin' : ad(o.hedef) + ' karar veriyor';
    }
    return metin + '.';
  }
  if (o.tip === 'cek') {
    if (o.ceza) {
      return cekti(o.kim, o.adet) + ' ve sırayı kaybetti' + (ben(o.kim) ? 'n' : '') + '.';
    }
    if (o.adet === 0) {
      return 'Destede kart kalmadı.';
    }
    return kim(o.kim) + ' kart ' + fiil(o.kim, 'çekti', 'çektin') + '.';
  }
  if (o.tip === 'pas') {
    return kim(o.kim) + ' pas ' + fiil(o.kim, 'geçti', 'geçtin') + '.';
  }
  if (o.tip === 'itiraz') {
    if (o.sonuc === 'yasadisi') {
      return 'İtiraz haklı! ' + cekti(o.hedef, o.adet) + '.';
    }
    return 'İtiraz haksız. ' + cekti(o.kim, o.adet) + '.';
  }
  if (o.tip === 'kabul') {
    return kim(o.kim) + ' kabul ' + fiil(o.kim, 'etti', 'ettin') + ': ' + cekti(o.kim, o.adet) + '.';
  }
  if (o.tip === 'uno') {
    return kim(o.kim) + ' UNO ' + fiil(o.kim, 'dedi', 'dedin') + '!';
  }
  if (o.tip === 'yakala') {
    const kimi = ben(o.hedef) ? 'UNO demedin' : ad(o.hedef) + ' UNO demedi';
    return kim(o.kim) + ' ' + fiil(o.kim, 'yakaladı', 'yakaladın') + '! ' + kimi + ', ' + cekti(o.hedef, o.adet) + '.';
  }
  if (o.tip === 'renk') {
    return kim(o.kim) + ' rengi ' + RENK_ADLARI[o.renk] + ' ' + fiil(o.kim, 'yaptı', 'yaptın') + '.';
  }
  if (o.tip === 'el') {
    let metin = 'Açılış kartı: ' + kartAdi(o.kart) + '.';
    if (o.etki === 'cek') {
      metin += ' ' + cekti(o.hedef, o.adet) + ', ' + (ben(o.hedef) ? 'sıran atlandı' : 'sırası atlandı') + '.';
    } else if (o.etki === 'atla') {
      metin += ' ' + atlandi(o.hedef).replace(/^./, (h) => h.toUpperCase()) + '.';
    } else if (o.etki === 'ters') {
      metin += ' Yön döndü.';
    } else if (o.etki === 'renk') {
      metin += ben(o.kim) ? ' Rengi sen seç.' : ' ' + ad(o.kim) + ' rengi seçecek.';
    }
    return metin;
  }
  return '';
}

function ipucuMetni(d, ben) {
  if (d.asama !== 'oyun') {
    return '';
  }
  const benimSiram = d.sira === ben;
  const ad = (i) => d.oyuncular[i].ad;
  let basla = '';
  if (d.yakala !== null && d.yakala !== ben) {
    basla = ad(d.yakala) + ' UNO demedi! ';
  }
  if (d.renkBekle) {
    return basla + (benimSiram ? 'Açılış kartı Joker. Bir renk seç.' : ad(d.sira) + ' renk seçiyor.');
  }
  if (d.itiraz) {
    if (d.itiraz.hedef === ben) {
      return basla + 'Kabul edersen 4 kart çekersin. İtiraz haklıysa +4 atan çeker, haksızsa sen 6 çekersin.';
    }
    return basla + ad(d.itiraz.hedef) + ' karar veriyor.';
  }
  if (!benimSiram) {
    return basla;
  }
  if (d.bekleyen > 0) {
    return basla + '+2 at ya da ' + d.bekleyen + ' kart çek.';
  }
  if (d.cektiMi) {
    const kart = d.oyuncular[ben].el.find((k) => k.id === d.cekilenKart);
    if (kart && atilabilirlik(d, istemci.oyuncuId, kart) !== 'hayir') {
      return basla + 'Çektiğin kartı atabilir ya da pas geçebilirsin.';
    }
    return basla + 'Atabileceğin kart yok. Pas geç.';
  }
  return basla + 'Bir kart at ya da desteden çek.';
}

// ---------------------------------------------------------------------------
// Ekran: başlangıç
// ---------------------------------------------------------------------------

function baslangicEkrani() {
  const adGirdi = el('input', {
    class: 'girdi',
    type: 'text',
    maxlength: 12,
    placeholder: 'Adın',
    value: istemci.ad,
    autocomplete: 'nickname',
    'aria-label': 'Adın',
  });
  adGirdi.addEventListener('input', () => {
    istemci.ad = adGirdi.value;
    depoYaz('uno.ad', adGirdi.value.trim());
  });

  const kodGirdi = el('input', {
    class: 'girdi kod',
    type: 'text',
    maxlength: 4,
    placeholder: 'KOD',
    value: istemci.onKod,
    autocapitalize: 'characters',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Oda kodu',
  });
  kodGirdi.addEventListener('input', () => {
    kodGirdi.value = kodTemizle(kodGirdi.value);
    istemci.onKod = kodGirdi.value;
  });
  kodGirdi.addEventListener('keydown', (olay) => {
    if (olay.key === 'Enter') {
      odayaKatil(kodGirdi.value);
    }
  });

  const davet = istemci.onKod.length === 4 && kodHashten() === istemci.onKod;

  return el(
    'div',
    { class: 'sayfa' },
    el('div', { class: 'logo' }, BASLIK),
    el('p', { class: 'slogan' }, 'İki kişi, iki telefon, bir oyun.'),
    davet ? el('p', { class: 'slogan' }, istemci.onKod + ' odasına davet edildin. Adını yaz ve katıl.') : null,
    el(
      'div',
      { class: 'kutu' },
      el('label', { class: 'etiket' }, 'Adın'),
      adGirdi
    ),
    el(
      'div',
      { class: 'kutu' },
      el('h2', null, 'Yeni oyun'),
      el('button', { class: 'dugme birincil genis', onclick: () => odaKur() }, 'Oda kur')
    ),
    el(
      'div',
      { class: 'kutu' },
      el('h2', null, 'Odaya katıl'),
      el('label', { class: 'etiket' }, '4 harfli oda kodu'),
      kodGirdi,
      el('button', { class: 'dugme genis', onclick: () => odayaKatil(kodGirdi.value) }, 'Katıl')
    )
  );
}

// ---------------------------------------------------------------------------
// Üst çubuk
// ---------------------------------------------------------------------------

function ustCubuk() {
  const d = istemci.durum;
  const sahipMi = d && d.sahip === istemci.oyuncuId;
  return el(
    'div',
    { class: 'ustcubuk' },
    baglantiGostergesi(),
    el('span', { class: 'kod-kucuk' }, istemci.kod),
    d && d.oyun !== 'tanis' && d.asama !== 'lobi' && d.ayar.hedef > 0 ? el('span', null, 'Hedef ' + d.ayar.hedef) : null,
    d && d.oyun !== 'tanis' && d.asama !== 'lobi' && d.ayar.hedef === 0 ? el('span', null, 'Tek el') : null,
    el('span', { class: 'bosluk' }),
    sahipMi && d.asama !== 'lobi'
      ? el(
          'button',
          {
            class: 'link-dugme',
            onclick: () => {
              if (d.asama === 'bitti' && d.oyun === 'tanis') {
                hamle({ tip: 'yeniOyun' });
              } else if (window.confirm('Oyun yarıda kalacak ve herkes lobiye dönecek. Emin misin?')) {
                hamle({ tip: 'yeniOyun' });
              }
            },
          },
          'Lobiye dön'
        )
      : null,
    el('button', { class: 'link-dugme', onclick: () => odadanCik() }, 'Çık')
  );
}

// ---------------------------------------------------------------------------
// Ekran: lobi
// ---------------------------------------------------------------------------

async function linkiKopyala() {
  const link = odaLinki();
  try {
    await navigator.clipboard.writeText(link);
    mesajGoster('Link kopyalandı.');
    return;
  } catch (hata) {
    // eski tarayıcı: aşağıdaki yedeği dene
  }
  try {
    const kutu = el('textarea', { style: 'position:fixed;opacity:0;left:-1000px' });
    kutu.value = link;
    document.body.append(kutu);
    kutu.select();
    document.execCommand('copy');
    kutu.remove();
    mesajGoster('Link kopyalandı.');
  } catch (hata) {
    mesajGoster('Kopyalanamadı. Kodu elle yaz: ' + istemci.kod);
  }
}

async function linkiPaylas() {
  try {
    await navigator.share({
      title: BASLIK,
      text: 'Oyun oynayalım! Oda kodu: ' + istemci.kod,
      url: odaLinki(),
    });
  } catch (hata) {
    if (!hata || hata.name !== 'AbortError') {
      linkiKopyala();
    }
  }
}

// Oyun seçici: ev sahibi seçer, diğerleri sadece görür
function oyunSecici(d, sahipMi) {
  const mevcut = oyunId(d);
  const dugmeler = OYUNLAR.map((oyun) =>
    el(
      'button',
      {
        class: 'secenek',
        'aria-pressed': mevcut === oyun.id ? 'true' : 'false',
        disabled: !sahipMi,
        onclick: () => {
          if (mevcut !== oyun.id) {
            hamle({ tip: 'oyunSec', oyun: oyun.id });
          }
        },
      },
      oyun.ad
    )
  );
  return el(
    'div',
    { class: 'kutu' },
    el('h2', null, 'Oyun'),
    el('div', { class: 'secenekler oyun-secici' }, dugmeler),
    sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Oyunu sadece ev sahibi seçer.')
  );
}

// UNO'ya özel lobi bölümü: ayarlar ve başlat düğmesi
function unoLobiBolumu(d, sahipMi) {
  const istifAcik = d.ayar.istif;
  const anahtar = el('button', {
    class: 'anahtar',
    role: 'switch',
    'aria-checked': istifAcik ? 'true' : 'false',
    'aria-label': "+2'nin üstüne +2 koyma",
    disabled: !sahipMi,
    onclick: () => hamle({ tip: 'ayarla', ayar: { istif: !istifAcik } }),
  });

  const hedefler = [
    { deger: 500, yazi: '500' },
    { deger: 200, yazi: '200' },
    { deger: 0, yazi: 'Tek el' },
  ];
  const hedefDugmeleri = hedefler.map((h) =>
    el(
      'button',
      {
        class: 'secenek',
        'aria-pressed': d.ayar.hedef === h.deger ? 'true' : 'false',
        disabled: !sahipMi,
        onclick: () => hamle({ tip: 'ayarla', ayar: { hedef: h.deger } }),
      },
      h.yazi
    )
  );

  return [
    el(
      'div',
      { class: 'kutu' },
      el('h2', null, 'Ayarlar'),
      el(
        'div',
        { class: 'ayar-satiri' },
        el(
          'div',
          { class: 'metin' },
          el('div', null, "+2'nin üstüne +2 koyma"),
          el('div', { class: 'alt-yazi' }, 'Açıksa +2 yiyen, kendi +2 kartıyla karşılık verebilir.')
        ),
        anahtar
      ),
      el('div', { class: 'etiket' }, 'Hedef puan'),
      el('div', { class: 'secenekler' }, hedefDugmeleri),
      sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
    ),
    sahipMi
      ? el(
          'button',
          {
            class: 'dugme birincil genis',
            disabled: d.oyuncular.length < 2,
            onclick: () => hamle({ tip: 'baslat' }),
          },
          d.oyuncular.length < 2 ? 'Oyunu başlat (en az 2 kişi)' : 'Oyunu başlat'
        )
      : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca oyun açılır.'),
  ];
}

function lobiEkrani() {
  const d = istemci.durum;
  const sahipMi = d.sahip === istemci.oyuncuId;
  const tanisMi = oyunId(d) === 'tanis';

  // Kendi sorularımı düzenlediğim ekran
  if (tanisMi && tanisEkran.sorularimAcikMi()) {
    return tanisEkran.sorularimEkrani();
  }

  // Oyuncu satırları (UNO'da 4 koltuk, "Beni ne kadar tanıyorsun"da 2)
  const koltuk = tanisMi ? Math.max(2, d.oyuncular.length) : MAKS_OYUNCU;
  const satirlar = [];
  for (let i = 0; i < koltuk; i++) {
    const o = d.oyuncular[i];
    if (!o) {
      satirlar.push(el('li', { class: 'oyuncu-satiri bos-koltuk' }, el('span', { class: 'ad' }, 'Boş yer')));
      continue;
    }
    satirlar.push(
      el(
        'li',
        { class: 'oyuncu-satiri' },
        el('span', { class: 'ad' }, o.ad),
        o.id === d.sahip ? el('span', { class: 'etiket-kucuk vurgu' }, 'Ev sahibi') : null,
        o.id === istemci.oyuncuId ? el('span', { class: 'etiket-kucuk' }, 'Sen') : null,
        sahipMi && o.id !== istemci.oyuncuId
          ? el('button', { class: 'mini-dugme', onclick: () => hamle({ tip: 'cikar', hedef: o.id }) }, 'Çıkar')
          : null
      )
    );
  }

  const paylasDugmesi = navigator.share
    ? el('button', { class: 'dugme birincil', onclick: () => linkiPaylas() }, 'Linki paylaş')
    : null;

  return el(
    'div',
    { class: 'sayfa' },
    el('p', { class: 'slogan' }, 'Oda kodu'),
    el('div', { class: 'kod-buyuk', onclick: () => linkiKopyala() }, istemci.kod),
    el('p', { class: 'slogan' }, 'Kodu ya da linki arkadaşına gönder.'),
    el(
      'div',
      { class: 'satir' },
      paylasDugmesi,
      el('button', { class: paylasDugmesi ? 'dugme ikincil' : 'dugme birincil', onclick: () => linkiKopyala() }, 'Linki kopyala')
    ),
    oyunSecici(d, sahipMi),
    el(
      'div',
      { class: 'kutu' },
      el('h2', null, tanisMi ? 'Oyuncular (' + d.oyuncular.length + ')' : 'Oyuncular (' + d.oyuncular.length + '/' + MAKS_OYUNCU + ')'),
      el('ul', { class: 'oyuncu-listesi' }, satirlar)
    ),
    tanisMi ? tanisEkran.lobiBolumu(d, sahipMi) : unoLobiBolumu(d, sahipMi)
  );
}

// ---------------------------------------------------------------------------
// Ekran: oyun masası
// ---------------------------------------------------------------------------

function rakipPaneli(d, i) {
  const o = d.oyuncular[i];
  const sayi = o.el.length;
  const arkalar = el('div', { class: 'arkalar' });
  for (let k = 0; k < Math.min(sayi, 8); k++) {
    arkalar.append(arkaKartCiz());
  }
  arkalar.append(el('span', { class: 'sayi' }, String(sayi)));

  let rozet = null;
  if (d.asama === 'oyun' && sayi === 1) {
    rozet = o.uno
      ? el('span', { class: 'rozet uno-dedi' }, 'UNO!')
      : el('span', { class: 'rozet uno' }, '1 kart');
  }

  const sirada = d.asama === 'oyun' && d.sira === i;
  return el(
    'div',
    { class: sirada ? 'rakip sirada' : 'rakip' },
    el('div', { class: 'ad' }, o.ad),
    arkalar,
    el('div', { class: 'puan' }, o.puan + ' puan'),
    rozet
  );
}

// Karta dokununca ne olur
function kartaDokun(kart) {
  const d = istemci.durum;
  if (d.asama !== 'oyun') {
    return;
  }
  const durum = atilabilirlik(d, istemci.oyuncuId, kart);
  if (durum === 'hayir') {
    // Motorun kendi mesajını göster (sıra sende değil, atamazsın vb.)
    const sonuc = uygula(d, { tip: 'oyna', id: istemci.oyuncuId, kart: kart.id, renk: 'mavi' });
    mesajGoster(sonuc.ok ? 'Bu kartı şimdi atamazsın.' : sonuc.hata);
    return;
  }
  if (kart.tip === 'joker') {
    istemci.modal = { tur: 'renk', kart: kart };
    render();
    return;
  }
  if (kart.tip === 'cek4') {
    istemci.modal = { tur: durum === 'blof' ? 'blof' : 'renk', kart: kart };
    render();
    return;
  }
  hamle({ tip: 'oyna', kart: kart.id });
}

function masaEkrani() {
  const d = istemci.durum;
  const ben = benimIndeks();
  const n = d.oyuncular.length;
  const benO = d.oyuncular[ben];
  const oyunda = d.asama === 'oyun';
  const benimSiram = oyunda && d.sira === ben;

  // Rakipler: benden sonra gelenler, saat yönünde
  const rakipler = [];
  for (let k = 1; k < n; k++) {
    rakipler.push(rakipPaneli(d, (ben + k) % n));
  }

  // Ortadaki yığınlar
  const ust = d.atik[d.atik.length - 1];
  const atikSinifi = ust && ust.id !== istemci.sonAtikId ? 'atildi' : '';
  istemci.sonAtikId = ust ? ust.id : null;

  const desteHazir = benimSiram && !d.cektiMi && !d.itiraz && !d.renkBekle;
  const desteKutusu = el(
    'button',
    {
      class: desteHazir ? 'deste-kutu hazir' : 'deste-kutu',
      'aria-label': 'Desteden kart çek',
      onclick: () => hamle({ tip: 'cek' }),
    },
    el('span', { class: 'alt-yazi' }, desteHazir ? (d.bekleyen > 0 ? d.bekleyen + ' kart çek' : 'Çek') : 'Deste'),
    arkaKartCiz(),
    el('span', { class: 'alt-yazi' }, d.deste.length + ' kart')
  );

  const renkSinifi = d.renk ? ' halka-' + d.renk : '';
  const atikKutusu = el(
    'div',
    { class: 'atik-kutu' + renkSinifi },
    el('span', { class: 'renk-yazisi' }, el('span', { class: 'yuvarlak' }), d.renk ? RENK_ADLARI[d.renk] : 'Renk seçiliyor'),
    el('div', { class: 'atik-halka' }, ust ? kartCiz(ust, atikSinifi) : null)
  );

  const yon = el('div', { class: 'yon', title: 'Oyun yönü', 'aria-label': 'Oyun yönü' }, d.yon === 1 ? '↻' : '↺');

  // Sıra bandı
  const siraYazisi = benimSiram ? 'Sıra sende' : oyunda ? 'Sıra: ' + d.oyuncular[d.sira].ad : '';
  const siraBandi = el('div', { class: benimSiram ? 'sira-bandi benim' : 'sira-bandi' }, siraYazisi || ' ');

  // Düğmeler
  const dugmeler = [];
  if (benimSiram && d.cektiMi && !d.itiraz) {
    dugmeler.push(el('button', { class: 'dugme ikincil', onclick: () => hamle({ tip: 'pas' }) }, 'Pas'));
  }
  const unoGoster = oyunda && !benO.uno && ((benimSiram && benO.el.length === 2) || (benO.el.length === 1 && d.yakala === ben));
  if (unoGoster) {
    dugmeler.push(el('button', { class: 'dugme uno-dugme', onclick: () => hamle({ tip: 'uno' }) }, 'UNO!'));
  }
  if (oyunda && d.yakala !== null && d.yakala !== ben) {
    dugmeler.push(el('button', { class: 'dugme yakala-dugme', onclick: () => hamle({ tip: 'yakala' }) }, 'Yakala!'));
  }
  if (oyunda && d.itiraz && d.itiraz.hedef === ben) {
    dugmeler.push(el('button', { class: 'dugme kotu', onclick: () => hamle({ tip: 'itiraz' }) }, 'İtiraz et'));
    dugmeler.push(el('button', { class: 'dugme ikincil', onclick: () => hamle({ tip: 'kabul' }) }, 'Kabul et'));
  }

  // Elim: renge ve değere göre sıralı
  const siraliEl = benO.el.slice().sort(kartSirala);
  const gorulen = istemci.gorulenEl;
  const elKartlari = siraliEl.map((kart) => {
    const durum = atilabilirlik(d, istemci.oyuncuId, kart);
    const siniflar = ['el-kart'];
    if (durum === 'evet') {
      siniflar.push('oynanir');
    } else if (durum === 'blof') {
      siniflar.push('risk');
    } else if (benimSiram) {
      siniflar.push('soluk');
    }
    const kartDugumu = kartCiz(kart, gorulen.has(kart.id) ? '' : 'yeni');
    kartDugumu.className += ' ' + siniflar.join(' ');
    kartDugumu.addEventListener('click', () => kartaDokun(kart));
    return kartDugumu;
  });
  istemci.gorulenEl = new Set(siraliEl.map((k) => k.id));

  const benimBilgi = el(
    'div',
    { class: 'benim-bilgi' },
    el('span', { class: 'ad' }, benO.ad),
    el('span', null, benO.puan + ' puan'),
    benO.el.length === 1 && oyunda
      ? el('span', { class: benO.uno ? 'rozet uno-dedi' : 'rozet uno' }, benO.uno ? 'UNO!' : '1 kart')
      : null
  );

  return el(
    'div',
    { class: 'masa' },
    ustCubuk(),
    el('div', { class: 'rakipler' }, rakipler),
    el(
      'div',
      { class: 'orta-alan' },
      el('div', { class: 'yiginlar' }, desteKutusu, atikKutusu, yon),
      el('div', { class: 'olay-yazisi', 'aria-live': 'polite' }, olayMetni(d, ben)),
      siraBandi,
      el('div', { class: 'ipucu' }, ipucuMetni(d, ben))
    ),
    el(
      'div',
      { class: 'alt-alan' },
      el('div', { class: 'eylemler' }, dugmeler),
      benimBilgi,
      el('div', { class: 'el-seridi' }, el('div', { class: 'el-ici' }, elKartlari))
    )
  );
}

// ---------------------------------------------------------------------------
// Katmanlar: renk seçimi, blöf uyarısı, el sonu
// ---------------------------------------------------------------------------

function renkKatmani(baslik, renkSecildi, vazgec) {
  const dugmeler = RENKLER.map((renk) =>
    el('button', { class: 'renk-dugmesi ' + renk, onclick: () => renkSecildi(renk) }, RENK_ADLARI[renk])
  );
  return el(
    'div',
    { class: 'katman' },
    el(
      'div',
      { class: 'pano' },
      el('h2', null, baslik),
      el('div', { class: 'renk-dugmeleri' }, dugmeler),
      vazgec ? el('button', { class: 'dugme ikincil', onclick: vazgec }, 'Vazgeç') : null
    )
  );
}

function modalKapat() {
  istemci.modal = null;
  render();
}

function modalKatmani(d, ben) {
  // Oyun başında Joker açıldıysa ilk oyuncu renk seçer
  if (d.asama === 'oyun' && d.renkBekle && d.sira === ben) {
    return renkKatmani('Rengi seç', (renk) => hamle({ tip: 'renkSec', renk: renk }), null);
  }
  const m = istemci.modal;
  if (!m) {
    return null;
  }
  // Durum değiştiyse (sıra geçti vb.) eski pencereyi bırak
  const hala = d.asama === 'oyun' && d.sira === ben && d.oyuncular[ben].el.some((k) => k.id === m.kart.id);
  if (!hala) {
    istemci.modal = null;
    return null;
  }
  if (m.tur === 'renk') {
    return renkKatmani(
      'Rengi seç',
      (renk) => {
        istemci.modal = null;
        hamle({ tip: 'oyna', kart: m.kart.id, renk: renk });
      },
      modalKapat
    );
  }
  // Blöf uyarısı: elde geçerli renk varken +4
  const eskiRenk = RENK_ADLARI[d.renk];
  return el(
    'div',
    { class: 'katman' },
    el(
      'div',
      { class: 'pano' },
      el('h2', null, 'Dikkat'),
      el(
        'p',
        null,
        'Elinde ' + eskiRenk + ' kart var. +4 yine de atılabilir ama rakip itiraz ederse 4 kart çekersin.'
      ),
      el(
        'button',
        {
          class: 'dugme birincil genis',
          onclick: () => {
            istemci.modal = { tur: 'renk', kart: m.kart };
            render();
          },
        },
        'Yine de at'
      ),
      el('button', { class: 'dugme ikincil genis', onclick: modalKapat }, 'Vazgeç')
    )
  );
}

function puanTablosu(d, artisGoster) {
  const sirali = d.oyuncular
    .map((o, i) => ({ o: o, i: i }))
    .sort((a, b) => b.o.puan - a.o.puan);
  return el(
    'div',
    { class: 'puan-tablosu' },
    sirali.map((s) => {
      const kazanan = s.i === d.elKazanan;
      return el(
        'div',
        { class: kazanan ? 'puan-satiri kazanan' : 'puan-satiri' },
        el('span', { class: 'ad' }, s.o.id === istemci.oyuncuId ? s.o.ad + ' (sen)' : s.o.ad),
        artisGoster && kazanan ? el('span', { class: 'artis' }, '+' + d.elPuani) : null,
        el('span', { class: 'toplam' }, String(s.o.puan))
      );
    })
  );
}

function elSonuKatmani(d, ben) {
  const sahipMi = d.sahip === istemci.oyuncuId;
  const kazanan = d.oyuncular[d.elKazanan];
  const benKazandim = d.elKazanan === ben;

  if (d.asama === 'el_sonu') {
    return el(
      'div',
      { class: 'katman' },
      el(
        'div',
        { class: 'pano' },
        el('div', { class: 'buyuk-emoji' }, benKazandim ? '🎉' : '🃏'),
        el('h2', null, benKazandim ? 'Eli sen aldın!' : kazanan.ad + ' eli aldı!'),
        el('p', null, d.elPuani + ' puan kazandı.'),
        puanTablosu(d, true),
        el('p', { class: 'soluk-yazi' }, 'Hedef: ' + d.ayar.hedef + ' puan'),
        sahipMi
          ? el('button', { class: 'dugme birincil genis', onclick: () => hamle({ tip: 'sonrakiEl' }) }, 'Sonraki el')
          : el('p', { class: 'soluk-yazi' }, 'Ev sahibi sonraki eli başlatacak.')
      )
    );
  }

  // Oyun bitti
  const oyunKazanan = d.oyuncular[d.oyunKazanan];
  const benOyunKazandim = d.oyunKazanan === ben;
  return el(
    'div',
    { class: 'katman' },
    el(
      'div',
      { class: 'pano' },
      el('div', { class: 'buyuk-emoji' }, '🏆'),
      el('h2', null, benOyunKazandim ? 'Oyunu sen kazandın!' : oyunKazanan.ad + ' oyunu kazandı!'),
      el('p', null, 'Son elde ' + d.elPuani + ' puan.'),
      puanTablosu(d, true),
      sahipMi
        ? el('button', { class: 'dugme birincil genis', onclick: () => hamle({ tip: 'yeniOyun' }) }, 'Yeni oyun')
        : el('p', { class: 'soluk-yazi' }, 'Ev sahibi yeni oyunu başlatacak.')
    )
  );
}

// ---------------------------------------------------------------------------
// Çizim
// ---------------------------------------------------------------------------

// Her oyunun kendi rengi var: UNO yeşil çuha, "Beni ne kadar tanıyorsun" mor-gül
function temaUygula(d) {
  const tanisMi = Boolean(istemci.kod && d && oyunId(d) === 'tanis');
  const sayfaKoku = document.documentElement;
  if (tanisMi) {
    sayfaKoku.setAttribute('data-tema', 'tanis');
  } else {
    sayfaKoku.removeAttribute('data-tema');
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', tanisMi ? '#241437' : '#0c2f26');
  }
}

function render() {
  const d = istemci.durum;
  const ben = benimIndeks();

  // Kendi sorumu yazarken gelen güncelleme yazı kutusunu bozmasın
  if (istemci.kod && ben >= 0 && tanisEkran.yazimSurerken(d)) {
    tanisEkran.ozelEsitle();
    return;
  }

  // El şeridinin kaydırma konumunu koru
  const eskiSerit = kok.querySelector('.el-seridi');
  const kaydirma = eskiSerit ? eskiSerit.scrollLeft : 0;

  kok.replaceChildren();

  // Odada oturmuyorsak başlangıç ekranı
  if (!istemci.kod || !d || ben < 0) {
    if (istemci.kod && d && ben < 0 && !istemci.gecis) {
      mesajGoster('Bu odadan çıkarıldın.');
      abonelikKapat();
      istemci.kod = null;
      istemci.durum = null;
      istemci.surum = 0;
    }
    temaUygula(null);
    kok.append(baslangicEkrani());
    return;
  }

  temaUygula(d);

  // Sorularım ekranı yalnız "Beni ne kadar tanıyorsun" lobisinde açık kalır
  if (oyunId(d) !== 'tanis' || d.asama !== 'lobi') {
    tanisEkran.sorularimiKapat();
  }

  if (d.asama === 'lobi') {
    kok.append(ustCubuk(), lobiEkrani());
    tanisEkran.ozelEsitle();
    return;
  }

  if (oyunId(d) === 'tanis') {
    kok.append(...tanisEkran.sayfa(d, ben));
    return;
  }

  kok.append(masaEkrani());

  const katman = modalKatmani(d, ben);
  if (katman) {
    kok.append(katman);
  }
  if (d.asama === 'el_sonu' || d.asama === 'bitti') {
    kok.append(elSonuKatmani(d, ben));
  }

  const yeniSerit = kok.querySelector('.el-seridi');
  if (yeniSerit) {
    yeniSerit.scrollLeft = kaydirma;
  }
}

// ---------------------------------------------------------------------------
// Açılış
// ---------------------------------------------------------------------------

async function basla() {
  if (!db) {
    kok.append(
      el(
        'div',
        { class: 'sayfa' },
        el('div', { class: 'logo' }, BASLIK),
        el('p', { class: 'slogan' }, 'Oyun kütüphanesi yüklenemedi. İnterneti kontrol edip sayfayı yenile.')
      )
    );
    return;
  }

  const kod = kodHashten();
  istemci.onKod = kod;
  render();

  // Aynı tarayıcıyla aynı linke dönüldüyse koltuğa geri otur
  if (kod.length === 4) {
    try {
      const satir = await satirGetir(kod);
      if (satir && odaGecerliMi(satir) && oyuncuIndeks(satir.durum, istemci.oyuncuId) >= 0) {
        odaBaglan(kod, satir);
      }
    } catch (hata) {
      mesajGoster('Bağlanamadım. İnterneti kontrol et.');
    }
  }
}

basla();

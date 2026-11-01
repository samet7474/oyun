// cizbil-ekran.js - "Çiz Bil" ekranları ve canlı çizim.
// Oyun kuralları cizbil.js içindedir; burada göstermek, çizmek ve çizgiyi canlı göndermek var.
// app.js ortak yardımcıları (el, hamle, istemci, db...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Canlı çizim: çizgiler oda durumuna (oyun_odalari satırı) YAZILMAZ. Çizenin telefonu çizgiyi
// AKTARIM_MS aralıklarla küçük "parça" mesajları halinde Supabase Realtime broadcast kanalına
// ('cizbil-<oda kodu>') gönderir. Satıra yalnız tur, kelime, tahmin ve puan yazılır.
// Sayfayı yenileyen ya da bağlantısı kopup gelen biri kanala "iste" der, çizen tam tahtayı gönderir.
// Arada kaçan parça fark edilirse (sıra numarası atlarsa) yine tam tahta istenir.
// Çizen sayfasını yenilerse kendi tahtasını tarayıcıdan (localStorage) geri yükler.
//
// Gizlilik: kelime durumda durur ama ekran tahmincilere yalnız harf sayısını gösterir.

import {
  KALINLIKLAR,
  MAKS_CIZGI,
  MAKS_NOKTA,
  MAKS_TAHMIN_UZUNLUK,
  RENKLER,
  RENK_ADLARI,
  SILGI,
  SILGI_KALINLIGI,
  SURELER,
  TAHTA_BOYUT,
  TUR_SAYILARI,
  asamaSuresiMs,
  bildiMi,
  kalanMs,
  kelimeKalibi,
  mesajGecerliMi,
  mesajUygula,
  noktaSayisi,
  noktaTutulsunMu,
  oyunKazananlari,
  tahminDogruMu,
  tahminHatasi,
  tahminciler,
  tahtaAnahtari,
  tahtaMesaji,
  tahtaNoktasi,
  toplamCizim,
  turNumarasi,
  yakinMi,
  yeniTahta,
} from './cizbil.js';

// Çizen telefon yeni noktaları en geç bu kadar ms'de bir gönderir (saniyede ~8 mesaj, yalnız çizerken)
const AKTARIM_MS = 120;
// Tam tahta isteği en fazla bu sıklıkta (ms)
const ISTEK_ARALIGI = 1500;
// Kanal kurulamadıysa bu kadar ms sonra yeniden denenir
const KANAL_YENIDEN_MS = 10000;
// Süre bitince çizen hemen, diğerleri bu kadar ms sonra "süre bitti" der (saat farkı ve çizenin önceliği için)
const SURE_BEKLEME_MS = 3000;

const DEPO_ANAHTARI = 'cizbil.tahta';

function buyukHarf(metin) {
  return String(metin).toLocaleUpperCase('tr-TR');
}

// Saat farkında süre, aşamanın süresinden büyük görünmesin diye ust ile sınırlanır
function sureYazisi(ms, ust) {
  const sinirli = ust ? Math.min(ms, ust) : ms;
  const sn = Math.max(0, Math.ceil(sinirli / 1000));
  return Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0');
}

export function cizbilEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;
  const db = k.db;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    tahta: yeniTahta(''), // şu anki çizimin çizgileri
    tahtaKod: '', // tahtanın ait olduğu oda
    renk: 0,
    kalin: 0, // KALINLIKLAR indeksi
    silgi: false,
    ciziyor: null, // { pointerId, i } (şu an çizilen çizgi)
    gonderilen: {}, // çizgi no -> gönderilmiş nokta sayısı
    aktarimZamanlayici: null,
    kanal: null,
    kanalKod: '',
    kanalHazir: false,
    kanalKuruldu: 0,
    sonIstek: 0,
    istekZamanlayici: null,
    imza: '', // tam çizilen sayfanın imzası (aynıysa yerinde güncellenir)
    kok: null, // tam çizilen sayfanın kökü
    mesaj: '',
    mesajSinif: '',
    sureGonderiliyor: false,
    nasilAcik: true,
  };

  // Kalıcı öğeler: her çizimde yeniden kurulmaz (çizim ve yazı kutusu kaybolmasın)
  const tuval = document.createElement('canvas');
  tuval.className = 'cb-tuval';
  tuval.setAttribute('aria-label', 'Çizim tahtası');
  const tuvalKutusu = document.createElement('div');
  tuvalKutusu.className = 'cb-tuval-kutusu';
  tuvalKutusu.append(tuval);
  const ctx = tuval.getContext('2d');

  const girdi = document.createElement('input');
  girdi.className = 'cb-girdi';
  girdi.type = 'text';
  girdi.maxLength = MAKS_TAHMIN_UZUNLUK;
  girdi.placeholder = 'Tahminini yaz';
  girdi.autocomplete = 'off';
  girdi.setAttribute('autocapitalize', 'off');
  girdi.setAttribute('autocorrect', 'off');
  girdi.setAttribute('spellcheck', 'false');
  girdi.setAttribute('enterkeyhint', 'send');
  girdi.setAttribute('aria-label', 'Tahmin');

  // -------------------------------------------------------------------------
  // Durum yardımcıları
  // -------------------------------------------------------------------------

  function guncelDurum() {
    const d = istemci.durum;
    if (!istemci.kod || !d || d.oyun !== 'cizbil') {
      return null;
    }
    return d;
  }

  function cizenMiyim(d) {
    return Boolean(d) && k.benimIndeks() === d.cizen && k.benimIndeks() >= 0;
  }

  function cizenId(d) {
    const o = d.oyuncular[d.cizen];
    return o ? o.id : null;
  }

  function tahtaliAsama(d) {
    return d.asama === 'cizim' || d.asama === 'acik';
  }

  // Durum yeni bir çizime geçtiyse tahtayı sıfırla (çizen kendi kaydını geri yükler)
  function tahtayiHazirla(d) {
    const anahtar = tahtaAnahtari(d);
    if (durumum.tahta.anahtar === anahtar && durumum.tahtaKod === istemci.kod) {
      return;
    }
    durumum.tahta = yeniTahta(anahtar);
    durumum.tahtaKod = istemci.kod;
    durumum.ciziyor = null;
    durumum.gonderilen = {};
    if (cizenMiyim(d)) {
      tahtaGeriYukle();
    }
    tumunuCiz();
    if (tahtaliAsama(d)) {
      // Kanal mesajı durumdan önce geldiyse ilk çizgiler kaçmış olabilir: kısa bir süre sonra tam tahtayı iste
      clearTimeout(durumum.istekZamanlayici);
      durumum.istekZamanlayici = setTimeout(() => tahtaIste(true), 1200);
    }
  }

  // -------------------------------------------------------------------------
  // Tarayıcıda saklama (çizen sayfasını yenilerse çizimi kaybolmasın)
  // -------------------------------------------------------------------------

  function tahtaSakla() {
    try {
      localStorage.setItem(
        DEPO_ANAHTARI,
        JSON.stringify({ kod: istemci.kod, tahta: durumum.tahta })
      );
    } catch (hata) {
      // depo kapalı ya da dolu: önemli değil
    }
  }

  function tahtaGeriYukle() {
    try {
      const kayit = JSON.parse(localStorage.getItem(DEPO_ANAHTARI) || 'null');
      if (!kayit || kayit.kod !== istemci.kod || !kayit.tahta || kayit.tahta.anahtar !== durumum.tahta.anahtar) {
        return;
      }
      const m = Object.assign({}, tahtaMesaji(kayit.tahta), { a: durumum.tahta.anahtar });
      if (mesajUygula(durumum.tahta, m) === 'tamam') {
        durumum.tahta.cizgiler.forEach((c, i) => {
          durumum.gonderilen[i] = c.n.length / 2;
        });
      }
    } catch (hata) {
      // bozuk kayıt: yok say
    }
  }

  // -------------------------------------------------------------------------
  // Tuvale çizim
  // -------------------------------------------------------------------------

  function olcek() {
    return tuval.width / TAHTA_BOYUT;
  }

  function cizgiRengi(c) {
    return c.r === SILGI ? '#ffffff' : RENKLER[c.r];
  }

  // c çizgisini bas. noktadan (nokta sırası) sonuna kadar çizer
  function cizgiCiz(c, bas) {
    const n = c.n;
    const adet = n.length / 2;
    if (adet === 0) {
      return;
    }
    const o = olcek();
    ctx.strokeStyle = cizgiRengi(c);
    ctx.fillStyle = cizgiRengi(c);
    ctx.lineWidth = c.k * o;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (adet === 1) {
      ctx.beginPath();
      ctx.arc(n[0] * o, n[1] * o, (c.k * o) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const ilk = Math.max(0, bas - 1);
    if (ilk >= adet - 1) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(n[ilk * 2] * o, n[ilk * 2 + 1] * o);
    for (let j = ilk + 1; j < adet; j++) {
      ctx.lineTo(n[j * 2] * o, n[j * 2 + 1] * o);
    }
    ctx.stroke();
  }

  function tumunuCiz() {
    if (tuval.width === 0) {
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tuval.width, tuval.height);
    for (const c of durumum.tahta.cizgiler) {
      cizgiCiz(c, 0);
    }
  }

  // Kutu boyutu değişince tuvalin piksel boyutunu ayarla ve hepsini yeniden çiz
  function boyutAyarla() {
    const genislik = tuvalKutusu.clientWidth;
    if (genislik <= 0) {
      return;
    }
    const oran = Math.min(window.devicePixelRatio || 1, 2.5);
    const piksel = Math.round(genislik * oran);
    if (tuval.width !== piksel || tuval.height !== piksel) {
      tuval.width = piksel;
      tuval.height = piksel;
      tumunuCiz();
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => boyutAyarla()).observe(tuvalKutusu);
  } else {
    window.addEventListener('resize', boyutAyarla);
  }

  // -------------------------------------------------------------------------
  // Parmakla / fareyle çizme (yalnız çizen, yalnız çizim aşamasında)
  // -------------------------------------------------------------------------

  function cizebilirMiyim() {
    const d = guncelDurum();
    return Boolean(d) && d.asama === 'cizim' && cizenMiyim(d) && durumum.tahta.anahtar === tahtaAnahtari(d);
  }

  function olayNoktasi(olay) {
    const kutu = tuval.getBoundingClientRect();
    if (kutu.width === 0 || kutu.height === 0) {
      return null;
    }
    return tahtaNoktasi((olay.clientX - kutu.left) / kutu.width, (olay.clientY - kutu.top) / kutu.height);
  }

  function kalinlik() {
    return durumum.silgi ? SILGI_KALINLIGI : KALINLIKLAR[durumum.kalin];
  }

  tuval.addEventListener('pointerdown', (olay) => {
    if (!cizebilirMiyim() || durumum.ciziyor) {
      return;
    }
    if (olay.pointerType === 'mouse' && olay.button !== 0) {
      return;
    }
    olay.preventDefault();
    const tahta = durumum.tahta;
    if (tahta.cizgiler.length >= MAKS_CIZGI || noktaSayisi(tahta) >= MAKS_NOKTA) {
      mesajYaz('Tahta doldu. Temizle ya da geri al.', 'uyari');
      return;
    }
    const nokta = olayNoktasi(olay);
    if (!nokta) {
      return;
    }
    try {
      tuval.setPointerCapture(olay.pointerId);
    } catch (hata) {
      // bazı tarayıcılarda gerekmez
    }
    const cizgi = { r: durumum.silgi ? SILGI : durumum.renk, k: kalinlik(), n: [nokta[0], nokta[1]] };
    tahta.cizgiler.push(cizgi);
    const i = tahta.cizgiler.length - 1;
    durumum.gonderilen[i] = 0;
    durumum.ciziyor = { pointerId: olay.pointerId, i: i };
    cizgiCiz(cizgi, 0);
    aktarimPlanla();
  });

  tuval.addEventListener('pointermove', (olay) => {
    const ciz = durumum.ciziyor;
    if (!ciz || olay.pointerId !== ciz.pointerId) {
      return;
    }
    olay.preventDefault();
    const cizgi = durumum.tahta.cizgiler[ciz.i];
    if (!cizgi) {
      durumum.ciziyor = null;
      return;
    }
    const olaylar = typeof olay.getCoalescedEvents === 'function' ? olay.getCoalescedEvents() : [];
    const liste = olaylar.length > 0 ? olaylar : [olay];
    const once = cizgi.n.length / 2;
    for (const o of liste) {
      if (noktaSayisi(durumum.tahta) >= MAKS_NOKTA) {
        break;
      }
      const nokta = olayNoktasi(o);
      if (!nokta) {
        continue;
      }
      const sonX = cizgi.n[cizgi.n.length - 2];
      const sonY = cizgi.n[cizgi.n.length - 1];
      if (noktaTutulsunMu(sonX, sonY, nokta[0], nokta[1])) {
        cizgi.n.push(nokta[0], nokta[1]);
      }
    }
    if (cizgi.n.length / 2 > once) {
      cizgiCiz(cizgi, once);
      aktarimPlanla();
    }
  });

  function cizmeyiBitir(olay) {
    const ciz = durumum.ciziyor;
    if (!ciz || olay.pointerId !== ciz.pointerId) {
      return;
    }
    durumum.ciziyor = null;
    aktar();
    tahtaSakla();
  }

  tuval.addEventListener('pointerup', cizmeyiBitir);
  tuval.addEventListener('pointercancel', cizmeyiBitir);
  tuval.addEventListener('lostpointercapture', cizmeyiBitir);
  // Dokunurken sayfa kaymasın, uzun basınca menü açılmasın
  tuval.addEventListener('touchstart', (olay) => olay.preventDefault(), { passive: false });
  tuval.addEventListener('contextmenu', (olay) => olay.preventDefault());

  function aktarimPlanla() {
    if (durumum.aktarimZamanlayici === null) {
      durumum.aktarimZamanlayici = setTimeout(aktar, AKTARIM_MS);
    }
  }

  // Gönderilmemiş noktaları parça mesajı olarak yolla
  function aktar() {
    clearTimeout(durumum.aktarimZamanlayici);
    durumum.aktarimZamanlayici = null;
    const tahta = durumum.tahta;
    tahta.cizgiler.forEach((c, i) => {
      const gonderilen = durumum.gonderilen[i] || 0;
      const adet = c.n.length / 2;
      if (adet > gonderilen) {
        yayinla({ t: 'parca', a: tahta.anahtar, s: tahta.sayfa, i: i, r: c.r, k: c.k, b: gonderilen, n: c.n.slice(gonderilen * 2) });
        durumum.gonderilen[i] = adet;
      }
    });
  }

  function geriAl() {
    if (!cizebilirMiyim() || durumum.ciziyor) {
      return;
    }
    const tahta = durumum.tahta;
    if (tahta.cizgiler.length === 0) {
      return;
    }
    aktar();
    tahta.cizgiler.pop();
    const i = tahta.cizgiler.length;
    delete durumum.gonderilen[i];
    yayinla({ t: 'geri', a: tahta.anahtar, s: tahta.sayfa, i: i });
    tumunuCiz();
    tahtaSakla();
  }

  function temizle() {
    if (!cizebilirMiyim() || durumum.ciziyor) {
      return;
    }
    const tahta = durumum.tahta;
    if (tahta.cizgiler.length === 0) {
      return;
    }
    tahta.sayfa += 1;
    tahta.cizgiler = [];
    durumum.gonderilen = {};
    yayinla({ t: 'temizle', a: tahta.anahtar, s: tahta.sayfa });
    tumunuCiz();
    tahtaSakla();
  }

  // -------------------------------------------------------------------------
  // Broadcast kanalı
  // -------------------------------------------------------------------------

  function kanalKapat() {
    if (durumum.kanal && db) {
      db.removeChannel(durumum.kanal);
    }
    durumum.kanal = null;
    durumum.kanalKod = '';
    durumum.kanalHazir = false;
  }

  function kanalKur() {
    kanalKapat();
    if (!db || !istemci.kod) {
      return;
    }
    const kod = istemci.kod;
    durumum.kanalKod = kod;
    durumum.kanalKuruldu = Date.now();
    const kanal = db.channel('cizbil-' + kod, { config: { broadcast: { self: false, ack: false } } });
    durumum.kanal = kanal;
    kanal
      .on('broadcast', { event: 'c' }, (yuk) => {
        if (durumum.kanal === kanal) {
          mesajGeldi(yuk && yuk.payload);
        }
      })
      .subscribe((durum) => {
        if (durumum.kanal !== kanal) {
          return;
        }
        durumum.kanalHazir = durum === 'SUBSCRIBED';
        if (durum === 'SUBSCRIBED') {
          kanalAcildi();
        }
      });
  }

  // Kanal (yeniden) açıldı: çizen tahtasını yollar, diğerleri tam tahtayı ister
  function kanalAcildi() {
    const d = guncelDurum();
    if (!d || !tahtaliAsama(d)) {
      return;
    }
    tahtayiHazirla(d);
    if (cizenMiyim(d)) {
      if (durumum.tahta.cizgiler.length > 0) {
        yayinla(tahtaMesaji(durumum.tahta));
      }
    } else {
      tahtaIste(true);
    }
  }

  function kanalKontrol() {
    const d = guncelDurum();
    if (!d || !db) {
      return;
    }
    if (durumum.kanalKod !== istemci.kod) {
      kanalKur();
    }
  }

  function yayinla(mesaj) {
    if (!durumum.kanal || !durumum.kanalHazir) {
      return; // kanal yokken giden kaybolur; kanal açılınca tam tahta yollanır
    }
    try {
      const vaat = durumum.kanal.send({
        type: 'broadcast',
        event: 'c',
        payload: Object.assign({ g: istemci.oyuncuId }, mesaj),
      });
      if (vaat && typeof vaat.catch === 'function') {
        vaat.catch(() => {});
      }
    } catch (hata) {
      // gönderilemedi: sonraki parça boşluğu fark ettirir
    }
  }

  // Tam tahtayı iste (sık sık değil)
  function tahtaIste(zorla) {
    const d = guncelDurum();
    if (!d || !tahtaliAsama(d)) {
      return;
    }
    const simdi = Date.now();
    if (!zorla && simdi - durumum.sonIstek < ISTEK_ARALIGI) {
      return;
    }
    durumum.sonIstek = simdi;
    yayinla({ t: 'iste', a: tahtaAnahtari(d) });
  }

  function mesajGeldi(m) {
    const d = guncelDurum();
    if (!d || !m || m.g === istemci.oyuncuId || !mesajGecerliMi(m)) {
      return;
    }
    if (!tahtaliAsama(d) || k.benimIndeks() < 0) {
      return;
    }
    tahtayiHazirla(d);
    const tahta = durumum.tahta;
    if (m.a !== tahta.anahtar) {
      return;
    }
    const benCizenim = cizenMiyim(d);
    const cizenden = m.g === cizenId(d);

    if (m.t === 'iste') {
      // Çizen her isteyene; çizen tahtasını kaybettiyse ve isterse tahminciler cevap verir
      if (benCizenim || (cizenden && tahta.cizgiler.length > 0)) {
        aktar();
        yayinla(tahtaMesaji(tahta));
      }
      return;
    }

    if (!cizenden) {
      // Çizen değilse yalnız çizenin kaybettiği tahtayı geri vermek için gelen tam tahta kabul edilir
      if (!(benCizenim && m.t === 'tahta' && tahta.cizgiler.length === 0)) {
        return;
      }
    } else if (benCizenim) {
      return; // aynı kimlikle iki sekme: kendi çizdiğimi tekrar işleme
    }

    const once = m.t === 'parca' && tahta.cizgiler[m.i] ? tahta.cizgiler[m.i].n.length / 2 : 0;
    const sonuc = mesajUygula(tahta, m);
    if (sonuc === 'eksik') {
      tahtaIste(false);
      return;
    }
    if (sonuc !== 'tamam') {
      return;
    }
    if (m.t === 'parca') {
      cizgiCiz(tahta.cizgiler[m.i], once);
    } else {
      tumunuCiz();
    }
    if (benCizenim && m.t === 'tahta') {
      tahta.cizgiler.forEach((c, i) => {
        durumum.gonderilen[i] = c.n.length / 2;
      });
      tahtaSakla();
    }
  }

  // Bağlantı toparlama: kanal düştüyse yeniden kur; sekmeye dönünce kaçanları iste
  setInterval(() => {
    const d = guncelDurum();
    if (!d || !db) {
      return;
    }
    if (!durumum.kanalHazir && Date.now() - durumum.kanalKuruldu > KANAL_YENIDEN_MS) {
      kanalKur();
    }
  }, 3000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      return;
    }
    const d = guncelDurum();
    if (!d || !db) {
      return;
    }
    if (!durumum.kanalHazir) {
      kanalKur();
    } else if (!cizenMiyim(d)) {
      tahtaIste(true);
    }
  });

  // -------------------------------------------------------------------------
  // Geri sayım: süreyi tazeler; süre bitince "süre bitti" hamlesini dener
  // -------------------------------------------------------------------------

  setInterval(() => {
    const d = guncelDurum();
    if (!d || (d.asama !== 'secim' && d.asama !== 'cizim') || k.benimIndeks() < 0) {
      return;
    }
    const kalan = kalanMs(d, Date.now());
    document.querySelectorAll('.cb-sure').forEach((oge) => {
      oge.textContent = sureYazisi(kalan, asamaSuresiMs(d));
      oge.classList.toggle('az', kalan <= 10000);
    });
    const bekleme = cizenMiyim(d) ? 0 : SURE_BEKLEME_MS;
    if (kalan <= -bekleme && !durumum.sureGonderiliyor) {
      durumum.sureGonderiliyor = true;
      k.hamle({ tip: 'sureBitti', cizim: d.cizim }).then(() => {
        // Başarısız olursa (bağlantı, saat farkı) birkaç saniye sonra yeniden denenir
        setTimeout(() => {
          durumum.sureGonderiliyor = false;
        }, 3000);
      });
    }
  }, 250);

  // -------------------------------------------------------------------------
  // Tahmin
  // -------------------------------------------------------------------------

  function mesajYaz(metin, sinif) {
    durumum.mesaj = metin;
    durumum.mesajSinif = sinif || '';
    const oge = document.querySelector('.cb-mesaj');
    if (oge) {
      oge.textContent = metin;
      oge.className = 'cb-mesaj ' + durumum.mesajSinif;
    }
  }

  function tahminGonder(olay) {
    if (olay) {
      olay.preventDefault();
    }
    const d = guncelDurum();
    const ben = k.benimIndeks();
    if (!d || d.asama !== 'cizim' || ben < 0 || ben === d.cizen || bildiMi(d, ben)) {
      return;
    }
    const metin = girdi.value;
    const sorun = tahminHatasi(metin);
    if (sorun) {
      mesajYaz(sorun, 'uyari');
      return;
    }
    const dogru = tahminDogruMu(metin, d.kelime);
    const yakin = !dogru && yakinMi(metin, d.kelime);
    k.hamle({ tip: 'tahmin', cizim: d.cizim, metin: metin }).then((sonuc) => {
      if (!sonuc || !sonuc.ok) {
        if (sonuc && sonuc.hata === 'mesgul') {
          k.bekleyenUyari();
        }
        return;
      }
      if (girdi.value === metin) {
        girdi.value = '';
      }
      if (!dogru) {
        mesajYaz(yakin ? 'Çok yakın!' : 'Olmadı, tekrar dene.', yakin ? 'yakin' : '');
      }
    });
  }

  // -------------------------------------------------------------------------
  // Parçalar
  // -------------------------------------------------------------------------

  function adGoster(d, i, ben) {
    return i === ben ? d.oyuncular[i].ad + ' (sen)' : d.oyuncular[i].ad;
  }

  // Üstte oyuncular: puan, kim çiziyor, kim bildi
  function oyuncuSeridi(d, ben) {
    return el(
      'div',
      { class: 'cb-oyuncular' },
      d.oyuncular.map((o, i) => {
        let sinif = 'cb-oyuncu';
        let isaret = null;
        if (i === d.cizen && d.asama !== 'bitti') {
          sinif += ' cizen';
          isaret = '✏️';
        } else if (d.asama === 'cizim' && bildiMi(d, i)) {
          sinif += ' bildi';
          isaret = '✓';
        }
        return el(
          'div',
          { class: sinif },
          isaret ? el('span', { class: 'isaret' }, isaret) : null,
          el('span', { class: 'ad' }, i === ben ? 'Sen' : o.ad),
          el('span', { class: 'puan' }, String(o.puan))
        );
      })
    );
  }

  // Tahmin akışı: yanlış tahminler ve kim bildi (doğru cevap yazılmaz)
  function akisCiz(d, ben) {
    const satirlar = [];
    for (const b of d.bilenler) {
      satirlar.push(
        el('li', { class: 'bildi' }, (b.o === ben ? 'Sen' : d.oyuncular[b.o].ad) + ' bildi! +' + b.puan)
      );
    }
    for (const y of d.yanlislar.slice().reverse()) {
      satirlar.push(
        el('li', null, el('b', null, (y.o === ben ? 'Sen' : d.oyuncular[y.o].ad) + ': '), y.metin)
      );
    }
    if (satirlar.length === 0) {
      satirlar.push(el('li', { class: 'bos' }, 'Tahminler burada görünür.'));
    }
    return el('ul', { class: 'cb-akis', 'aria-live': 'polite' }, satirlar);
  }

  // Kelime kalıbı: tahminci harf sayısını görür
  function kalipCiz(kelime) {
    const parcalar = kelimeKalibi(kelime);
    const toplam = parcalar.reduce((t, n) => t + n, 0);
    return el(
      'div',
      { class: 'cb-kalip', 'aria-label': toplam + ' harf' },
      parcalar.map((n) => el('span', { class: 'kelime-kalibi' }, '_'.repeat(n).split('').join(' '))),
      el('span', { class: 'harf-sayisi' }, toplam + ' harf')
    );
  }

  function ustBilgi(d, sureli) {
    return el(
      'div',
      { class: 'cb-ust' },
      el(
        'span',
        null,
        'Tur ' + turNumarasi(d) + '/' + d.ayar.turSayisi + ' · Çizim ' + (d.cizim + 1) + '/' + toplamCizim(d)
      ),
      sureli ? el('span', { class: 'cb-sure' }, sureYazisi(kalanMs(d, Date.now()), asamaSuresiMs(d))) : null
    );
  }

  function aracCubugu() {
    const renkDugmeleri = RENKLER.map((renk, i) =>
      el('button', {
        class: 'cb-renk',
        style: '--renk:' + renk,
        'aria-label': RENK_ADLARI[i],
        'aria-pressed': !durumum.silgi && durumum.renk === i ? 'true' : 'false',
        onclick: () => {
          durumum.renk = i;
          durumum.silgi = false;
          araclariTazele();
        },
      })
    );
    const silgiDugmesi = el(
      'button',
      {
        class: 'cb-arac',
        'aria-pressed': durumum.silgi ? 'true' : 'false',
        onclick: () => {
          durumum.silgi = !durumum.silgi;
          araclariTazele();
        },
      },
      'Silgi'
    );
    const kalinDugmesi = el(
      'button',
      {
        class: 'cb-arac',
        'aria-label': 'Kalınlık',
        onclick: () => {
          durumum.kalin = (durumum.kalin + 1) % KALINLIKLAR.length;
          durumum.silgi = false;
          araclariTazele();
        },
      },
      durumum.kalin === 0 ? 'İnce' : 'Kalın'
    );
    return el(
      'div',
      { class: 'cb-araclar' },
      el('div', { class: 'cb-arac-satiri' }, renkDugmeleri, silgiDugmesi, kalinDugmesi),
      el(
        'div',
        { class: 'cb-arac-satiri' },
        el('button', { class: 'cb-arac', onclick: () => geriAl() }, '↶ Geri al'),
        el('span', { class: 'bosluk' }),
        el('button', { class: 'cb-arac tehlikeli', onclick: () => temizle() }, 'Temizle')
      )
    );
  }

  function araclariTazele() {
    const eski = document.querySelector('.cb-araclar');
    if (eski) {
      eski.replaceWith(aracCubugu());
    }
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function nasilOynanirKutusu() {
    const kutu = el(
      'details',
      { class: 'kutu cb-nasil', open: durumum.nasilAcik },
      el('summary', null, 'Nasıl oynanır'),
      el(
        'ul',
        null,
        el('li', null, 'Sırası gelen 3 kelimeden birini seçer ve parmağıyla çizer.'),
        el('li', null, 'Çizim diğerlerinin ekranında hemen görünür; onlar cevabı yazar.'),
        el('li', null, 'Erken bilen daha çok puan alır (10 ile 2 arası). Çizen, her bilen için onun puanının yarısını alır.'),
        el('li', null, 'Büyük-küçük harf ve Türkçe harf farkı önemli değil: "kopek" de "köpek" sayılır.'),
        el('li', null, 'Herkes bir kez çizince bir tur biter. Sonda en çok puanı olan kazanır.')
      )
    );
    kutu.addEventListener('toggle', () => {
      durumum.nasilAcik = kutu.open;
    });
    return kutu;
  }

  function lobiBolumu(d, sahipMi) {
    const turDugmeleri = TUR_SAYILARI.map((sayi) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.turSayisi === sayi ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { turSayisi: sayi } }),
        },
        String(sayi)
      )
    );
    const sureDugmeleri = SURELER.map((sn) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.sure === sn ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { sure: sn } }),
        },
        sn + ' sn'
      )
    );
    const yeterli = d.oyuncular.length >= 2;
    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Her turda herkes bir kez çizer.'),
        el('div', { class: 'etiket' }, 'Tur sayısı'),
        el('div', { class: 'secenekler' }, turDugmeleri),
        el('div', { class: 'etiket' }, 'Çizim süresi'),
        el('div', { class: 'secenekler' }, sureDugmeleri),
        el(
          'p',
          { class: 'soluk-yazi' },
          'Bu ayarla ' + d.ayar.turSayisi * Math.max(2, d.oyuncular.length) + ' çizim yapılır.'
        ),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
      ),
      nasilOynanirKutusu(),
      yeterli ? null : el('p', { class: 'slogan' }, 'Bu oyun 2 ile 4 kişiyle oynanır.'),
      sahipMi
        ? el(
            'button',
            { class: 'dugme birincil genis', disabled: !yeterli, onclick: () => k.hamle({ tip: 'baslat' }) },
            yeterli ? 'Oyunu başlat' : 'Oyunu başlat (en az 2 kişi)'
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca oyun açılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Kelime seçimi
  // -------------------------------------------------------------------------

  function secimEkrani(d, ben) {
    const cizen = d.oyuncular[d.cizen];
    let govde;
    if (ben === d.cizen) {
      govde = el(
        'div',
        { class: 'kutu cb-secim' },
        el('h2', null, 'Sıra sende! Bir kelime seç'),
        el('p', { class: 'soluk-yazi' }, 'Seçince çizim başlar. Süre biterse ilk kelime seçilir.'),
        el(
          'div',
          { class: 'cb-secenekler' },
          d.secenekler.map((kelime, i) =>
            el(
              'button',
              {
                class: 'dugme birincil genis',
                onclick: () => k.hamle({ tip: 'sec', cizim: d.cizim, secim: i }),
              },
              buyukHarf(kelime)
            )
          )
        )
      );
    } else {
      govde = el(
        'div',
        { class: 'kutu cb-bekle' },
        el('div', { class: 'buyuk-emoji' }, '🎨'),
        el('p', null, cizen.ad + ' kelime seçiyor…'),
        el('p', { class: 'soluk-yazi' }, 'Seçince çizim hemen ekranına gelir.')
      );
    }
    return el('div', { class: 'cb-sayfa' }, ustBilgi(d, true), oyuncuSeridi(d, ben), govde);
  }

  // -------------------------------------------------------------------------
  // Çizim ekranı
  // -------------------------------------------------------------------------

  function cizimEkrani(d, ben) {
    const benCizenim = ben === d.cizen;
    const cizen = d.oyuncular[d.cizen];
    let kelimeAlani;
    if (benCizenim) {
      kelimeAlani = el(
        'div',
        { class: 'cb-kelime' },
        el('span', { class: 'soluk-yazi' }, 'Çiz: '),
        el('b', null, buyukHarf(d.kelime))
      );
    } else {
      kelimeAlani = el(
        'div',
        { class: 'cb-kelime' },
        el('span', { class: 'soluk-yazi' }, cizen.ad + ' çiziyor'),
        kalipCiz(d.kelime)
      );
    }

    let alt;
    if (benCizenim) {
      const bekleyen = tahminciler(d).filter((i) => !bildiMi(d, i)).length;
      alt = [
        aracCubugu(),
        el(
          'p',
          { class: 'cb-mesaj ' + durumum.mesajSinif },
          durumum.mesaj || (bekleyen === 0 ? 'Herkes bildi!' : 'Konuşmak yok, yalnız çizim!')
        ),
      ];
    } else if (bildiMi(d, ben)) {
      const b = d.bilenler.find((x) => x.o === ben);
      alt = el(
        'div',
        { class: 'cb-bildin' },
        el('div', { class: 'baslik iyi' }, 'Bildin! +' + b.puan),
        el('p', { class: 'soluk-yazi' }, 'Diğerleri bekleniyor…')
      );
    } else {
      alt = [
        el(
          'form',
          { class: 'cb-tahmin', onsubmit: tahminGonder },
          girdi,
          el('button', { class: 'dugme birincil', type: 'submit' }, 'Tahmin et')
        ),
        el('p', { class: 'cb-mesaj ' + durumum.mesajSinif, role: 'status' }, durumum.mesaj),
      ];
    }

    return el(
      'div',
      { class: 'cb-sayfa' + (benCizenim ? ' ciziyor' : '') },
      ustBilgi(d, true),
      oyuncuSeridi(d, ben),
      kelimeAlani,
      tuvalKutusu,
      el('div', { class: 'cb-alt' }, alt),
      akisCiz(d, ben)
    );
  }

  // -------------------------------------------------------------------------
  // Çizim bitti: kelime açıldı
  // -------------------------------------------------------------------------

  function acikEkrani(d, ben) {
    const g = d.gecmis[d.gecmis.length - 1];
    const son = d.cizim + 1 >= toplamCizim(d);
    const cizenAd = adGoster(d, g.cizen, ben);
    let baslik;
    if (g.bilenler.length === 0) {
      baslik = 'Kimse bilemedi';
    } else if (g.bilenler.length === tahminciler(d).length) {
      baslik = 'Herkes bildi!';
    } else {
      baslik = g.bilenler.length + ' kişi bildi';
    }
    const satirlar = g.bilenler.map((b, sira) =>
      el(
        'div',
        { class: 'puan-satiri' },
        el('span', { class: 'ad' }, sira + 1 + '. ' + adGoster(d, b.o, ben)),
        el('span', { class: 'artis' }, '+' + b.puan)
      )
    );
    satirlar.push(
      el(
        'div',
        { class: 'puan-satiri cizen' },
        el('span', { class: 'ad' }, '✏️ ' + cizenAd),
        el('span', { class: 'artis' }, '+' + g.cizenPuan)
      )
    );
    return el(
      'div',
      { class: 'cb-sayfa sonuc' },
      ustBilgi(d, false),
      el(
        'div',
        { class: 'cb-cevap' },
        el('div', { class: 'etiket' }, 'Kelime'),
        el('div', { class: 'cb-cevap-yazi' }, buyukHarf(g.kelime)),
        el('p', { class: 'soluk-yazi' }, baslik)
      ),
      tuvalKutusu,
      el('div', { class: 'puan-tablosu' }, satirlar),
      oyuncuSeridi(d, ben),
      el(
        'div',
        { class: 'cb-alt-dugmeler' },
        el(
          'button',
          { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'sonraki', cizim: d.cizim }) },
          son ? 'Sonuçları gör' : 'Sonraki çizim'
        )
      )
    );
  }

  // -------------------------------------------------------------------------
  // Oyun sonu
  // -------------------------------------------------------------------------

  function bitisEkrani(d, ben) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    const kazananlar = oyunKazananlari(d);
    const berabere = kazananlar.length > 1;
    let baslik;
    if (berabere) {
      baslik = 'Berabere';
    } else if (kazananlar[0] === ben) {
      baslik = 'Oyunu sen kazandın!';
    } else {
      baslik = d.oyuncular[kazananlar[0]].ad + ' kazandı!';
    }

    const sirali = d.oyuncular.map((o, i) => ({ o: o, i: i })).sort((a, b) => b.o.puan - a.o.puan);
    const tablo = el(
      'div',
      { class: 'puan-tablosu' },
      sirali.map((s) =>
        el(
          'div',
          { class: kazananlar.includes(s.i) ? 'puan-satiri kazanan' : 'puan-satiri' },
          el('span', { class: 'ad' }, adGoster(d, s.i, ben)),
          el('span', { class: 'toplam' }, String(s.o.puan))
        )
      )
    );

    const ozet = d.gecmis.map((g, t) =>
      el(
        'li',
        { class: 'cb-ozet' },
        el('div', { class: 'kelime' }, t + 1 + '. ' + buyukHarf(g.kelime)),
        el(
          'div',
          { class: 'soluk-yazi' },
          '✏️ ' +
            d.oyuncular[g.cizen].ad +
            ' · ' +
            (g.bilenler.length === 0
              ? 'kimse bilemedi'
              : 'bilen: ' + g.bilenler.map((b) => d.oyuncular[b.o].ad).join(', '))
        )
      )
    );

    return el(
      'div',
      { class: 'cb-sayfa sonuc' },
      el(
        'div',
        { class: 'tanis-uyum' },
        el('div', { class: 'buyuk-emoji' }, berabere ? '🤝' : '🏆'),
        el('div', { class: 'uyum-yazi' }, baslik),
        berabere ? el('p', { class: 'soluk-yazi' }, kazananlar.map((i) => d.oyuncular[i].ad).join(', ')) : null
      ),
      tablo,
      el('div', { class: 'kutu' }, el('h2', null, 'Çizilenler'), el('ul', { class: 'cb-ozet-listesi' }, ozet)),
      sahipMi
        ? el(
            'div',
            { class: 'cb-alt-dugmeler' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // -------------------------------------------------------------------------
  // Giriş noktaları
  // -------------------------------------------------------------------------

  function imzaKur(d, ben) {
    return [istemci.kod, d.asama, d.cizim, d.baslangic, bildiMi(d, ben) ? 1 : 0].join('|');
  }

  // Çizim sürerken gelen güncelleme sayfayı yeniden kurmasın (tuval, parmak ve yazı kutusu bozulmasın):
  // aynı çizimdeysek yalnız oyuncu şeridi, akış ve çizenin mesajı tazelenir. Yaptıysa true döner.
  function yerindeGuncelle(d, ben) {
    if (!d || d.oyun !== 'cizbil' || d.asama !== 'cizim' || ben < 0) {
      return false;
    }
    if (!durumum.kok || !durumum.kok.isConnected || durumum.imza !== imzaKur(d, ben)) {
      return false;
    }
    kanalKontrol();
    const serit = durumum.kok.querySelector('.cb-oyuncular');
    if (serit) {
      serit.replaceWith(oyuncuSeridi(d, ben));
    }
    const akis = durumum.kok.querySelector('.cb-akis');
    if (akis) {
      akis.replaceWith(akisCiz(d, ben));
    }
    if (ben === d.cizen && !durumum.mesaj) {
      const bekleyen = tahminciler(d).filter((i) => !bildiMi(d, i)).length;
      const mesaj = durumum.kok.querySelector('.cb-mesaj');
      if (mesaj && bekleyen === 0) {
        mesaj.textContent = 'Herkes bildi!';
      }
    }
    return true;
  }

  // Tüm sayfa (üst çubuk dahil): secim, cizim, acik ve bitti aşamaları
  function sayfa(d, ben) {
    kanalKontrol();
    if (tahtaliAsama(d)) {
      tahtayiHazirla(d);
    }
    const imza = imzaKur(d, ben);
    if (imza !== durumum.imza) {
      durumum.mesaj = '';
      durumum.mesajSinif = '';
      if (d.asama !== 'cizim') {
        girdi.value = '';
      }
    }
    let govde;
    if (d.asama === 'bitti') {
      govde = bitisEkrani(d, ben);
    } else if (d.asama === 'acik') {
      govde = acikEkrani(d, ben);
    } else if (d.asama === 'cizim') {
      govde = cizimEkrani(d, ben);
    } else {
      govde = secimEkrani(d, ben);
    }
    durumum.imza = imza;
    durumum.kok = govde;
    // Tuval sayfaya yerleşince boyutunu al
    requestAnimationFrame(() => boyutAyarla());
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da odadan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    kanalKapat();
    clearTimeout(durumum.aktarimZamanlayici);
    durumum.aktarimZamanlayici = null;
    clearTimeout(durumum.istekZamanlayici);
    durumum.tahta = yeniTahta('');
    durumum.tahtaKod = '';
    durumum.ciziyor = null;
    durumum.gonderilen = {};
    durumum.imza = '';
    durumum.kok = null;
    durumum.mesaj = '';
    durumum.mesajSinif = '';
    durumum.sureGonderiliyor = false;
    durumum.nasilAcik = true;
    girdi.value = '';
    tumunuCiz();
  }

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
    yerindeGuncelle: yerindeGuncelle,
  };
}

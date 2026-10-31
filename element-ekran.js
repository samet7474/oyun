// element-ekran.js - "Element Düellosu" ekranları.
// Oyun kuralları element.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Gizlilik: ekran rakibin elini ve kilitli seçimini yalnız element.js içindeki gorunum() çıktısından okur.
// Rakip kartları açılıştan önce hiçbir yerde çizilmez; rakip için yalnız "seçti" bilgisi vardır.

import {
  HEDEFLER,
  OYUNCU_SAYISI,
  OZEL_ADLARI,
  gorunum,
  kartBilgi,
  oyunKazananlari,
  rakipIndeks,
  secimHatasi,
} from './element.js';

// "Nasıl oynanır" metni (lobide ve oyun ekranlarında aynı)
const NASIL_OYNANIR = [
  'İkinizin de kendi 18 kartlık destesi var. Başta 5 kart çekersiniz.',
  'Her turda ikiniz de aynı anda gizlice kart seçersiniz. "Oyna"ya basınca seçimin kilitlenir. Rakip yalnız seçtiğini görür.',
  'İkiniz de seçince kartlar açılır.',
  'Su ateşi söndürür, ateş toprağı yakar, toprak suyu emer. Yenen element turu kazanır.',
  'Aynı elementte büyük sayı kazanır. Sayılar da aynıysa berabere kalırsınız.',
  'Kazanan, kendi kartının sayısıyla rakip kartın sayısını toplar ve o kadar puan alır.',
  'Ters Rüzgâr: o tur kimin kimi yeneceği tersine döner. Bir element kartıyla birlikte oynanır. İkiniz de oynarsanız etkisi kalmaz.',
  'Kalkan: tek başına oynanır. O tur kimse puan almaz.',
  'İkiye Katla: bir element kartıyla birlikte oynanır. O kart kazanırsa puan iki katı olur.',
  'Bir turda en fazla bir özel kart oynanır. Tur bitince elin yine 5 karta tamamlanır.',
  'Hedef puana önce ulaşan kazanır. Kartlar biterse çok puanı olan kazanır.',
  'Oynananlar şeridinde çıkan kartları görürsün. Hangi kartların kaldığını bu şekilde takip edebilirsin.',
];

// Yenme cümleleri (normal düzen)
const YENME_CUMLESI = {
  su: 'Su ateşi söndürür.',
  ates: 'Ateş toprağı yakar.',
  toprak: 'Toprak suyu emer.',
};

// Tersine dönünce kullanılan cümleler (kazanan element, yenilen element)
const BELIRTME_HALI = {
  ates: 'ateşi',
  su: 'suyu',
  toprak: 'toprağı',
};

const KUCUK_AD = {
  ates: 'Ateş',
  su: 'Su',
  toprak: 'Toprak',
};

// Kart ve döngü şeması simgeleri: 24x24 alanda iç çizimler (resim dosyası yok)
const SIMGELER = {
  ates:
    '<path d="M12 2.2c.3 4.2 5.4 6.2 5.4 11.6a5.4 5.4 0 0 1-10.8 0c0-2.6 1.3-4.2 2.7-5.4.3 1.9 1.1 2.9 2.2 3 .2-3.2-.8-6.2.5-9.2z" fill="currentColor"/><path d="M12 21.6a2.6 2.6 0 0 1-2.6-2.6c0-1.6 1.4-2.4 2.6-4 1.2 1.6 2.6 2.4 2.6 4a2.6 2.6 0 0 1-2.6 2.6z" fill="#ffe08a"/>',
  su:
    '<path d="M12 2.4c0 0-6.6 7.4-6.6 12.2a6.6 6.6 0 0 0 13.2 0C18.6 9.8 12 2.4 12 2.4z" fill="currentColor"/><path d="M8.6 14.6a3.6 3.6 0 0 0 3 3.5" fill="none" stroke="#d8f6ff" stroke-width="1.6" stroke-linecap="round"/>',
  toprak:
    '<path d="M1.8 20.5 9 6.8l4 7.2 2.4-3.6 6.8 10.1z" fill="currentColor"/><path d="M9 6.8l1.8 3.2-1.8-.9-1.9.9z" fill="#f4ffe8"/><path d="M15.2 4.6c1.6.1 2.9 1.2 3.2 2.8-1.6.1-3-1-3.2-2.8z" fill="#bff2a2"/>',
  ters:
    '<path d="M18.6 8.2A7.6 7.6 0 0 0 5.2 9.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M5.4 15.8a7.6 7.6 0 0 0 13.4-1.4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 3.8v5.6h-5.6z" fill="currentColor"/><path d="M4 20.2v-5.6h5.6z" fill="currentColor"/>',
  kalkan:
    '<path d="M12 2.2 20 5.2v6c0 5-3.4 8.8-8 10.6-4.6-1.8-8-5.6-8-10.6v-6z" fill="currentColor"/><path d="M12 5.2v14.2c2.9-1.4 5.2-4.2 5.2-8V7z" fill="rgba(0,0,0,0.22)"/>',
  ikiye:
    '<path d="M5 6l6 6-6 6M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};

function simgeSvg(ad) {
  return '<svg viewBox="0 0 24 24" aria-hidden="true">' + SIMGELER[ad] + '</svg>';
}

export function elementEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    anahtar: '', // hangi oda, tur ve aşamadaki taslak olduğu
    taslak: [], // elimden seçtiğim ama henüz kilitlemediğim kartlar
    gonderiliyor: false,
    gorulen: new Set(), // açılış animasyonunu oynamış turlar
    ilkCizim: true, // sayfa ilk açıldığında açık kartlar animasyonsuz gelir
    nasilAcik: false,
  };

  // -------------------------------------------------------------------------
  // Küçük yardımcılar
  // -------------------------------------------------------------------------

  function adGoster(d, i, ben) {
    return i === ben ? 'Sen' : d.oyuncular[i].ad;
  }

  // Oda, tur ya da aşama değiştiyse taslağı temizle
  function turuHazirla(d) {
    const anahtar = istemci.kod + ':' + d.tur + ':' + d.asama;
    if (durumum.anahtar !== anahtar) {
      durumum.anahtar = anahtar;
      durumum.taslak = [];
      durumum.gonderiliyor = false;
    }
  }

  // Bu turun açılışı ilk kez mi çiziliyor? İlk çizimde (sayfa açılışı) animasyon oynamaz.
  function acilisYeniMi(d) {
    const anahtar = istemci.kod + ':' + d.tur;
    if (durumum.gorulen.has(anahtar)) {
      return false;
    }
    durumum.gorulen.add(anahtar);
    return !durumum.ilkCizim;
  }

  function hamleGonder(eylem) {
    if (durumum.gonderiliyor) {
      return;
    }
    durumum.gonderiliyor = true;
    k.hamle(eylem).then((sonuc) => {
      durumum.gonderiliyor = false;
      if (sonuc && !sonuc.ok) {
        k.mesajGoster(sonuc.hata === 'mesgul' ? 'Bir saniye, tekrar dene.' : sonuc.hata);
        return;
      }
      k.render();
    });
  }

  function nasilOynanirKutusu() {
    const kutu = el(
      'details',
      { class: 'ed-nasil', open: durumum.nasilAcik },
      el('summary', null, 'Nasıl oynanır?'),
      el('ul', null, NASIL_OYNANIR.map((satir) => el('li', null, satir)))
    );
    kutu.addEventListener('toggle', () => {
      durumum.nasilAcik = kutu.open;
    });
    return kutu;
  }

  // -------------------------------------------------------------------------
  // Kart çizimi (CSS ve inline SVG)
  //   secenek: { sinif, tikla, mini, etiket }
  // -------------------------------------------------------------------------

  function kartAdiKisa(bilgi) {
    if (bilgi.tip === 'element') {
      return KUCUK_AD[bilgi.element];
    }
    return OZEL_ADLARI[bilgi.tip];
  }

  function kartDugumu(kartId, secenek) {
    const ayar = secenek || {};
    const bilgi = kartBilgi(kartId);
    let sinif = 'ed-kart';
    if (ayar.mini) {
      sinif += ' mini';
    }
    if (ayar.sinif) {
      sinif += ' ' + ayar.sinif;
    }
    const ozellik = {
      class: sinif,
      'data-tip': bilgi.tip,
      'aria-label': ayar.etiket || kartAdiKisa(bilgi) + (bilgi.deger ? ' ' + bilgi.deger : ''),
    };
    if (bilgi.tip === 'element') {
      ozellik['data-element'] = bilgi.element;
    }
    if (ayar.stil) {
      ozellik.style = ayar.stil;
    }
    let etiket = 'div';
    if (ayar.tikla) {
      etiket = 'button';
      ozellik.onclick = ayar.tikla;
      ozellik.type = 'button';
    }
    return el(
      etiket,
      ozellik,
      el('span', { class: 'ed-deger' }, bilgi.tip === 'element' ? String(bilgi.deger) : bilgi.tip === 'ikiye' ? '×2' : ''),
      el('span', { class: 'ed-simge', html: simgeSvg(bilgi.tip === 'element' ? bilgi.element : bilgi.tip) }),
      el('span', { class: 'ed-kartad' }, kartAdiKisa(bilgi))
    );
  }

  // Kapalı kart (arkası)
  function sirtDugumu(ek) {
    return el(
      'div',
      { class: 'ed-kart sirt' + (ek ? ' ' + ek : ''), 'aria-label': 'Kapalı kart' },
      el('span', { class: 'ed-sirt-isaret', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 4l2.2 6.2L20 12l-5.8 1.8L12 20l-2.2-6.2L4 12l5.8-1.8z" fill="currentColor"/></svg>' })
    );
  }

  // -------------------------------------------------------------------------
  // Döngü şeması: hangi element hangisini yener
  // -------------------------------------------------------------------------

  function dongusemasi() {
    const konum = { ates: [120, 30], su: [34, 122], toprak: [206, 122] };
    const yaricap = 22;

    // a'dan b'ye ok (daire kenarlarına kadar)
    function ok(a, b, yazi, yaziKonumu) {
      const [ax, ay] = konum[a];
      const [bx, by] = konum[b];
      const dx = bx - ax;
      const dy = by - ay;
      const boy = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / boy;
      const uy = dy / boy;
      const x1 = ax + ux * (yaricap + 4);
      const y1 = ay + uy * (yaricap + 4);
      const x2 = bx - ux * (yaricap + 7);
      const y2 = by - uy * (yaricap + 7);
      return (
        '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) +
        '" class="ed-ok" marker-end="url(#ed-uc)"/>' +
        '<text x="' + yaziKonumu[0] + '" y="' + yaziKonumu[1] + '" text-anchor="middle" class="ed-ok-yazi">' + yazi + '</text>'
      );
    }

    function dugum(ad) {
      const [x, y] = konum[ad];
      return (
        '<circle cx="' + x + '" cy="' + y + '" r="' + yaricap + '" class="ed-dugum ' + ad + '"/>' +
        '<svg x="' + (x - 12) + '" y="' + (y - 12) + '" width="24" height="24" viewBox="0 0 24 24" class="ed-dugum-simge ' + ad + '">' + SIMGELER[ad] + '</svg>'
      );
    }

    const svg =
      '<svg viewBox="0 0 240 170" role="img" aria-label="Su ateşi söndürür, ateş toprağı yakar, toprak suyu emer.">' +
      '<defs><marker id="ed-uc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0l10 5-10 5z" class="ed-uc"/></marker></defs>' +
      ok('su', 'ates', 'söndürür', [50, 68]) +
      ok('ates', 'toprak', 'yakar', [192, 68]) +
      ok('toprak', 'su', 'emer', [120, 116]) +
      dugum('ates') +
      dugum('su') +
      dugum('toprak') +
      '<text x="152" y="35" class="ed-dugum-ad">Ateş</text>' +
      '<text x="34" y="164" text-anchor="middle" class="ed-dugum-ad">Su</text>' +
      '<text x="206" y="164" text-anchor="middle" class="ed-dugum-ad">Toprak</text>' +
      '</svg>';

    return el(
      'div',
      { class: 'ed-dongu' },
      el('div', { class: 'ed-baslik-kucuk' }, 'Kim kimi yener?'),
      el('div', { class: 'ed-dongu-sema', html: svg })
    );
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function lobiBolumu(d, sahipMi) {
    const hedefDugmeleri = HEDEFLER.map((sayi) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.hedef === sayi ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { hedef: sayi } }),
        },
        String(sayi)
      )
    );

    const yeterli = d.oyuncular.length === OYUNCU_SAYISI;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'İkiniz de aynı anda gizlice kart seçersiniz. Kartlar açılınca kazanan puan alır.'),
        el('div', { class: 'etiket' }, 'Hedef puan'),
        el('div', { class: 'secenekler' }, hedefDugmeleri),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
      ),
      dongusemasi(),
      nasilOynanirKutusu(),
      yeterli ? null : el('p', { class: 'slogan' }, 'Bu oyun tam 2 kişiyle oynanır.'),
      sahipMi
        ? el(
            'button',
            {
              class: 'dugme birincil genis',
              disabled: !yeterli,
              onclick: () => k.hamle({ tip: 'baslat' }),
            },
            yeterli ? 'Oyunu başlat' : 'Oyunu başlat (2 kişi gerekli)'
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca oyun açılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Tur sonucu metni
  // -------------------------------------------------------------------------

  function kazananAdi(d, i, ben) {
    return i === ben ? 'Sen' : d.oyuncular[i].ad;
  }

  // Kazanan ve yenilen elementler (kartlardan okunur)
  function elementler(g, i) {
    const kart = g.kartlar[i].map(kartBilgi).find((b) => b && b.tip === 'element');
    return kart ? kart.element : null;
  }

  function sonucMetni(d, g, ben) {
    if (g.neden === 'kalkan') {
      return 'Kalkan! Bu tur kimse puan almadı.';
    }
    if (g.neden === 'rakipYok') {
      const bosOlan = g.kartlar[0].length === 0 ? 0 : 1;
      if (bosOlan === ben) {
        return 'Oynayacak kartın yoktu. Bu tur puan yok.';
      }
      return d.oyuncular[bosOlan].ad + ' oynayacak kart bulamadı. Bu tur puan yok.';
    }
    if (g.kazanan < 0) {
      return 'Berabere! Aynı element, aynı sayı. Puan yok.';
    }
    const ad = kazananAdi(d, g.kazanan, ben);
    const fiil = g.kazanan === ben ? ' kazandın' : ' kazandı';
    let neden;
    if (g.neden === 'deger') {
      neden = 'Aynı element, büyük sayı kazanır.';
    } else {
      const kazananEl = elementler(g, g.kazanan);
      const yenilenEl = elementler(g, rakipIndeks(g.kazanan));
      if (g.tersEtkili) {
        const buyuk = KUCUK_AD[kazananEl];
        neden = 'Ters Rüzgâr! ' + buyuk + ' ' + BELIRTME_HALI[yenilenEl] + ' yendi.';
      } else {
        neden = YENME_CUMLESI[kazananEl];
      }
    }
    let puanYazisi = '+' + g.puan + ' puan';
    if (g.ikiyeEtkili) {
      puanYazisi += ' (İkiye Katla!)';
    }
    return ad + fiil + '. ' + neden + ' ' + puanYazisi + '.';
  }

  // -------------------------------------------------------------------------
  // Geçmiş şeridi: açılmış kartlar (kart sayma için)
  // -------------------------------------------------------------------------

  function gecmisSeridi(d, ben, acikTurGizli) {
    let liste = d.gecmis.slice();
    if (acikTurGizli) {
      liste = liste.slice(0, -1); // açılış animasyonu bitmeden son turu burada gösterme
    }
    liste.reverse(); // yeniler solda
    const rakip = rakipIndeks(ben);

    const turlar = liste.map((g) => {
      let etiket = 'Berabere';
      let sinif = 'ed-gecmis-tur';
      if (g.kazanan >= 0) {
        etiket = (g.kazanan === ben ? 'Sen' : 'Rakip') + ' +' + g.puan;
        sinif += g.kazanan === ben ? ' benim' : ' rakibin';
      } else if (g.neden === 'kalkan') {
        etiket = 'Kalkan';
      }
      const kartSatiri = (i) =>
        el(
          'div',
          { class: 'ed-gecmis-kartlar' },
          g.kartlar[i].length > 0
            ? g.kartlar[i].map((kartId) => kartDugumu(kartId, { mini: true }))
            : el('span', { class: 'ed-gecmis-yok' }, '-')
        );
      return el(
        'div',
        { class: sinif },
        el('div', { class: 'ed-gecmis-no' }, 'Tur ' + (g.tur + 1)),
        kartSatiri(rakip),
        kartSatiri(ben),
        el('div', { class: 'ed-gecmis-sonuc' }, etiket)
      );
    });

    return el(
      'div',
      { class: 'kutu ed-gecmis' },
      el('h2', null, 'Oynananlar'),
      turlar.length > 0
        ? el('div', { class: 'ed-gecmis-serit' }, turlar)
        : el('p', { class: 'soluk-yazi' }, 'Henüz açılmış kart yok. Açılan kartlar burada birikir. Üstte rakibin, altta senin kartların görünür.')
    );
  }

  // -------------------------------------------------------------------------
  // Masa: seçim ve açılış
  // -------------------------------------------------------------------------

  function skorSeridi(d, ben) {
    const rakip = rakipIndeks(ben);
    return el(
      'div',
      { class: 'ed-ust' },
      el('span', { class: 'ed-tur' }, 'Tur ' + (d.tur + 1)),
      el('span', { class: 'ed-hedef' }, 'Hedef ' + d.ayar.hedef + ' puan'),
      el(
        'span',
        { class: 'ed-skor' },
        el('span', { class: 'ed-skor-ben' }, d.oyuncular[ben].puan + ' Sen'),
        el('span', { class: 'ed-skor-ayrac' }, ':'),
        el('span', { class: 'ed-skor-rakip' }, d.oyuncular[rakip].ad + ' ' + d.oyuncular[rakip].puan)
      )
    );
  }

  function rakipKarti(d, ben, gor) {
    const rakip = rakipIndeks(ben);
    let durum;
    if (d.asama === 'acik') {
      durum = 'Kartlar açıldı';
    } else if (gor.rakip.kilitli) {
      durum = 'Seçti ✓';
    } else {
      durum = 'Düşünüyor…';
    }
    return el(
      'div',
      { class: 'ed-rakip' + (gor.rakip.kilitli && d.asama === 'secim' ? ' secti' : '') },
      el('span', { class: 'ad' }, d.oyuncular[rakip].ad),
      el('span', { class: 'ed-rakip-bilgi' }, gor.rakip.elSayisi + ' kart elinde · ' + gor.rakip.desteSayisi + ' kart destede'),
      el('span', { class: 'ed-rakip-durum' }, durum)
    );
  }

  // Bir oyuncunun masadaki yuvası. kartlar null ise kapalı kart ya da boş yuva çizilir.
  function yuva(secenek) {
    const icerik = [];
    if (secenek.kartlar && secenek.kartlar.length > 0) {
      secenek.kartlar.forEach((kartId, n) => {
        icerik.push(
          kartDugumu(kartId, {
            sinif: 'masada' + (secenek.animasyon ? ' acil' : ''),
            stil: '--gecikme:' + (secenek.gecikme + n * 0.18).toFixed(2) + 's',
          })
        );
      });
    } else if (secenek.sirt) {
      icerik.push(sirtDugumu('masada'));
    } else if (secenek.kartlar) {
      icerik.push(el('div', { class: 'ed-yuva-bos' }, 'Oynayacak kartı yok'));
    } else {
      icerik.push(el('div', { class: 'ed-yuva-bos' }, secenek.bos));
    }
    return el('div', { class: 'ed-yuva ' + (secenek.sinif || '') }, icerik);
  }

  function masa(d, ben, gor) {
    const rakip = rakipIndeks(ben);
    const acik = d.asama === 'acik';
    const g = acik ? d.gecmis[d.gecmis.length - 1] : null;
    const animasyon = acik ? acilisYeniMi(d) : false;

    let rakipYuva;
    let benYuva;
    if (acik) {
      rakipYuva = yuva({
        kartlar: gor.rakip.secim,
        animasyon: animasyon,
        gecikme: 0.1,
        sinif: g.kazanan === rakip ? 'kazandi' : g.kazanan === ben ? 'kaybetti' : '',
      });
      benYuva = yuva({
        kartlar: gor.benim.secim,
        animasyon: animasyon,
        gecikme: 0.4,
        sinif: g.kazanan === ben ? 'kazandi' : g.kazanan === rakip ? 'kaybetti' : '',
      });
    } else {
      rakipYuva = yuva({ sirt: gor.rakip.kilitli, kartlar: null, bos: 'Rakip düşünüyor…', sinif: gor.rakip.kilitli ? 'dolu' : '' });
      if (gor.benim.kilitli) {
        benYuva = yuva({ kartlar: gor.benim.secim, animasyon: false, gecikme: 0, sinif: 'dolu' });
      } else {
        benYuva = yuva({ kartlar: null, bos: 'Alttan kart seç', sinif: '' });
      }
    }

    let orta;
    if (acik) {
      orta = el(
        'div',
        { class: 'ed-orta sonuc' + (animasyon ? ' belir' : '') + (g.kazanan === ben ? ' iyi' : g.kazanan === rakip ? ' kotu' : ''), role: 'status', 'aria-live': 'polite' },
        sonucMetni(d, g, ben)
      );
    } else if (gor.benim.kilitli) {
      orta = el(
        'div',
        { class: 'ed-orta bekle', role: 'status', 'aria-live': 'polite' },
        el('span', { class: 'nokta-nabiz' }),
        el('span', null, d.oyuncular[rakip].ad + ' seçince kartlar açılır…')
      );
    } else {
      orta = el('div', { class: 'ed-orta' }, gor.rakip.kilitli ? d.oyuncular[rakip].ad + ' seçti. Sıra sende.' : 'Aynı anda seçiyorsunuz.');
    }

    return el('div', { class: 'ed-masa' }, rakipYuva, orta, benYuva);
  }

  // Elimden bir karta dokunma: seçimi kurar
  function kartaDokun(kartId) {
    const d = istemci.durum;
    const ben = k.benimIndeks();
    if (!d || d.asama !== 'secim' || ben < 0 || d.secimler[ben]) {
      return;
    }
    const bilgi = kartBilgi(kartId);
    let taslak = durumum.taslak.slice();
    const tipi = (id) => kartBilgi(id).tip;

    if (taslak.includes(kartId)) {
      taslak = taslak.filter((id) => id !== kartId);
    } else if (bilgi.tip === 'kalkan') {
      taslak = [kartId]; // Kalkan tek başına oynanır
    } else if (bilgi.tip === 'element') {
      taslak = taslak.filter((id) => tipi(id) !== 'element' && tipi(id) !== 'kalkan'); // başka element yerine geçer
      taslak.push(kartId);
    } else {
      taslak = taslak.filter((id) => tipi(id) === 'element'); // tek özel kart, Kalkan çıkar
      taslak.push(kartId);
    }
    durumum.taslak = taslak;
    k.render();
  }

  // Seçimin altındaki yönlendirme yazısı. { yazi, uyari, gecerli }
  function secimYardimi(el_, taslak) {
    if (taslak.length === 0) {
      return { yazi: 'Bir element kartı seç. İstersen yanına bir özel kart ekle.', uyari: false, gecerli: false };
    }
    const sorun = secimHatasi(el_, taslak);
    if (sorun) {
      return { yazi: sorun, uyari: true, gecerli: false };
    }
    const bilgiler = taslak.map(kartBilgi);
    const element = bilgiler.find((b) => b.tip === 'element');
    const ozel = bilgiler.find((b) => b.tip !== 'element');
    if (!element) {
      return { yazi: 'Kalkan: bu tur kimse puan almaz.', uyari: false, gecerli: true };
    }
    const ad = KUCUK_AD[element.element] + ' ' + element.deger;
    if (!ozel) {
      return { yazi: ad + ' oynayacaksın.', uyari: false, gecerli: true };
    }
    if (ozel.tip === 'ters') {
      return { yazi: ad + ' ile Ters Rüzgâr: kim kimi yener tersine döner.', uyari: false, gecerli: true };
    }
    return { yazi: ad + ' ile İkiye Katla: kazanırsa puan iki katı.', uyari: false, gecerli: true };
  }

  function elSeridi(d, ben, gor) {
    // Kilitlediğim kartlar masaya geçti, elde göstermem
    const kilitli = gor.benim.secim || [];
    const kartlar = gor.benim.el.filter((id) => !kilitli.includes(id));
    const oynanabilir = d.asama === 'secim' && !gor.benim.kilitli;

    // Eldeki taslak artık elimde olmayan kart içermesin
    durumum.taslak = durumum.taslak.filter((id) => gor.benim.el.includes(id));

    const dugumler = kartlar.map((kartId) =>
      kartDugumu(kartId, {
        sinif: 'elde' + (durumum.taslak.includes(kartId) ? ' secili' : '') + (oynanabilir ? '' : ' pasif'),
        tikla: oynanabilir ? () => kartaDokun(kartId) : null,
      })
    );
    if (dugumler.length === 0) {
      dugumler.push(el('p', { class: 'soluk-yazi' }, 'Elinde kart kalmadı.'));
    }
    return el('div', { class: 'ed-el', 'aria-label': 'Elin' }, dugumler);
  }

  function altAlan(d, ben, gor) {
    if (d.asama === 'acik') {
      const sonucuGor = Boolean(d.bitisNedeni);
      return el(
        'div',
        { class: 'ed-alt' + (durumum.ilkCizim ? '' : ' belir-gec') },
        el(
          'button',
          { class: 'dugme birincil genis', onclick: () => hamleGonder({ tip: 'sonraki', tur: d.tur }) },
          sonucuGor ? 'Sonucu gör' : 'Sonraki tur'
        )
      );
    }
    if (gor.benim.kilitli) {
      return el('div', { class: 'ed-alt' }, el('p', { class: 'ed-yardim' }, 'Seçimin kilitlendi. Değiştirilemez.'));
    }
    const yardim = secimYardimi(gor.benim.el, durumum.taslak);
    return el(
      'div',
      { class: 'ed-alt' },
      el('p', { class: yardim.uyari ? 'ed-yardim uyari' : 'ed-yardim', role: 'status', 'aria-live': 'polite' }, yardim.yazi),
      el(
        'div',
        { class: 'satir' },
        el(
          'button',
          {
            class: 'dugme birincil genis',
            disabled: !yardim.gecerli,
            onclick: () => hamleGonder({ tip: 'sec', tur: d.tur, kartlar: durumum.taslak.slice() }),
          },
          'Oyna'
        ),
        durumum.taslak.length > 0
          ? el(
              'button',
              {
                class: 'dugme ikincil',
                onclick: () => {
                  durumum.taslak = [];
                  k.render();
                },
              },
              'Temizle'
            )
          : null
      )
    );
  }

  function masaEkrani(d, ben) {
    const gor = gorunum(d, ben);
    const acik = d.asama === 'acik';
    return el(
      'div',
      { class: 'ed-sayfa' },
      skorSeridi(d, ben),
      rakipKarti(d, ben, gor),
      masa(d, ben, gor),
      altAlan(d, ben, gor),
      elSeridi(d, ben, gor),
      el('div', { class: 'ed-deste-bilgi' }, 'Destende ' + gor.benim.desteSayisi + ' kartın kaldı.'),
      gecmisSeridi(d, ben, acik),
      dongusemasi(),
      nasilOynanirKutusu()
    );
  }

  // -------------------------------------------------------------------------
  // Oyun sonu
  // -------------------------------------------------------------------------

  function puanTablosu(d, ben, vurgulu) {
    const sirali = d.oyuncular.map((o, i) => ({ o: o, i: i })).sort((a, b) => b.o.puan - a.o.puan);
    return el(
      'div',
      { class: 'puan-tablosu' },
      sirali.map((s) =>
        el(
          'div',
          { class: vurgulu.includes(s.i) ? 'puan-satiri kazanan' : 'puan-satiri' },
          el('span', { class: 'ad' }, s.i === ben ? s.o.ad + ' (sen)' : s.o.ad),
          el('span', { class: 'toplam' }, String(s.o.puan))
        )
      )
    );
  }

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
    const neden =
      d.bitisNedeni === 'hedef'
        ? 'Biri ' + d.ayar.hedef + ' puana ulaştı.'
        : 'Oynanacak kart kalmadı. Çok puanı olan kazanır.';

    return el(
      'div',
      { class: 'ed-sayfa sonuc' },
      el(
        'div',
        { class: 'tanis-uyum' },
        el('div', { class: 'buyuk-emoji' }, berabere ? '🤝' : '🏆'),
        el('div', { class: 'uyum-yazi' }, baslik),
        el('p', { class: 'soluk-yazi' }, neden)
      ),
      puanTablosu(d, ben, kazananlar),
      gecmisSeridi(d, ben, false),
      sahipMi
        ? el(
            'div',
            { class: 'ed-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // -------------------------------------------------------------------------
  // Tüm sayfa (üst çubuk dahil): secim, acik ve bitti aşamaları
  // -------------------------------------------------------------------------

  function sayfa(d, ben) {
    if (ben < 0) {
      return [k.ustCubuk(), el('div', { class: 'ed-sayfa' }, el('p', { class: 'slogan' }, 'Bu odada oyuncu değilsin.'))];
    }
    turuHazirla(d);
    let govde;
    if (d.asama === 'bitti') {
      govde = bitisEkrani(d, ben);
    } else {
      govde = masaEkrani(d, ben);
    }
    durumum.ilkCizim = false;
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.anahtar = '';
    durumum.taslak = [];
    durumum.gonderiliyor = false;
    durumum.gorulen = new Set();
    durumum.ilkCizim = true;
  }

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
  };
}

// kule-ekran.js - "Risk Kulesi" ekranları.
// Oyun kuralları kule.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Bu oyunda gizli bilgi yoktur: zar, kule ve kasalar herkesin ekranında canlı görünür.

import {
  HEDEFLER,
  catlakEtkinMi,
  catlakVarMi,
  istatistikler,
  kuleToplami,
  sirayiGecebilirMi,
} from './kule.js';

const NASIL_OYNANIR = [
  'Sırası gelen oyuncu "Zar at"a basar. Çıkan sayı, kulesine bir kat olur.',
  'Zar 1 gelirse kule yıkılır. O turda biriken her şey gider ve sıra diğer oyuncuya geçer.',
  'Bir önceki katla aynı sayıyı atarsan (1 hariç) bu kat iki kat sayılır. Katın üstünde "x2" yazar.',
  '"Dur"a basarsan kulenin toplamı kasana eklenir ve sıra geçer. İlk zarı atmadan duramazsın.',
  'Çatlak taş: oyun boyunca bir kez bir rakibe atabilirsin. O oyuncunun bir sonraki turunda 1 gelirse de 2 gelirse de kulesi yıkılır.',
  'Kasası hedef puana ulaşan ilk oyuncu kazanır. Hedefe "Dur" diyerek ulaşılır.',
  'Sırası gelen oyuncu 60 saniye bir şey yapmazsa diğerleri "Sırayı geç"e basabilir.',
];

const NEDEN_YAZILARI = {
  hedef: 'Hedef puana ilk ulaşan oyunu aldı.',
  rakipsiz: 'Diğer oyuncular odadan çıktı.',
};

// Zar yüzlerindeki noktaların yerleri (100x100 alanda)
const NOKTA_YERLERI = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
};

// Animasyonun süresi (ms): zar yuvarlanır, kat düşer ya da kule dağılır
const ANIMASYON_MS = 1300;

// Kule blok renkleri (tuğla tonları, gün batımı)
const TUGLA_RENKLERI = ['#c4552d', '#d9703a', '#a8412a', '#e08a45', '#b34a2f'];

// Zar SVG'si (sabit metin, kullanıcı verisi içermez)
function zarSvg(deger, yikici) {
  const noktalar = (NOKTA_YERLERI[deger] || [])
    .map((n) => '<circle cx="' + n[0] + '" cy="' + n[1] + '" r="9" fill="' + (yikici ? '#fff' : '#2b1710') + '"/>')
    .join('');
  const dolgu = yikici ? '#c62f2f' : '#fff3e0';
  const kenar = yikici ? '#7a1414' : '#d9b68a';
  return (
    '<svg viewBox="0 0 100 100" width="100%" height="100%" role="img" aria-label="Zar: ' + deger + '">' +
    '<rect x="6" y="6" width="88" height="88" rx="18" fill="' + dolgu + '" stroke="' + kenar + '" stroke-width="4"/>' +
    noktalar +
    '</svg>'
  );
}

// Çatlak simgesi (zigzag çizgi)
const CATLAK_SIMGESI =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">' +
  '<path d="M13 2 L8 11 L13 12 L7 22 L17 10 L12 9 Z" fill="#ffb02e" stroke="#7a2a00" stroke-width="1.2" stroke-linejoin="round"/>' +
  '</svg>';

export function kuleEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    catlakAcik: false, // "Çatlak taş at" paneli açık mı
    nasilAcik: true,
    animAnahtar: undefined, // son görülen zarın anahtarı (oyun no + olay no)
    animBasla: 0, // animasyonun başladığı an (ms)
    animZamanlayici: null,
    gecGoruldu: false, // son çizimde "Sırayı geç" görünüyor muydu
  };

  // -------------------------------------------------------------------------
  // Küçük yardımcılar
  // -------------------------------------------------------------------------

  function hamleGonder(eylem) {
    return k.hamle(eylem).then((sonuc) => {
      if (sonuc && !sonuc.ok && sonuc.hata === 'mesgul') {
        k.bekleyenUyari();
      }
      return sonuc;
    });
  }

  function nasilOynanirKutusu(acik) {
    const kutu = el(
      'details',
      { class: 'kl-nasil', open: acik },
      el('summary', null, 'Nasıl oynanır?'),
      el('ul', null, NASIL_OYNANIR.map((satir) => el('li', null, satir)))
    );
    kutu.addEventListener('toggle', () => {
      durumum.nasilAcik = kutu.open;
    });
    return kutu;
  }

  // Yeni bir zar ya da yıkılma geldi mi? Geldiyse animasyon şimdi başlar.
  // Odaya yeni girenlere eski olay yeniden oynatılmaz.
  function animasyonHazirla(d) {
    const anahtar = d.oyunNo + ':' + (d.sonZar ? d.sonZar.no : 0);
    if (durumum.animAnahtar === undefined) {
      durumum.animAnahtar = anahtar;
      durumum.animBasla = 0;
    } else if (anahtar !== durumum.animAnahtar) {
      durumum.animAnahtar = anahtar;
      durumum.animBasla = Date.now();
    }
    const gecen = durumum.animBasla > 0 ? Date.now() - durumum.animBasla : ANIMASYON_MS;
    const suruyor = gecen < ANIMASYON_MS;
    if (suruyor && durumum.animZamanlayici === null) {
      // Animasyon bitince ekran bir kez daha çizilir (dağılan kule kaybolur)
      durumum.animZamanlayici = setTimeout(() => {
        durumum.animZamanlayici = null;
        k.render();
      }, ANIMASYON_MS - gecen + 50);
    }
    return { suruyor: suruyor, gecen: gecen };
  }

  // Animasyon yeniden çizilince baştan başlamasın: geçen süre kadar ileri sar
  function gecikmeStili(anim, ekstra = '') {
    return 'animation-delay:-' + anim.gecen + 'ms;' + ekstra;
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function lobiBolumu(d, sahipMi) {
    const hedefDugmeleri = HEDEFLER.map((hedef) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.hedef === hedef ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { hedef: hedef } }),
        },
        hedef + ' puan'
      )
    );

    const yeterli = d.oyuncular.length >= 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Sırayla zar atıp kule yükseltirsiniz. Ne kadar yükseltirsen o kadar kazanırsın, ama 1 gelirse her şey gider.'),
        el('div', { class: 'etiket' }, 'Önce kaç puana ulaşan kazansın?'),
        el('div', { class: 'secenekler' }, hedefDugmeleri),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarı sadece ev sahibi değiştirir.')
      ),
      nasilOynanirKutusu(true),
      yeterli ? null : el('p', { class: 'slogan' }, 'Bu oyun 2 ile 4 kişiyle oynanır.'),
      sahipMi
        ? el(
            'button',
            {
              class: 'dugme birincil genis',
              disabled: !yeterli,
              onclick: () => k.hamle({ tip: 'baslat' }),
            },
            yeterli ? 'Oyunu başlat' : 'Oyunu başlat (en az 2 kişi)'
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca ilk zar atılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Oyun ekranı
  // -------------------------------------------------------------------------

  // Oyuncu kasaları ve hedefe ilerleme çubukları
  function kasaTablosu(d, ben) {
    return el(
      'ul',
      { class: 'kl-kasalar', 'aria-label': 'Kasalar' },
      d.oyuncular.map((o, i) => {
        const yuzde = Math.min(100, Math.round((d.kasalar[i] / d.ayar.hedef) * 100));
        const sirada = i === d.sira && d.asama === 'oyun';
        const siniflar = 'kl-kasa' + (sirada ? ' sirada' : '') + (i === ben ? ' ben' : '');
        return el(
          'li',
          { class: siniflar },
          el(
            'div',
            { class: 'kl-kasa-ust' },
            el('span', { class: 'ad' }, i === ben ? o.ad + ' (sen)' : o.ad),
            catlakVarMi(d, i)
              ? el('span', { class: 'kl-catlak-simge', html: CATLAK_SIMGESI, title: 'Üstünde çatlak taş var', 'aria-label': 'Üstünde çatlak taş var' })
              : null,
            sirada ? el('span', { class: 'kl-sira-etiketi' }, 'Sırada') : null,
            el('span', { class: 'puan' }, d.kasalar[i] + ' / ' + d.ayar.hedef)
          ),
          el(
            'div',
            { class: 'kl-cubuk', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(d.ayar.hedef), 'aria-valuenow': String(d.kasalar[i]) },
            el('div', { class: 'kl-cubuk-dolu', style: 'width:' + yuzde + '%' })
          )
        );
      })
    );
  }

  // Tek bir kat bloğu
  function katBlogu(kat, sira, ekstraSinif, stil) {
    return el(
      'div',
      {
        class: 'kl-kat ' + ekstraSinif + (kat.x2 ? ' x2' : ''),
        style: '--tugla:' + TUGLA_RENKLERI[sira % TUGLA_RENKLERI.length] + ';' + (stil || ''),
      },
      el('span', { class: 'kl-kat-sayi' }, String(kat.sayi)),
      kat.x2 ? el('span', { class: 'kl-kat-x2' }, 'x2') : null
    );
  }

  // Dağılan kulenin parçaları: her blok kendi yönüne uçar (yönler katın sırasından türetilir, sabit)
  function dagilanKule(kat, anim) {
    const sayi = kat.length;
    const yukseklik = katYuksekligi(sayi);
    return el(
      'div',
      { class: 'kl-kule dagiliyor', style: '--kh:' + yukseklik + 'px' },
      kat.map((parca, i) => {
        const yon = i % 2 === 0 ? -1 : 1;
        const dx = yon * (30 + ((i * 37) % 70));
        const donus = yon * (25 + ((i * 53) % 80));
        const dy = 40 + ((i * 29) % 50);
        return katBlogu(
          parca,
          i,
          'dusuyor',
          '--dx:' + dx + 'px;--dy:' + dy + 'px;--don:' + donus + 'deg;' + gecikmeStili(anim, 'animation-duration:' + (900 + (i % 3) * 120) + 'ms;')
        );
      })
    );
  }

  // Kat sayısı arttıkça bloklar küçülür, kule sahneye sığar
  function katYuksekligi(sayi) {
    return Math.max(16, Math.min(38, Math.floor(250 / Math.max(1, sayi))));
  }

  function kuleCizimi(d, anim) {
    const yikildi = d.sonZar && d.sonZar.yikildi;
    // Kule yıkıldığı anda dağılan blokları göster; sonra boş zemin
    if (anim.suruyor && yikildi && d.sonZar.kat.length > 0) {
      return dagilanKule(d.sonZar.kat, anim);
    }
    const katlar = d.kule;
    const sayi = katlar.length;
    const yeniKat = anim.suruyor && d.sonZar && !d.sonZar.yikildi && sayi > 0;
    const siniflar = 'kl-kule' + (catlakEtkinMi(d, d.sira) ? ' catlakli' : '');
    return el(
      'div',
      { class: siniflar, style: '--kh:' + katYuksekligi(sayi) + 'px' },
      katlar.map((kat, i) => {
        const tepe = i === sayi - 1;
        if (tepe && yeniKat) {
          return katBlogu(kat, i, 'yeni', gecikmeStili(anim));
        }
        return katBlogu(kat, i, '', '');
      })
    );
  }

  function zarCizimi(d, anim) {
    if (!d.sonZar) {
      return el('div', { class: 'kl-zar bos', html: '<span>?</span>', 'aria-label': 'Henüz zar atılmadı' });
    }
    const siniflar = 'kl-zar' + (anim.suruyor ? ' yuvarlaniyor' : '') + (d.sonZar.yikildi ? ' yikici' : '');
    return el('div', {
      class: siniflar,
      style: anim.suruyor ? gecikmeStili(anim) : null,
      html: zarSvg(d.sonZar.deger, d.sonZar.yikildi),
    });
  }

  // Sahnenin altındaki tek satırlık durum yazısı
  function sahneYazisi(d, ben) {
    const sirada = d.oyuncular[d.sira];
    if (d.sira === ben) {
      return 'Sıra sende';
    }
    return sirada.ad + ' oynuyor';
  }

  function sahne(d, ben, anim) {
    return el(
      'div',
      { class: 'kl-sahne' + (d.sira === ben ? ' benim' : '') },
      el(
        'div',
        { class: 'kl-sahne-ust' },
        el('span', { class: 'kl-sira-yazi' }, sahneYazisi(d, ben)),
        el(
          'span',
          { class: 'kl-rekor', title: 'Oyundaki en yüksek kule' },
          d.rekor.kat > 0 ? 'Rekor: ' + d.rekor.kat + ' kat (' + d.rekor.ad + ')' : 'Rekor yok'
        )
      ),
      el(
        'div',
        { class: 'kl-meydan' },
        el('div', { class: 'kl-kule-alani' }, kuleCizimi(d, anim), el('div', { class: 'kl-zemin' })),
        zarCizimi(d, anim)
      ),
      el(
        'div',
        { class: 'kl-toplam' },
        el('span', null, 'Turdaki toplam'),
        el('span', { class: 'kl-toplam-sayi' }, String(d.turToplam))
      )
    );
  }

  // Çatlak taşı olan oyuncunun gördüğü uyarı (sırası gelince büyük, öncesinde küçük)
  function catlakUyarisi(d, ben) {
    if (!catlakEtkinMi(d, ben)) {
      return null;
    }
    if (d.sira === ben) {
      return el(
        'div',
        { class: 'kl-uyari buyuk', role: 'alert' },
        el('span', { class: 'kl-uyari-simge', html: CATLAK_SIMGESI }),
        el('div', null, el('b', null, 'ÇATLAK TAŞ!'), el('p', null, 'Bu turda 1 de 2 de kuleni yıkar. Dikkatli ol.'))
      );
    }
    return el(
      'div',
      { class: 'kl-uyari', role: 'status' },
      el('span', { class: 'kl-uyari-simge kucuk', html: CATLAK_SIMGESI }),
      el('div', null, 'Üstünde çatlak taş var. Sıran gelince 1 de 2 de kuleni yıkar.')
    );
  }

  // Çatlak taş paneli: bir rakip seç
  function catlakBolumu(d, ben) {
    const hak = d.catlakHakki[ben];
    if (hak <= 0) {
      return el('p', { class: 'soluk-yazi kl-catlak-yok' }, 'Çatlak taş hakkını kullandın.');
    }
    const benimTurumdaAtti = d.sira === ben && d.kule.length > 0;
    if (!durumum.catlakAcik) {
      return el(
        'button',
        {
          class: 'dugme ikincil genis kl-catlak-dugme',
          disabled: benimTurumdaAtti,
          onclick: () => {
            durumum.catlakAcik = true;
            k.render();
          },
        },
        benimTurumdaAtti ? 'Çatlak taş (zar atmadan önce atılır)' : 'Çatlak taş at (1 hakkın var)'
      );
    }
    const rakipler = d.oyuncular.map((o, i) => ({ o: o, i: i })).filter((x) => x.i !== ben);
    const dugmeler = rakipler.map((x) =>
      el(
        'button',
        {
          class: 'dugme ikincil genis kl-hedef',
          disabled: catlakVarMi(d, x.i),
          onclick: () => {
            hamleGonder({ tip: 'catlak', hedef: x.o.id }).then((sonuc) => {
              if (sonuc && sonuc.ok) {
                durumum.catlakAcik = false;
                k.mesajGoster('Çatlak taş atıldı.');
                k.render();
              }
            });
          },
        },
        catlakVarMi(d, x.i) ? x.o.ad + ' (zaten çatlak var)' : x.o.ad
      )
    );
    return el(
      'div',
      { class: 'kutu kl-catlak-panel' },
      el('h2', null, 'Çatlak taş'),
      el('p', { class: 'soluk-yazi' }, 'Kimin bir sonraki turunda 1 de 2 de kuleyi yıksın? Bu hakkı oyun boyunca bir kez kullanırsın.'),
      dugmeler,
      el(
        'button',
        {
          class: 'dugme',
          onclick: () => {
            durumum.catlakAcik = false;
            k.render();
          },
        },
        'Vazgeç'
      )
    );
  }

  // Zar at ve Dur düğmeleri (sıra bendeyse), yoksa bekleme yazısı ve gerekirse "Sırayı geç"
  function eylemAlani(d, ben) {
    if (d.sira === ben) {
      const duramaz = d.kule.length === 0;
      return el(
        'div',
        { class: 'kl-eylem' },
        el('button', { class: 'dugme birincil kl-zar-at', onclick: () => hamleGonder({ tip: 'zarAt' }) }, 'Zar at'),
        el(
          'button',
          {
            class: 'dugme kl-dur',
            disabled: duramaz,
            onclick: () => hamleGonder({ tip: 'dur' }),
          },
          duramaz ? 'Dur (önce zar at)' : 'Dur (+' + kuleToplami(d.kule) + ')'
        )
      );
    }
    const gec = sirayiGecebilirMi(d, Date.now());
    durumum.gecGoruldu = gec;
    return el(
      'div',
      { class: 'kl-bekle' },
      el('p', { class: 'slogan' }, d.oyuncular[d.sira].ad + ' oynuyor. Zarı ve kuleyi buradan izleyebilirsin.'),
      gec
        ? el(
            'button',
            { class: 'dugme ikincil genis kl-gec', onclick: () => hamleGonder({ tip: 'gec' }) },
            d.oyuncular[d.sira].ad + ' gelmedi, sırayı geç'
          )
        : null
    );
  }

  function haberListesi(d) {
    if (d.haberler.length === 0) {
      return null;
    }
    const son = d.haberler.slice().reverse();
    return el(
      'div',
      { class: 'kutu kl-haberler' },
      el('h2', null, 'Son olanlar'),
      el('ul', null, son.map((h) => el('li', null, h.metin)))
    );
  }

  function oyunEkrani(d, ben) {
    const anim = animasyonHazirla(d);
    durumum.gecGoruldu = false;
    return el(
      'div',
      { class: 'kl-sayfa' },
      kasaTablosu(d, ben),
      catlakUyarisi(d, ben),
      sahne(d, ben, anim),
      eylemAlani(d, ben),
      catlakBolumu(d, ben),
      haberListesi(d),
      nasilOynanirKutusu(durumum.nasilAcik)
    );
  }

  // -------------------------------------------------------------------------
  // Oyun sonu
  // -------------------------------------------------------------------------

  function bitisEkrani(d, ben) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    const kazanan = d.sonuc.kazanan;
    const kazananAd = kazanan !== null && d.oyuncular[kazanan] ? d.oyuncular[kazanan].ad : null;
    const ist = istatistikler(d);

    const sirali = d.oyuncular
      .map((o, i) => ({ idx: i, ad: o.ad, kasa: d.kasalar[i], yikilma: d.yikilma[i], enYuksek: d.enYuksek[i] }))
      .sort((a, b) => b.kasa - a.kasa || a.idx - b.idx);

    const tablo = el(
      'ul',
      { class: 'kl-kasalar sonuc', 'aria-label': 'Sonuç tablosu' },
      sirali.map((o) =>
        el(
          'li',
          { class: 'kl-kasa' + (o.idx === ben ? ' ben' : '') + (o.idx === kazanan ? ' kazanan' : '') },
          el(
            'div',
            { class: 'kl-kasa-ust' },
            el('span', { class: 'ad' }, (o.idx === kazanan ? '★ ' : '') + (o.idx === ben ? o.ad + ' (sen)' : o.ad)),
            el('span', { class: 'puan' }, o.kasa + ' puan')
          ),
          el('div', { class: 'kl-kasa-alt' }, 'En yüksek kule: ' + o.enYuksek + ' kat · Yıkılan kule: ' + o.yikilma)
        )
      )
    );

    return el(
      'div',
      { class: 'kl-sayfa sonuc' },
      el(
        'div',
        { class: 'kl-kazanan' },
        el('div', { class: 'etiket' }, 'Oyun bitti'),
        el('div', { class: 'ad' }, kazananAd ? kazananAd + ' kazandı!' : 'Oyun bitti'),
        el('p', { class: 'soluk-yazi' }, NEDEN_YAZILARI[d.sonuc.neden] || '')
      ),
      tablo,
      el(
        'div',
        { class: 'kutu kl-istatistik' },
        el('h2', null, 'Oyunun özeti'),
        el(
          'ul',
          null,
          el(
            'li',
            null,
            ist.enYuksek
              ? 'En yüksek kule: ' + ist.enYuksek.kat + ' kat (' + ist.enYuksek.ad + ')'
              : 'Kimse kule kuramadı.'
          ),
          el(
            'li',
            null,
            ist.enCokYikilan
              ? 'En çok yıkılan: ' + ist.enCokYikilan.ad + ' (' + ist.enCokYikilan.adet + ' kez)'
              : 'Hiç kule yıkılmadı.'
          )
        )
      ),
      sahipMi
        ? el(
            'div',
            { class: 'kl-alt' },
            d.oyuncular.length >= 2
              ? el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna')
              : el('p', { class: 'slogan' }, 'Tekrar oynamak için en az 2 kişi gerekli.'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // Tüm sayfa (üst çubuk dahil): oyun ve bitti aşamaları
  function sayfa(d, ben) {
    const govde = d.asama === 'bitti' ? bitisEkrani(d, ben) : oyunEkrani(d, ben);
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.catlakAcik = false;
    durumum.nasilAcik = true;
    durumum.animAnahtar = undefined;
    durumum.animBasla = 0;
    durumum.gecGoruldu = false;
    if (durumum.animZamanlayici !== null) {
      clearTimeout(durumum.animZamanlayici);
      durumum.animZamanlayici = null;
    }
  }

  // -------------------------------------------------------------------------
  // Saniyelik kontrol: 60 saniye dolunca "Sırayı geç" düğmesi kendiliğinden belirsin
  // -------------------------------------------------------------------------

  setInterval(() => {
    const d = istemci.durum;
    if (!istemci.kod || !d || d.oyun !== 'kule' || d.asama !== 'oyun') {
      return;
    }
    const ben = k.benimIndeks();
    if (ben < 0 || ben === d.sira) {
      return;
    }
    const gec = sirayiGecebilirMi(d, Date.now());
    if (gec !== durumum.gecGoruldu) {
      k.render();
    }
  }, 1000);

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
  };
}

// pazar-ekran.js - "Pazar" ekranları.
// Oyun kuralları pazar.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Bu oyunda gizli bilgi yoktur: tezgâh, fiyatlar ve herkesin eli açıktır.

import {
  EL_SINIRI,
  EN_AZ_SATIS,
  MEYVELER,
  UZUNLUKLAR,
  alabilirMi,
  elBoyu,
  kalanHamle,
  meyveAdi,
  meyveBilgi,
  pasMi,
  satisSonrasiFiyat,
  siralama,
  tamDeste,
} from './pazar.js';

const NASIL_OYNANIR = [
  'Sırası gelen tek bir hamle yapar: tezgâhtan bir kart alır ya da kart satar.',
  'Al: tezgâhtaki bir karta dokun, eline gelir. Elinde en fazla ' + EL_SINIRI + ' kart olur.',
  'Sat: aynı meyveden en az ' + EN_AZ_SATIS + ' kartı sat. Her kart için o meyvenin şu anki fiyatı kadar puan alırsın.',
  'Sattığın meyvenin fiyatı, sattığın kart sayısı kadar düşer (en az 1).',
  'Her satıştan sonra diğer meyvelerin fiyatı 1 artar. Ama başlangıç fiyatını geçmez.',
  'Deste bitince son tur oynanır. Elinde kalan kartlar çürür, puan getirmez.',
  'En çok puanı olan kazanır. Eşitlikte daha çok kart satan kazanır, o da eşitse berabere.',
];

const UZUNLUK_YAZILARI = {
  kisa: 'Kısa',
  normal: 'Normal',
};

const NEDEN_YAZILARI = {
  puan: 'En çok puanı olan kazandı.',
  satilan: 'Puanlar eşitti. Daha çok kart satan kazandı.',
  berabere: 'Puan da satılan kart da eşit: berabere.',
};

export function pazarEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    satAdet: {}, // meyve -> satılacak adet (kullanıcı azaltabilir)
    nasilAcik: true,
  };

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
      { class: 'pz-nasil', open: acik },
      el('summary', null, 'Nasıl oynanır?'),
      el('ul', null, NASIL_OYNANIR.map((satir) => el('li', null, satir)))
    );
    kutu.addEventListener('toggle', () => {
      durumum.nasilAcik = kutu.open;
    });
    return kutu;
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function lobiBolumu(d, sahipMi) {
    const uzunlukDugmeleri = Object.keys(UZUNLUKLAR).map((uzunluk) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.uzunluk === uzunluk ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { uzunluk: uzunluk } }),
        },
        UZUNLUK_YAZILARI[uzunluk] + ' (' + tamDeste(uzunluk).length + ' kart)'
      )
    );

    const yeterli = d.oyuncular.length >= 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el(
          'p',
          { class: 'soluk-yazi' },
          'Sırayla meyve toplayıp satarsınız. Bir meyveden çok satılınca fiyatı düşer. Ne zaman satacağını iyi seç.'
        ),
        el('div', { class: 'etiket' }, 'Oyun ne kadar sürsün?'),
        el('div', { class: 'secenekler' }, uzunlukDugmeleri),
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
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca pazar açılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Oyun ekranı
  // -------------------------------------------------------------------------

  // Elin kısa yazısı: "🍎2 🍉1" (boşsa "boş")
  function elYazisi(elim) {
    const parcalar = MEYVELER.filter((m) => elim[m.id] > 0).map((m) => m.simge + elim[m.id]);
    return parcalar.length > 0 ? parcalar.join(' ') : 'eli boş';
  }

  // Oyuncular: puan ve açık el
  function oyuncuTablosu(d, ben) {
    return el(
      'ul',
      { class: 'pz-oyuncular', 'aria-label': 'Oyuncular' },
      d.oyuncular.map((o, i) => {
        const sirada = i === d.sira && d.asama === 'oyun';
        return el(
          'li',
          { class: 'pz-oyuncu' + (sirada ? ' sirada' : '') + (i === ben ? ' ben' : '') },
          el(
            'div',
            { class: 'pz-oyuncu-ust' },
            el('span', { class: 'ad' }, i === ben ? o.ad + ' (sen)' : o.ad),
            sirada ? el('span', { class: 'pz-sira-etiketi' }, 'Sırada') : null,
            el('span', { class: 'puan' }, d.puanlar[i] + ' puan')
          ),
          el(
            'div',
            { class: 'pz-oyuncu-alt' },
            el('span', null, elYazisi(d.eller[i])),
            el('span', { class: 'soluk-yazi' }, elBoyu(d.eller[i]) + '/' + EL_SINIRI + ' kart')
          )
        );
      })
    );
  }

  // Son satışta fiyatı nasıl değişti: 'dustu', 'artti' ya da null
  function fiyatDegisimi(d, meyve) {
    const olay = d.sonOlay;
    if (!olay || olay.tip !== 'sat') {
      return null;
    }
    if (olay.meyve === meyve) {
      return olay.yeniFiyat < olay.fiyat ? 'dustu' : null;
    }
    return 'artti';
  }

  // Pazar tahtası: her meyvenin fiyatı, tavanı ve elimdeki sayısı
  function fiyatTahtasi(d, ben) {
    return el(
      'div',
      { class: 'pz-tahta', role: 'table', 'aria-label': 'Fiyatlar' },
      MEYVELER.map((m) => {
        const fiyat = d.fiyatlar[m.id];
        const degisim = fiyatDegisimi(d, m.id);
        const noktalar = [];
        for (let i = 1; i <= m.baslangic; i++) {
          noktalar.push(el('span', { class: 'pz-nokta' + (i <= fiyat ? ' dolu' : '') }));
        }
        return el(
          'div',
          { class: 'pz-meyve' + (degisim ? ' ' + degisim : ''), role: 'row' },
          el('span', { class: 'pz-simge', 'aria-hidden': 'true' }, m.simge),
          el('span', { class: 'pz-meyve-ad' }, m.ad),
          el(
            'span',
            { class: 'pz-fiyat', 'aria-label': m.ad + ' fiyatı ' + fiyat },
            String(fiyat),
            degisim === 'dustu' ? el('small', null, '▼') : degisim === 'artti' && fiyat <= m.baslangic ? el('small', null, '▲') : null
          ),
          el('span', { class: 'pz-noktalar', title: 'En yüksek fiyat ' + m.baslangic }, noktalar),
          el('span', { class: 'pz-elde' + (d.eller[ben][m.id] > 0 ? ' var' : '') }, 'Elinde ' + d.eller[ben][m.id])
        );
      })
    );
  }

  // Tezgâh: açık kartlar. Sıra bendeyse ve alabiliyorsam dokunulur.
  function tezgah(d, ben) {
    const benim = d.sira === ben;
    const alir = benim && alabilirMi(d, ben);
    const kartlar = d.tezgah.map((meyve, yer) => {
      const m = meyveBilgi(meyve);
      return el(
        'button',
        {
          class: 'pz-kart',
          disabled: !alir,
          'aria-label': m.ad + ' al',
          onclick: () => hamleGonder({ tip: 'al', yer: yer }),
        },
        el('span', { class: 'pz-kart-simge', 'aria-hidden': 'true' }, m.simge),
        el('span', { class: 'pz-kart-ad' }, m.ad)
      );
    });
    for (let i = d.tezgah.length; i < 5; i++) {
      kartlar.push(el('div', { class: 'pz-kart bos', 'aria-hidden': 'true' }));
    }
    let not = 'Destede ' + d.deste.length + ' kart';
    if (benim && !alir && elBoyu(d.eller[ben]) >= EL_SINIRI) {
      not = 'Elin dolu. Bu tur satmalısın.';
    }
    return el(
      'div',
      { class: 'kutu pz-tezgah-kutu' },
      el('div', { class: 'pz-baslik' }, el('h2', null, 'Tezgâh'), el('span', { class: 'soluk-yazi' }, not)),
      el('div', { class: 'pz-tezgah' }, kartlar),
      benim && alir ? el('p', { class: 'soluk-yazi pz-ipucu' }, 'Almak istediğin karta dokun.') : null
    );
  }

  // Satış satırları: elimde en az 2 olan her meyve için
  function satisBolumu(d, ben) {
    const benim = d.sira === ben;
    const satirlar = [];
    for (const m of MEYVELER) {
      const elde = d.eller[ben][m.id];
      if (elde < EN_AZ_SATIS) {
        delete durumum.satAdet[m.id];
        continue;
      }
      let adet = durumum.satAdet[m.id] || elde;
      adet = Math.max(EN_AZ_SATIS, Math.min(elde, adet)); // dokunulmadıysa hepsi
      const kazanc = adet * d.fiyatlar[m.id];
      const sonra = satisSonrasiFiyat(d, m.id, adet);
      satirlar.push(
        el(
          'div',
          { class: 'pz-satis' },
          el('span', { class: 'pz-satis-meyve' }, m.simge + ' ' + m.ad),
          el(
            'div',
            { class: 'pz-adet' },
            el(
              'button',
              {
                class: 'mini-dugme',
                'aria-label': 'Bir eksik',
                disabled: adet <= EN_AZ_SATIS,
                onclick: () => {
                  durumum.satAdet[m.id] = adet - 1;
                  k.render();
                },
              },
              '−'
            ),
            el('span', { class: 'pz-adet-sayi' }, String(adet)),
            el(
              'button',
              {
                class: 'mini-dugme',
                'aria-label': 'Bir fazla',
                disabled: adet >= elde,
                onclick: () => {
                  durumum.satAdet[m.id] = adet + 1;
                  k.render();
                },
              },
              '+'
            )
          ),
          el(
            'button',
            {
              class: 'dugme birincil pz-sat',
              disabled: !benim,
              onclick: () => hamleGonder({ tip: 'sat', meyve: m.id, adet: adet }),
            },
            'Sat +' + kazanc
          ),
          el('span', { class: 'pz-satis-not' }, adet + ' x ' + d.fiyatlar[m.id] + '. Sonra fiyat ' + sonra + ' olur.')
        )
      );
    }
    if (satirlar.length === 0) {
      return el(
        'div',
        { class: 'kutu pz-satis-kutu' },
        el('h2', null, 'Sat'),
        el('p', { class: 'soluk-yazi' }, 'Satmak için aynı meyveden en az ' + EN_AZ_SATIS + ' kartın olmalı.')
      );
    }
    return el(
      'div',
      { class: 'kutu pz-satis-kutu' },
      el('h2', null, 'Sat'),
      satirlar,
      benim ? null : el('p', { class: 'soluk-yazi' }, 'Sıran gelince satabilirsin.')
    );
  }

  function siraYazisi(d, ben) {
    if (d.sira === ben) {
      return el('div', { class: 'pz-sira benim' }, 'Sıra sende: bir kart al ya da sat.');
    }
    return el('div', { class: 'pz-sira' }, d.oyuncular[d.sira].ad + ' düşünüyor…');
  }

  function sonTurUyarisi(d) {
    const kalan = kalanHamle(d);
    if (kalan === null) {
      return null;
    }
    return el(
      'div',
      { class: 'pz-son-tur', role: 'status' },
      el('b', null, 'Son tur! '),
      'Deste bitti. Oyun bitmeden ' + kalan + ' hamle kaldı. Elde kalan kartlar çürür.'
    );
  }

  function pasAlani(d, ben) {
    if (d.sira !== ben || !pasMi(d, ben)) {
      return null;
    }
    return el(
      'div',
      { class: 'kutu' },
      el('p', { class: 'soluk-yazi' }, 'Tezgâh boş ve satacak çiftin yok.'),
      el('button', { class: 'dugme ikincil genis', onclick: () => hamleGonder({ tip: 'pas' }) }, 'Pas geç')
    );
  }

  function haberListesi(d) {
    if (d.haberler.length === 0) {
      return null;
    }
    const son = d.haberler.slice().reverse();
    return el(
      'div',
      { class: 'kutu pz-haberler' },
      el('h2', null, 'Son olanlar'),
      el('ul', null, son.map((h) => el('li', null, h.metin)))
    );
  }

  function oyunEkrani(d, ben) {
    return el(
      'div',
      { class: 'pz-sayfa' },
      oyuncuTablosu(d, ben),
      sonTurUyarisi(d),
      siraYazisi(d, ben),
      fiyatTahtasi(d, ben),
      tezgah(d, ben),
      satisBolumu(d, ben),
      pasAlani(d, ben),
      haberListesi(d),
      nasilOynanirKutusu(durumum.nasilAcik)
    );
  }

  // -------------------------------------------------------------------------
  // Oyun sonu
  // -------------------------------------------------------------------------

  function bitisEkrani(d, ben) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    const kazananlar = d.sonuc.kazananlar;
    const berabere = kazananlar.length > 1;
    let baslik = 'Oyun bitti';
    if (berabere) {
      baslik = 'Berabere!';
    } else if (kazananlar.length === 1 && d.oyuncular[kazananlar[0]]) {
      baslik = kazananlar[0] === ben ? 'Sen kazandın!' : d.oyuncular[kazananlar[0]].ad + ' kazandı!';
    }

    const tablo = el(
      'ul',
      { class: 'pz-oyuncular sonuc', 'aria-label': 'Sonuç tablosu' },
      siralama(d).map((s) =>
        el(
          'li',
          { class: 'pz-oyuncu' + (s.idx === ben ? ' ben' : '') + (kazananlar.includes(s.idx) ? ' kazanan' : '') },
          el(
            'div',
            { class: 'pz-oyuncu-ust' },
            el('span', { class: 'ad' }, (kazananlar.includes(s.idx) ? '★ ' : '') + (s.idx === ben ? s.ad + ' (sen)' : s.ad)),
            el('span', { class: 'puan' }, s.puan + ' puan')
          ),
          el(
            'div',
            { class: 'pz-oyuncu-alt' },
            el('span', null, s.satilan + ' kart sattı'),
            el('span', { class: 'soluk-yazi' }, s.curuyen > 0 ? s.curuyen + ' kart çürüdü' : 'çürüyen yok')
          )
        )
      )
    );

    const enIyi = d.enIyiSatis;
    return el(
      'div',
      { class: 'pz-sayfa sonuc' },
      el(
        'div',
        { class: 'pz-kazanan' },
        el('div', { class: 'etiket' }, 'Pazar kapandı'),
        el('div', { class: 'ad' }, baslik),
        el('p', { class: 'soluk-yazi' }, NEDEN_YAZILARI[d.sonuc.neden] || '')
      ),
      tablo,
      el(
        'div',
        { class: 'kutu pz-haberler' },
        el('h2', null, 'Oyunun özeti'),
        el(
          'ul',
          null,
          el(
            'li',
            null,
            enIyi
              ? 'En kârlı satış: ' + enIyi.ad + ', ' + enIyi.adet + ' ' + meyveAdi(enIyi.meyve) + ' ile ' + enIyi.puan + ' puan'
              : 'Kimse satış yapmadı.'
          ),
          el('li', null, 'Toplam ' + d.hamleSayisi + ' hamle oynandı.')
        )
      ),
      sahipMi
        ? el(
            'div',
            { class: 'pz-alt' },
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
    durumum.satAdet = {};
    durumum.nasilAcik = true;
  }

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
  };
}

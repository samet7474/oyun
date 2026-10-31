// kelime-ekran.js - "Kelime düellosu" ekranları.
// Oyun kuralları kelime.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Gizlilik: rakiplerin harfleri ve gizli kelime tur bitene kadar hiçbir yerde çizilmez
// (rakip tahtalarında yalnız renk vardır).

import {
  DENEME_SAYISI,
  KELIME_UZUNLUK,
  TUR_SAYILARI,
  harfler,
  kelimeTemizle,
  klavyeRenkleri,
  oyuncuDurumu,
  oyunKazananlari,
  tahminHatasi,
} from './kelime.js';

// Türkçe Q klavye: Q, W, X yok
const KLAVYE = [
  ['e', 'r', 't', 'y', 'u', 'ı', 'o', 'p', 'ğ', 'ü'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ş', 'i'],
  ['gir', 'z', 'c', 'v', 'b', 'n', 'm', 'ö', 'ç', 'sil'],
];

// Sonuç açılmadan önce son satırın çevrilme animasyonu bitsin diye beklenen süre (ms)
const ACIK_GECIKME = 1800;

function buyukHarf(harf) {
  return harf.toLocaleUpperCase('tr-TR');
}

export function kelimeEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    satirAnahtari: '', // yazılan satırın hangi kelimeye ve kaçıncı denemeye ait olduğu
    yazilan: [], // şu an yazdığım harfler
    mesaj: '', // tahtanın altındaki küçük yazı
    yineKelime: null, // "Yine de kullan" ile gönderilecek kelime
    salla: false, // bir sonraki çizimde satırı salla
    pop: false, // bir sonraki çizimde son harfi büyüt
    gonderiliyor: false,
    gorulen: new Set(), // animasyonu oynamış satırlar
    ilkCizim: true, // ilk çizimde mevcut satırlar animasyonsuz gelir
    gecikme: null, // { anahtar, bitis }
    tusRenkleri: {}, // klavyede en son çizilen harf renkleri (yeni boyananlar karolar dönünce boyansın)
  };

  // -------------------------------------------------------------------------
  // Yazma: harf ekle, sil, gönder
  // -------------------------------------------------------------------------

  // Tahmin yapabilecek durumdaysam { d, ben } döner
  function oynayabilirMi() {
    const d = istemci.durum;
    if (!istemci.kod || !d || d.oyun !== 'kelime' || d.asama !== 'tur') {
      return null;
    }
    const ben = k.benimIndeks();
    if (ben < 0 || oyuncuDurumu(d, ben).bitti) {
      return null;
    }
    return { d: d, ben: ben };
  }

  function mesajiSil() {
    durumum.mesaj = '';
    durumum.yineKelime = null;
  }

  // Yeni kelimeye ya da yeni satıra geçildiyse yazılanı temizle
  function satiriHazirla(d, ben) {
    const anahtar = istemci.kod + ':' + d.tur + ':' + d.cevap + ':' + d.tahminler[ben].length;
    if (durumum.satirAnahtari !== anahtar) {
      durumum.satirAnahtari = anahtar;
      durumum.yazilan = [];
      mesajiSil();
    }
  }

  function harfEkle(harf) {
    const o = oynayabilirMi();
    if (!o) {
      return;
    }
    satiriHazirla(o.d, o.ben);
    if (durumum.yazilan.length >= KELIME_UZUNLUK) {
      return;
    }
    durumum.yazilan.push(harf);
    mesajiSil();
    durumum.pop = true;
    k.render();
  }

  function harfSil() {
    const o = oynayabilirMi();
    if (!o) {
      return;
    }
    satiriHazirla(o.d, o.ben);
    if (durumum.yazilan.length === 0) {
      return;
    }
    durumum.yazilan.pop();
    mesajiSil();
    k.render();
  }

  // zorla: true ise sözlükte olmayan kelime de gönderilir ("Yine de kullan")
  function gonder(zorla) {
    const o = oynayabilirMi();
    if (!o) {
      return;
    }
    if (durumum.gonderiliyor) {
      k.bekleyenUyari();
      return;
    }
    satiriHazirla(o.d, o.ben);
    const kelime = durumum.yazilan.join('');
    const sorun = tahminHatasi(o.d, o.ben, kelime, zorla);
    if (sorun) {
      durumum.mesaj = sorun.hata;
      durumum.yineKelime = sorun.neden === 'sozluk' ? kelime : null;
      durumum.salla = true;
      k.render();
      return;
    }
    mesajiSil();
    durumum.gonderiliyor = true;
    k.hamle({ tip: 'tahmin', tur: o.d.tur, kelime: kelime, zorla: zorla === true }).then((sonuc) => {
      durumum.gonderiliyor = false;
      if (sonuc && !sonuc.ok && sonuc.hata === 'mesgul') {
        k.bekleyenUyari();
      }
    });
  }

  // Bilgisayar klavyesi (Türkçe harfler dahil)
  document.addEventListener('keydown', (olay) => {
    if (olay.ctrlKey || olay.metaKey || olay.altKey) {
      return;
    }
    const aktif = document.activeElement;
    if (aktif && (aktif.tagName === 'INPUT' || aktif.tagName === 'TEXTAREA' || aktif.isContentEditable)) {
      return;
    }
    // Onay penceresi açıkken tuşlar pencereye aittir (Enter, "Evet" düğmesine basmalı)
    if (document.querySelector('.onay-katmani')) {
      return;
    }
    if (!oynayabilirMi()) {
      return;
    }
    if (olay.key === 'Enter') {
      olay.preventDefault();
      if (!olay.repeat) {
        gonder(false);
      }
      return;
    }
    if (olay.key === 'Backspace') {
      olay.preventDefault();
      harfSil();
      return;
    }
    if (olay.key.length === 1) {
      const harf = kelimeTemizle(olay.key);
      if (harfler(harf).length === 1) {
        olay.preventDefault();
        harfEkle(harf);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Çizim yardımcıları
  // -------------------------------------------------------------------------

  function satirAnahtari(d, oyuncu, satir) {
    return istemci.kod + ':' + d.tur + ':' + d.cevap + ':' + oyuncu + ':' + satir;
  }

  // Bu satır ilk kez mi çiziliyor? İlk çizimde (sayfa açılışı) animasyon oynamaz.
  function yeniMi(anahtar) {
    if (durumum.gorulen.has(anahtar)) {
      return false;
    }
    durumum.gorulen.add(anahtar);
    return !durumum.ilkCizim;
  }

  function bosKutular(sayi) {
    const kutular = [];
    for (let c = 0; c < sayi; c++) {
      kutular.push(el('div', { class: 'kt' }));
    }
    return kutular;
  }

  // Tahta: 6 satır x 5 kutu.
  //   secenek.harfli   : harfler yazılsın mı (rakipte hiç)
  //   secenek.sinif    : mini | orta | (boş = büyük)
  //   secenek.yazilan  : benim yazdığım satır (yoksa null)
  //   secenek.sallan   : yazılan satır sallansın
  //   secenek.satir    : kaç satır çizilsin (varsayılan 6)
  function tahtaCiz(d, oyuncu, secenek) {
    const tahminler = d.tahminler[oyuncu];
    const satirSayisi = secenek.satir || DENEME_SAYISI;
    const satirlar = [];
    for (let j = 0; j < satirSayisi; j++) {
      const t = tahminler[j];
      let kutular;
      let sinif = 'kt-satir';
      if (t) {
        const canlansin = yeniMi(satirAnahtari(d, oyuncu, j));
        const hf = harfler(t.kelime);
        kutular = t.renkler.map((renk, c) =>
          el(
            'div',
            {
              class: 'kt r' + renk + (canlansin ? ' cevir' : ''),
              style: canlansin ? '--i:' + c : null,
            },
            secenek.harfli ? buyukHarf(hf[c]) : null
          )
        );
      } else if (secenek.yazilan && j === tahminler.length) {
        kutular = [];
        for (let c = 0; c < KELIME_UZUNLUK; c++) {
          const harf = secenek.yazilan[c];
          const sonEklenen = secenek.pop && c === secenek.yazilan.length - 1;
          kutular.push(
            el('div', { class: harf ? 'kt dolu' + (sonEklenen ? ' pop' : '') : 'kt' }, harf ? buyukHarf(harf) : null)
          );
        }
        if (secenek.sallan) {
          sinif += ' sallan';
        }
      } else {
        kutular = bosKutular(KELIME_UZUNLUK);
      }
      satirlar.push(el('div', { class: sinif }, kutular));
    }
    return el('div', { class: 'kt-tahta ' + (secenek.sinif || '') }, satirlar);
  }

  function adGoster(d, i, ben) {
    return i === ben ? d.oyuncular[i].ad + ' (sen)' : d.oyuncular[i].ad;
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

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

    const sozlukSecenekleri = [
      { deger: false, yazi: 'Kabul etme' },
      { deger: true, yazi: 'Kabul et' },
    ];
    const sozlukDugmeleri = sozlukSecenekleri.map((s) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.serbest === s.deger ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { serbest: s.deger } }),
        },
        s.yazi
      )
    );

    const yeterli = d.oyuncular.length >= 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Herkes aynı 5 harfli kelimeyi aynı anda bulmaya çalışır. 6 hakkın var.'),
        el('div', { class: 'etiket' }, 'Tur sayısı'),
        el('div', { class: 'secenekler' }, turDugmeleri),
        el('div', { class: 'etiket' }, 'Sözlükte olmayan kelime'),
        el('div', { class: 'secenekler' }, sozlukDugmeleri),
        el(
          'p',
          { class: 'soluk-yazi' },
          d.ayar.serbest
            ? 'Her 5 harfli kelime denenebilir.'
            : 'Listede olmayan kelimede "Yine de kullan" çıkar.'
        ),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
      ),
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
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca oyun açılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Oyun ekranı: kelime sürüyor
  // -------------------------------------------------------------------------

  function klavyeCiz(renkler) {
    const onceki = durumum.tusRenkleri;
    durumum.tusRenkleri = renkler;
    const satirlar = KLAVYE.map((satir) =>
      el(
        'div',
        { class: 'klavye-satir' },
        satir.map((tus) => {
          if (tus === 'gir') {
            return el('button', { class: 'tus genis', 'aria-label': 'Gönder', onclick: () => gonder(false) }, 'Gir');
          }
          if (tus === 'sil') {
            return el('button', { class: 'tus genis', 'aria-label': 'Sil', onclick: () => harfSil() }, '⌫');
          }
          const renk = renkler[tus];
          const yeniBoyandi = renk !== undefined && renk !== onceki[tus] && !durumum.ilkCizim;
          return el(
            'button',
            {
              class: renk === undefined ? 'tus' : 'tus r' + renk + (yeniBoyandi ? ' gec' : ''),
              'aria-label': buyukHarf(tus),
              onclick: () => harfEkle(tus),
            },
            buyukHarf(tus)
          );
        })
      )
    );
    return el('div', { class: 'klavye' }, satirlar);
  }

  // Rakibin küçük tahtası: yalnız renkler, harf yok
  function rakipKarti(d, i) {
    const durum = oyuncuDurumu(d, i);
    let yazi = durum.sayi + '/' + DENEME_SAYISI;
    let sinif = 'kelime-rakip';
    if (durum.cozdu) {
      yazi = 'çözdü ✓ (' + durum.deneme + '. denemede)';
      sinif += ' cozdu';
    } else if (durum.bitti) {
      yazi = 'bitti ✗';
      sinif += ' bitti';
    }
    return el(
      'div',
      { class: sinif },
      el(
        'div',
        { class: 'baslik-satiri' },
        el('span', { class: 'ad' }, d.oyuncular[i].ad),
        el('span', { class: 'puan-rozeti' }, d.oyuncular[i].puan + ' puan')
      ),
      tahtaCiz(d, i, { harfli: false, sinif: 'mini' }),
      el('div', { class: 'durum' }, yazi)
    );
  }

  // Ben bitirdim: klavye yerine durum yazısı. Gizli kelime burada da gösterilmez.
  function bitirdimPaneli(d, ben) {
    const durum = oyuncuDurumu(d, ben);
    const bekleyen = d.oyuncular.filter((o, i) => !oyuncuDurumu(d, i).bitti).length;
    const baslik = durum.cozdu ? 'Çözdün ✓ (' + durum.deneme + '. denemede)' : 'Bitti ✗ Hakların doldu';
    let bekle = 'Sonuçlar geliyor…';
    if (bekleyen === 1) {
      bekle = '1 kişi daha oynuyor…';
    } else if (bekleyen > 1) {
      bekle = bekleyen + ' kişi daha oynuyor…';
    }
    return el(
      'div',
      { class: 'kelime-bitirdim' },
      el('div', { class: durum.cozdu ? 'baslik iyi' : 'baslik' }, baslik),
      el('div', { class: 'tanis-bekle', 'aria-live': 'polite' }, el('span', { class: 'nokta-nabiz' }), bekle)
    );
  }

  function turEkrani(d, ben) {
    satiriHazirla(d, ben);
    const durum = oyuncuDurumu(d, ben);
    const oynuyorum = d.asama === 'tur' && !durum.bitti;

    const sallan = durumum.salla;
    const pop = durumum.pop;
    durumum.salla = false;
    durumum.pop = false;

    const rakipler = [];
    d.oyuncular.forEach((o, i) => {
      if (i !== ben) {
        rakipler.push(rakipKarti(d, i));
      }
    });

    const tahta = tahtaCiz(d, ben, {
      harfli: true,
      yazilan: oynuyorum ? durumum.yazilan : null,
      sallan: sallan,
      pop: pop,
    });

    // Mesaj yoksa aynı satırda hangi kelimede olduğumuz yazar
    const bilgi = 'Kelime ' + (d.tur + 1) + '/' + d.ayar.turSayisi + ' · ' + d.oyuncular[ben].puan + ' puanın var';
    const mesaj = el(
      'div',
      { class: durumum.mesaj ? 'kelime-mesaj' : 'kelime-mesaj bilgi', role: 'status', 'aria-live': 'polite' },
      el('span', null, durumum.mesaj ? durumum.mesaj : bilgi),
      durumum.yineKelime
        ? el('button', { class: 'link-dugme', onclick: () => gonder(true) }, 'Yine de kullan')
        : null
    );

    const alt = oynuyorum ? klavyeCiz(klavyeRenkleri(d.tahminler[ben])) : bitirdimPaneli(d, ben);

    return el(
      'div',
      { class: 'kelime-sayfa' },
      el('div', { class: 'kelime-rakipler n' + rakipler.length }, rakipler),
      mesaj,
      el('div', { class: 'kelime-tahta-alani' }, tahta),
      el('div', { class: 'kelime-alt-alan' }, alt)
    );
  }

  // Tur bitti ama son satırların çevrilme animasyonu oynasın diye sonucu biraz geciktir
  function acikGecikmesi(d) {
    const anahtar = istemci.kod + ':' + d.tur + ':' + d.cevap;
    if (durumum.gecikme && durumum.gecikme.anahtar === anahtar) {
      return Date.now() < durumum.gecikme.bitis;
    }
    durumum.gecikme = { anahtar: anahtar, bitis: 0 };
    if (durumum.ilkCizim) {
      return false;
    }
    const yeniSatirVar = d.tahminler.some((liste, i) =>
      liste.some((t, j) => !durumum.gorulen.has(satirAnahtari(d, i, j)))
    );
    if (!yeniSatirVar) {
      return false;
    }
    durumum.gecikme.bitis = Date.now() + ACIK_GECIKME;
    setTimeout(() => k.render(), ACIK_GECIKME + 50);
    return true;
  }

  // -------------------------------------------------------------------------
  // Sonuç ekranı: kelime bitti
  // -------------------------------------------------------------------------

  function turKazananMetni(d, g, ben) {
    if (g.kazananlar.length === 0) {
      return 'Kimse çözemedi';
    }
    if (g.kazananlar.length === 1) {
      const i = g.kazananlar[0];
      return i === ben ? 'Bu kelimeyi sen kazandın!' : d.oyuncular[i].ad + ' kazandı!';
    }
    return 'Berabere: ' + g.kazananlar.map((i) => d.oyuncular[i].ad).join(', ');
  }

  // Puan tablosu (çok puandan aza). vurgulu: öne çıkan oyuncu indeksleri.
  //   secenek.artis : vurgulu oyunculara "+1" yaz
  //   secenek.etiket: puanın yanına küçük açıklama
  function puanTablosu(d, ben, vurgulu, secenek) {
    const sirali = d.oyuncular.map((o, i) => ({ o: o, i: i })).sort((a, b) => b.o.puan - a.o.puan);
    return el(
      'div',
      { class: 'puan-tablosu' },
      sirali.map((s) =>
        el(
          'div',
          { class: vurgulu.includes(s.i) ? 'puan-satiri kazanan' : 'puan-satiri' },
          el('span', { class: 'ad' }, adGoster(d, s.i, ben)),
          secenek.etiket ? el('span', { class: 'soluk-yazi' }, secenek.etiket) : null,
          secenek.artis && vurgulu.includes(s.i) ? el('span', { class: 'artis' }, '+1') : null,
          el('span', { class: 'toplam' }, String(s.o.puan))
        )
      )
    );
  }

  function acikEkrani(d, ben) {
    const g = d.gecmis[d.gecmis.length - 1];
    const sonKelime = d.tur + 1 >= d.ayar.turSayisi;

    const cevapKutulari = harfler(d.cevap).map((h) => el('div', { class: 'kt r2' }, buyukHarf(h)));

    const kartlar = d.oyuncular.map((o, i) => {
      const deneme = g.denemeler[i];
      return el(
        'div',
        { class: g.kazananlar.includes(i) ? 'kelime-sonuc-kart kazanan' : 'kelime-sonuc-kart' },
        el('div', { class: 'ad' }, adGoster(d, i, ben)),
        el('div', { class: deneme ? 'durum iyi' : 'durum' }, deneme ? deneme + '. denemede ✓' : 'çözemedi ✗'),
        tahtaCiz(d, i, { harfli: true, sinif: 'orta', satir: Math.max(1, d.tahminler[i].length) })
      );
    });

    return el(
      'div',
      { class: 'kelime-sayfa sonuc' },
      el('div', { class: 'kelime-ust' }, el('span', null, 'Kelime ' + (d.tur + 1) + '/' + d.ayar.turSayisi)),
      el(
        'div',
        { class: 'kelime-cevap-alani' },
        el('div', { class: 'etiket' }, 'Kelime'),
        el('div', { class: 'kelime-cevap', 'aria-label': buyukHarf(d.cevap) }, cevapKutulari),
        el('p', { class: 'kelime-kazanan' }, turKazananMetni(d, g, ben))
      ),
      el('div', { class: 'kelime-kartlar' }, kartlar),
      puanTablosu(d, ben, g.kazananlar, { artis: true }),
      el(
        'div',
        { class: 'kelime-alt' },
        el(
          'button',
          { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'sonraki', tur: d.tur }) },
          sonKelime ? 'Sonuçları gör' : 'Sonraki kelime'
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

    const ozet = d.gecmis.map((g, t) =>
      el(
        'li',
        { class: 'kelime-ozet' },
        el('div', { class: 'kelime' }, t + 1 + '. ' + buyukHarf(g.kelime)),
        el(
          'div',
          { class: 'denemeler' },
          d.oyuncular.map((o, i) =>
            el(
              'span',
              { class: g.kazananlar.includes(i) ? 'deneme kazanan' : 'deneme' },
              o.ad + ' ' + (g.denemeler[i] ? g.denemeler[i] : '✗')
            )
          )
        )
      )
    );

    return el(
      'div',
      { class: 'kelime-sayfa sonuc' },
      el(
        'div',
        { class: 'tanis-uyum' },
        el('div', { class: 'buyuk-emoji' }, berabere ? '🤝' : '🏆'),
        el('div', { class: 'uyum-yazi' }, baslik),
        berabere ? el('p', { class: 'soluk-yazi' }, kazananlar.map((i) => d.oyuncular[i].ad).join(', ')) : null
      ),
      puanTablosu(d, ben, kazananlar, { etiket: 'kelime kazandı' }),
      el('div', { class: 'kutu' }, el('h2', null, 'Kelimeler'), el('ul', { class: 'kelime-ozet-listesi' }, ozet)),
      sahipMi
        ? el(
            'div',
            { class: 'kelime-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // Tüm sayfa (üst çubuk dahil): tur, acik ve bitti aşamaları
  function sayfa(d, ben) {
    let govde;
    if (d.asama === 'bitti') {
      govde = bitisEkrani(d, ben);
    } else if (d.asama === 'acik' && !acikGecikmesi(d)) {
      govde = acikEkrani(d, ben);
    } else {
      govde = turEkrani(d, ben);
    }
    durumum.ilkCizim = false;
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.satirAnahtari = '';
    durumum.yazilan = [];
    mesajiSil();
    durumum.salla = false;
    durumum.pop = false;
    durumum.gonderiliyor = false;
    durumum.gorulen = new Set();
    durumum.ilkCizim = true;
    durumum.gecikme = null;
    durumum.tusRenkleri = {};
  }

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
  };
}

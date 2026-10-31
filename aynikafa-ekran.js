// aynikafa-ekran.js - "Aynı Kafa" ekranları.
// Oyun kuralları aynikafa.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Gizlilik: başkasının cevabı, herkes göndermeden hiçbir yerde çizilmez
// (yalnız "gönderdi" ya da "yazıyor" görünür).

import {
  MAKS_CEVAP_HARF,
  TUR_SAYILARI,
  cevapHatasi,
  ciftSayisi,
  enFazlaPuan,
  enGuzelEslesmeler,
  gonderenler,
  toplamPuan,
  turCiftleri,
  turGruplari,
  turPuani,
  uyumEtiketi,
  uyumYuzdesi,
} from './aynikafa.js';

// Aynı turda en fazla iki eşleşme grubu olabilir (4 kişi: 2 + 2); her grubun kendi rengi var.
const GRUP_RENKLERI = ['#ffd166', '#7ee0c8', '#c9a7ff', '#ff9bb3'];

export function aynikafaEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    taslakAnahtari: '', // yazılan metnin hangi ipucuna ait olduğu
    taslak: '', // şu an yazdığım cevap
    hata: '', // girdinin altındaki küçük uyarı
    gonderiliyor: false,
    nasilAcik: true, // "Nasıl oynanır" açık mı (gönderince kapanır)
    cizilenAnahtar: '', // ekranda çizili soru ekranının anahtarı
    gorulenKartlar: new Set(), // açılış animasyonunu oynamış kartlar
    parlayanlar: new Set(), // eşleşme parıltısını oynamış kartlar
    ilkCizim: true, // ilk çizimde mevcut kartlar animasyonsuz gelir
  };

  const NASIL_OYNANIR = [
    'Herkese aynı ipucu gelir. Herkes cevabını gizlice yazar.',
    'Herkes gönderince cevaplar birlikte açılır.',
    'Aynı cevabı yazan her iki kişi takıma 1 puan getirir. Amaç aynı şeyi düşünmek!',
  ];

  // -------------------------------------------------------------------------
  // Küçük yardımcılar
  // -------------------------------------------------------------------------

  function adGoster(d, i, ben) {
    return i === ben ? d.oyuncular[i].ad + ' (sen)' : d.oyuncular[i].ad;
  }

  function anahtarKur(d) {
    return istemci.kod + ':' + d.tur + ':' + d.ipuclari[d.tur];
  }

  function nasilOynanirKutusu(acik) {
    const kutu = el(
      'details',
      { class: 'ak-nasil', open: acik },
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

    const yeterli = d.oyuncular.length >= 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Birbirine karşı değil, birlikte oynanır. Hepiniz aynı şeyi düşünmeye çalışırsınız.'),
        el('div', { class: 'etiket' }, 'İpucu sayısı'),
        el('div', { class: 'secenekler' }, turDugmeleri),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
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
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca oyun açılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Soru ekranı: herkes cevabını yazıyor
  // -------------------------------------------------------------------------

  function benimCevabim(d, ben) {
    return d.cevaplar[d.tur][ben];
  }

  // Yeni ipucuna geçildiyse taslağı temizle (gönderdiysem gönderdiğim cevap taslak olur)
  function taslagiHazirla(d, ben) {
    const anahtar = anahtarKur(d);
    if (durumum.taslakAnahtari !== anahtar) {
      durumum.taslakAnahtari = anahtar;
      durumum.taslak = benimCevabim(d, ben) || '';
      durumum.hata = '';
      durumum.gonderiliyor = false;
    }
  }

  // Kim gönderdi, kim yazıyor (başkasının cevabı yok)
  function durumSatirlari(d, ben) {
    const gonderen = gonderenler(d, d.tur);
    return d.oyuncular.map((o, i) =>
      el(
        'li',
        { class: gonderen[i] ? 'ak-durum gonderdi' : 'ak-durum' },
        el('span', { class: 'ad' }, adGoster(d, i, ben)),
        el('span', { class: 'ne' }, gonderen[i] ? 'gönderdi ✓' : 'yazıyor…')
      )
    );
  }

  // Uyarıyı hemen yaz. Kutuda odak varken (iOS'ta düğmeye basınca da kalır) render() çizimi
  // atladığı için uyarı yazısını doğrudan yerine yazarız.
  function hataGoster(metin) {
    durumum.hata = metin;
    const uyari = document.querySelector('.ak-hata');
    if (uyari) {
      uyari.textContent = metin;
    }
    k.render();
  }

  function gonder(d, ben, girdi) {
    if (durumum.gonderiliyor) {
      k.bekleyenUyari();
      return;
    }
    const metin = girdi.value;
    const hata = cevapHatasi(metin);
    if (hata) {
      hataGoster(hata);
      return;
    }
    durumum.hata = '';
    durumum.taslak = metin;
    durumum.gonderiliyor = true;
    girdi.blur(); // klavye kapansın, gönderince ekran baştan çizilsin
    k.hamle({ tip: 'cevapla', tur: d.tur, cevap: metin }).then((sonuc) => {
      durumum.gonderiliyor = false;
      if (sonuc && !sonuc.ok) {
        if (sonuc.hata === 'mesgul') {
          k.bekleyenUyari();
        } else {
          hataGoster(sonuc.hata);
        }
      }
    });
  }

  function soruEkrani(d, ben) {
    taslagiHazirla(d, ben);
    durumum.cizilenAnahtar = anahtarKur(d);

    const gonderdim = benimCevabim(d, ben) !== null;
    const bekleyen = gonderenler(d, d.tur).filter((evet) => !evet).length;

    const girdi = el('input', {
      class: 'girdi ak-girdi',
      type: 'text',
      maxlength: MAKS_CEVAP_HARF,
      placeholder: 'Cevabını yaz',
      value: durumum.taslak,
      autocomplete: 'off',
      autocapitalize: 'off',
      'aria-label': 'Cevabın',
    });
    girdi.addEventListener('input', () => {
      durumum.taslak = girdi.value;
      if (durumum.hata) {
        durumum.hata = '';
        const uyari = document.querySelector('.ak-hata');
        if (uyari) {
          uyari.textContent = '';
        }
      }
      // Gönderdiğim cevapla aynıysa düğme "Gönderildi" olsun
      dugme.disabled = girdi.value === benimCevabim(istemci.durum, ben);
      dugme.textContent = dugme.disabled ? 'Gönderildi ✓' : gonderdim ? 'Cevabı değiştir' : 'Gönder';
    });
    girdi.addEventListener('keydown', (olay) => {
      if (olay.key === 'Enter' && !olay.repeat) {
        olay.preventDefault();
        gonder(d, ben, girdi);
      }
    });

    const ayniMi = gonderdim && durumum.taslak === benimCevabim(d, ben);
    const dugme = el(
      'button',
      {
        class: 'dugme birincil genis',
        disabled: ayniMi,
        onclick: () => gonder(d, ben, girdi),
      },
      ayniMi ? 'Gönderildi ✓' : gonderdim ? 'Cevabı değiştir' : 'Gönder'
    );

    let altYazi;
    if (!gonderdim) {
      altYazi = 'Cevabını yaz ve gönder. Kimse göndermeden cevaplar görünmez.';
    } else if (bekleyen === 1) {
      altYazi = 'Cevabın gitti. 1 kişi daha yazıyor. İstersen cevabını değiştirebilirsin.';
    } else {
      altYazi = 'Cevabın gitti. ' + bekleyen + ' kişi daha yazıyor. İstersen cevabını değiştirebilirsin.';
    }

    return el(
      'div',
      { class: 'ak-sayfa' },
      el(
        'div',
        { class: 'ak-ust' },
        el('span', null, 'İpucu ' + (d.tur + 1) + '/' + d.ipuclari.length),
        el('span', { class: 'ak-puan' }, 'Takım puanı: ' + toplamPuan(d))
      ),
      el('div', { class: 'ak-ipucu', role: 'heading', 'aria-level': '2' }, d.ipuclari[d.tur]),
      el(
        'div',
        { class: 'ak-yazim' },
        girdi,
        el('div', { class: 'hata-yazisi ak-hata', role: 'alert' }, durumum.hata),
        dugme,
        el('p', { class: 'soluk-yazi ak-alt-yazi' }, altYazi)
      ),
      el('ul', { class: 'ak-durumlar', 'aria-label': 'Kim gönderdi' }, durumSatirlari(d, ben)),
      nasilOynanirKutusu(durumum.nasilAcik && !gonderdim)
    );
  }

  // Yazı yazarken gelen oda güncellemeleri kutuyu bozup klavyeyi kapatmasın
  function yazimSurerken(d) {
    if (!d || d.oyun !== 'aynikafa' || d.asama !== 'soru') {
      return false;
    }
    if (durumum.cizilenAnahtar !== anahtarKur(d)) {
      return false;
    }
    const aktif = document.activeElement;
    return Boolean(aktif && aktif.tagName === 'INPUT' && aktif.classList.contains('ak-girdi'));
  }

  // Kutuyu yeniden kurmadan yalnız "kim gönderdi" listesini ve puanı tazeler
  function esitle(d, ben) {
    const liste = document.querySelector('.ak-durumlar');
    if (liste) {
      liste.replaceChildren(...durumSatirlari(d, ben));
    }
    const puan = document.querySelector('.ak-puan');
    if (puan) {
      puan.textContent = 'Takım puanı: ' + toplamPuan(d);
    }
  }

  // -------------------------------------------------------------------------
  // Açılış ekranı: cevaplar açıldı
  // -------------------------------------------------------------------------

  // Bu kart ilk kez mi açılıyor? İlk çizimde (sayfa açılışı) animasyon oynamaz.
  function kartYeniMi(anahtar) {
    if (durumum.gorulenKartlar.has(anahtar)) {
      return false;
    }
    durumum.gorulenKartlar.add(anahtar);
    return !durumum.ilkCizim;
  }

  // Bu kartın eşleşmesi ilk kez mi görünüyor?
  function parlamaYeniMi(anahtar) {
    if (durumum.parlayanlar.has(anahtar)) {
      return false;
    }
    durumum.parlayanlar.add(anahtar);
    return !durumum.ilkCizim;
  }

  function cevapKarti(d, i, ben, grup) {
    const anahtar = istemci.kod + ':' + d.tur + ':' + i;
    const acilis = kartYeniMi(anahtar);
    const esles = grup >= 0;
    const parla = esles && parlamaYeniMi(anahtar + ':' + grup);
    let sinif = 'ak-kart';
    if (esles) {
      sinif += ' eslesti';
    }
    if (acilis) {
      sinif += ' ac';
    }
    if (parla) {
      sinif += ' parla';
    }
    return el(
      'div',
      {
        class: sinif,
        style: '--sira:' + i + ';--gr:' + (esles ? GRUP_RENKLERI[grup % GRUP_RENKLERI.length] : 'transparent'),
      },
      el('div', { class: 'ad' }, adGoster(d, i, ben)),
      el('div', { class: 'cevap' }, d.cevaplar[d.tur][i])
    );
  }

  function ciftYazisi(d, c, ben) {
    const a = d.oyuncular[c.a].ad;
    const b = d.oyuncular[c.b].ad;
    return a + ' ile ' + b;
  }

  // "Aynı sayılsın" oyunu ver ya da geri al
  function oyVer(d, c, sayilsin) {
    k.hamle({ tip: 'sayilsin', tur: d.tur, a: c.a, b: c.b, sayilsin: sayilsin }).then((sonuc) => {
      if (sonuc && !sonuc.ok) {
        if (sonuc.hata === 'mesgul') {
          k.bekleyenUyari();
        } else {
          k.mesajGoster(sonuc.hata);
        }
      }
    });
  }

  function eslesmeKutusu(d, ben) {
    const ciftler = turCiftleri(d, d.tur);
    const eslesen = ciftler.filter((c) => c.durum !== 'yok');
    const eslesmeyen = ciftler.filter((c) => c.durum === 'yok');

    const eslesenSatirlari = eslesen.map((c) =>
      el(
        'li',
        { class: 'ak-cift eslesti' },
        el(
          'span',
          { class: 'yazi' },
          '✓ ' + ciftYazisi(d, c, ben) + ' eşleşti',
          c.durum === 'oy' ? el('span', { class: 'soluk-yazi' }, ' (aynı sayıldı)') : null
        ),
        c.durum === 'oy'
          ? el('button', { class: 'mini-dugme', onclick: () => oyVer(d, c, false) }, 'Geri al')
          : null
      )
    );

    const eslesmeyenSatirlari = eslesmeyen.map((c) =>
      el(
        'li',
        { class: 'ak-cift' },
        el(
          'span',
          { class: 'yazi' },
          el('b', null, d.oyuncular[c.a].ad + ': '),
          d.cevaplar[d.tur][c.a],
          ' · ',
          el('b', null, d.oyuncular[c.b].ad + ': '),
          d.cevaplar[d.tur][c.b]
        ),
        el('button', { class: 'mini-dugme', onclick: () => oyVer(d, c, true) }, 'Bunlar aynı sayılsın')
      )
    );

    return el(
      'div',
      { class: 'kutu ak-eslesme' },
      eslesenSatirlari.length > 0 ? el('ul', { class: 'ak-cift-listesi' }, eslesenSatirlari) : el('p', { class: 'soluk-yazi' }, 'Bu turda eşleşme yok.'),
      eslesmeyenSatirlari.length > 0
        ? el(
            'div',
            { class: 'ak-oy-bolumu' },
            el('div', { class: 'etiket' }, 'Aslında aynı mı demek istediniz?'),
            el('ul', { class: 'ak-cift-listesi' }, eslesmeyenSatirlari),
            el(
              'p',
              { class: 'soluk-yazi' },
              'Bir kişinin basması yeter, puan hemen değişir. Yanlış olduysa Geri al ile döndür.'
            )
          )
        : null
    );
  }

  function acikEkrani(d, ben) {
    const grup = turGruplari(d, d.tur);
    const kartlar = d.oyuncular.map((o, i) => cevapKarti(d, i, ben, grup[i]));
    const puan = turPuani(d, d.tur);
    const enFazla = ciftSayisi(d.oyuncular.length);
    const sonIpucu = d.tur + 1 >= d.ipuclari.length;

    let baslik = 'Bu turda ' + puan + ' puan';
    if (puan === 0) {
      baslik = 'Bu turda eşleşme olmadı';
    } else if (puan === enFazla) {
      baslik = 'Hepiniz aynı kafadasınız! +' + puan;
    }

    return el(
      'div',
      { class: 'ak-sayfa' },
      el(
        'div',
        { class: 'ak-ust' },
        el('span', null, 'İpucu ' + (d.tur + 1) + '/' + d.ipuclari.length),
        el('span', { class: 'ak-puan' }, 'Takım puanı: ' + toplamPuan(d))
      ),
      el('div', { class: 'ak-ipucu kucuk' }, d.ipuclari[d.tur]),
      el('div', { class: 'ak-kartlar n' + kartlar.length }, kartlar),
      el('div', { class: puan > 0 ? 'ak-tur-puani iyi' : 'ak-tur-puani' }, baslik + (puan > 0 && puan < enFazla ? ' (en fazla ' + enFazla + ')' : '')),
      eslesmeKutusu(d, ben),
      el(
        'div',
        { class: 'ak-alt' },
        el(
          'button',
          { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'sonraki', tur: d.tur }) },
          sonIpucu ? 'Sonuçları gör' : 'Sonraki ipucu'
        )
      )
    );
  }

  // -------------------------------------------------------------------------
  // Oyun sonu
  // -------------------------------------------------------------------------

  function bitisEkrani(d, ben) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    const yuzde = uyumYuzdesi(d);
    const guzeller = enGuzelEslesmeler(d, 5);

    const guzelListe = guzeller.map((g) => {
      // Aynı cevabı yazanları bir araya getirip "Ali, Ece: elma" biçiminde göster
      const gruplar = turGruplari(d, g.tur);
      const satirlar = [];
      const gorulen = new Set();
      g.cevaplar.forEach((c, i) => {
        if (gruplar[i] < 0 || gorulen.has(gruplar[i])) {
          return;
        }
        gorulen.add(gruplar[i]);
        const adlar = g.cevaplar.filter((x, j) => gruplar[j] === gruplar[i]).map((x) => x.ad);
        satirlar.push(el('div', { class: 'ak-guzel-cevap' }, adlar.join(', ') + ': ', el('b', null, c.cevap)));
      });
      return el(
        'li',
        { class: 'ak-guzel' },
        el('div', { class: 'ak-guzel-ust' }, el('span', { class: 'soru' }, g.ipucu), el('span', { class: 'artis' }, '+' + g.puan)),
        satirlar
      );
    });

    return el(
      'div',
      { class: 'ak-sayfa sonuc' },
      el(
        'div',
        { class: 'tanis-uyum' },
        el('div', { class: 'etiket' }, 'Uyum'),
        el('div', { class: 'yuzde' }, '%' + yuzde),
        el('div', { class: 'uyum-yazi' }, uyumEtiketi(yuzde)),
        el('p', { class: 'soluk-yazi' }, 'Takım puanı: ' + toplamPuan(d) + ' / ' + enFazlaPuan(d))
      ),
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'En güzel eşleşmeler'),
        guzelListe.length > 0
          ? el('ul', { class: 'ak-guzel-listesi' }, guzelListe)
          : el('p', { class: 'soluk-yazi' }, 'Bu sefer eşleşme çıkmadı. Bir dahaki sefere!')
      ),
      sahipMi
        ? el(
            'div',
            { class: 'ak-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // Tüm sayfa (üst çubuk dahil): soru, acik ve bitti aşamaları
  function sayfa(d, ben) {
    let govde;
    if (d.asama === 'bitti') {
      govde = bitisEkrani(d, ben);
    } else if (d.asama === 'acik') {
      govde = acikEkrani(d, ben);
    } else {
      govde = soruEkrani(d, ben);
    }
    if (d.asama !== 'soru') {
      durumum.cizilenAnahtar = '';
    }
    durumum.ilkCizim = false;
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.taslakAnahtari = '';
    durumum.taslak = '';
    durumum.hata = '';
    durumum.gonderiliyor = false;
    durumum.nasilAcik = true;
    durumum.cizilenAnahtar = '';
    durumum.gorulenKartlar = new Set();
    durumum.parlayanlar = new Set();
    durumum.ilkCizim = true;
  }

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
    yazimSurerken: yazimSurerken,
    esitle: esitle,
  };
}

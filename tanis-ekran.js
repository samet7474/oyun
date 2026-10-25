// tanis-ekran.js - "Beni ne kadar tanıyorsun" ekranları.
// Oyun kuralları tanis.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.

import {
  MAKS_OZEL,
  MAKS_SORU_HARF,
  MAKS_SECENEK_HARF,
  EN_AZ_SECENEK,
  EN_COK_SECENEK,
  SORU_SAYILARI,
  VARSAYILAN_BANKA,
  konusulacaklar,
  ozelAnahtar,
  ozelIdUret,
  ozelSoruHatasi,
  ozelTemizle,
  turSonucu,
  uyumEtiketi,
  uyumYuzdesi,
} from './tanis.js';

const DEPO_ANAHTARI = 'tanis-sorularim';

export function tanisEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    sorularimAcik: false,
    taslak: { soru: '', secenekler: ['', ''], hata: '' },
    secim: { anahtar: '', kendi: null, tahmin: null },
    sonGonderilen: null, // odaya en son gönderdiğim kendi-soru listesinin anahtarı
  };
  let esitleZamanlayici = null;

  // -------------------------------------------------------------------------
  // Sorularım: bu telefonda saklanan kendi sorularım
  // -------------------------------------------------------------------------

  function sorularimOku() {
    const ham = k.depoOku(DEPO_ANAHTARI);
    if (!ham) {
      return [];
    }
    try {
      return ozelTemizle(JSON.parse(ham));
    } catch (hata) {
      return [];
    }
  }

  function sorularimYaz(liste) {
    k.depoYaz(DEPO_ANAHTARI, JSON.stringify(liste));
  }

  function taslagiSifirla() {
    durumum.taslak = { soru: '', secenekler: ['', ''], hata: '' };
  }

  // Listem odadakinden farklıysa odaya bildir. Her çizimde çağrılır, işi yoksa hemen döner.
  function ozelEsitle() {
    clearTimeout(esitleZamanlayici);
    const d = istemci.durum;
    const ben = k.benimIndeks();
    if (!d || d.oyun !== 'tanis' || d.asama !== 'lobi' || ben < 0) {
      durumum.sonGonderilen = null;
      return;
    }
    const yerel = sorularimOku();
    const anahtar = ozelAnahtar(yerel);
    if (anahtar === ozelAnahtar(d.oyuncular[ben].ozel)) {
      durumum.sonGonderilen = anahtar;
      return;
    }
    if (anahtar === durumum.sonGonderilen) {
      return;
    }
    if (istemci.mesgul) {
      // Başka bir hareket gidiyor, birazdan tekrar bak
      esitleZamanlayici = setTimeout(ozelEsitle, 500);
      return;
    }
    durumum.sonGonderilen = anahtar;
    k.hamle({ tip: 'ozelSorular', sorular: yerel }).then((sonuc) => {
      if (!sonuc || !sonuc.ok) {
        durumum.sonGonderilen = null; // bir sonraki çizimde yeniden denenir
      }
    });
  }

  function sorularimAc() {
    durumum.sorularimAcik = true;
    taslagiSifirla();
    k.render();
  }

  function sorularimKapat() {
    durumum.sorularimAcik = false;
    k.render();
  }

  function yeniKendiId(liste) {
    let id = ozelIdUret();
    while (liste.some((q) => q.id === id)) {
      id = ozelIdUret();
    }
    return id;
  }

  function soruEkle() {
    const t = durumum.taslak;
    const liste = sorularimOku();
    if (liste.length >= MAKS_OZEL) {
      t.hata = 'En fazla ' + MAKS_OZEL + ' soru ekleyebilirsin.';
      k.render();
      return;
    }
    const hata = ozelSoruHatasi(t.soru, t.secenekler);
    if (hata) {
      t.hata = hata;
      k.render();
      return;
    }
    const temiz = ozelTemizle([{ id: yeniKendiId(liste), soru: t.soru, secenekler: t.secenekler }]);
    if (temiz.length === 0) {
      t.hata = 'Soru eklenemedi.';
      k.render();
      return;
    }
    liste.push(temiz[0]);
    sorularimYaz(liste);
    taslagiSifirla();
    k.mesajGoster('Soru eklendi.');
    k.render();
  }

  function soruSil(id) {
    if (!window.confirm('Bu soru silinsin mi?')) {
      return;
    }
    sorularimYaz(sorularimOku().filter((q) => q.id !== id));
    k.render();
  }

  function secenekEkle() {
    const t = durumum.taslak;
    if (t.secenekler.length >= EN_COK_SECENEK) {
      return;
    }
    t.secenekler.push('');
    t.hata = '';
    k.render();
    odakla(t.secenekler.length - 1);
  }

  function secenekSil(i) {
    const t = durumum.taslak;
    if (t.secenekler.length <= EN_AZ_SECENEK) {
      return;
    }
    t.secenekler.splice(i, 1);
    t.hata = '';
    k.render();
  }

  function odakla(i) {
    const girdi = document.querySelector('[data-secenek="' + i + '"]');
    if (girdi) {
      girdi.focus();
    }
  }

  // Yazı yazarken gelen oda güncellemeleri kutuyu bozup klavyeyi kapatmasın
  function yazimSurerken(d) {
    if (!durumum.sorularimAcik || !d || d.oyun !== 'tanis' || d.asama !== 'lobi') {
      return false;
    }
    const aktif = document.activeElement;
    return Boolean(aktif && aktif.tagName === 'INPUT' && aktif.closest('#app'));
  }

  function sorularimEkrani() {
    const liste = sorularimOku();
    const t = durumum.taslak;

    const soruGirdi = el('input', {
      class: 'girdi',
      type: 'text',
      maxlength: MAKS_SORU_HARF,
      placeholder: 'Örn: En sevdiğin mevsim hangisi?',
      value: t.soru,
      'aria-label': 'Soru',
    });
    soruGirdi.addEventListener('input', () => {
      t.soru = soruGirdi.value;
    });

    const secenekSatirlari = t.secenekler.map((metin, i) => {
      const girdi = el('input', {
        class: 'girdi',
        type: 'text',
        maxlength: MAKS_SECENEK_HARF,
        placeholder: 'Seçenek ' + (i + 1),
        value: metin,
        'data-secenek': String(i),
        'aria-label': 'Seçenek ' + (i + 1),
      });
      girdi.addEventListener('input', () => {
        t.secenekler[i] = girdi.value;
      });
      return el(
        'div',
        { class: 'secenek-satiri' },
        girdi,
        t.secenekler.length > EN_AZ_SECENEK
          ? el('button', { class: 'mini-dugme sil', 'aria-label': 'Seçeneği sil', onclick: () => secenekSil(i) }, '×')
          : null
      );
    });

    const kayitlar = liste.map((q) =>
      el(
        'li',
        { class: 'kendi-soru' },
        el(
          'div',
          { class: 'metin' },
          el('div', { class: 'soru' }, q.soru),
          el('div', { class: 'alt-yazi' }, q.secenekler.join(' · '))
        ),
        el('button', { class: 'mini-dugme', onclick: () => soruSil(q.id) }, 'Sil')
      )
    );

    return el(
      'div',
      { class: 'sayfa' },
      el(
        'div',
        { class: 'baslik-satiri' },
        el('button', { class: 'link-dugme', onclick: () => sorularimKapat() }, '‹ Lobiye dön'),
        el('span', { class: 'etiket-kucuk' }, liste.length + '/' + MAKS_OZEL)
      ),
      el('h2', { class: 'sayfa-basligi' }, 'Sorularım'),
      el('p', { class: 'slogan' }, 'Kendi sorunu yaz. Oyunda ikinize de sorulur. Sorular bu telefonda saklanır.'),
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Yeni soru'),
        el('label', { class: 'etiket' }, 'Soru (en fazla ' + MAKS_SORU_HARF + ' harf)'),
        soruGirdi,
        el('label', { class: 'etiket' }, 'Seçenekler (' + EN_AZ_SECENEK + ' ile ' + EN_COK_SECENEK + ' arası)'),
        secenekSatirlari,
        t.secenekler.length < EN_COK_SECENEK
          ? el('button', { class: 'dugme ikincil genis', onclick: () => secenekEkle() }, 'Seçenek ekle')
          : null,
        el('p', { class: 'hata-yazisi', role: 'alert' }, t.hata),
        el('button', { class: 'dugme birincil genis', onclick: () => soruEkle() }, 'Ekle')
      ),
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Eklediklerim'),
        liste.length === 0
          ? el('p', { class: 'soluk-yazi' }, 'Henüz soru eklemedin.')
          : el('ul', { class: 'kendi-sorular' }, kayitlar)
      )
    );
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function konuAdi(id) {
    const kategori = VARSAYILAN_BANKA.kategoriler.find((x) => x.id === id);
    return kategori ? kategori.ad : id;
  }

  function ozelOzeti(d) {
    const parcalar = d.oyuncular.map((o) => o.ad + ' ' + (o.ozel ? o.ozel.length : 0));
    return 'Yazılmış soru: ' + parcalar.join(', ');
  }

  function lobiBolumu(d, sahipMi) {
    const soruDugmeleri = SORU_SAYILARI.map((sayi) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.soruSayisi === sayi ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { soruSayisi: sayi } }),
        },
        String(sayi)
      )
    );

    const konuDugmeleri = VARSAYILAN_BANKA.kategoriler.map((kategori) => {
      const acik = d.ayar.konular.includes(kategori.id);
      return el(
        'button',
        {
          class: 'cip',
          'aria-pressed': acik ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => {
            const yeni = acik ? d.ayar.konular.filter((x) => x !== kategori.id) : d.ayar.konular.concat([kategori.id]);
            if (yeni.length === 0) {
              k.mesajGoster('En az bir konu açık kalmalı.');
              return;
            }
            k.hamle({ tip: 'ayarla', ayar: { konular: yeni } });
          },
        },
        konuAdi(kategori.id)
      );
    });

    const ozelAcik = d.ayar.ozel;
    const anahtar = el('button', {
      class: 'anahtar',
      role: 'switch',
      'aria-checked': ozelAcik ? 'true' : 'false',
      'aria-label': 'Kendi sorularımız da gelsin',
      disabled: !sahipMi,
      onclick: () => k.hamle({ tip: 'ayarla', ayar: { ozel: !ozelAcik } }),
    });

    const benimSayim = sorularimOku().length;
    const ikiKisi = d.oyuncular.length === 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('div', { class: 'etiket' }, 'Soru sayısı'),
        el('div', { class: 'secenekler' }, soruDugmeleri),
        el('div', { class: 'etiket' }, 'Konular'),
        el('div', { class: 'cipler' }, konuDugmeleri),
        el(
          'div',
          { class: 'ayar-satiri' },
          el(
            'div',
            { class: 'metin' },
            el('div', null, 'Kendi sorularımız da gelsin'),
            el('div', { class: 'alt-yazi' }, ozelOzeti(d))
          ),
          anahtar
        ),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
      ),
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Sorularım'),
        el('p', { class: 'soluk-yazi' }, 'Kendi sorunu yaz, oyunda ikinize de sorulsun. Şu an ' + benimSayim + ' sorun var.'),
        el('button', { class: 'dugme ikincil genis', onclick: () => sorularimAc() }, 'Sorularımı düzenle')
      ),
      ikiKisi ? null : el('p', { class: 'slogan' }, 'Bu oyun iki kişilik.'),
      sahipMi
        ? el(
            'button',
            {
              class: 'dugme birincil genis',
              disabled: !ikiKisi,
              onclick: () => k.hamle({ tip: 'baslat' }),
            },
            'Oyunu başlat'
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca oyun açılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Oyun ekranları
  // -------------------------------------------------------------------------

  function skorSeridi(d, ben) {
    const es = 1 - ben;
    const kutu = (i) =>
      el(
        'div',
        { class: 'oyuncu' },
        el('div', { class: 'ad' }, i === ben ? d.oyuncular[i].ad + ' (sen)' : d.oyuncular[i].ad),
        el('div', { class: 'sayi' }, String(d.oyuncular[i].puan))
      );
    return el(
      'div',
      { class: 'tanis-skor' },
      kutu(ben),
      el('div', { class: 'orta' }, 'Soru', el('br'), el('strong', null, d.tur + 1 + '/' + d.sorular.length)),
      kutu(es)
    );
  }

  function ilerlemeCubugu(d) {
    const parcalar = d.sorular.map((soru, t) => {
      let sinif = '';
      if (t < d.tur || (t === d.tur && d.asama === 'acik')) {
        sinif = 'biten';
      } else if (t === d.tur) {
        sinif = 'simdiki';
      }
      return el('span', { class: sinif });
    });
    return el('div', { class: 'tanis-ilerleme', 'aria-hidden': 'true' }, parcalar);
  }

  function soruKarti(soru) {
    const konu = soru.kategori === 'ozel' ? 'Kendi sorumuz' : konuAdi(soru.kategori);
    return el('div', { class: 'tanis-soru' }, el('div', { class: 'konu' }, konu), el('div', { class: 'metin' }, soru.soru));
  }

  function seciminiHazirla(d) {
    const anahtar = istemci.kod + ':' + d.sorular[d.tur].id + ':' + d.tur;
    if (durumum.secim.anahtar !== anahtar) {
      durumum.secim = { anahtar: anahtar, kendi: null, tahmin: null };
    }
    return durumum.secim;
  }

  function cevapFormu(d, soru, es) {
    const secim = seciminiHazirla(d);
    const esAd = d.oyuncular[es].ad;

    const gonder = el(
      'button',
      {
        class: 'dugme birincil genis',
        disabled: secim.kendi === null || secim.tahmin === null,
        onclick: () => {
          if (secim.kendi === null || secim.tahmin === null) {
            return;
          }
          k.hamle({ tip: 'cevapla', tur: d.tur, kendi: secim.kendi, tahmin: secim.tahmin });
        },
      },
      'Gönder'
    );

    function grup(baslik, sinif, alan) {
      const dugmeler = soru.secenekler.map((metin, i) =>
        el(
          'button',
          {
            class: 'tanis-secenek',
            'aria-pressed': secim[alan] === i ? 'true' : 'false',
            onclick: () => {
              secim[alan] = i;
              dugmeler.forEach((dugme, j) => {
                dugme.setAttribute('aria-pressed', j === i ? 'true' : 'false');
              });
              gonder.disabled = secim.kendi === null || secim.tahmin === null;
            },
          },
          metin
        )
      );
      return el('div', { class: 'tanis-grup ' + sinif }, el('h3', null, baslik), el('div', { class: 'tanis-secenekler' }, dugmeler));
    }

    const esDurumu = d.cevaplar[d.tur][es] ? esAd + ' cevapladı ✓' : esAd + ' cevaplıyor…';

    return [
      grup('Senin cevabın', 'kendi', 'kendi'),
      grup('Sence ' + esAd + ' ne dedi?', 'tahmin', 'tahmin'),
      el('div', { class: 'tanis-alt' }, el('div', { class: 'tanis-durum' }, esDurumu), gonder),
    ];
  }

  function beklemeBolumu(d, soru, ben, es) {
    const benim = d.cevaplar[d.tur][ben];
    const esAd = d.oyuncular[es].ad;
    return [
      el(
        'div',
        { class: 'tanis-sonuc' },
        el('div', { class: 'baslik' }, 'Cevabın gönderildi ✓'),
        el('div', { class: 'etiket' }, 'Senin cevabın'),
        el('div', { class: 'cevap' }, soru.secenekler[benim.kendi]),
        el('div', { class: 'etiket' }, 'Sence ' + esAd + ' dedi'),
        el('div', { class: 'cevap' }, soru.secenekler[benim.tahmin])
      ),
      el('div', { class: 'tanis-bekle', 'aria-live': 'polite' }, el('span', { class: 'nokta-nabiz' }), esAd + ' cevaplıyor…'),
    ];
  }

  // Bir oyuncunun kutusu: kendi cevabı ve eşinin tahmini
  function oyuncuSonucu(d, soru, sonuc, i, ben) {
    const es = 1 - i;
    const dogru = sonuc.dogru[es];
    const ad = d.oyuncular[i].ad;
    return el(
      'div',
      { class: 'tanis-sonuc' },
      el('div', { class: 'baslik' }, i === ben ? ad + ' (sen)' : ad),
      el('div', { class: 'etiket' }, 'Cevabı'),
      el('div', { class: 'cevap' }, soru.secenekler[sonuc.kendi[i]]),
      el(
        'div',
        { class: dogru ? 'tanis-tahmin dogru' : 'tanis-tahmin yanlis' },
        el('span', { class: 'isaret', 'aria-label': dogru ? 'doğru' : 'yanlış' }, dogru ? '✓' : '✗'),
        el('span', { class: 'metin' }, d.oyuncular[es].ad + ' tahmin etti: ' + soru.secenekler[sonuc.tahmin[es]]),
        dogru ? el('span', { class: 'artis' }, '+1') : null
      )
    );
  }

  function acikBolum(d, soru, ben) {
    const sonuc = turSonucu(d, d.tur);
    const sonSoru = d.tur + 1 >= d.sorular.length;
    return [
      sonuc.ayni ? el('div', { class: 'tanis-not' }, 'Aynı cevap!') : null,
      oyuncuSonucu(d, soru, sonuc, ben, ben),
      oyuncuSonucu(d, soru, sonuc, 1 - ben, ben),
      soru.yazar !== null ? el('p', { class: 'soluk-yazi ortala' }, 'Soruyu ' + d.oyuncular[soru.yazar].ad + ' yazdı.') : null,
      el(
        'div',
        { class: 'tanis-alt' },
        el(
          'button',
          { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'sonraki', tur: d.tur }) },
          sonSoru ? 'Sonuçları gör' : 'Sonraki soru'
        )
      ),
    ];
  }

  function turEkrani(d, ben) {
    const soru = d.sorular[d.tur];
    const es = 1 - ben;
    let alt;
    if (d.asama === 'acik') {
      alt = acikBolum(d, soru, ben);
    } else if (d.cevaplar[d.tur][ben]) {
      alt = beklemeBolumu(d, soru, ben, es);
    } else {
      alt = cevapFormu(d, soru, es);
    }
    return el('div', { class: 'tanis-sayfa' }, skorSeridi(d, ben), ilerlemeCubugu(d), soruKarti(soru), alt);
  }

  function bitisEkrani(d, ben) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    const yuzde = uyumYuzdesi(d);
    const toplamSoru = d.sorular.length;
    const konusun = konusulacaklar(d);

    const puanSatiri = (i) =>
      el(
        'div',
        { class: 'puan-satiri' },
        el('span', { class: 'ad' }, i === ben ? d.oyuncular[i].ad + ' (sen)' : d.oyuncular[i].ad),
        el('span', { class: 'soluk-yazi' }, 'doğru tahmin'),
        el('span', { class: 'toplam' }, d.oyuncular[i].puan + '/' + toplamSoru)
      );

    const konusunKayitlari = konusun.map((x) => {
      const satirlar = [0, 1].map((i) => {
        const es = 1 - i;
        const kacirdi = !x.dogru[es];
        return el(
          'div',
          { class: 'cevap-satiri' },
          el('strong', null, d.oyuncular[i].ad + ': '),
          x.soru.secenekler[x.kendi[i]],
          kacirdi ? el('span', { class: 'soluk-yazi' }, ' · ' + d.oyuncular[es].ad + ' farklı düşünmüştü') : null
        );
      });
      return el('li', { class: 'konusun' }, el('div', { class: 'soru' }, x.soru.soru), satirlar);
    });

    return el(
      'div',
      { class: 'tanis-sayfa' },
      el(
        'div',
        { class: 'tanis-uyum' },
        el('div', { class: 'buyuk-emoji' }, '💞'),
        el('div', { class: 'etiket' }, 'Uyum'),
        el('div', { class: 'yuzde' }, '%' + yuzde),
        el('p', { class: 'uyum-yazi' }, uyumEtiketi(yuzde))
      ),
      el('div', { class: 'puan-tablosu' }, puanSatiri(ben), puanSatiri(1 - ben)),
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Bunları konuşun'),
        konusun.length === 0
          ? el('p', { class: 'soluk-yazi' }, 'Hepsini doğru bildiniz. Konuşacak yanlış kalmadı!')
          : el('ul', { class: 'konusun-listesi' }, konusunKayitlari)
      ),
      sahipMi
        ? el(
            'div',
            { class: 'tanis-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // Tüm sayfa (üst çubuk dahil): cevap, açık ve bitti aşamaları
  function sayfa(d, ben) {
    const govde = d.asama === 'bitti' ? bitisEkrani(d, ben) : turEkrani(d, ben);
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.sorularimAcik = false;
    durumum.sonGonderilen = null;
    durumum.secim = { anahtar: '', kendi: null, tahmin: null };
    taslagiSifirla();
    clearTimeout(esitleZamanlayici);
  }

  return {
    lobiBolumu: lobiBolumu,
    sorularimEkrani: sorularimEkrani,
    sorularimAcikMi: () => durumum.sorularimAcik,
    sorularimiKapat: () => {
      durumum.sorularimAcik = false;
    },
    yazimSurerken: yazimSurerken,
    ozelEsitle: ozelEsitle,
    sayfa: sayfa,
    sifirla: sifirla,
  };
}

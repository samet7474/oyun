// gorev-ekran.js - "Gizli Görev" ekranları.
// Oyun kuralları gorev.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Gizlilik: ekran yalnız gorev.js'teki ekranVerisi / sonucVerisi yardımcılarından beslenir.
// Başkasının görevleri oyun bitene kadar hiçbir yerde çizilmez.

import { onayIste } from './onay.js';
import {
  GOREV_PUANI,
  HEDEFLER,
  MAKS_TAHMIN_HARF,
  SURELER,
  YAKALAMA_HAKKI,
  ZORLUK_ADLARI,
  ekranVerisi,
  kalanMs,
  sonucVerisi,
  sureYazisi,
  tahminHatasi,
} from './gorev.js';

const NASIL_OYNANIR = [
  'Herkesin elinde 3 gizli görev var: bir kolay, bir orta, bir zor. Görevleri sohbet ederken, yüz yüze ya da mesajla yaparsınız.',
  'Görevi yaptığını düşünürsen "Yaptım"a bas. Diğerleri "Oldu mu?" diye sorulur. Kabul edilirse puan alırsın ve yeni bir görev gelir.',
  'Kolay görev 1, orta görev 2, zor görev 3 puandır.',
  'Birinin görev yapmaya çalıştığını fark edersen "Yakaladım"a bas, kimden şüphelendiğini ve tahminini yaz. Doğruysa 1 puan alırsın ve onun görevi yanar. 3 hakkın var.',
  'Beğenmediğin bir görevi oyun boyunca bir kez değiştirebilirsin.',
  'Oyun bitince herkesin tamamladığı görevler açılır.',
];

// Zorluk renkleri (kartın sol şeridi ve etiketi)
const NEDEN_YAZILARI = {
  hedef: 'Hedef puana ilk ulaşan oyunu aldı.',
  sure: 'Süre bitti.',
  sahip: 'Ev sahibi oyunu bitirdi.',
};

export function gorevEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    yakalaAcik: false, // "Yakaladım" paneli açık mı
    yakalaHedef: '', // şüphelendiğim oyuncunun kimliği
    tahmin: '', // yazdığım tahmin
    gonderiliyor: false,
    nasilAcik: true,
    soruImzasi: '', // son çizimde bana gelen soruların imzası
    sureGonderiliyor: false, // süre bitti hareketi yolda mı
  };

  // -------------------------------------------------------------------------
  // Küçük yardımcılar
  // -------------------------------------------------------------------------

  // Tahmin kutusunda imleç varsa bırakır. iOS'ta düğmeye basmak odağı kutudan almaz;
  // "yazım sürüyor" kancası da odaktaki kutu yüzünden çizimi atlar, bu yüzden basılan düğmenin
  // sonucu (kapanan panel, yeni durum) görünmez. Düğmeye basılınca odağı biz bırakırız.
  function odagiBirak() {
    const aktif = document.activeElement;
    if (aktif && aktif.tagName === 'INPUT' && aktif.classList.contains('gv-tahmin')) {
      aktif.blur();
    }
  }

  function hamleGonder(eylem) {
    odagiBirak();
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
      { class: 'gv-nasil', open: acik },
      el('summary', null, 'Nasıl oynanır?'),
      el('ul', null, NASIL_OYNANIR.map((satir) => el('li', null, satir)))
    );
    kutu.addEventListener('toggle', () => {
      durumum.nasilAcik = kutu.open;
    });
    return kutu;
  }

  function zorlukEtiketi(zorluk) {
    return el('span', { class: 'gv-etiket ' + zorluk }, ZORLUK_ADLARI[zorluk] + ' · ' + GOREV_PUANI[zorluk] + ' puan');
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function lobiBolumu(d, sahipMi) {
    const bitisDugmeleri = [
      { deger: 'puan', ad: 'Hedef puan' },
      { deger: 'sure', ad: 'Süre' },
    ].map((secenek) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.bitis === secenek.deger ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { bitis: secenek.deger } }),
        },
        secenek.ad
      )
    );

    let altDugmeler;
    let altEtiket;
    if (d.ayar.bitis === 'puan') {
      altEtiket = 'Önce kaç puana ulaşan kazansın?';
      altDugmeler = HEDEFLER.map((hedef) =>
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
    } else {
      altEtiket = 'Oyun kaç dakika sürsün? Süre bitince en çok puan alan kazanır.';
      altDugmeler = SURELER.map((sure) =>
        el(
          'button',
          {
            class: 'secenek',
            'aria-pressed': d.ayar.sure === sure ? 'true' : 'false',
            disabled: !sahipMi,
            onclick: () => k.hamle({ tip: 'ayarla', ayar: { sure: sure } }),
          },
          sure + ' dakika'
        )
      );
    }

    const yeterli = d.oyuncular.length >= 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Bu oyun ekranın dışında oynanır. Sohbet ederken gizli görevlerini yapmaya çalışırsın.'),
        el('div', { class: 'etiket' }, 'Oyun nasıl bitsin?'),
        el('div', { class: 'secenekler' }, bitisDugmeleri),
        el('div', { class: 'etiket' }, altEtiket),
        el('div', { class: 'secenekler' }, altDugmeler),
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
        : el('p', { class: 'slogan' }, 'Ev sahibi oyunu başlatınca görevler dağıtılır.'),
    ];
  }

  // -------------------------------------------------------------------------
  // Oyun ekranı
  // -------------------------------------------------------------------------

  // Üstteki şerit: kalan süre ya da hedef
  function ustSerit(d) {
    if (d.ayar.bitis === 'sure') {
      return el(
        'div',
        { class: 'gv-ust' },
        el('span', null, 'Kalan süre'),
        el('span', { class: 'gv-sure' }, sureYazisi(kalanMs(d, Date.now())))
      );
    }
    return el('div', { class: 'gv-ust' }, el('span', null, 'Hedef'), el('span', { class: 'gv-hedef' }, d.ayar.hedef + ' puan'));
  }

  // Ekranın üstüne çıkan sorular: onaylar ve yakalama
  function soruKartlari(veri) {
    const kartlar = [];
    for (const onay of veri.sorular.onaylar) {
      kartlar.push(
        el(
          'div',
          { class: 'gv-soru', role: 'group', 'aria-label': 'Onay sorusu' },
          el('p', { class: 'gv-soru-yazi' }, el('b', null, onay.ad), ' şu görevi yaptığını söylüyor: ', el('b', null, onay.metin), ' Oldu mu?'),
          el(
            'div',
            { class: 'satir' },
            el('button', { class: 'dugme iyi', onclick: () => hamleGonder({ tip: 'onay', no: onay.no, evet: true }) }, 'Oldu'),
            el('button', { class: 'dugme kotu', onclick: () => hamleGonder({ tip: 'onay', no: onay.no, evet: false }) }, 'Olmadı')
          )
        )
      );
    }
    for (const y of veri.sorular.yakalamalar) {
      const secimler = y.gorevler.map((g) =>
        el(
          'button',
          {
            class: 'dugme ikincil genis gv-secim ' + g.zorluk,
            onclick: () => hamleGonder({ tip: 'yakalamaCevap', no: y.no, evet: true, zorluk: g.zorluk }),
          },
          'Evet, bu görevimdi: ' + g.metin
        )
      );
      kartlar.push(
        el(
          'div',
          { class: 'gv-soru yakala', role: 'group', 'aria-label': 'Yakalama sorusu' },
          el('p', { class: 'gv-soru-yazi' }, el('b', null, y.ad), ' senden şüpheleniyor ve şunu yazdı:'),
          el('p', { class: 'gv-tahmin-yazi' }, '"' + y.tahmin + '"'),
          el('p', { class: 'gv-soru-yazi' }, 'Bu senin görevlerinden biri miydi?'),
          secimler,
          el('button', { class: 'dugme genis', onclick: () => hamleGonder({ tip: 'yakalamaCevap', no: y.no, evet: false }) }, 'Hayır')
        )
      );
    }
    return kartlar;
  }

  function puanTablosu(d, veri) {
    const sirali = veri.oyuncular
      .map((o) => o)
      .sort((a, b) => b.puan - a.puan);
    return el(
      'ul',
      { class: 'gv-tablo', 'aria-label': 'Puan tablosu' },
      sirali.map((o) =>
        el(
          'li',
          { class: o.ben ? 'gv-satir ben' : 'gv-satir' },
          el('span', { class: 'ad' }, o.ben ? o.ad + ' (sen)' : o.ad),
          el('span', { class: 'gorev-sayisi' }, o.tamamlanan + ' görev'),
          el('span', { class: 'puan' }, d.ayar.bitis === 'puan' ? o.puan + ' / ' + d.ayar.hedef : String(o.puan))
        )
      )
    );
  }

  function gorevKarti(g, veri) {
    if (!g.metin) {
      return el(
        'div',
        { class: 'gv-gorev ' + g.zorluk + ' bos' },
        zorlukEtiketi(g.zorluk),
        el('p', { class: 'gv-gorev-metin' }, 'Yeni görev kalmadı.')
      );
    }
    return el(
      'div',
      { class: 'gv-gorev ' + g.zorluk },
      zorlukEtiketi(g.zorluk),
      el('p', { class: 'gv-gorev-metin' }, g.metin),
      g.onayBekliyor ? el('p', { class: 'gv-bekliyor' }, 'Onay bekleniyor…') : null,
      el(
        'div',
        { class: 'gv-gorev-dugmeler' },
        el(
          'button',
          {
            class: 'dugme birincil gv-yaptim',
            disabled: g.onayBekliyor,
            onclick: () => hamleGonder({ tip: 'yaptim', zorluk: g.zorluk }),
          },
          'Yaptım'
        ),
        veri.degistirmeHakki > 0
          ? el(
              'button',
              {
                class: 'dugme ikincil gv-degistir',
                disabled: g.onayBekliyor,
                onclick: () => hamleGonder({ tip: 'degistir', zorluk: g.zorluk }),
              },
              'Değiştir'
            )
          : null
      )
    );
  }

  // "Yakaladım" paneli: kimden şüphelendiğini seç, tahmini yaz
  function yakalaBolumu(d, veri, ben) {
    const hak = veri.yakalamaHakki;
    const digerleri = veri.oyuncular.map((o, i) => ({ o: o, i: i })).filter((x) => x.i !== ben);

    if (!durumum.yakalaAcik) {
      return el(
        'button',
        {
          class: 'dugme ikincil genis gv-yakala-dugme',
          disabled: hak <= 0 || veri.yakalamaBekliyor,
          onclick: () => {
            durumum.yakalaAcik = true;
            k.render();
          },
        },
        veri.yakalamaBekliyor ? 'Yakaladım (cevap bekleniyor…)' : 'Yakaladım (' + hak + '/' + YAKALAMA_HAKKI + ' hakkın var)'
      );
    }

    // Tek rakip varsa onu kendiliğinden seç
    if (digerleri.length === 1) {
      durumum.yakalaHedef = digerleri[0].o.id;
    }
    if (!digerleri.some((x) => x.o.id === durumum.yakalaHedef)) {
      durumum.yakalaHedef = '';
    }

    const hedefDugmeleri = digerleri.map((x) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': durumum.yakalaHedef === x.o.id ? 'true' : 'false',
          onclick: () => {
            odagiBirak();
            durumum.yakalaHedef = x.o.id;
            k.render();
          },
        },
        x.o.ad
      )
    );

    const girdi = el('input', {
      class: 'girdi gv-tahmin',
      type: 'text',
      maxlength: MAKS_TAHMIN_HARF,
      placeholder: 'Ne yapmaya çalışıyor sence?',
      value: durumum.tahmin,
      autocomplete: 'off',
      'aria-label': 'Tahminin',
    });
    girdi.addEventListener('input', () => {
      durumum.tahmin = girdi.value;
    });
    girdi.addEventListener('keydown', (olay) => {
      if (olay.key === 'Enter' && !olay.repeat) {
        olay.preventDefault();
        yakalaGonder();
      }
    });
    // Klavye kapanınca (düğmeye basma payı bırakarak) bekleyen güncellemeyi çiz
    girdi.addEventListener('blur', () => {
      setTimeout(() => k.render(), 300);
    });

    function yakalaGonder() {
      if (durumum.gonderiliyor) {
        k.bekleyenUyari();
        return;
      }
      if (durumum.yakalaHedef === '') {
        k.mesajGoster('Önce kimden şüphelendiğini seç.');
        return;
      }
      // Boş ya da çok uzun tahmin: kutu açık kalsın, uyarı çıksın
      const tahminSorunu = tahminHatasi(girdi.value);
      if (tahminSorunu) {
        k.mesajGoster(tahminSorunu);
        return;
      }
      durumum.gonderiliyor = true;
      hamleGonder({ tip: 'yakala', hedef: durumum.yakalaHedef, tahmin: girdi.value }).then((sonuc) => {
        durumum.gonderiliyor = false;
        if (sonuc && sonuc.ok) {
          durumum.yakalaAcik = false;
          durumum.tahmin = '';
          durumum.yakalaHedef = '';
          k.mesajGoster('Tahminin gönderildi.');
          k.render();
        }
      });
    }

    return el(
      'div',
      { class: 'kutu gv-yakala-panel' },
      el('h2', null, 'Yakaladım'),
      digerleri.length > 1 ? el('div', { class: 'etiket' }, 'Kimden şüpheleniyorsun?') : null,
      digerleri.length > 1 ? el('div', { class: 'secenekler' }, hedefDugmeleri) : null,
      el('div', { class: 'etiket' }, 'Tahminin (en fazla ' + MAKS_TAHMIN_HARF + ' harf). Kalan hakkın: ' + hak),
      girdi,
      el(
        'div',
        { class: 'satir' },
        el('button', { class: 'dugme birincil', onclick: () => yakalaGonder() }, 'Gönder'),
        el(
          'button',
          {
            class: 'dugme ikincil',
            onclick: () => {
              odagiBirak();
              durumum.yakalaAcik = false;
              k.render();
            },
          },
          'Vazgeç'
        )
      )
    );
  }

  function haberListesi(veri) {
    if (veri.haberler.length === 0) {
      return null;
    }
    const son = veri.haberler.slice().reverse();
    return el(
      'div',
      { class: 'kutu gv-haberler' },
      el('h2', null, 'Son olanlar'),
      el('ul', null, son.map((h) => el('li', null, h.metin)))
    );
  }

  function oyunEkrani(d, ben) {
    const veri = ekranVerisi(d, ben);
    const sahipMi = d.sahip === istemci.oyuncuId;
    durumum.soruImzasi = soruImzasi(veri);

    return el(
      'div',
      { class: 'gv-sayfa' },
      ustSerit(d),
      soruKartlari(veri),
      puanTablosu(d, veri),
      el('h2', { class: 'gv-baslik' }, 'Gizli görevlerin'),
      el('div', { class: 'gv-gorevler' }, veri.gorevler.map((g) => gorevKarti(g, veri))),
      yakalaBolumu(d, veri, ben),
      haberListesi(veri),
      nasilOynanirKutusu(durumum.nasilAcik),
      sahipMi
        ? el(
            'button',
            {
              class: 'dugme ikincil genis gv-bitir',
              onclick: () => {
                onayIste('Oyun şimdi bitecek ve puanlara göre sonuç çıkacak. Emin misin?', {
                  tamam: 'Oyunu bitir',
                  iptal: 'Vazgeç',
                  tehlikeli: true,
                }).then((evet) => {
                  if (evet) {
                    hamleGonder({ tip: 'bitir' });
                  }
                });
              },
            },
            'Oyunu bitir'
          )
        : null
    );
  }

  // Bana gelen soruların kısa imzası: yeni bir soru gelince ekran baştan çizilsin
  function soruImzasi(veri) {
    const onaylar = veri.sorular.onaylar.map((o) => 'o' + o.no);
    const yakalamalar = veri.sorular.yakalamalar.map((y) => 'y' + y.no);
    return onaylar.concat(yakalamalar).join(',');
  }

  // Tahmin yazarken gelen oda güncellemeleri kutuyu bozup klavyeyi kapatmasın.
  // Bana yeni bir soru geldiyse yine de baştan çizilir.
  function yazimSurerken(d, ben) {
    if (!d || d.oyun !== 'gorev' || d.asama !== 'oyun' || ben < 0) {
      return false;
    }
    const aktif = document.activeElement;
    if (!aktif || aktif.tagName !== 'INPUT' || !aktif.classList.contains('gv-tahmin')) {
      return false;
    }
    return soruImzasi(ekranVerisi(d, ben)) === durumum.soruImzasi;
  }

  // -------------------------------------------------------------------------
  // Oyun sonu
  // -------------------------------------------------------------------------

  function bitisEkrani(d, ben) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    const sonuc = sonucVerisi(d);
    const kazananAdlari = sonuc.kazananlar.map((i) => d.oyuncular[i].ad);
    const baslik = kazananAdlari.length === 1 ? kazananAdlari[0] + ' kazandı!' : 'Berabere: ' + kazananAdlari.join(', ');

    const tablo = el(
      'ul',
      { class: 'gv-tablo', 'aria-label': 'Puan tablosu' },
      sonuc.sira.map((o) =>
        el(
          'li',
          { class: o.idx === ben ? 'gv-satir ben' : 'gv-satir' },
          el('span', { class: 'ad' }, (sonuc.kazananlar.includes(o.idx) ? '★ ' : '') + (o.idx === ben ? o.ad + ' (sen)' : o.ad)),
          el('span', { class: 'gorev-sayisi' }, o.tamamlananlar.length + ' görev'),
          el('span', { class: 'puan' }, String(o.puan))
        )
      )
    );

    const gorevKutulari = sonuc.sira.map((o) =>
      el(
        'div',
        { class: 'kutu gv-yapilanlar' },
        el('h2', null, o.ad + ' (' + o.puan + ' puan)'),
        o.tamamlananlar.length > 0
          ? el(
              'ul',
              null,
              o.tamamlananlar.map((t) => el('li', { class: t.zorluk }, el('span', { class: 'gv-etiket ' + t.zorluk }, '+' + GOREV_PUANI[t.zorluk]), t.metin))
            )
          : el('p', { class: 'soluk-yazi' }, 'Tamamlanan görev yok.')
      )
    );

    return el(
      'div',
      { class: 'gv-sayfa sonuc' },
      el(
        'div',
        { class: 'gv-kazanan' },
        el('div', { class: 'etiket' }, 'Oyun bitti'),
        el('div', { class: 'ad' }, baslik),
        el('p', { class: 'soluk-yazi' }, NEDEN_YAZILARI[sonuc.neden] || '')
      ),
      tablo,
      el('h2', { class: 'gv-baslik' }, 'Yapılan görevler'),
      gorevKutulari,
      sahipMi
        ? el(
            'div',
            { class: 'gv-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // Tüm sayfa (üst çubuk dahil): oyun ve bitti aşamaları
  function sayfa(d, ben) {
    // Oyun bitince yakalama paneli kapanır ve boşalır: yeni oyun temiz başlasın
    if (d.asama === 'bitti') {
      durumum.yakalaAcik = false;
      durumum.yakalaHedef = '';
      durumum.tahmin = '';
    }
    const govde = d.asama === 'bitti' ? bitisEkrani(d, ben) : oyunEkrani(d, ben);
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.yakalaAcik = false;
    durumum.yakalaHedef = '';
    durumum.tahmin = '';
    durumum.gonderiliyor = false;
    durumum.nasilAcik = true;
    durumum.soruImzasi = '';
    durumum.sureGonderiliyor = false;
  }

  // -------------------------------------------------------------------------
  // Geri sayım: her saniye süreyi tazeler; süre bitince oyunu bitirmeyi dener
  // -------------------------------------------------------------------------

  setInterval(() => {
    const d = istemci.durum;
    if (!istemci.kod || !d || d.oyun !== 'gorev' || d.asama !== 'oyun' || d.ayar.bitis !== 'sure') {
      return;
    }
    const kalan = kalanMs(d, Date.now());
    const oge = document.querySelector('.gv-sure');
    if (oge) {
      oge.textContent = sureYazisi(kalan);
    }
    if (kalan <= 0 && !durumum.sureGonderiliyor && k.benimIndeks() >= 0) {
      durumum.sureGonderiliyor = true;
      k.hamle({ tip: 'sureBitir' }).then(() => {
        // Başarısız olursa (bağlantı, saat farkı) birkaç saniye sonra yeniden denenir
        setTimeout(() => {
          durumum.sureGonderiliyor = false;
        }, 3000);
      });
    }
  }, 1000);

  return {
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
    yazimSurerken: yazimSurerken,
  };
}

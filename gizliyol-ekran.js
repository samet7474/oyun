// gizliyol-ekran.js - "Gizli Yol" ekranları.
// Oyun kuralları gizliyol.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Gizlilik: rakibin yolu, tur bitene kadar hiçbir yerde çizilmez.
// Bulma ekranında yalnız benim bulduğum doğru kareler (yolun başı) ve kırmızı işaretler çıkar.

import { onayIste } from './onay.js';
import {
  ALT_SATIR,
  PES_HATASI,
  TAHTA,
  TUR_SAYILARI,
  UST_SATIR,
  YOL_UZUNLUKLARI,
  kareAnahtari,
  kareUyarisi,
  komsuMu,
  oyuncuDurumu,
  oyunKazananlari,
  rakipIndeks,
  yolHatasi,
} from './gizliyol.js';

// "Nasıl oynanır" metni (lobide ve oyun ekranlarında aynı)
const NASIL_OYNANIR = [
  'Önce herkes gizli bir yol çizer: alt satırdan başlar, üst satırda biter.',
  'Yol karelerden oluşur. Her kare bir öncekinin yanında, üstünde ya da altında olur. Çapraz gidilmez. Aynı kareden iki kez geçilmez.',
  'Sonra ikiniz de aynı anda birbirinizin yolunu bulmaya çalışırsınız. Önce alt satırda başlangıç karesini bul.',
  'Doğru kare yeşil yanar, bir sonraki kareyi aramaya devam edersin.',
  'Yanlış kareye basarsan başa dönersin. Bulduğun kareler tekrar gizlenir. Ama kırmızı işaret yerinde kalır, bu sana ipucu olur.',
  'Yolun sonuna, üst satıra ulaşan bitirir. İkiniz de bitirince daha az hata yapan turu alır.',
];

export function gizliyolEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    anahtar: '', // hangi oda ve turdaki taslak olduğu
    taslak: [], // kurmada çizdiğim yol (henüz gönderilmedi)
    mesaj: '', // tahtanın üstündeki küçük yazı
    mesajKotu: false, // mesaj bir uyarı mı
    gonderiliyor: false,
    gorulen: new Set(), // animasyonu oynamış kareler
    ilkCizim: true, // ilk çizimde mevcut kareler animasyonsuz gelir
    nasilAcik: false,
  };

  // -------------------------------------------------------------------------
  // Küçük yardımcılar
  // -------------------------------------------------------------------------

  function adGoster(d, i, ben) {
    return i === ben ? d.oyuncular[i].ad + ' (sen)' : d.oyuncular[i].ad;
  }

  function mesajKoy(metin, kotu) {
    durumum.mesaj = metin;
    durumum.mesajKotu = Boolean(kotu);
  }

  // Oda ya da tur değiştiyse taslağı ve mesajı temizle
  function turuHazirla(d) {
    const anahtar = istemci.kod + ':' + d.tur + ':' + d.asama;
    if (durumum.anahtar !== anahtar) {
      // Kurmadan bulmaya geçerken taslağın işi biter, her aşamada temiz başla
      durumum.anahtar = anahtar;
      durumum.taslak = [];
      mesajKoy('', false);
      durumum.gonderiliyor = false;
    }
  }

  // Bu kare ilk kez mi çiziliyor? İlk çizimde (sayfa açılışı) animasyon oynamaz.
  function yeniMi(anahtar) {
    if (durumum.gorulen.has(anahtar)) {
      return false;
    }
    durumum.gorulen.add(anahtar);
    return !durumum.ilkCizim;
  }

  function hamleGonder(eylem, sonra) {
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
      if (sonra) {
        sonra(sonuc);
      }
    });
  }

  function nasilOynanirKutusu() {
    const kutu = el(
      'details',
      { class: 'gy-nasil', open: durumum.nasilAcik },
      el('summary', null, 'Nasıl oynanır?'),
      el('ul', null, NASIL_OYNANIR.map((satir) => el('li', null, satir)))
    );
    kutu.addEventListener('toggle', () => {
      durumum.nasilAcik = kutu.open;
    });
    return kutu;
  }

  // -------------------------------------------------------------------------
  // Tahta: 6x6 kare
  //   hucre(satir, sutun) -> { sinif, yazi, etiket, tikla } (tikla yoksa kare dokunulmaz)
  // -------------------------------------------------------------------------

  function tahtaCiz(hucre, ek) {
    const kareler = [];
    for (let s = 0; s < TAHTA; s++) {
      for (let c = 0; c < TAHTA; c++) {
        const h = hucre(s, c);
        let sinif = 'gy-kare';
        if (s === UST_SATIR) {
          sinif += ' ust';
        }
        if (s === ALT_SATIR) {
          sinif += ' alt';
        }
        if (h.sinif) {
          sinif += ' ' + h.sinif;
        }
        const ozellik = { class: sinif, 'aria-label': h.etiket };
        if (h.tikla) {
          ozellik.onclick = h.tikla;
        } else {
          ozellik.disabled = true;
        }
        kareler.push(el('button', ozellik, h.yazi === undefined ? null : h.yazi));
      }
    }
    return el(
      'div',
      { class: 'gy-tahta-kutu' },
      el('div', { class: 'gy-uc ust-yazi' }, '▲ Üst satır: yolun sonu'),
      el('div', { class: 'gy-tahta ' + (ek || '') }, kareler),
      el('div', { class: 'gy-uc alt-yazi' }, '▼ Alt satır: yolun başı')
    );
  }

  function kareEtiketi(s, c) {
    return 'Satır ' + (s + 1) + ', sütun ' + (c + 1);
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

    const uzunlukDugmeleri = YOL_UZUNLUKLARI.map((sayi) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': d.ayar.enAzKare === sayi ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { enAzKare: sayi } }),
        },
        (sayi === YOL_UZUNLUKLARI[0] ? 'Kısa' : 'Uzun') + ' (' + sayi + ' kare)'
      )
    );

    const yeterli = d.oyuncular.length === 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Herkes gizli bir yol çizer, sonra birbirinizin yolunu bulursunuz. Az hata yapan kazanır.'),
        el('div', { class: 'etiket' }, 'Tur sayısı'),
        el('div', { class: 'secenekler' }, turDugmeleri),
        el('div', { class: 'etiket' }, 'Yolun uzunluğu (en az)'),
        el('div', { class: 'secenekler' }, uzunlukDugmeleri),
        sahipMi ? null : el('p', { class: 'soluk-yazi' }, 'Ayarları sadece ev sahibi değiştirir.')
      ),
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
  // Kurma: yolunu çiz
  // -------------------------------------------------------------------------

  // Çizim sırasında kareye dokunma
  function kurmaDokun(s, c) {
    const d = istemci.durum;
    if (!d || d.asama !== 'kurma' || d.hazir[k.benimIndeks()]) {
      return;
    }
    const yol = durumum.taslak;
    const son = yol[yol.length - 1];

    if (son && son[0] === s && son[1] === c) {
      // Son kareye dokunmak bir adım geri alır
      yol.pop();
      mesajKoy('', false);
      k.render();
      return;
    }
    if (!son) {
      if (s !== ALT_SATIR) {
        mesajKoy('Yol alt satırdan başlar. Alttaki satırdan bir kare seç.', true);
        k.render();
        return;
      }
    } else if (yol.some((kare) => kare[0] === s && kare[1] === c)) {
      mesajKoy('Bu kareden zaten geçtin. Geri almak için son kareye dokun.', true);
      k.render();
      return;
    } else if (!komsuMu(son, [s, c])) {
      mesajKoy('Son karenin yanındaki, üstündeki ya da altındaki bir kareyi seç.', true);
      k.render();
      return;
    }
    yol.push([s, c]);
    mesajKoy('', false);
    k.render();
  }

  function taslakYazisi(d) {
    const yol = durumum.taslak;
    if (yol.length === 0) {
      return 'Alt satırdan bir kare seçerek yola başla.';
    }
    const sorun = yolHatasi(yol, d.ayar.enAzKare);
    if (sorun === null) {
      return yol.length + ' kare. Yolun hazır, "Hazırım"a basabilirsin.';
    }
    if (yol[yol.length - 1][0] !== UST_SATIR) {
      return yol.length + ' kare. Yolu üst satıra kadar sürdür.';
    }
    return yol.length + ' kare. ' + sorun;
  }

  function kurmaEkrani(d, ben) {
    const rakip = rakipIndeks(ben);
    const hazirim = d.hazir[ben];
    const yol = hazirim ? d.yollar[ben] : durumum.taslak;
    const sira = new Map();
    yol.forEach((kare, i) => sira.set(kareAnahtari(kare[0], kare[1]), i));
    const son = yol[yol.length - 1];

    const tahta = tahtaCiz((s, c) => {
      const i = sira.get(kareAnahtari(s, c));
      const h = { etiket: kareEtiketi(s, c) };
      if (i !== undefined) {
        h.sinif = 'yol';
        if (i === yol.length - 1) {
          h.sinif += ' son';
        }
        h.yazi = String(i + 1);
      } else if (!hazirim && son && komsuMu(son, [s, c])) {
        h.sinif = 'olabilir';
      } else if (!hazirim && !son && s === ALT_SATIR) {
        h.sinif = 'olabilir';
      }
      if (!hazirim) {
        h.tikla = () => kurmaDokun(s, c);
      }
      return h;
    }, 'kurma');

    let alt;
    if (hazirim) {
      alt = el(
        'div',
        { class: 'gy-alt' },
        el(
          'div',
          { class: 'tanis-bekle', 'aria-live': 'polite' },
          el('span', { class: 'nokta-nabiz' }),
          d.oyuncular[rakip].ad + ' yolunu çiziyor…'
        ),
        el(
          'button',
          {
            class: 'dugme ikincil genis',
            onclick: () => {
              // Yolu taslağa geri al, böylece baştan çizmek gerekmez
              durumum.taslak = d.yollar[ben].map((kare) => [kare[0], kare[1]]);
              hamleGonder({ tip: 'hazirIptal', tur: d.tur });
            },
          },
          'Yolu değiştir'
        )
      );
    } else {
      const gecerli = yolHatasi(durumum.taslak, d.ayar.enAzKare) === null;
      alt = el(
        'div',
        { class: 'gy-alt' },
        el(
          'div',
          { class: 'gy-dugmeler' },
          el(
            'button',
            {
              class: 'dugme ikincil',
              disabled: durumum.taslak.length === 0,
              onclick: () => {
                durumum.taslak = [];
                mesajKoy('', false);
                k.render();
              },
            },
            'Temizle'
          ),
          el(
            'button',
            {
              class: 'dugme birincil',
              disabled: !gecerli,
              onclick: () => hamleGonder({ tip: 'hazir', tur: d.tur, yol: durumum.taslak.map((kare) => [kare[0], kare[1]]) }),
            },
            'Hazırım'
          )
        ),
        d.hazir[rakip] ? el('div', { class: 'gy-durum iyi' }, d.oyuncular[rakip].ad + ' hazır ✓') : null
      );
    }

    const bilgi = hazirim ? 'Yolun hazır. Rakibin hazır olunca oyun başlar.' : taslakYazisi(d);
    const mesaj = durumum.mesaj ? durumum.mesaj : bilgi;
    const mesajSinifi = durumum.mesaj && durumum.mesajKotu ? 'gy-mesaj kotu' : 'gy-mesaj';

    return el(
      'div',
      { class: 'gy-sayfa' },
      el('div', { class: 'gy-ust' }, el('span', null, 'Tur ' + (d.tur + 1) + '/' + d.ayar.turSayisi), el('span', null, 'Yolunu çiz')),
      el('div', { class: mesajSinifi, role: 'status', 'aria-live': 'polite' }, mesaj),
      tahta,
      alt,
      nasilOynanirKutusu()
    );
  }

  // -------------------------------------------------------------------------
  // Bulma: rakibin yolunu ara
  // -------------------------------------------------------------------------

  // Rakibin ilerlemesi (hangi kareler olduğu görünmez)
  function rakipKarti(d, i) {
    const durum = oyuncuDurumu(d, i);
    let yazi = durum.bulunan + ' kare ilerledi · ' + durum.hata + ' hata';
    let sinif = 'gy-rakip';
    if (durum.pes) {
      yazi = 'pes etti · ' + durum.hata + ' hata';
      sinif += ' bitti';
    } else if (durum.bitti) {
      yazi = 'yolu buldu ✓ · ' + durum.hata + ' hata';
      sinif += ' cozdu';
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
      el('div', { class: 'durum' }, yazi)
    );
  }

  // Bulma sırasında kareye dokunma
  function bulmaDokun(s, c) {
    const d = istemci.durum;
    const ben = k.benimIndeks();
    if (!d || d.asama !== 'bulma' || ben < 0 || oyuncuDurumu(d, ben).bitti) {
      return;
    }
    const uyari = kareUyarisi(d, ben, s, c);
    if (uyari) {
      mesajKoy(uyari.hata, true);
      k.render();
      return;
    }
    const onceki = oyuncuDurumu(d, ben);
    const tur = d.tur;
    hamleGonder({ tip: 'kare', tur: tur, satir: s, sutun: c }, () => {
      const yeni = istemci.durum;
      if (!yeni || yeni.tur !== tur || yeni.asama === 'kurma') {
        return;
      }
      const simdi = oyuncuDurumu(yeni, ben);
      if (simdi.hata > onceki.hata) {
        mesajKoy('Yanlış kare! Başa döndün. Kırmızı işaret yerinde kalır.', true);
      } else {
        mesajKoy('', false);
      }
      k.render();
    });
  }

  function bulmaEkrani(d, ben) {
    const rakip = rakipIndeks(ben);
    const durum = oyuncuDurumu(d, ben);
    const ilerleme = d.bulma[ben];
    const oynuyorum = !durum.bitti;
    const hedef = d.yollar[rakip];

    // Bulduğum kareler (rakibin yolunun başı) ve kalıcı işaretler
    const bulunanlar = new Map();
    for (let i = 0; i < ilerleme.bulunan; i++) {
      bulunanlar.set(kareAnahtari(hedef[i][0], hedef[i][1]), i);
    }
    const isaretler = new Map();
    ilerleme.yanlislar.forEach((y, n) => isaretler.set(kareAnahtari(y.satir, y.sutun), n));

    const tahta = tahtaCiz((s, c) => {
      const anahtar = kareAnahtari(s, c);
      const h = { etiket: kareEtiketi(s, c) };
      if (bulunanlar.has(anahtar)) {
        const i = bulunanlar.get(anahtar);
        h.sinif = 'dogru';
        if (yeniMi(d.tur + ':d:' + anahtar + ':' + ilerleme.hata + ':' + i)) {
          h.sinif += ' parla';
        }
        h.yazi = String(i + 1);
      } else if (isaretler.has(anahtar)) {
        h.sinif = 'yanlis';
        if (yeniMi(d.tur + ':y:' + anahtar + ':' + isaretler.get(anahtar))) {
          h.sinif += ' sallan';
        }
        h.yazi = '✕';
      }
      if (oynuyorum) {
        h.tikla = () => bulmaDokun(s, c);
      }
      return h;
    }, 'bulma');

    // Mesaj yoksa nerede olduğumuzu söyle
    let bilgi;
    if (ilerleme.bulunan === 0) {
      bilgi = 'Alt satırda yolun başlangıç karesini bul.';
    } else {
      bilgi = 'Son bulduğun karenin yanındaki kareye dokun.';
    }
    const mesaj = durumum.mesaj ? durumum.mesaj : bilgi;
    const mesajSinifi = durumum.mesaj && durumum.mesajKotu ? 'gy-mesaj kotu' : 'gy-mesaj';

    // Altta: ben oynuyorsam sayaçlar, bitirdiysem bekleme
    let alt;
    if (oynuyorum) {
      alt = el(
        'div',
        { class: 'gy-alt' },
        el(
          'div',
          { class: 'gy-sayac' },
          el('span', null, 'Bulduğun: ' + durum.bulunan + ' kare'),
          el('span', { class: durum.hata > 0 ? 'kotu' : null }, 'Hata: ' + durum.hata)
        ),
        durum.pesEdebilir
          ? el(
              'button',
              {
                class: 'dugme ikincil genis',
                onclick: () => {
                  onayIste('Pes edersen bu tur ' + PES_HATASI + ' hata sayılır. Emin misin?', {
                    tamam: 'Pes et',
                    iptal: 'Devam et',
                    tehlikeli: true,
                  }).then((evet) => {
                    if (evet) {
                      hamleGonder({ tip: 'pes', tur: d.tur });
                    }
                  });
                },
              },
              'Pes et'
            )
          : null
      );
    } else {
      const bekleyen = d.oyuncular.filter((o, i) => !oyuncuDurumu(d, i).bitti).length;
      const baslik = durum.pes ? 'Pes ettin. Bu tur ' + PES_HATASI + ' hata sayılır.' : 'Yolu buldun ✓ ' + durum.hata + ' hatayla.';
      alt = el(
        'div',
        { class: 'gy-alt' },
        el('div', { class: durum.pes ? 'gy-durum' : 'gy-durum iyi' }, baslik),
        el(
          'div',
          { class: 'tanis-bekle', 'aria-live': 'polite' },
          el('span', { class: 'nokta-nabiz' }),
          bekleyen > 0 ? d.oyuncular[rakip].ad + ' hâlâ arıyor…' : 'Sonuçlar geliyor…'
        )
      );
    }

    return el(
      'div',
      { class: 'gy-sayfa' },
      el('div', { class: 'gy-ust' }, el('span', null, 'Tur ' + (d.tur + 1) + '/' + d.ayar.turSayisi), el('span', null, d.oyuncular[ben].puan + ' puanın var')),
      rakipKarti(d, rakip),
      el('div', { class: mesajSinifi, role: 'status', 'aria-live': 'polite' }, mesaj),
      tahta,
      alt,
      nasilOynanirKutusu()
    );
  }

  // -------------------------------------------------------------------------
  // Sonuç: tur bitti, iki yol da açık
  // -------------------------------------------------------------------------

  // Açık tahta: bir oyuncunun yolu ve karşı tarafın o yolda yaptığı hatalar
  function acikTahta(yol, yanlislar, ek) {
    const sira = new Map();
    yol.forEach((kare, i) => sira.set(kareAnahtari(kare[0], kare[1]), i));
    const isaretler = new Set(yanlislar.map((y) => kareAnahtari(y.satir, y.sutun)));
    return tahtaCiz((s, c) => {
      const anahtar = kareAnahtari(s, c);
      const h = { etiket: kareEtiketi(s, c) };
      const yolda = sira.has(anahtar);
      const hatali = isaretler.has(anahtar);
      if (yolda && hatali) {
        h.sinif = 'yol hatali';
        h.yazi = String(sira.get(anahtar) + 1);
      } else if (yolda) {
        h.sinif = 'yol';
        h.yazi = String(sira.get(anahtar) + 1);
      } else if (hatali) {
        h.sinif = 'yanlis';
        h.yazi = '✕';
      }
      return h;
    }, 'acik ' + (ek || ''));
  }

  function turKazananMetni(d, g, ben) {
    if (g.kazanan < 0) {
      return 'Berabere: ikiniz de ' + g.hatalar[0] + ' hata yaptınız.';
    }
    if (g.kazanan === ben) {
      return 'Bu turu sen kazandın! (' + g.hatalar[ben] + ' hataya karşı ' + g.hatalar[rakipIndeks(ben)] + ')';
    }
    return d.oyuncular[g.kazanan].ad + ' kazandı. (' + g.hatalar[g.kazanan] + ' hataya karşı ' + g.hatalar[rakipIndeks(g.kazanan)] + ')';
  }

  // Puan tablosu (çok puandan aza). vurgulu: öne çıkan oyuncu indeksleri.
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
    const rakip = rakipIndeks(ben);
    const sonTur = d.tur + 1 >= d.ayar.turSayisi;

    return el(
      'div',
      { class: 'gy-sayfa sonuc' },
      el('div', { class: 'gy-ust' }, el('span', null, 'Tur ' + (d.tur + 1) + '/' + d.ayar.turSayisi), el('span', null, 'Sonuç')),
      el('p', { class: 'gy-kazanan' }, turKazananMetni(d, g, ben)),
      el(
        'div',
        { class: 'gy-yol-kutusu' },
        el('h2', null, 'Senin yolun'),
        el('p', { class: 'soluk-yazi' }, d.oyuncular[rakip].ad + ' bunu bulmaya çalıştı. Kırmızı ✕ işaretler onun yanlış bastığı kareler.'),
        acikTahta(d.yollar[ben], d.bulma[rakip].yanlislar)
      ),
      el(
        'div',
        { class: 'gy-yol-kutusu' },
        el('h2', null, d.oyuncular[rakip].ad + ' oyuncusunun yolu'),
        el('p', { class: 'soluk-yazi' }, 'Sen bunu bulmaya çalıştın. Kırmızı ✕ işaretler senin yanlış bastığın kareler.'),
        acikTahta(d.yollar[rakip], d.bulma[ben].yanlislar)
      ),
      puanTablosu(d, ben, g.kazanan >= 0 ? [g.kazanan] : [], { artis: true }),
      el(
        'div',
        { class: 'gy-alt' },
        el(
          'button',
          { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'sonraki', tur: d.tur }) },
          sonTur ? 'Sonuçları gör' : 'Sonraki tur'
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
        { class: 'gy-ozet' },
        el('div', { class: 'tur' }, t + 1 + '. tur'),
        el(
          'div',
          { class: 'hatalar' },
          d.oyuncular.map((o, i) =>
            el('span', { class: g.kazanan === i ? 'hata kazanan' : 'hata' }, o.ad + ' ' + g.hatalar[i] + ' hata')
          )
        )
      )
    );

    return el(
      'div',
      { class: 'gy-sayfa sonuc' },
      el(
        'div',
        { class: 'tanis-uyum' },
        el('div', { class: 'buyuk-emoji' }, berabere ? '🤝' : '🏆'),
        el('div', { class: 'uyum-yazi' }, baslik),
        berabere ? el('p', { class: 'soluk-yazi' }, 'İkiniz de ' + d.oyuncular[0].puan + ' tur aldınız.') : null
      ),
      puanTablosu(d, ben, kazananlar, { etiket: 'tur kazandı' }),
      el('div', { class: 'kutu' }, el('h2', null, 'Turlar'), el('ul', { class: 'gy-ozet-listesi' }, ozet)),
      sahipMi
        ? el(
            'div',
            { class: 'gy-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'tekrarOyna' }) }, 'Tekrar oyna'),
            el('button', { class: 'dugme ikincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi yeni oyunu başlatacak.')
    );
  }

  // Tüm sayfa (üst çubuk dahil): kurma, bulma, acik ve bitti aşamaları
  function sayfa(d, ben) {
    turuHazirla(d);
    let govde;
    if (d.asama === 'bitti') {
      govde = bitisEkrani(d, ben);
    } else if (d.asama === 'acik') {
      govde = acikEkrani(d, ben);
    } else if (d.asama === 'bulma') {
      govde = bulmaEkrani(d, ben);
    } else {
      govde = kurmaEkrani(d, ben);
    }
    durumum.ilkCizim = false;
    return [k.ustCubuk(), govde];
  }

  // Oda değişince ya da oyundan çıkınca ekranın kendi hafızasını sıfırla
  function sifirla() {
    durumum.anahtar = '';
    durumum.taslak = [];
    mesajKoy('', false);
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

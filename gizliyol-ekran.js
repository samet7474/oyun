// gizliyol-ekran.js - "Gizli Yol" ekranları.
// Oyun kuralları gizliyol.js içindedir; burada sadece göstermek var.
// app.js ortak yardımcıları (el, hamle, istemci...) kur() ile verir, böylece bu dosya app.js'i çağırmaz.
//
// Gizlilik: rakibin yolu, tur bitene kadar yalnız "Bak" süresince görünür.
// Çözme ekranında yalnız benim bulduğum doğru kutular ve kırmızı işaretler çıkar.

import { onayIste } from './onay.js';
import {
  EN_AZ_BAKMA_SURESI,
  EN_COK_BAKMA_SURESI,
  PES_HATASI,
  SATIR_SAYILARI,
  SUTUN_SAYISI,
  TUR_SAYILARI,
  bakmaSuresiOku,
  eskiDurumMu,
  kareUyarisi,
  oyuncuDurumu,
  oyunKazananlari,
  rakipIndeks,
  satirSayisiOku,
  siradakiSatir,
  turSayisiOku,
  yolHatasi,
} from './gizliyol.js';

// "Nasıl oynanır" metni (lobide ve oyun ekranlarında aynı)
const NASIL_OYNANIR = [
  'Önce her satırdan bir kutu seçersin. Seçtiğin kutular senin gizli yolundur.',
  'Rakibin de kendi yolunu seçer. Sonra birbirinizin yolunu bulmaya çalışırsınız.',
  '"Bak"a basarsan rakibin yolu birkaç saniye görünür. Aklında tut! Bak sadece bir kez kullanılır.',
  'Tahmine başlarsan Bak hakkın gider.',
  'En alttaki satırdan başlarsın. Doğru kutu yeşil olur, bir üst satıra geçersin.',
  'Yanlış kutu kırmızı çarpı olur ve hata sayılır. Aynı satırda tekrar denersin.',
  'Tüm satırları bulunca bitirirsin. Daha az hata yapan turu kazanır.',
];

export function gizliyolEkraniKur(k) {
  const el = k.el;
  const istemci = k.istemci;

  // Ekranın kendi hafızası (oda durumunda tutulmaz)
  const durumum = {
    anahtar: '', // hangi oda, tur ve aşamadaki taslak olduğu
    taslak: [], // kurmada seçtiğim yol (satır başına sütun ya da null), henüz gönderilmedi
    mesaj: '', // tahtanın üstündeki küçük yazı
    mesajKotu: false, // mesaj bir uyarı mı
    gonderiliyor: false,
    gorulen: new Set(), // animasyonu oynamış kutular
    ilkCizim: true, // ilk çizimde mevcut kutular animasyonsuz gelir
    nasilAcik: false,
    sayimBitis: 0, // çalışan geri sayımın bitiş anı (ms)
    sayimId: null, // geri sayım zamanlayıcısı
    kaydiriciTutuluyor: 0, // Bak süresi kaydırıcısına parmak değdiği an (ms), 0 = değmiyor
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

  function bosTaslak(n) {
    const taslak = [];
    for (let i = 0; i < n; i++) {
      taslak.push(null);
    }
    return taslak;
  }

  // Oda, tur ya da aşama değiştiyse taslağı ve mesajı temizle
  function turuHazirla(d) {
    const anahtar = istemci.kod + ':' + d.tur + ':' + d.asama;
    if (durumum.anahtar !== anahtar) {
      durumum.anahtar = anahtar;
      // Kurma ekranına ilk girişte taslak boş başlar. "Yolu değiştir" taslağı kendisi doldurur.
      if (d.asama === 'kurma') {
        durumum.taslak = bosTaslak(satirSayisiOku(d));
      }
      mesajKoy('', false);
      durumum.gonderiliyor = false;
    }
  }

  // Bu kutu ilk kez mi çiziliyor? İlk çizimde (sayfa açılışı) animasyon oynamaz.
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
  // Tahta: 6 sütun, 8 ya da 10 satır. Soldaki küçük sayı alttan sayılır (1 = en alt satır).
  //   hucre(satir, sutun) -> { sinif, yazi, etiket, tikla } (tikla yoksa kutu dokunulmaz)
  //   secenek: { sira: sıradaki satır (vurgulanır), ek: ek sınıf }
  // -------------------------------------------------------------------------

  function satirNo(satirSayisi, s) {
    return satirSayisi - s;
  }

  function tahtaCiz(satirSayisi, hucre, secenek) {
    const ayar = secenek || {};
    const ogeler = [];
    for (let s = 0; s < satirSayisi; s++) {
      const sirada = ayar.sira === s;
      ogeler.push(el('div', { class: sirada ? 'gy-satir-no sira' : 'gy-satir-no' }, String(satirNo(satirSayisi, s))));
      for (let c = 0; c < SUTUN_SAYISI; c++) {
        const h = hucre(s, c);
        let sinif = 'gy-kare';
        if (sirada) {
          sinif += ' sira-satir';
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
        ogeler.push(el('button', ozellik, h.yazi === undefined ? null : h.yazi));
      }
    }
    return el(
      'div',
      { class: 'gy-tahta-kutu' },
      el('div', { class: 'gy-tahta ' + (ayar.ek || ''), style: '--gy-yuk: ' + (satirSayisi > 8 ? 40 : 44) + 'px' }, ogeler)
    );
  }

  function kareEtiketi(satirSayisi, s, c) {
    return 'Alttan ' + satirNo(satirSayisi, s) + '. satır, ' + (c + 1) + '. sütun';
  }

  // -------------------------------------------------------------------------
  // Lobi: oyuna özel bölüm (oyun seçici ve oyuncular app.js'te)
  // -------------------------------------------------------------------------

  function secenekDugmeleri(liste, secili, sahipMi, yaz, ayarAdi) {
    return liste.map((sayi) =>
      el(
        'button',
        {
          class: 'secenek',
          'aria-pressed': secili === sayi ? 'true' : 'false',
          disabled: !sahipMi,
          onclick: () => k.hamle({ tip: 'ayarla', ayar: { [ayarAdi]: sayi } }),
        },
        yaz(sayi)
      )
    );
  }

  // Parmak kaldırıldı: bekleyen oda güncellemesi varsa şimdi çizilir
  function kaydiriciBirak() {
    if (durumum.kaydiriciTutuluyor === 0) {
      return;
    }
    durumum.kaydiriciTutuluyor = 0;
    setTimeout(() => k.render(), 100);
  }

  // Parmak şu an kaydırıcıda mı? (app.js render'ı bu sırada çizimi atlar.)
  // Bırakma olayı hiç gelmezse (sekme değişti vb.) 15 saniye sonra kendiliğinden biter.
  function kaydiriciSurukleniyor() {
    const baslangic = durumum.kaydiriciTutuluyor;
    return baslangic !== 0 && Date.now() - baslangic < 15000;
  }

  // Bak süresi: ses ayarı gibi kaydırılarak seçilir.
  // Kaydırırken yalnız yazı değişir; parmak bırakılınca ayar odaya yazılır.
  function bakmaKaydiricisi(d, sahipMi) {
    const sure = bakmaSuresiOku(d);
    const yazi = el('span', { class: 'gy-kaydirici-deger' }, sure + ' sn');
    const kaydirici = el('input', {
      class: 'gy-kaydirici',
      type: 'range',
      min: String(EN_AZ_BAKMA_SURESI),
      max: String(EN_COK_BAKMA_SURESI),
      step: '1',
      value: String(sure),
      disabled: !sahipMi,
      'aria-label': 'Bak süresi (saniye)',
      oninput: (olay) => {
        yazi.textContent = olay.target.value + ' sn';
      },
      // Parmak kaydırıcıdayken gelen oda güncellemesi kaydırıcıyı eski değere zıplatmasın
      onpointerdown: () => {
        durumum.kaydiriciTutuluyor = Date.now();
      },
      onpointerup: () => kaydiriciBirak(),
      onpointercancel: () => kaydiriciBirak(),
      onchange: (olay) => {
        const yeni = Number(olay.target.value);
        if (yeni !== bakmaSuresiOku(istemci.durum)) {
          k.hamle({ tip: 'ayarla', ayar: { bakmaSuresi: yeni } });
        }
      },
    });
    return el('div', { class: 'gy-kaydirici-satir' }, kaydirici, yazi);
  }

  function lobiBolumu(d, sahipMi) {
    const yeterli = d.oyuncular.length === 2;

    return [
      el(
        'div',
        { class: 'kutu' },
        el('h2', null, 'Ayarlar'),
        el('p', { class: 'soluk-yazi' }, 'Her satırdan bir kutu seçip gizli yolunu kurarsın. Sonra birbirinizin yolunu bulursunuz. Az hata yapan kazanır.'),
        el('div', { class: 'etiket' }, 'Tur sayısı'),
        el('div', { class: 'secenekler' }, secenekDugmeleri(TUR_SAYILARI, turSayisiOku(d), sahipMi, (n) => String(n), 'turSayisi')),
        el('div', { class: 'etiket' }, 'Tahta büyüklüğü'),
        el('div', { class: 'secenekler' }, secenekDugmeleri(SATIR_SAYILARI, satirSayisiOku(d), sahipMi, (n) => n + ' satır', 'satirSayisi')),
        el('div', { class: 'etiket' }, 'Bak süresi'),
        bakmaKaydiricisi(d, sahipMi),
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
  // Eski kurallarla başlamış oda
  // -------------------------------------------------------------------------

  function eskiOdaEkrani(d) {
    const sahipMi = d.sahip === istemci.oyuncuId;
    return el(
      'div',
      { class: 'gy-sayfa' },
      el('div', { class: 'gy-mesaj kotu' }, 'Bu oyun eski kurallarla başlamıştı. Yeni kurallarla devam edemez.'),
      sahipMi
        ? el(
            'div',
            { class: 'gy-alt' },
            el('button', { class: 'dugme birincil genis', onclick: () => k.hamle({ tip: 'yeniOyun' }) }, 'Lobiye dön')
          )
        : el('p', { class: 'slogan' }, 'Ev sahibi lobiye döndürecek.')
    );
  }

  // -------------------------------------------------------------------------
  // Kurma: her satırdan bir kutu seç
  // -------------------------------------------------------------------------

  // Taslakta kaç satır seçili
  function secilenSayisi() {
    return durumum.taslak.filter((s) => s !== null && s !== undefined).length;
  }

  // Kurma sırasında kutuya dokunma: o satırdaki seçim bu kutu olur, aynı kutuya tekrar dokunmak kaldırır
  function kurmaDokun(s, c) {
    const d = istemci.durum;
    if (!d || d.asama !== 'kurma' || d.hazir[k.benimIndeks()]) {
      return;
    }
    durumum.taslak[s] = durumum.taslak[s] === c ? null : c;
    mesajKoy('', false);
    k.render();
  }

  function kurmaEkrani(d, ben) {
    const rakip = rakipIndeks(ben);
    const satirSayisi = satirSayisiOku(d);
    const hazirim = d.hazir[ben];
    const yol = hazirim ? d.yollar[ben] : durumum.taslak;
    const eksikSatir = yol.findIndex((s) => s === null || s === undefined);

    const tahta = tahtaCiz(
      satirSayisi,
      (s, c) => {
        const h = { etiket: kareEtiketi(satirSayisi, s, c) };
        if (yol[s] === c) {
          h.sinif = 'secili';
          h.yazi = '●';
        }
        if (!hazirim) {
          h.tikla = () => kurmaDokun(s, c);
        }
        return h;
      },
      { ek: 'kurma' }
    );

    const tamam = yolHatasi(durumum.taslak, satirSayisi) === null;

    let alt;
    if (hazirim) {
      alt = el(
        'div',
        { class: 'gy-alt' },
        el(
          'div',
          { class: 'tanis-bekle', 'aria-live': 'polite' },
          el('span', { class: 'nokta-nabiz' }),
          d.oyuncular[rakip].ad + ' yolunu seçiyor…'
        ),
        el(
          'button',
          {
            class: 'dugme ikincil genis',
            onclick: () => {
              // Yolu taslağa geri al, böylece baştan seçmek gerekmez
              durumum.taslak = d.yollar[ben].slice();
              hamleGonder({ tip: 'hazirIptal', tur: d.tur });
            },
          },
          'Yolu değiştir'
        )
      );
    } else {
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
              disabled: secilenSayisi() === 0,
              onclick: () => {
                durumum.taslak = bosTaslak(satirSayisi);
                mesajKoy('', false);
                k.render();
              },
            },
            'Temizle'
          ),
          el(
            'button',
            {
              class: 'dugme ikincil',
              onclick: () => {
                // Her satıra rastgele bir kutu
                durumum.taslak = bosTaslak(satirSayisi).map(() => Math.floor(Math.random() * SUTUN_SAYISI));
                mesajKoy('', false);
                k.render();
              },
            },
            'Rastgele doldur'
          ),
          el(
            'button',
            {
              class: 'dugme birincil',
              disabled: !tamam,
              onclick: () => hamleGonder({ tip: 'hazir', tur: d.tur, yol: durumum.taslak.slice() }),
            },
            'Hazırım'
          )
        ),
        d.hazir[rakip] ? el('div', { class: 'gy-durum iyi' }, d.oyuncular[rakip].ad + ' hazır ✓') : null
      );
    }

    const secilen = hazirim ? satirSayisi : secilenSayisi();
    const sayac = el(
      'div',
      { class: secilen === satirSayisi ? 'gy-yol-sayac iyi' : 'gy-yol-sayac' },
      'Seçilen: ' + secilen + ' / ' + satirSayisi + ' satır'
    );

    let bilgi;
    if (hazirim) {
      bilgi = 'Yolun hazır. Rakibin hazır olunca oyun başlar.';
    } else if (tamam) {
      bilgi = 'Yolun hazır, "Hazırım"a basabilirsin.';
    } else if (eksikSatir >= 0) {
      bilgi = 'Her satırdan bir kutu seç. Kutuya tekrar dokunursan seçim kalkar.';
    } else {
      bilgi = 'Her satırdan bir kutu seç.';
    }
    const mesaj = durumum.mesaj ? durumum.mesaj : bilgi;
    const mesajSinifi = durumum.mesaj && durumum.mesajKotu ? 'gy-mesaj kotu' : 'gy-mesaj';

    return el(
      'div',
      { class: 'gy-sayfa' },
      el('div', { class: 'gy-ust' }, el('span', null, 'Tur ' + (d.tur + 1) + '/' + turSayisiOku(d)), el('span', null, 'Gizli yolunu seç')),
      el('div', { class: mesajSinifi, role: 'status', 'aria-live': 'polite' }, mesaj),
      sayac,
      tahta,
      alt,
      nasilOynanirKutusu()
    );
  }

  // -------------------------------------------------------------------------
  // Çözme: rakibin yolunu ara
  // -------------------------------------------------------------------------

  // Rakibin ilerlemesi (hangi kutular olduğu görünmez)
  function rakipKarti(d, i) {
    const durum = oyuncuDurumu(d, i);
    const satirSayisi = satirSayisiOku(d);
    let yazi = durum.bulunan + '/' + satirSayisi + ' satır · ' + durum.hata + ' hata';
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
        el('span', { class: 'ad' }, d.oyuncular[i].ad + (durum.bakti ? ' baktı' : '')),
        el('span', { class: 'puan-rozeti' }, d.oyuncular[i].puan + ' puan')
      ),
      el('div', { class: 'durum' }, yazi)
    );
  }

  // Çözme sırasında kutuya dokunma
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
        mesajKoy('Yanlış kutu! Aynı satırda tekrar dene.', true);
      } else {
        mesajKoy('', false);
      }
      k.render();
    });
  }

  // Bak'a bas: rakibin yolu süre boyunca görünür
  function bakDokun() {
    const d = istemci.durum;
    const ben = k.benimIndeks();
    if (!d || d.asama !== 'bulma' || ben < 0 || !oyuncuDurumu(d, ben).bakabilir) {
      return;
    }
    mesajKoy('', false);
    hamleGonder({ tip: 'bak', tur: d.tur, zaman: Date.now() }, () => k.render());
  }

  // Geri sayım: her çeyrek saniyede yazıyı günceller, süre bitince ekranı yeniler (yol gizlenir)
  function sayimiDurdur() {
    if (durumum.sayimId !== null) {
      clearInterval(durumum.sayimId);
      durumum.sayimId = null;
    }
    durumum.sayimBitis = 0;
  }

  function sayimiBaslat(bitis) {
    if (durumum.sayimId !== null && durumum.sayimBitis === bitis) {
      return; // zaten bu süre için çalışıyor
    }
    sayimiDurdur();
    durumum.sayimBitis = bitis;
    durumum.sayimId = setInterval(() => {
      const kalan = bitis - Date.now();
      if (kalan <= 0) {
        sayimiDurdur();
        k.render();
        return;
      }
      const yazi = document.querySelector('.gy-sayim-sn');
      if (yazi) {
        yazi.textContent = String(Math.ceil(kalan / 1000));
      }
    }, 250);
  }

  // Bak paneli: düğme, geri sayım ya da kısa bilgi
  function bakPaneli(d, durum, bitis) {
    if (durum.bitti) {
      return null;
    }
    const gorunuyor = bitis > Date.now();
    if (gorunuyor) {
      return el(
        'div',
        { class: 'gy-bak sayiyor', role: 'status' },
        el('span', { class: 'gy-sayim-sn' }, String(Math.ceil((bitis - Date.now()) / 1000))),
        el('span', { class: 'gy-bak-yazi' }, 'Rakibinin yolunu aklında tut!')
      );
    }
    if (durum.bakabilir) {
      return el(
        'div',
        { class: 'gy-bak' },
        el('button', { class: 'dugme birincil gy-bak-dugme', onclick: bakDokun }, '👁 Bak (' + bakmaSuresiOku(d) + ' sn)'),
        el('span', { class: 'gy-bak-yazi' }, 'Tahmine başlarsan Bak hakkın gider.')
      );
    }
    if (durum.bakti && !durum.tahminYapti) {
      return el('div', { class: 'gy-bak bitti' }, el('span', { class: 'gy-bak-yazi' }, 'Baktın. Şimdi alttan başla.'));
    }
    return null;
  }

  function bulmaEkrani(d, ben) {
    const rakip = rakipIndeks(ben);
    const durum = oyuncuDurumu(d, ben);
    const ilerleme = d.bulma[ben];
    const oynuyorum = !durum.bitti;
    const hedef = d.yollar[rakip];
    const satirSayisi = satirSayisiOku(d);
    const sirada = siradakiSatir(d, ben);

    // Bak süresi sürüyor mu? (bitiş anı, bakılan oyuncunun kendi saatine göre durumda tutulur)
    const bitis = durum.bakti && durum.bakmaZamani ? durum.bakmaZamani + bakmaSuresiOku(d) * 1000 : 0;
    const gorunuyor = oynuyorum && bitis > Date.now();
    if (gorunuyor) {
      sayimiBaslat(bitis);
    } else {
      sayimiDurdur();
    }

    // Kalıcı işaretler
    const isaretler = new Set(ilerleme.yanlislar.map((y) => y.satir + ',' + y.sutun));

    const tahta = tahtaCiz(
      satirSayisi,
      (s, c) => {
        const h = { etiket: kareEtiketi(satirSayisi, s, c) };
        const bulunduMu = sirada === null || s > sirada; // bu satır bulundu
        if (bulunduMu && hedef[s] === c) {
          h.sinif = 'dogru';
          if (yeniMi(d.tur + ':d:' + s)) {
            h.sinif += ' parla';
          }
          h.yazi = '✓';
        } else if (isaretler.has(s + ',' + c)) {
          h.sinif = 'yanlis';
          if (yeniMi(d.tur + ':y:' + s + ',' + c)) {
            h.sinif += ' sallan';
          }
          h.yazi = '✕';
        } else if (gorunuyor && hedef[s] === c) {
          // Bak süresi: rakibin yolu
          h.sinif = 'goster';
          h.yazi = '●';
        } else if (bulunduMu) {
          h.sinif = 'gec';
        }
        if (oynuyorum && !gorunuyor) {
          h.tikla = () => bulmaDokun(s, c);
        }
        return h;
      },
      { ek: 'bulma', sira: oynuyorum ? sirada : undefined }
    );

    // Mesaj yoksa nerede olduğumuzu söyle
    let bilgi;
    if (gorunuyor) {
      bilgi = 'Süre bitince yol gizlenir.';
    } else if (oynuyorum) {
      bilgi = 'Alttan ' + (ilerleme.bulunan + 1) + '. satırdaki doğru kutuyu bul.';
    } else {
      bilgi = '';
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
          el('span', null, 'Bulunan: ' + durum.bulunan + ' / ' + satirSayisi + ' satır'),
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
      el('div', { class: 'gy-ust' }, el('span', null, 'Tur ' + (d.tur + 1) + '/' + turSayisiOku(d)), el('span', null, d.oyuncular[ben].puan + ' puanın var')),
      rakipKarti(d, rakip),
      bakPaneli(d, durum, bitis),
      mesaj ? el('div', { class: mesajSinifi, role: 'status', 'aria-live': 'polite' }, mesaj) : null,
      tahta,
      alt,
      nasilOynanirKutusu()
    );
  }

  // -------------------------------------------------------------------------
  // Sonuç: tur bitti, iki yol da açık
  // -------------------------------------------------------------------------

  // Açık tahta: bir oyuncunun yolu ve karşı tarafın o yolda yaptığı hatalar
  function acikTahta(yol, yanlislar) {
    const satirSayisi = yol.length;
    const isaretler = new Set(yanlislar.map((y) => y.satir + ',' + y.sutun));
    return tahtaCiz(
      satirSayisi,
      (s, c) => {
        const h = { etiket: kareEtiketi(satirSayisi, s, c) };
        const yolda = yol[s] === c;
        const hatali = isaretler.has(s + ',' + c);
        if (yolda) {
          h.sinif = 'yol';
          h.yazi = '●';
        } else if (hatali) {
          h.sinif = 'yanlis';
          h.yazi = '✕';
        }
        return h;
      },
      { ek: 'acik' }
    );
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
    const sonTur = d.tur + 1 >= turSayisiOku(d);

    return el(
      'div',
      { class: 'gy-sayfa sonuc' },
      el('div', { class: 'gy-ust' }, el('span', null, 'Tur ' + (d.tur + 1) + '/' + turSayisiOku(d)), el('span', null, 'Sonuç')),
      el('p', { class: 'gy-kazanan' }, turKazananMetni(d, g, ben)),
      el(
        'div',
        { class: 'gy-yol-kutusu' },
        el('h2', null, 'Senin yolun'),
        el('p', { class: 'soluk-yazi' }, d.oyuncular[rakip].ad + ' bunu bulmaya çalıştı: ' + d.bulma[rakip].hata + ' hata. Kırmızı ✕ işaretler onun yanlış bastığı kutular.'),
        acikTahta(d.yollar[ben], d.bulma[rakip].yanlislar)
      ),
      el(
        'div',
        { class: 'gy-yol-kutusu' },
        el('h2', null, 'Rakibin yolu: ' + d.oyuncular[rakip].ad),
        el('p', { class: 'soluk-yazi' }, 'Sen bunu bulmaya çalıştın: ' + d.bulma[ben].hata + ' hata. Kırmızı ✕ işaretler senin yanlış bastığın kutular.'),
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

  // Tüm sayfa (üst çubuk dahil): kurma, çözme, açık ve bitti aşamaları
  function sayfa(d, ben) {
    let govde;
    if (eskiDurumMu(d)) {
      sayimiDurdur();
      govde = eskiOdaEkrani(d);
    } else {
      turuHazirla(d);
      if (d.asama !== 'bulma') {
        sayimiDurdur();
      }
      if (d.asama === 'bitti') {
        govde = bitisEkrani(d, ben);
      } else if (d.asama === 'acik') {
        govde = acikEkrani(d, ben);
      } else if (d.asama === 'bulma') {
        govde = bulmaEkrani(d, ben);
      } else {
        govde = kurmaEkrani(d, ben);
      }
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
    durumum.kaydiriciTutuluyor = 0;
    sayimiDurdur();
  }

  return {
    kaydiriciSurukleniyor: kaydiriciSurukleniyor,
    lobiBolumu: lobiBolumu,
    sayfa: sayfa,
    sifirla: sifirla,
  };
}

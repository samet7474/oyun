// onay.js - Sitenin kendi stilinde küçük onay penceresi (tarayıcının window.confirm penceresi yerine).
//
//   onayIste('Emin misin?', { tamam: 'Evet', iptal: 'Vazgeç', tehlikeli: true }).then((evet) => { ... });
//
// Söz (Promise) döner: "tamam"a basılırsa true, "iptal"e basılırsa, boşluğa dokunulursa ya da Esc'ye basılırsa false.
// Pencere body'ye eklenir (oyun ekranı yeniden çizilse de kaybolmaz).

let acikPencere = null;

function dugumYap(etiket, sinif, metin) {
  const dugum = document.createElement(etiket);
  if (sinif) {
    dugum.className = sinif;
  }
  if (metin !== undefined) {
    dugum.textContent = metin;
  }
  return dugum;
}

export function onayIste(metin, secenekler = {}) {
  // Aynı anda tek pencere: öncekini reddederek kapat
  if (acikPencere) {
    acikPencere(false);
  }
  const tamamYazisi = secenekler.tamam || 'Evet';
  const iptalYazisi = secenekler.iptal || 'Vazgeç';

  return new Promise((coz) => {
    const katman = dugumYap('div', 'katman onay-katmani');
    katman.setAttribute('role', 'alertdialog');
    katman.setAttribute('aria-modal', 'true');
    katman.setAttribute('aria-label', metin);

    const pano = dugumYap('div', 'pano onay-pano');
    const yazi = dugumYap('p', 'onay-yazi', metin);
    const iptal = dugumYap('button', 'dugme ikincil genis', iptalYazisi);
    const tamam = dugumYap('button', 'dugme genis ' + (secenekler.tehlikeli ? 'kotu' : 'birincil'), tamamYazisi);
    iptal.type = 'button';
    tamam.type = 'button';
    pano.append(yazi, tamam, iptal);
    katman.append(pano);

    function kapat(sonuc) {
      if (acikPencere !== kapat) {
        return;
      }
      acikPencere = null;
      document.removeEventListener('keydown', tusa, true);
      katman.remove();
      coz(sonuc);
    }

    function tusa(olay) {
      if (olay.key === 'Escape') {
        olay.preventDefault();
        kapat(false);
      }
    }

    tamam.addEventListener('click', () => kapat(true));
    iptal.addEventListener('click', () => kapat(false));
    // Pencerenin dışına (karartıya) dokunmak vazgeçmektir
    katman.addEventListener('click', (olay) => {
      if (olay.target === katman) {
        kapat(false);
      }
    });

    acikPencere = kapat;
    document.addEventListener('keydown', tusa, true);
    document.body.append(katman);
    // Yanlışlıkla onaylanmasın: odak "vazgeç"te başlar
    iptal.focus();
  });
}

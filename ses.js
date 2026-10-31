// ses.js - Çok kısa, yumuşak sesler (WebAudio ile üretilir, ses dosyası yok).
// Varsayılan kapalı. Tercih tarayıcıda saklanır (localStorage kapalıysa bellekte kalır).
//
//   sesAcikMi()        : ses açık mı
//   sesDegistir()      : aç/kapa; yeni durumu döndürür (açarken bir "tık" çalar)
//   sesCal(tur)        : 'sira' (sıra sana geldi) | 'kazan' (kazandın) | 'kotu' (yanlış ya da yıkıldı)
//   titret()           : kullanıcı sayfaya dokunduktan sonra kısa titreşim (önce dokunulmadıysa hiçbir şey yapmaz)

const ANAHTAR = 'oyun.ses';

let acik = false;
let baglam = null;
let dokunuldu = false;
let bellekDegeri = null;

// Tercihi oku (başlangıçta bir kez)
try {
  acik = localStorage.getItem(ANAHTAR) === '1';
} catch (hata) {
  acik = bellekDegeri === '1';
}

function tercihiYaz() {
  const deger = acik ? '1' : '0';
  try {
    localStorage.setItem(ANAHTAR, deger);
  } catch (hata) {
    bellekDegeri = deger;
  }
}

// Tarayıcılar ses ve titreşimi sayfaya ilk dokunuştan önce engeller.
// İlk dokunuşu bir kez yakalarız.
function dokunusuYakala(olay) {
  if (olay && olay.isTrusted === false) {
    return; // koddan üretilen olay gerçek dokunuş sayılmaz
  }
  dokunuldu = true;
  for (const olay of ['pointerdown', 'touchstart', 'keydown', 'click']) {
    window.removeEventListener(olay, dokunusuYakala, true);
  }
}

if (typeof window !== 'undefined') {
  for (const olay of ['pointerdown', 'touchstart', 'keydown', 'click']) {
    window.addEventListener(olay, dokunusuYakala, true);
  }
}

export function kullaniciDokundu() {
  return dokunuldu;
}

// Kısa titreşim: kullanıcı sayfaya dokunana kadar çağrılmaz (tarayıcı uyarı verirdi)
export function titret(sure = 80) {
  if (!dokunuldu) {
    return;
  }
  try {
    // Tarayıcı kendi kaydını tutuyorsa ona da bak: gerçek dokunuş olmadan titreşim çağrılmaz
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
      return;
    }
    if (navigator.vibrate) {
      navigator.vibrate(sure);
    }
  } catch (hata) {
    // titreşim yoksa sorun değil
  }
}

function baglamAl() {
  if (baglam) {
    return baglam;
  }
  const Sinif = window.AudioContext || window.webkitAudioContext;
  if (!Sinif) {
    return null;
  }
  try {
    baglam = new Sinif();
  } catch (hata) {
    baglam = null;
  }
  return baglam;
}

// Tek bir yumuşak nota: sinüs dalgası, hızlı giriş, yavaş sönüş
function nota(ac, frekans, baslangic, sure, yuksek) {
  const osilator = ac.createOscillator();
  const kazanc = ac.createGain();
  osilator.type = 'sine';
  osilator.frequency.setValueAtTime(frekans, ac.currentTime + baslangic);
  kazanc.gain.setValueAtTime(0.0001, ac.currentTime + baslangic);
  kazanc.gain.exponentialRampToValueAtTime(yuksek, ac.currentTime + baslangic + 0.02);
  kazanc.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + baslangic + sure);
  osilator.connect(kazanc);
  kazanc.connect(ac.destination);
  osilator.start(ac.currentTime + baslangic);
  osilator.stop(ac.currentTime + baslangic + sure + 0.05);
}

// Her sesin notaları: [frekans (Hz), başlangıç (sn), süre (sn)]
const SESLER = {
  sira: [
    [660, 0, 0.14],
    [880, 0.1, 0.2],
  ],
  kazan: [
    [523, 0, 0.16],
    [659, 0.12, 0.16],
    [784, 0.24, 0.16],
    [1047, 0.36, 0.34],
  ],
  kotu: [
    [330, 0, 0.16],
    [247, 0.13, 0.3],
  ],
  tik: [[740, 0, 0.08]],
};

export function sesAcikMi() {
  return acik;
}

export function sesCal(tur) {
  if (!acik || !dokunuldu) {
    return;
  }
  const notalar = SESLER[tur];
  const ac = baglamAl();
  if (!notalar || !ac) {
    return;
  }
  try {
    if (ac.state === 'suspended') {
      ac.resume();
    }
    for (const n of notalar) {
      nota(ac, n[0], n[1], n[2], 0.09);
    }
  } catch (hata) {
    // ses çalmazsa oyun etkilenmesin
  }
}

export function sesDegistir() {
  acik = !acik;
  tercihiYaz();
  if (acik) {
    // Bu çağrı bir dokunuştan geldiği için tarayıcı sesi artık serbest bırakır
    dokunuldu = true;
    sesCal('tik');
  }
  return acik;
}

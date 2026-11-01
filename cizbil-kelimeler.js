// cizbil-kelimeler.js - "Çiz Bil" kelime bankası.
// Hepsi çizilebilir, somut şeyler (soyut kavram yok). Küçük harfle, tek kelime ya da kısa ikili.
// Motor her çizim için buradan 3 seçenek çeker; odada çıkan kelimeler liste bitene kadar tekrar gelmez.

export const KELIMELER = [
  // Hayvanlar
  'kedi', 'köpek', 'balık', 'kuş', 'at', 'inek', 'koyun', 'tavuk', 'ördek', 'tavşan',
  'kaplumbağa', 'yılan', 'fil', 'zürafa', 'aslan', 'kaplan', 'maymun', 'ayı', 'penguen', 'baykuş',
  'kelebek', 'arı', 'örümcek', 'salyangoz', 'karınca', 'yengeç', 'ahtapot', 'balina', 'köpekbalığı', 'kurbağa',
  'deve', 'fare', 'kirpi', 'sincap', 'tilki', 'kartal', 'yunus', 'denizatı', 'uğur böceği', 'kanguru',

  // Yiyecek ve içecek
  'elma', 'muz', 'armut', 'çilek', 'karpuz', 'kiraz', 'üzüm', 'portakal', 'limon', 'ananas',
  'havuç', 'domates', 'mısır', 'patlıcan', 'biber', 'mantar', 'soğan', 'ekmek', 'peynir', 'yumurta',
  'pizza', 'hamburger', 'dondurma', 'pasta', 'kurabiye', 'simit', 'çay', 'kahve', 'süt', 'şeker',
  'lolipop', 'patlamış mısır', 'sandviç', 'makarna', 'çorba',

  // Ev ve eşya
  'masa', 'sandalye', 'yatak', 'kanepe', 'lamba', 'kapı', 'pencere', 'merdiven', 'saat', 'ayna',
  'televizyon', 'buzdolabı', 'çaydanlık', 'tencere', 'tava', 'kaşık', 'çatal', 'bıçak', 'tabak', 'bardak',
  'şişe', 'anahtar', 'kilit', 'makas', 'kalem', 'silgi', 'kitap', 'defter', 'zarf', 'mum',
  'şemsiye', 'çanta', 'valiz', 'yastık', 'battaniye', 'süpürge', 'kova', 'diş fırçası', 'tarak', 'havlu',
  'telefon', 'bilgisayar', 'kulaklık', 'fotoğraf makinesi', 'ampul', 'pil', 'priz', 'çekiç', 'tornavida', 'vida',

  // Giyim
  'şapka', 'gözlük', 'ayakkabı', 'çorap', 'eldiven', 'atkı', 'elbise', 'pantolon', 'tişört', 'kravat',
  'yüzük', 'kolye', 'bere', 'kemer', 'terlik',

  // Doğa ve gökyüzü
  'güneş', 'ay', 'yıldız', 'bulut', 'yağmur', 'kar tanesi', 'şimşek', 'gökkuşağı', 'dağ', 'deniz',
  'dalga', 'ada', 'nehir', 'göl', 'ağaç', 'çiçek', 'yaprak', 'kaktüs', 'orman', 'volkan',
  'şelale', 'ateş', 'taş', 'kum saati', 'palmiye',

  // Taşıtlar
  'araba', 'otobüs', 'bisiklet', 'motosiklet', 'tren', 'uçak', 'helikopter', 'gemi', 'tekne', 'roket',
  'kamyon', 'traktör', 'ambulans', 'itfaiye', 'balon', 'denizaltı', 'kaykay', 'paten',

  // Yerler ve yapılar
  'ev', 'okul', 'köprü', 'kale', 'çadır', 'deniz feneri', 'cami', 'kule', 'çeşme', 'park',

  // Vücut
  'göz', 'kulak', 'burun', 'ağız', 'el', 'ayak', 'diş', 'saç', 'kalp', 'bıyık',

  // Oyun, müzik, spor ve diğerleri
  'top', 'zar', 'uçurtma', 'oyuncak ayı', 'gitar', 'davul', 'piyano', 'keman', 'trompet', 'mikrofon',
  'futbol topu', 'basketbol potası', 'kupa', 'madalya', 'hediye', 'mektup', 'harita', 'pusula', 'çapa', 'bayrak',
  'taç', 'kılıç', 'kalkan', 'robot', 'uzaylı', 'hayalet', 'kardan adam', 'korsan', 'prenses', 'palyaço',
  'dürbün', 'mıknatıs', 'teleskop', 'çark', 'çan',
];

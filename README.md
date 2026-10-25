# UNO

İki kişi (en fazla dört kişi) kendi telefonundan aynı linki açıp resmi kurallarla UNO oynar.
Sunucu kodu yok: her hamle tarayıcıda hesaplanır ve Supabase tablosuna (`oyun_odalari`) yazılır.
GitHub Pages'te çalışır, derleme gerekmez.

## Nasıl oynanır
1. Adını yaz, **Oda kur**'a bas.
2. Çıkan linki ya da 4 harfli kodu eşine gönder. O da adını yazıp **Katıl**'a basar.
3. Ev sahibi ayarları seçer ve **Oyunu başlat**'a basar.
4. Sıra sendeyse parlayan bir kartı at ya da desteden kart çek. Çektiğin kartı atabilirsin, olmazsa **Pas** de.
5. Son iki karta düşünce **UNO!**'ya bas. Birisi basmayı unutursa **Yakala!** ile 2 kart yedirebilirsin.
6. Biri sana +4 atarsa **İtiraz et** ya da **Kabul et**.

Ayarlar: "+2'nin üstüne +2 koyma" (varsayılan kapalı), hedef puan 500 / 200 / Tek el.
Aynı tarayıcıdan aynı linke dönersen koltuğuna otursun diye kimliğin tarayıcıda saklanır.

## Testleri çalıştırma
```
node test/uno-test.js
```
Hata varsa çıkış kodu 1 olur.

## Dosyalar
- `index.html`: sayfa iskeleti, Supabase betiği
- `style.css`: tüm görünüm (kartlar dahil, resim yok)
- `app.js`: ekranlar, çizim, Supabase senkronu
- `uno.js`: oyun kuralları (saf motor, DOM ve ağ yok)
- `config.js`: Supabase adresi ve herkese açık anahtar
- `test/uno-test.js`: motor testleri
- `package.json`: node'un `uno.js`'i modül olarak okuması için

## Bilinen sınırlar
Tüm oyun durumu tek satırda durduğu için teknik olarak herkesin eli okunabilir; ekran başkasının kartını göstermez.

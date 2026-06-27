# Lingonbergets kulinariska samling

En stilren, **mörk receptapp** som körs i webbläsaren och kan installeras på hemskärmen som en
app — bäst på **iPhone och iPad**, men fungerar på alla plattformar. Byggd i ren HTML/CSS/JS utan
byggkedja, server eller API-nycklar. Släpps via **GitHub Pages**.

## Funktioner

- 📷 **Fotografera handskrivna recept** → text (OCR via Tesseract.js, svenska + engelska).
- 🖼️ **Infoga bilder** från kameran eller bildbiblioteket.
- 📄 **Importera PDF-recept** från OneDrive, iCloud/Filer eller annan media.
- 🔗 **Importera från länk** (t.ex. köket.se eller Pinterest) — läser receptets strukturerade data,
  med **klistra in-läge** som alltid fungerar.
- 🍽️ **Kategorier:** Förrätt, Huvudrätt, Efterrätt, Bakverk och Vegetariskt.
- ✍️ **Texteditor** med verktygsfält (rubrik, fet/kursiv, listor, färg, infoga bild) — samma
  princip som Baltic Yachts interna editor.
- ☁️ **Spara till iCloud Drive** (via Filer) och säkerhetskopiera hela samlingen.
- 🌙 Modernt mörkt tema, helskärm och offline-stöd när appen lagts till på hemskärmen.

## Kör lokalt

Appen behöver serveras över HTTP (service worker och kamera kräver det):

```bash
cd lingonbergets-kulinariska-samling
python3 -m http.server 8080
# öppna http://localhost:8080
```

## Publicera via GitHub (Pages)

1. Skapa ett nytt GitHub-repo, t.ex. `lingonbergets-kulinariska-samling`.
2. Lägg **innehållet i den här mappen i repo-roten** (så att `index.html` ligger i roten), och pusha:
   ```bash
   git init
   git add .
   git commit -m "Lingonbergets kulinariska samling"
   git branch -M main
   git remote add origin https://github.com/<DITT-KONTO>/<REPO>.git
   git push -u origin main
   ```
3. I repo:t: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   Det medföljande arbetsflödet (`.github/workflows/pages.yml`) bygger och publicerar automatiskt.
4. Efter någon minut finns appen på `https://<DITT-KONTO>.github.io/<REPO>/`.

## Installera på iPhone / iPad

1. Öppna Pages-URL:en i **Safari**.
2. Tryck på **Dela** → **Lägg till på hemskärmen**.
3. Starta appen från hemskärmen — den körs i helskärm som en vanlig app.

## Att spara recept till iCloud

Tryck **Spara till iCloud** på ett recept. iOS visar delningsbladet → välj **Spara i Filer** och
lägg filen i **iCloud Drive** (förvald plats). Recepten ligger även lokalt i appen och kan öppnas
igen via menyn → *Öppna recept från iCloud / Filer*.

> En webbapp kan inte tyst auto-synka till iCloud — Apple tillåter inte det från webben. Därför
> sker sparningen med ett tryck via Filer, men iCloud Drive är förvald destination.

## Bra att veta

- **OCR och PDF** laddar sina bibliotek från CDN första gången → kräver internet vid första
  användningen, sedan cachas de.
- **Handskrifts-OCR är ungefärligt.** Resultatet hamnar i editorn så att du snabbt kan rätta det.
- **Länkimport** kan blockeras av vissa sajter (CORS). Pinterest är "best effort" — använd
  *Klistra in recept* om en länk inte fungerar.
- All receptdata stannar på din enhet / i din iCloud. Appen har ingen server.

## Teknik

Ingen byggkedja. `index.html` + `css/app.css` + moduler i `js/`:
`store.js` (IndexedDB), `app.js` (vyer/CRUD), `editor.js` (rich text),
`ocr.js` (Tesseract.js), `pdfimport.js` (pdf.js), `webimport.js` (länk/klistra in),
`icloud.js` (spara/öppna filer). PWA via `manifest.webmanifest` + `sw.js`.

## Licens

MIT — se [LICENSE](LICENSE).

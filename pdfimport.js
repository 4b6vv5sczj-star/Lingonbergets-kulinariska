/* pdfimport.js — importera PDF-recept (från OneDrive, Filer/iCloud eller annan media).
   Använder pdf.js (Apache-2.0), laddas från CDN vid behov. Extraherar text och
   renderar förstasidan som miniatyrbild. Texten återskapas rad för rad utifrån
   varje textbits position på sidan, så att receptets upplägg (rubriker, ingrediens-
   rader, steg) bevaras inför struktureringen. PDF väljs via systemets filväljare,
   som på iOS inkluderar OneDrive och iCloud Drive. /
(function (global) {
  'use strict';

  var BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/';
  var _loaded = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Kunde inte ladda PDF-läsaren (kräver internet första gången).')); };
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (_loaded) return _loaded;
    _loaded = loadScript(BASE + 'pdf.min.js').then(function () {
      if (!global.pdfjsLib) throw new Error('PDF-läsaren kunde inte startas.');
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js';
    });
    return _loaded;
  }

  function readArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsArrayBuffer(file);
    });
  }

  // Återskapa rader ur pdf.js textinnehåll genom att gruppera bitar efter y-position.
  function itemsToLines(items) {
    var rows = [];
    items.forEach(function (it) {
      if (!it.str || !it.str.replace(/\s/g, '')) return;
      var y = it.transform[5], x = it.transform[4];
      var row = null;
      for (var k = 0; k < rows.length; k++) {
        if (Math.abs(rows[k].y - y) <= 3) { row = rows[k]; break; }
      }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, s: it.str });
    });
    rows.sort(function (a, b) { return b.y - a.y; });           // uppifrån och ner
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });      // vänster till höger
      return r.parts.map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }).filter(function (l) { return l.length > 0; });
  }

  var PDFImport = {
    /* Returnerar { text, thumbnail(dataURL|null), title } */
    extract: function (file, onProgress) {
      var fileName = (file && file.name ? file.name.replace(/.pdf$/i, '') : '').trim();
      return ensure().then(function () {
        return readArrayBuffer(file);
      }).then(function (buf) {
        return global.pdfjsLib.getDocument({ data: buf }).promise;
      }).then(function (pdf) {
        var maxPages = Math.min(pdf.numPages, 20);
        var chain = Promise.resolve('');
        var thumb = null;

        // Text från alla sidor (upp till 20), radvis återskapad
        for (var i = 1; i <= maxPages; i++) {
          (function (pageNum) {
            chain = chain.then(function (acc) {
              return pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  if (onProgress) onProgress(pageNum / maxPages);
                  var lines = itemsToLines(tc.items);
                  return acc + lines.join('\n') + '\n\n';
                });
              });
            });
          })(i);
        }

        // Miniatyr av sida 1
        var thumbP = pdf.getPage(1).then(function (page) {
          var viewport = page.getViewport({ scale: 1 });
          var scale = Math.min(900 / viewport.width, 1.6);
          var vp = page.getViewport({ scale: scale });
          var canvas = document.createElement('canvas');
          canvas.width = Math.ceil(vp.width);
          canvas.height = Math.ceil(vp.height);
          var ctx = canvas.getContext('2d');
          return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
            try { thumb = canvas.toDataURL('image/jpeg', 0.78); } catch (e) { thumb = null; }
          });
        }).catch(function () { thumb = null; });

        return Promise.all([chain, thumbP]).then(function (out) {
          return { text: (out[0] || '').replace(/^\s+|\s+$/g, ''), thumbnail: thumb, title: fileName };
        });
      });
    }
  };

  global.PDFImport = PDFImport;
})(window);

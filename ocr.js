/* ocr.js — handskrifts-/textigenkänning via Tesseract.js (MIT), laddas från CDN vid behov.
   Språk: svenska + engelska. Handskrift är ungefärligt — resultatet hamnar i editorn
   där användaren snabbt kan rätta det. */
(function (global) {
  'use strict';

  var TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var _loaded = null;
  var _worker = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[data-src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true; s.setAttribute('data-src', src);
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Kunde inte ladda igenkänningsmotorn (kräver internet första gången).')); };
      document.head.appendChild(s);
    });
  }

  function ensure() {
    if (_loaded) return _loaded;
    _loaded = loadScript(TESSERACT_SRC).then(function () {
      if (!global.Tesseract) throw new Error('Igenkänningsmotorn kunde inte startas.');
    });
    return _loaded;
  }

  var OCR = {
    /** Känn igen text i en bild (File, Blob eller data-URL). onProgress(0..1) valfri. */
    recognize: function (image, onProgress) {
      return ensure().then(function () {
        var opts = {};
        if (onProgress) {
          opts.logger = function (m) {
            if (m && m.status === 'recognizing text' && typeof m.progress === 'number') onProgress(m.progress);
          };
        }
        return global.Tesseract.createWorker('swe+eng', 1, opts);
      }).then(function (worker) {
        _worker = worker;
        return worker.recognize(image).then(function (res) {
          var text = (res && res.data && res.data.text) ? res.data.text : '';
          return worker.terminate().then(function () { _worker = null; return text.trim(); });
        }).catch(function (err) {
          try { worker.terminate(); } catch (e) {}
          _worker = null;
          throw err;
        });
      });
    }
  };

  global.OCR = OCR;
})(window);

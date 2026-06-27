/* icloud.js — spara/öppna recept som filer.
   På iPhone/iPad öppnar "Spara till iCloud" systemets delningsblad där "Spara till Filer"
   landar i iCloud Drive (förvald plats). Varje recept är en portabel .json-fil med
   titel, kategori, ingredienser/instruktioner och inbäddade bilder (data-URL).

   OBS: en webbapp kan inte tyst auto-synka till iCloud — Apple tillåter inte det från
   webben. Sparningen är därför ett tryck via filväljaren, med iCloud Drive som standard. */
(function (global) {
  'use strict';

  function slugify(s) {
    return (s || 'recept').toLowerCase()
      .replace(/[åä]/g, 'a').replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'recept';
  }

  function makeFile(obj, name) {
    var json = JSON.stringify(obj, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    try { return new File([blob], name, { type: 'application/json' }); }
    catch (e) { blob.name = name; return blob; }
  }

  // Försök dela (iOS: "Spara till Filer"→iCloud). Annars ladda ner.
  function shareOrDownload(file, title) {
    if (global.navigator && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: title || file.name })
            .then(function () { return 'shared'; })
            .catch(function (err) {
              if (err && err.name === 'AbortError') return 'cancelled';
              return download(file);
            });
        }
      } catch (e) { /* faller igenom till download */ }
    }
    return Promise.resolve(download(file));
  }

  function download(file) {
    var url = URL.createObjectURL(file);
    var a = document.createElement('a');
    a.href = url; a.download = file.name || 'recept.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
    return 'downloaded';
  }

  function readJsonFile(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        try { resolve(JSON.parse(fr.result)); }
        catch (e) { reject(new Error('Filen är inte ett giltigt recept (.json).')); }
      };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsText(file);
    });
  }

  var ICloud = {
    /** Spara ETT recept som .json (delas/ned-laddas → Filer/iCloud). */
    saveRecipe: function (recipe) {
      var payload = {
        app: 'lingonbergets-kulinariska-samling',
        type: 'recipe', version: 1,
        recipe: recipe
      };
      var name = slugify(recipe.title) + '.recept.json';
      return shareOrDownload(makeFile(payload, name), recipe.title || 'Recept');
    },

    /** Spara HELA samlingen som säkerhetskopia. */
    saveCollection: function (exportObj) {
      var name = 'lingonberget-samling-' + new Date().toISOString().slice(0, 10) + '.json';
      return shareOrDownload(makeFile(exportObj, name), 'Lingonberget – hela samlingen');
    },

    /** Läs en vald .json-fil → returnerar recept-objekt (eller hela samlingen). */
    parseFile: function (file) {
      return readJsonFile(file).then(function (data) {
        if (data && data.type === 'recipe' && data.recipe) return { kind: 'recipe', recipe: data.recipe };
        if (data && Array.isArray(data.recipes)) return { kind: 'collection', data: data };
        if (data && data.id && (data.title || data.bodyHtml)) return { kind: 'recipe', recipe: data };
        if (Array.isArray(data)) return { kind: 'collection', data: { recipes: data } };
        throw new Error('Filen innehåller inget recept i känt format.');
      });
    }
  };

  global.ICloud = ICloud;
})(window);

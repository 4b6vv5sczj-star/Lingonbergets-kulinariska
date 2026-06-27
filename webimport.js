/* webimport.js — importera recept från en webblänk (t.ex. köket.se eller Pinterest)
   eller från inklistrad text.

   En webbapp får inte hämta främmande sajter direkt (CORS), så URL:en läses via en
   CORS-vänlig läs-tjänst. Vi försöker först läsa sidans strukturerade schema.org
   "Recipe"/JSON-LD (titel, ingredienser, steg, bild) som de flesta receptsajter
   (inkl. köket.se) bäddar in. Hittas ingen sådan data faller vi tillbaka på läsbar text,
   som struktureras av RecipeFormat.

   Pinterest: en "pin" är i princip en hänvisning till en källsajt. Vi letar därför
   först upp den ursprungliga receptlänken i pin-sidan och hämtar receptet därifrån.

   "Klistra in recept" fungerar alltid och kräver ingen nätåtkomst. /
(function (global) {
  'use strict';

  // Hämtar rå HTML med tillåtande CORS.
  function fetchRawHtml(url) {
    var proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    return fetch(proxy).then(function (r) {
      if (!r.ok) throw new Error('proxy ' + r.status);
      return r.text();
    });
  }

  // Läsbar text-fallback via r.jina.ai.
  function fetchReadable(url) {
    var clean = url.replace(/^https?:///, '');
    return fetch('https://r.jina.ai/https://' + clean).then(function (r) {
      if (!r.ok) throw new Error('reader ' + r.status);
      return r.text();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  }

  function asArray(v) {
    if (v == null) return [];
    return Array.isArray(v) ? v : [v];
  }

  function pickImage(img) {
    var first = asArray(img)[0];
    if (!first) return null;
    if (typeof first === 'string') return first;
    if (first.url) return first.url;
    return null;
  }

  / ---------- Strukturering (delas med OCR/PDF via RecipeFormat) ---------- /

  function structureFull(text) {
    if (global.RecipeFormat) return global.RecipeFormat.structure(text || '');
    return parseTextFallback(text || '');
  }
  function structureToHtmlOnly(text) {
    if (global.RecipeFormat) {
      var r = global.RecipeFormat.structure(text || '');
      return r.html || ('<p>' + esc(text) + '</p>');
    }
    return '<p>' + esc(text) + '</p>';
  }

  / ---------- schema.org Recipe ---------- /

  function flattenInstructions(instr) {
    var steps = [];
    asArray(instr).forEach(function (it) {
      if (typeof it === 'string') { steps.push(it); return; }
      if (!it) return;
      if (it['@type'] === 'HowToSection' && it.itemListElement) {
        flattenInstructions(it.itemListElement).forEach(function (s) { steps.push(s); });
      } else if (it.text) {
        steps.push(it.text);
      } else if (it.name) {
        steps.push(it.name);
      }
    });
    return steps;
  }

  function findRecipe(node) {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var r = findRecipe(node[i]); if (r) return r;
      }
      return null;
    }
    var t = node['@type'];
    if (t && (t === 'Recipe' || (Array.isArray(t) && t.indexOf('Recipe') !== -1))) return node;
    if (node['@graph']) return findRecipe(node['@graph']);
    return null;
  }

  function parseJsonLd(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      try {
        var data = JSON.parse(scripts[i].textContent);
        var recipe = findRecipe(data);
        if (recipe) return recipe;
      } catch (e) { / hoppa över trasig JSON-LD / }
    }
    // OpenGraph-titel som nödlösning
    var ogt = doc.querySelector('meta[property="og:title"]');
    var ogi = doc.querySelector('meta[property="og:image"]');
    var ogd = doc.querySelector('meta[property="og:description"]');
    if (ogt || ogd) {
      return { _og: true, name: ogt && ogt.content, image: ogi && ogi.content, description: ogd && ogd.content };
    }
    return null;
  }

  function structuredToHtml(r) {
    var parts = [];
    var ingredients = asArray(r.recipeIngredient);
    var steps = flattenInstructions(r.recipeInstructions);

    if (ingredients.length) {
      parts.push('<h2>Ingredienser</h2><ul>');
      ingredients.forEach(function (x) { parts.push('<li>' + esc(x) + '</li>'); });
      parts.push('</ul>');
    }
    if (steps.length) {
      parts.push('<h2>Gör så här</h2><ol>');
      steps.forEach(function (x) { parts.push('<li>' + esc(x) + '</li>'); });
      parts.push('</ol>');
    }
    if (!ingredients.length && !steps.length && r.description) {
      parts.push(structureToHtmlOnly(r.description));
    }
    return parts.join('');
  }

  / ---------- Pinterest: hitta källreceptets länk ---------- /

  function isPinterest(url) {
    return /(^|.)pinterest.[a-z.]+/i.test(url) || /(^|/)pin.it/i.test(url);
  }

  function findPinterestSource(html) {
    // 1) og:see_also pekar ofta på källsajten
    var m = html.match(/property=["']og:see_also["'][^>]content="'["']/i);
    if (m && !/pinterest.|pinimg./i.test(m[1])) return m[1].replace(/&/g, '&');

    // 2) "link":"https://…" i pin-sidans inbäddade JSON (rich pin → källa)
    var re = /"link":"(https?:\?/\?/[^"]+)"/g, mm;
    while ((mm = re.exec(html))) {
      var u = mm[1].replace(/\//g, '/').replace(/\u002F/gi, '/');
      if (!/pinterest.|pinimg.|pin.it/i.test(u)) return u;
    }
    // 3) tracking-redirect "url":"https://…"
    var re2 = /"url":"(https?:\?/\?/(?!www.pinterest|i.pinimg)[^"]+)"/g, m2;
    while ((m2 = re2.exec(html))) {
      var u2 = m2[1].replace(/\//g, '/').replace(/\u002F/gi, '/');
      if (!/pinterest.|pinimg.|pin.it/i.test(u2)) return u2;
    }
    return null;
  }

  / ---------- Fri text-fallback (om RecipeFormat saknas) ---------- /

  function parseTextFallback(text) {
    var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var parts = ['<p>' + lines.map(esc).join('<br>') + '</p>'];
    return { title: lines[0] || '', html: parts.join('') };
  }

  / ---------- Publikt API ---------- /

  var WebImport = {
    / Importera från URL. Returnerar { title, html, image }. /
    fromUrl: function (url, _depth) {
      url = (url || '').trim();
      if (!/^https?:///i.test(url)) url = 'https://' + url;
      _depth = _depth || 0;
      var pin = isPinterest(url);

      return fetchRawHtml(url).then(function (html) {
        // Pinterest: följ länken till källreceptet och importera därifrån.
        if (pin && _depth < 1) {
          var src = findPinterestSource(html);
          if (src) return WebImport.fromUrl(src, _depth + 1);
        }

        var recipe = parseJsonLd(html);
        if (recipe && !recipe._og) {
          return { title: recipe.name || '', html: structuredToHtml(recipe), image: pickImage(recipe.image) };
        }
        if (recipe && recipe._og) {
          var body = recipe.description ? structureToHtmlOnly(recipe.description) : '';
          return { title: recipe.name || '', html: body, image: recipe.image || null };
        }
        throw new Error('no-jsonld');
      }).catch(function () {
        // Fallback: läsbar text → strukturera
        return fetchReadable(url).then(function (txt) {
          // r.jina.ai inleder med "Title:" m.m. — ta bort metaheader om den finns
          var cleaned = txt
            .replace(/^Title:.$/m, '')
            .replace(/^URL Source:.$/m, '')
            .replace(/^Markdown Content:.$/m, '');
          var parsed = structureFull(cleaned);
          return { title: parsed.title, html: parsed.html, image: null };
        });
      });
    },

    /** Tolka inklistrad text. Returnerar { title, html }. */
    fromText: function (text) { return structureFull(text || ''); }
  };

  global.WebImport = WebImport;
})(window);

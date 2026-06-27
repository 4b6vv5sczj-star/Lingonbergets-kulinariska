/* webimport.js — importera recept från en webblänk (t.ex. köket.se eller Pinterest)
   eller från inklistrad text.

   En webbapp får inte hämta främmande sajter direkt (CORS), så URL:en läses via en
   CORS-vänlig läs-tjänst. Vi försöker först läsa sidans strukturerade schema.org
   "Recipe"/JSON-LD (titel, ingredienser, steg, bild) som de flesta receptsajter
   (inkl. köket.se) bäddar in. Hittas ingen sådan data faller vi tillbaka på läsbar text.
   "Klistra in recept" fungerar alltid och kräver ingen nätåtkomst. */
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
    var clean = url.replace(/^https?:\/\//, '');
    return fetch('https://r.jina.ai/https://' + clean).then(function (r) {
      if (!r.ok) throw new Error('reader ' + r.status);
      return r.text();
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

  // Plocka instruktionssteg ur schema.org-format (sträng / HowToStep / HowToSection).
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

  // Leta upp ett Recipe-objekt i en JSON-LD-nod (kan vara @graph eller array).
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
      } catch (e) { /* hoppa över trasig JSON-LD */ }
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
      parts.push('<p>' + esc(r.description) + '</p>');
    }
    return parts.join('');
  }

  // Heuristisk tolkning av fri text → ingredienser + steg.
  function parseText(text) {
    var lines = String(text).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var title = '';
    var ingHeader = /^(ingredienser|du beh[öo]ver|det h[äa]r beh[öo]ver du)/i;
    var stepHeader = /^(g[öo]r s[åa] h[äa]r|s[åa] h[äa]r g[öo]r du|instruktioner|tillagning|method|instructions)/i;

    var mode = 'pre';
    var ing = [], steps = [], pre = [];
    lines.forEach(function (l) {
      if (ingHeader.test(l)) { mode = 'ing'; return; }
      if (stepHeader.test(l)) { mode = 'step'; return; }
      if (mode === 'ing') ing.push(l.replace(/^[-•*•]\s*/, ''));
      else if (mode === 'step') steps.push(l.replace(/^\d+[.)]\s*/, ''));
      else pre.push(l);
    });

    if (pre.length && !title) title = pre[0];
    var parts = [];
    if (pre.length > 1) parts.push('<p>' + pre.slice(1).map(esc).join('<br>') + '</p>');
    if (ing.length) parts.push('<h2>Ingredienser</h2><ul>' + ing.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
    if (steps.length) parts.push('<h2>Gör så här</h2><ol>' + steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>');
    if (!ing.length && !steps.length) {
      parts = ['<p>' + lines.map(esc).join('<br>') + '</p>'];
    }
    return { title: title, html: parts.join('') };
  }

  var WebImport = {
    /** Importera från URL. Returnerar { title, html, image }. */
    fromUrl: function (url) {
      url = (url || '').trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

      return fetchRawHtml(url).then(function (html) {
        var recipe = parseJsonLd(html);
        if (recipe && !recipe._og) {
          return { title: recipe.name || '', html: structuredToHtml(recipe), image: pickImage(recipe.image) };
        }
        if (recipe && recipe._og) {
          var body = recipe.description ? '<p>' + esc(recipe.description) + '</p>' : '';
          return { title: recipe.name || '', html: body, image: recipe.image || null };
        }
        throw new Error('no-jsonld');
      }).catch(function () {
        // Fallback: läsbar text
        return fetchReadable(url).then(function (txt) {
          // r.jina.ai inleder med "Title:" m.m. — ta bort metaheader om den finns
          var cleaned = txt.replace(/^Title:.*$/m, '').replace(/^URL Source:.*$/m, '').replace(/^Markdown Content:.*$/m, '');
          var parsed = parseText(cleaned);
          return { title: parsed.title, html: parsed.html, image: null };
        });
      });
    },

    /** Tolka inklistrad text. Returnerar { title, html }. */
    fromText: function (text) { return parseText(text || ''); }
  };

  global.WebImport = WebImport;
})(window);

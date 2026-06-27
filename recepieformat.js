/* recipeformat.js — tolkar rå recepttext (från OCR, PDF, inklistring eller webb)
   och återskapar receptets struktur genom att läsa av radernas upplägg:
   mängder/enheter avslöjar ingredienser, numrering och längre meningar avslöjar
   steg, och korta rader som slutar med kolon avslöjar delrubriker.
   Resultatet blir: titel → "Ingredienser" (punktlista) → "Gör så här" (numrerad lista),
   samma upplägg som originalet. Fristående modul, inga beroenden. /
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
  }

  / ---------- Mönster ---------- /
  var RE_QTY_START = /^\s(?:\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛])(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\b/;
  var RE_UNIT = /\b(?:dl|l|ml|cl|kg|hg|g|krm|msk|tsk|tbsp|tsp|st|stk|port|portioner|nypa|nypor|knippe|knippen|klyfta|klyftor|burk|burkar|paket|pkt|p[åa]se|p[åa]sar|skiva|skivor|skv[äa]tt|kvist|kvistar|blad|cm)\b/i;
  var RE_QTY_UNIT = /(?:\d+(?:[.,]\d+)?|[½¼¾⅓⅔⅛])\s*(?:dl|l|ml|cl|kg|hg|g|krm|msk|tsk|tbsp|tsp|st|stk|port|nypa|knippe|klyfta|klyftor|burk|paket|pkt|p[åa]se|skiva|skivor|kvist|blad|cm)\b/i;

  var RE_STEP_NUM = /^\s*(\d{1,2})[.)]\s+/;
  var RE_BULLET   = /^\s*[-–•▪·]\s+/;

  var RE_ING_HEADER = /^\s(ingredienser|du beh[öo]ver|det h[äa]r beh[öo]ver du|tillbeh[öo]r|s[åa]s|dressing|topping|fyllning|garnering|deg|botten|kr[äa]m|marinad|r[öo]ra|smet|s[åa]ser)\s*:?\s*$/i;
  var RE_METHOD_HEADER = /^\s*(g[öo]r s[åa] h[äa]r|s[åa] h[äa]r g[öo]r du|s[åa] g[öo]r du|instruktioner|tillagning|tillv[äa]gag[åa]ngss[äa]tt|method|instructions|steg)\s*:?\s*$/i;
  var RE_GENERIC_HEADER = /^[^.!?,]{2,40}:\s*$/;
  var RE_SERVES = /^\s*(?:ca.?\s*)?\d+\s*(?:port|portioner|bitar|personer|st)\b/i;

  /* ---------- Hjälp ---------- /
  function splitLines(raw) {
    return String(raw || '')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map(function (l) { return l.replace(/^\s+|\s+$/g, ''); })
      .filter(function (l) { return l.length > 0; });
  }
  function stripColon(s) { return s.replace(/\s:\s*$/, '').replace(/^\s+|\s+$/g, ''); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function cleanIng(s) { return s.replace(RE_BULLET, '').replace(/^\s+|\s+$/g, ''); }
  function cleanStep(s) { return s.replace(RE_STEP_NUM, '').replace(RE_BULLET, '').replace(/^\s+|\s+$/g, ''); }

  function isIngredientLine(l) {
    if (RE_STEP_NUM.test(l)) return false;
    if (RE_QTY_START.test(l)) return true;
    if (RE_QTY_UNIT.test(l)) return true;
    if (l.length <= 42 && !/[.!?]$/.test(l) && RE_UNIT.test(l)) return true;
    return false;
  }
  function isStepLine(l) {
    if (RE_STEP_NUM.test(l)) return true;
    if (RE_QTY_START.test(l) && l.length < 45) return false;
    if (l.length >= 45) return true;
    if (/[.!?]$/.test(l) && l.split(/\s+/).length >= 6) return true;
    return false;
  }

  /* ---------- Tolk ---------- */
  function structure(raw) {
    var lines = splitLines(raw);
    if (!lines.length) return { title: '', html: '' };

    var title = '';
    var i = 0;
    var first = lines[0];
    if (!RE_ING_HEADER.test(first) && !RE_METHOD_HEADER.test(first) &&
        !RE_GENERIC_HEADER.test(first) && !isIngredientLine(first) &&
        !isStepLine(first) && first.length <= 60) {
      title = stripColon(first).replace(/[•-–\s]+$/, '');
      i = 1;
    }

    var intro = [], ingGroups = [], steps = [], notes = [];
    var mode = 'pre';
    function newGroup(label) { var g = { label: label || null, items: [] }; ingGroups.push(g); return g; }
    function curGroup() { return ingGroups.length ? ingGroups[ingGroups.length - 1] : newGroup(null); }

    for (; i < lines.length; i++) {
      var line = lines[i];
      var mIng = line.match(RE_ING_HEADER);
      if (mIng) {
        var w = mIng[1].toLowerCase();
        if (/ingredienser|beh[öo]ver/.test(w)) { mode = 'ing'; newGroup(null); }
        else { mode = 'ing'; newGroup(cap(stripColon(line))); }
        continue;
      }
      if (RE_METHOD_HEADER.test(line)) { mode = 'step'; continue; }
      if (RE_GENERIC_HEADER.test(line)) {
        if (mode === 'step') { steps.push(stripColon(line)); }
        else { mode = 'ing'; newGroup(cap(stripColon(line))); }
        continue;
      }
      if (RE_SERVES.test(line) && mode === 'pre') { intro.push(line); continue; }

      if (mode === 'ing') {
        if (isStepLine(line) && !isIngredientLine(line)) { mode = 'step'; steps.push(cleanStep(line)); }
        else curGroup().items.push(cleanIng(line));
      } else if (mode === 'step') {
        steps.push(cleanStep(line));
      } else {
        if (isIngredientLine(line)) { mode = 'ing'; curGroup().items.push(cleanIng(line)); }
        else if (isStepLine(line)) { mode = 'step'; steps.push(cleanStep(line)); }
        else intro.push(line);
      }
    }

    var html = '';
    if (intro.length) html += '<p>' + intro.map(esc).join('<br>') + '</p>';

    var hasIng = false;
    for (var k = 0; k < ingGroups.length; k++) { if (ingGroups[k].items.length) { hasIng = true; break; } }

    if (hasIng) {
      html += '<h2>Ingredienser</h2>';
      ingGroups.forEach(function (g) {
        if (!g.items.length) return;
        if (g.label) html += '<p class="ing-sub"><strong>' + esc(g.label) + '</strong></p>';
        html += '<ul>' + g.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      });
    }
    if (steps.length) {
      html += '<h2>Gör så här</h2><ol>' + steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
    }
    if (notes.length) html += '<p>' + notes.map(esc).join('<br>') + '</p>';

    if (!hasIng && !steps.length && !intro.length) {
      html = '<p>' + lines.map(esc).join('<br>') + '</p>';
    }

    return { title: title, html: html };
  }

  global.RecipeFormat = { structure: structure };
})(window);

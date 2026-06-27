/* app.js — huvudlogik: vyer, kategorier, CRUD, sök/filter och import.
   Allt sker i en sida (inga externa länkar — fristående app). */
(function (global) {
  'use strict';

  var CATS = {
    forratt: 'Förrätt',
    huvudratt: 'Huvudrätt',
    efterratt: 'Efterrätt',
    bakverk: 'Bakverk',
    vegetariskt: 'Vegetariskt'
  };

  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var state = {
    view: 'collection',
    filter: 'all',
    query: '',
    editing: null,      // recept som redigeras
    images: [],         // bildgalleri (data-URL) för aktuellt recept
    category: 'huvudratt',
    imgIntent: 'gallery' // 'gallery' | 'scan'
  };

  /* ---------- Hjälpfunktioner ---------- */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function stripHtml(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' }); }
    catch (e) { return ''; }
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function setBusy(text) { $('busyText').textContent = text || 'Arbetar…'; $('busy').hidden = false; }
  function clearBusy() { $('busy').hidden = true; }

  // Läs in bild → krymp till rimlig storlek → data-URL (sparar lagring).
  function fileToImage(file, maxDim) {
    maxDim = maxDim || 1600;
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
          var c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          try { resolve(c.toDataURL('image/jpeg', 0.82)); }
          catch (e) { resolve(fr.result); }
        };
        img.onerror = function () { resolve(fr.result); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(fr.error); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- Vy-hantering ---------- */

  function showView(name) {
    state.view = name;
    $('view-collection').hidden = name !== 'collection';
    $('view-read').hidden = name !== 'read';
    $('view-edit').hidden = name !== 'edit';
    $('backBtn').hidden = name === 'collection';
    $('fab').hidden = name !== 'collection';
    window.scrollTo(0, 0);
  }

  /* ---------- Samling (lista) ---------- */

  function renderCollection() {
    Store.all().then(function (list) {
      var q = state.query.toLowerCase();
      var filtered = list.filter(function (r) {
        if (state.filter !== 'all' && r.category !== state.filter) return false;
        if (!q) return true;
        var hay = (r.title + ' ' + (CATS[r.category] || '') + ' ' + stripHtml(r.bodyHtml)).toLowerCase();
        return hay.indexOf(q) !== -1;
      });

      var grid = $('recipeGrid');
      grid.innerHTML = '';
      $('emptyState').hidden = list.length !== 0;

      if (list.length === 0) { return; }

      if (filtered.length === 0) {
        grid.innerHTML = '<p style="grid-column:1/-1;color:var(--faint);text-align:center;padding:30px">Inga recept matchar.</p>';
        return;
      }

      filtered.forEach(function (r) {
        var thumb = r.images && r.images[0];
        var snippet = escapeHtml(stripHtml(r.bodyHtml).slice(0, 90));
        var card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-id', r.id);
        card.innerHTML =
          '<div class="card-thumb ' + (thumb ? '' : 'placeholder') + '">' +
            (thumb ? '<img loading="lazy" src="' + thumb + '" alt="">' : '🫐') +
            '<span class="card-tag">' + escapeHtml(CATS[r.category] || 'Recept') + '</span>' +
          '</div>' +
          '<div class="card-body"><h3>' + escapeHtml(r.title || 'Namnlöst recept') + '</h3>' +
          (snippet ? '<p>' + snippet + '</p>' : '') + '</div>';
        card.addEventListener('click', function () { openReader(r.id); });
        grid.appendChild(card);
      });
    });
  }

  /* ---------- Läsvy ---------- */

  function openReader(id) {
    Store.get(id).then(function (r) {
      if (!r) { toast('Receptet kunde inte hittas.'); return; }
      state.editing = r;
      var hero = r.images && r.images[0];
      var rest = (r.images || []).slice(1);
      var html =
        (hero ? '<img class="hero" src="' + hero + '" alt="">' : '') +
        '<span class="tag">' + escapeHtml(CATS[r.category] || 'Recept') + '</span>' +
        '<h1>' + escapeHtml(r.title || 'Namnlöst recept') + '</h1>' +
        '<div class="meta">' + fmtDate(r.updatedAt) +
          (r.source ? ' · källa: ' + escapeHtml(r.source) : '') + '</div>' +
        (rest.length ? '<div class="gallery-strip">' + rest.map(function (s) {
          return '<img src="' + s + '" alt="">'; }).join('') + '</div>' : '') +
        '<div class="body">' + (r.bodyHtml || '<p style="color:var(--faint)">Inget innehåll ännu.</p>') + '</div>';
      $('reader').innerHTML = html;
      showView('read');
    });
  }

  /* ---------- Redigeringsvy ---------- */

  function openEditor(recipe) {
    var r = recipe || { id: null, title: '', category: 'huvudratt', images: [], bodyHtml: '', source: '' };
    state.editing = r;
    state.images = (r.images || []).slice();
    state.category = r.category || 'huvudratt';

    $('recipeTitle').value = r.title || '';
    Editor.setHtml(r.bodyHtml || '');
    renderCatPicker();
    renderGallery();
    showView('edit');
    $('recipeTitle').focus();
  }

  function renderCatPicker() {
    qa('#catPicker .cat').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-cat') === state.category);
    });
  }

  function renderGallery() {
    var g = $('gallery');
    g.innerHTML = '';
    state.images.forEach(function (src, i) {
      var d = document.createElement('div');
      d.className = 'thumb';
      d.innerHTML = '<img src="' + src + '" alt=""><button type="button" class="rm" data-rm="' + i + '">×</button>';
      g.appendChild(d);
    });
  }

  function gatherRecipe() {
    var r = state.editing || {};
    r.title = $('recipeTitle').value.trim() || 'Namnlöst recept';
    r.category = state.category;
    r.images = state.images.slice();
    r.bodyHtml = Editor.getHtml();
    return r;
  }

  function saveRecipe() {
    var r = gatherRecipe();
    return Store.put(r).then(function (saved) {
      state.editing = saved;
      toast('Receptet sparat.');
      renderCollection();
      return saved;
    });
  }

  /* ---------- Import: bilder, OCR, PDF, webb, klistra in ---------- */

  function handleImageFiles(files) {
    var arr = Array.prototype.slice.call(files);
    if (!arr.length) return Promise.resolve([]);
    return Promise.all(arr.map(function (f) { return fileToImage(f); }));
  }

  function addPhotos(files) {
    setBusy('Lägger till bilder…');
    handleImageFiles(files).then(function (urls) {
      state.images = state.images.concat(urls);
      renderGallery();
      clearBusy();
    }).catch(function () { clearBusy(); toast('Kunde inte läsa bilden.'); });
  }

  function scanPhoto(file) {
    setBusy('Läser texten… 0%');
    fileToImage(file, 2000).then(function (url) {
      state.images.push(url); renderGallery();
      return OCR.recognize(url, function (p) {
        $('busyText').textContent = 'Läser texten… ' + Math.round(p * 100) + '%';
      });
    }).then(function (text) {
      clearBusy();
      if (text) { Editor.appendText(text); toast('Texten tolkad — granska och rätta i editorn.'); }
      else toast('Ingen text kunde tolkas. Försök med en skarpare bild.');
    }).catch(function (err) {
      clearBusy(); toast(err && err.message ? err.message : 'Skanningen misslyckades.');
    });
  }

  function importPdf(file) {
    setBusy('Läser PDF… ');
    PDFImport.extract(file, function (p) {
      $('busyText').textContent = 'Läser PDF… ' + Math.round(p * 100) + '%';
    }).then(function (res) {
      clearBusy();
      if (res.thumbnail) { state.images.push(res.thumbnail); renderGallery(); }
      if (!$('recipeTitle').value.trim() && res.title) $('recipeTitle').value = res.title;
      if (res.text) { Editor.appendText(res.text); toast('PDF importerad — granska i editorn.'); }
      else toast('PDF:en innehöll ingen läsbar text (kan vara en skannad bild).');
    }).catch(function (err) {
      clearBusy(); toast(err && err.message ? err.message : 'Kunde inte läsa PDF:en.');
    });
  }

  function importUrl() {
    var url = global.prompt('Klistra in länk till receptet (t.ex. köket.se eller Pinterest):', '');
    if (!url) return;
    setBusy('Hämtar receptet…');
    WebImport.fromUrl(url).then(function (res) {
      clearBusy();
      if (!$('recipeTitle').value.trim() && res.title) $('recipeTitle').value = res.title;
      if (res.image) { state.images.push(res.image); renderGallery(); }
      if (res.html) { Editor.appendHtml(res.html); toast('Recept importerat — granska i editorn.'); }
      else toast('Hittade inget recept på sidan. Prova "Klistra in recept" istället.');
    }).catch(function () {
      clearBusy();
      toast('Kunde inte hämta länken (sajten kan blockera). Prova "Klistra in recept".');
    });
  }

  function importPaste() {
    var text = global.prompt('Klistra in receptets text (ingredienser och tillagning):', '');
    if (!text) return;
    var res = WebImport.fromText(text);
    if (!$('recipeTitle').value.trim() && res.title) $('recipeTitle').value = res.title;
    Editor.appendHtml(res.html);
    toast('Texten infogad — granska i editorn.');
  }

  /* ---------- iCloud: spara/öppna ---------- */

  function saveToICloud(recipe) {
    setBusy('Förbereder fil…');
    ICloud.saveRecipe(recipe).then(function (result) {
      clearBusy();
      if (result === 'cancelled') return;
      if (result === 'downloaded') toast('Receptet sparat som fil — välj "Spara i Filer → iCloud Drive".');
      else toast('Receptet delat — välj "Spara i Filer".');
    }).catch(function () { clearBusy(); toast('Kunde inte spara filen.'); });
  }

  function openFromICloud(file) {
    ICloud.parseFile(file).then(function (res) {
      if (res.kind === 'recipe') {
        var r = res.recipe; r.id = r.id || Store.uuid();
        return Store.put(r).then(function (saved) {
          renderCollection(); toast('Recept importerat från fil.'); openReader(saved.id);
        });
      } else {
        return Store.importAll(res.data).then(function (n) {
          renderCollection(); toast(n + ' recept importerade.');
        });
      }
    }).catch(function (err) { toast(err && err.message ? err.message : 'Kunde inte läsa filen.'); });
  }

  function exportAll() {
    setBusy('Skapar säkerhetskopia…');
    Store.exportAll().then(function (data) {
      if (!data.recipes.length) { clearBusy(); toast('Inga recept att exportera ännu.'); return; }
      return ICloud.saveCollection(data).then(function () { clearBusy(); toast('Säkerhetskopia skapad — spara i iCloud Drive.'); });
    }).catch(function () { clearBusy(); toast('Export misslyckades.'); });
  }

  /* ---------- Meny ---------- */

  function openMenu() { $('menu').hidden = false; $('menuBackdrop').hidden = false; }
  function closeMenu() { $('menu').hidden = true; $('menuBackdrop').hidden = true; }

  /* ---------- Händelser ---------- */

  function onAction(action) {
    switch (action) {
      case 'new': closeMenu(); openEditor(null); break;
      case 'edit': openEditor(state.editing); break;
      case 'save':
        saveRecipe().then(function (r) { openReader(r.id); });
        break;
      case 'delete':
        if (state.editing && state.editing.id) {
          if (global.confirm('Radera receptet permanent?')) {
            Store.delete(state.editing.id).then(function () {
              toast('Receptet raderat.'); renderCollection(); showView('collection');
            });
          }
        } else { showView('collection'); }
        break;
      case 'save-icloud-edit':
        saveRecipe().then(function (r) { saveToICloud(r); });
        break;
      case 'save-icloud-read':
        if (state.editing) saveToICloud(state.editing);
        break;
      case 'add-photo': state.imgIntent = 'gallery'; $('filePhoto').click(); break;
      case 'scan': state.imgIntent = 'scan'; $('filePhoto').value = ''; $('filePhoto').click(); break;
      case 'import-pdf': $('filePdf').click(); break;
      case 'import-url': importUrl(); break;
      case 'paste': importPaste(); break;
      case 'open-icloud': closeMenu(); $('fileRecipe').click(); break;
      case 'export-all': closeMenu(); exportAll(); break;
      case 'import-all': closeMenu(); $('fileCollection').click(); break;
      case 'about': closeMenu(); showAbout(); break;
    }
  }

  function showAbout() {
    alert('Lingonbergets kulinariska samling\n\n' +
      'En fristående receptapp: fotografera handskrivna recept (OCR), infoga bilder, ' +
      'importera PDF eller länk (t.ex. köket.se), och redigera fritt i texteditorn.\n\n' +
      'Recept sparas lokalt på enheten och kan sparas till iCloud Drive via "Spara till iCloud". ' +
      'Lägg till appen på hemskärmen för helskärmsläge.');
  }

  function bind() {
    // Generell action-delegering
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (el) { e.preventDefault(); onAction(el.getAttribute('data-action')); }
    });

    // Topbar
    $('backBtn').addEventListener('click', function () {
      if (state.view === 'edit' && state.editing && state.editing.id) openReader(state.editing.id);
      else { renderCollection(); showView('collection'); }
    });
    $('menuBtn').addEventListener('click', openMenu);
    $('menuBackdrop').addEventListener('click', closeMenu);

    // Filter
    $('filters').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      state.filter = c.getAttribute('data-cat');
      qa('#filters .chip').forEach(function (x) { x.classList.toggle('is-active', x === c); });
      Store.setSetting('filter', state.filter);
      renderCollection();
    });

    // Sök
    $('searchInput').addEventListener('input', function (e) {
      state.query = e.target.value; renderCollection();
    });

    // Kategori-väljare
    $('catPicker').addEventListener('click', function (e) {
      var b = e.target.closest('.cat'); if (!b) return;
      state.category = b.getAttribute('data-cat'); renderCatPicker();
    });

    // Galleri – ta bort bild
    $('gallery').addEventListener('click', function (e) {
      var b = e.target.closest('[data-rm]'); if (!b) return;
      state.images.splice(parseInt(b.getAttribute('data-rm'), 10), 1); renderGallery();
    });

    // Filinmatningar
    $('filePhoto').addEventListener('change', function (e) {
      var files = e.target.files;
      if (state.imgIntent === 'scan' && files[0]) scanPhoto(files[0]);
      else if (files.length) addPhotos(files);
      e.target.value = ''; state.imgIntent = 'gallery';
    });
    $('filePdf').addEventListener('change', function (e) {
      if (e.target.files[0]) importPdf(e.target.files[0]); e.target.value = '';
    });
    $('fileRecipe').addEventListener('change', function (e) {
      if (e.target.files[0]) openFromICloud(e.target.files[0]); e.target.value = '';
    });
    $('fileCollection').addEventListener('change', function (e) {
      if (e.target.files[0]) openFromICloud(e.target.files[0]); e.target.value = '';
    });
  }

  /* ---------- Start ---------- */

  function init() {
    Editor.init($('editor'), $('editorToolbar'));
    bind();

    // återställ senaste filter
    var s = Store.getSettings();
    if (s.filter && (s.filter === 'all' || CATS[s.filter])) {
      state.filter = s.filter;
      qa('#filters .chip').forEach(function (x) { x.classList.toggle('is-active', x.getAttribute('data-cat') === s.filter); });
    }
    renderCollection();
    showView('collection');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.LBApp = { renderCollection: renderCollection };
})(window);

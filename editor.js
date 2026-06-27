/* editor.js — enkel rich text-editor.
   Återanvänder mekanismen från Baltic Yachts interna editor (specification.html):
   en contenteditable-yta + ett verktygsfält som kör document.execCommand,
   inkl. infoga bild via insertHTML <img class="sp-img">. */
(function (global) {
  'use strict';

  var Editor = {
    el: null,
    toolbar: null,
    _onChange: null,

    init: function (editorEl, toolbarEl, onChange) {
      this.el = editorEl;
      this.toolbar = toolbarEl;
      this._onChange = onChange || function () {};
      var self = this;

      // Verktygsknappar: kör execCommand med ev. värde (data-val).
      toolbarEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-cmd]');
        if (!btn) return;
        e.preventDefault();
        self.el.focus();
        var cmd = btn.getAttribute('data-cmd');
        var val = btn.getAttribute('data-val') || null;
        if (cmd === 'formatBlock' && val) {
          // växla rubrik på/av
          document.execCommand('formatBlock', false, val);
        } else {
          try { document.execCommand(cmd, false, val); } catch (err) {}
        }
        self._emit();
      });

      // Hindra knappar från att stjäla markeringen
      toolbarEl.addEventListener('mousedown', function (e) {
        if (e.target.closest('button')) e.preventDefault();
      });

      editorEl.addEventListener('input', function () { self._emit(); });
      editorEl.addEventListener('blur', function () { self._emit(); });
    },

    _emit: function () { if (this._onChange) this._onChange(this.getHtml()); },

    getHtml: function () { return this.el ? this.el.innerHTML : ''; },

    setHtml: function (html) { if (this.el) this.el.innerHTML = html || ''; },

    /** Lägg till text i slutet (t.ex. OCR/PDF/webbimport-resultat). */
    appendText: function (text) {
      if (!this.el || !text) return;
      var safe = String(text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var html = safe.split(/\n{2,}/).map(function (p) {
        return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
      }).join('');
      this.el.innerHTML += html;
      this._emit();
    },

    /** Lägg till färdig HTML (t.ex. tolkat recept med rubriker + listor). */
    appendHtml: function (html) {
      if (!this.el || !html) return;
      this.el.innerHTML += html;
      this._emit();
    },

    /** Infoga bild i texten (data-URL), som Baltic-editorn (insertHTML <img>). */
    insertImage: function (dataUrl) {
      if (!this.el) return;
      this.el.focus();
      var img = '<img class="sp-img" alt="" src="' + dataUrl + '">';
      try { document.execCommand('insertHTML', false, img); }
      catch (e) { this.el.innerHTML += img; }
      this._emit();
    }
  };

  global.Editor = Editor;
})(window);

/* Utilidades compartidas. Se cargan como script clásico para poder abrir la app con file:// */
(function (global) {
  'use strict';

  const ExamBuilder = (global.ExamBuilder = global.ExamBuilder || {});

  function uid(prefix) {
    const random = Math.random().toString(36).slice(2, 9);
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + random;
  }

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function truncate(value, max) {
    const text = clean(value);
    if (text.length <= max) return text;
    return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function textToHtml(value) {
    const safe = escapeHtml(value == null ? '' : value).replace(/\r\n?/g, '\n');
    return '<p>' + safe.replace(/\n/g, '<br>') + '</p>';
  }

  function slug(value, fallback) {
    const normalized = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return normalized || fallback || 'examen';
  }

  function formatDate(value) {
    if (!value) return '';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch (error) {
      return '';
    }
  }

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ''));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('No se pudo leer el archivo'));
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  function uniqueBy(items, keyFn) {
    const seen = new Set();
    const result = [];
    (items || []).forEach(function (item) {
      const key = keyFn(item);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(item);
    });
    return result;
  }

  function shuffle(items) {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait);
    };
  }

  ExamBuilder.Util = {
    uid: uid,
    clean: clean,
    truncate: truncate,
    escapeHtml: escapeHtml,
    textToHtml: textToHtml,
    slug: slug,
    formatDate: formatDate,
    download: download,
    readFileAsText: readFileAsText,
    uniqueBy: uniqueBy,
    shuffle: shuffle,
    clone: clone,
    debounce: debounce,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* Aplicación principal */
(function () {
  'use strict';

  const EB = window.ExamBuilder;
  const Util = EB.Util;
  const Parser = EB.Parser;
  const Generator = EB.Generator;
  const MoodleXml = EB.MoodleXml;
  const Store = EB.Store;
  const Curriculum = EB.Curriculum;

  const THEME_KEY = 'moodle-exam-builder-theme';
  const THEME_COLORS = { dark: '#0b1220', light: '#f6f3ec' };

  const TYPE_LABELS = {
    multichoice: 'Opción múltiple',
    truefalse: 'Verdadero / Falso',
    shortanswer: 'Respuesta corta',
    essay: 'Ensayo',
    matching: 'Emparejamiento',
  };
  const TYPE_ORDER = ['multichoice', 'truefalse', 'essay', 'matching', 'shortanswer'];

  const loadedState = Store.load();
  let state = loadedState || Store.createDefaultState();
  let restoredFromStorage = Boolean(loadedState);

  const ui = {
    tab: 'source',
    bankSearch: '',
    bankType: '',
    bankCriteria: '',
    bankSource: '',
    bankSelection: '',
    filteredBank: [],
    xmlPreview: '',
  };

  let editingQuestion = null;
  let editingIsNew = false;

  /* ============================================================
     Utilidades de interfaz
     ============================================================ */
  const $ = function (selector, root) {
    return (root || document).querySelector(selector);
  };
  const $$ = function (selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  };
  const esc = Util.escapeHtml;

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function applyTheme(theme, save) {
    const next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    const icon = $('#themeIcon');
    const label = $('#themeLabel');
    const button = $('#btnTheme');
    const meta = $('#themeColor');
    if (icon) icon.textContent = next === 'dark' ? '☀' : '☾';
    if (label) label.textContent = next === 'dark' ? 'Tema claro' : 'Tema oscuro';
    if (button) {
      button.setAttribute('aria-pressed', String(next === 'dark'));
      button.title = next === 'dark' ? 'Cambiar al tema claro' : 'Cambiar al tema oscuro';
    }
    if (meta) meta.setAttribute('content', THEME_COLORS[next]);
    if (save) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        /* Sin localStorage: el tema solo dura la sesión. */
      }
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
  }

  function persist() {
    const ok = Store.save(state);
    const status = $('#saveStatus');
    if (!status) return;
    if (ok) {
      status.textContent = 'Guardado';
      status.className = 'save-status saved';
    } else {
      status.textContent = 'No se pudo guardar';
      status.className = 'save-status error';
    }
  }

  function toast(message, kind) {
    const stack = $('#toastStack');
    if (!stack) return;
    const icon = kind === 'error' ? '⚠' : (kind === 'success' ? '✓' : 'ℹ');
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.innerHTML = '<span class="toast-icon" aria-hidden="true">' + icon + '</span><span>' + esc(message) + '</span>';
    stack.appendChild(node);
    setTimeout(function () {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      node.style.transition = 'opacity .2s, transform .2s';
      setTimeout(function () {
        node.remove();
      }, 220);
    }, 4400);
  }

  function setTab(tabName) {
    ui.tab = tabName;
    $$('.tab').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.tab === tabName);
    });
    $$('.panel').forEach(function (panel) {
      panel.hidden = panel.dataset.panel !== tabName;
    });
    if (tabName === 'bank') renderBank();
    if (tabName === 'export') {
      renderExport();
      updateXmlPreview();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function criteriaLabel(question) {
    if (!question.criteria || !question.criteria.length) return 'General';
    return question.criteria.map(function (letter) {
      return 'CE ' + letter + ')';
    }).join(', ');
  }

  function selectedRaNumbers() {
    if (!Array.isArray(state.exam.raNumbers)) {
      state.exam.raNumbers = state.exam.raNumber ? [String(state.exam.raNumber)] : [];
    }
    return state.exam.raNumbers.map(String);
  }

  function selectedRaDetails() {
    if (!Curriculum || !Curriculum.isLoaded()) return [];
    const cycleKey = state.exam.cycleKey;
    const moduleCode = state.exam.moduleCode;
    return selectedRaNumbers().map(function (raNumber) {
      const selection = Curriculum.getSelection(cycleKey, moduleCode, raNumber);
      return selection ? { raNumber: raNumber, selection: selection } : null;
    }).filter(Boolean);
  }

  function curriculumSelection() {
    const details = selectedRaDetails();
    return details.length ? details[0].selection : null;
  }

  function raCriteria(raNumber) {
    if (!state.exam.raCriteria || typeof state.exam.raCriteria !== 'object') {
      state.exam.raCriteria = {};
    }
    if (!Array.isArray(state.exam.raCriteria[raNumber])) {
      state.exam.raCriteria[raNumber] = [];
    }
    return state.exam.raCriteria[raNumber];
  }

  function setRaCriteria(raNumber, letters) {
    if (!state.exam.raCriteria || typeof state.exam.raCriteria !== 'object') {
      state.exam.raCriteria = {};
    }
    state.exam.raCriteria[raNumber] = Array.isArray(letters) ? letters.slice() : [];
  }

  function selectedCriteriaUnion() {
    const letters = [];
    const seen = new Set();
    selectedRaNumbers().forEach(function (raNumber) {
      raCriteria(raNumber).forEach(function (letter) {
        if (!seen.has(letter)) {
          seen.add(letter);
          letters.push(letter);
        }
      });
    });
    if (letters.length) return letters;
    if (state.exam.criteria && state.exam.criteria.length) return state.exam.criteria.slice();
    if (state.source) return state.source.criteria.map(function (criterion) { return criterion.letter; });
    return [];
  }

  function syncExamRaState() {
    state.exam.raNumbers = selectedRaNumbers();
    const details = selectedRaDetails();
    state.exam.raNumber = details.length ? details[0].raNumber : '';
    state.exam.ra = details.map(function (item) { return item.selection.ra.display; }).join(', ');
    state.exam.raText = details.map(function (item) { return item.selection.ra.display + ': ' + item.selection.ra.text; }).join(' | ');
    state.exam.criteria = selectedCriteriaUnion();
    state.exam.selectedRas = details.map(function (item) {
      const letters = raCriteria(item.raNumber);
      return {
        cycleKey: item.selection.cycle.key,
        cycleName: item.selection.cycle.name,
        moduleCode: item.selection.module.code,
        moduleName: item.selection.module.name,
        course: item.selection.module.course,
        raNumber: item.raNumber,
        raDisplay: item.selection.ra.display,
        raText: item.selection.ra.text,
        criteria: letters.slice(),
        criteriaDetails: item.selection.ra.criteria
          .filter(function (criterion) { return letters.indexOf(criterion.letter) !== -1; })
          .map(function (criterion) {
            return { letter: criterion.letter, text: criterion.text };
          }),
      };
    });
  }

  function activeCriteria() {
    const details = selectedRaDetails();
    if (details.length) {
      const result = [];
      const seen = new Set();
      details.forEach(function (item) {
        item.selection.ra.criteria.forEach(function (criterion) {
          if (seen.has(criterion.letter)) return;
          seen.add(criterion.letter);
          result.push({
            letter: criterion.letter,
            raNumber: item.raNumber,
            text: item.selection.ra.display + ' · ' + criterion.text,
          });
        });
      });
      if (result.length) return result;
    }
    if (state.source) {
      return state.source.criteria.map(function (criterion) {
        return {
          letter: criterion.letter,
          text: criterion.practices && criterion.practices.length
            ? 'Detectado en la' + (criterion.practices.length > 1 ? 's' : '') + ' práctica' + (criterion.practices.length > 1 ? 's' : '') + ' ' + criterion.practices.join(', ') + '.'
            : 'Criterio detectado en el cuaderno.',
          practices: criterion.practices || [],
        };
      });
    }
    return [];
  }

  function selectRa(cycleKey, moduleCode, raNumber, replace) {
    if (!Curriculum || !Curriculum.isLoaded()) return false;
    const selection = Curriculum.getSelection(cycleKey, moduleCode, raNumber);
    if (!selection) return false;
    if (replace) {
      state.exam.raNumbers = [];
      state.exam.raCriteria = {};
    }
    state.exam.cycleKey = selection.cycle.key;
    state.exam.cycleName = selection.cycle.name;
    state.exam.moduleCode = selection.module.code;
    state.exam.moduleName = selection.module.name;
    state.exam.course = selection.module.name + ' (' + selection.module.code + ')' +
      (selection.module.course ? ' · ' + selection.module.course + 'º curso' : '');
    if (selectedRaNumbers().indexOf(String(raNumber)) === -1) {
      state.exam.raNumbers = selectedRaNumbers().concat([String(raNumber)]);
    }
    if (!Array.isArray(raCriteria(raNumber)) || !raCriteria(raNumber).length) {
      setRaCriteria(raNumber, selection.ra.criteria.map(function (criterion) {
        return criterion.letter;
      }));
    }
    syncExamRaState();
    return true;
  }

  function toggleRaSelection(raNumber) {
    if (!Curriculum || !Curriculum.isLoaded()) return;
    const current = selectedRaNumbers();
    if (current.indexOf(String(raNumber)) !== -1) {
      state.exam.raNumbers = current.filter(function (item) { return item !== String(raNumber); });
      if (state.exam.raCriteria && state.exam.raCriteria[raNumber]) {
        delete state.exam.raCriteria[raNumber];
      }
      syncExamRaState();
    } else {
      selectRa(state.exam.cycleKey, state.exam.moduleCode, raNumber, false);
    }
    persist();
    renderExamForm();
    renderExamSummary();
    renderBank();
    updateTabBadges();
  }

  function toggleRaCriterion(raNumber, letter) {
    const list = raCriteria(raNumber).slice();
    const index = list.indexOf(letter);
    if (index === -1) list.push(letter);
    else list.splice(index, 1);
    setRaCriteria(raNumber, list);
    syncExamRaState();
  }

  function applyCurriculumSelection(cycleKey, moduleCode, raNumber) {
    if (!Curriculum || !Curriculum.isLoaded()) return false;
    return selectRa(cycleKey, moduleCode, raNumber, true);
  }

  function applyDetectedCurriculum(source) {
    if (!Curriculum || !Curriculum.isLoaded() || !source) return false;
    const detected = Curriculum.detectSource(source);
    if (!detected) return false;
    return applyCurriculumSelection(detected.cycleKey, detected.moduleCode, detected.raNumber);
  }


  function practiceById(id) {
    if (!state.source) return null;
    return state.source.practices.find(function (practice) {
      return practice.id === id;
    }) || null;
  }

  function practiceShort(question) {
    const practice = question.practiceIds && question.practiceIds.length ? practiceById(question.practiceIds[0]) : null;
    return practice ? 'P' + practice.number : '';
  }

  function questionIssues(question) {
    const issues = [];
    if (!String(question.text || '').trim()) issues.push('Sin enunciado');
    if (!String(question.title || '').trim()) issues.push('Sin título');
    if (question.type === 'multichoice') {
      const options = (question.options || []).filter(function (option) {
        return String(option.text || '').trim();
      });
      if (options.length < 2) issues.push('Menos de dos opciones');
      if (options.filter(function (option) { return option.correct; }).length !== 1) issues.push('No hay una única respuesta correcta');
    }
    if (question.type === 'shortanswer' && !(question.answers || []).filter(Boolean).length) issues.push('Sin respuestas aceptadas');
    if (question.type === 'matching') {
      const pairs = (question.matchingPairs || []).filter(function (pair) {
        return String(pair.left || '').trim() && String(pair.right || '').trim();
      });
      if (pairs.length < 2) issues.push('Menos de dos parejas completas');
    }
    return issues;
  }

  function selectedQuestions() {
    const map = {};
    state.bank.forEach(function (question) {
      map[question.id] = question;
    });
    return (state.exam.selectedIds || []).map(function (id) {
      return map[id];
    }).filter(Boolean);
  }

  function updateTabBadges() {
    const bankBadge = $('#bankTabBadge');
    const exportBadge = $('#exportTabBadge');
    if (bankBadge) bankBadge.textContent = String(state.bank.length);
    if (exportBadge) exportBadge.textContent = String((state.exam.selectedIds || []).length);
  }

  function ensureSource() {
    if (!state.source) {
      toast('Primero importa un cuaderno de prácticas HTML.', 'error');
      setTab('source');
      return false;
    }
    return true;
  }

  /* ============================================================
     FUENTE
     ============================================================ */
  function renderSource() {
    renderSourceSummary();
    renderSourceDetails();
  }

  function renderSourceSummary() {
    const container = $('#sourceSummary');
    if (!container) return;
    if (!state.source) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon" aria-hidden="true">📄</div>' +
          '<h3>Todavía no hay fuente</h3>' +
          '<p class="muted">Importa un cuaderno de prácticas para generar el banco de preguntas y configurar el examen.</p>' +
        '</div>';
      $('#sourceFileName').textContent = '';
      return;
    }

    const source = state.source;
    container.innerHTML =
      '<div class="source-hero">' +
        '<div class="source-hero-icon" aria-hidden="true">📘</div>' +
        '<div>' +
          '<h3>' + esc(source.title) + '</h3>' +
          '<p>' + esc([source.subject, source.courseCode, source.courseLevel].filter(Boolean).join(' · ')) + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="stat-grid">' +
        '<div class="stat"><strong>' + source.stats.practices + '</strong><span>Prácticas</span></div>' +
        '<div class="stat"><strong>' + source.stats.criteria + '</strong><span>Criterios</span></div>' +
        '<div class="stat"><strong>' + state.bank.length + '</strong><span>Preguntas</span></div>' +
        '<div class="stat"><strong>' + (state.exam.selectedIds || []).length + '</strong><span>En examen</span></div>' +
      '</div>' +
      '<div class="source-meta">' +
        '<div><span>Unidad</span><span>' + esc(source.unit || '—') + '</span></div>' +
        '<div><span>Resultado de aprendizaje</span><span>' + esc(source.ra ? source.ra + ' · ' + Util.truncate(source.raText, 40) : '—') + '</span></div>' +
        '<div><span>Centro</span><span>' + esc(source.school || '—') + '</span></div>' +
        '<div><span>Curso</span><span>' + esc(source.academicYear || '—') + '</span></div>' +
        '<div><span>Archivo</span><span>' + esc(source.fileName || '—') + '</span></div>' +
      '</div>' +
      '<div class="actions wrap">' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="regenerate-bank">↻ Regenerar banco</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="go-bank">Revisar preguntas</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="clear-source">Quitar fuente</button>' +
      '</div>';
    $('#sourceFileName').textContent = source.fileName || '';
  }

  function renderSourceDetails() {
    const container = $('#sourceDetails');
    if (!container) return;
    if (!state.source) {
      container.hidden = true;
      container.innerHTML = '';
      return;
    }
    container.hidden = false;
    const source = state.source;
    const criteria = source.criteria || [];
    const practices = source.practices || [];

    container.innerHTML =
      '<div class="grid grid-2">' +
        '<div class="card">' +
          '<h3 class="mt-0">Criterios de evaluación detectados</h3>' +
          '<p class="muted small">La app asocia cada criterio a las prácticas que lo trabajan.</p>' +
          '<div class="criteria-grid">' +
            criteria.map(function (criterion) {
              return '<div class="criteria-chip is-on" style="cursor:default">' +
                '<strong>CE ' + esc(criterion.letter) + ')</strong>' +
                '<small>Práctica' + (criterion.practices.length > 1 ? 's' : '') + ' ' + criterion.practices.join(', ') + '</small>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<h3 class="mt-0">Lecturas de arranque y comprensión</h3>' +
          '<div class="source-meta">' +
            practices.map(function (practice) {
              return '<div><span>P' + practice.number + ' · ' + esc(Util.truncate(practice.reading.title || 'Sin lectura', 42)) + '</span><span>' +
                practice.reading.questions.length + ' preguntas</span></div>';
            }).join('') +
          '</div>' +
          '<p class="hint">Las preguntas de comprensión se incorporan al banco como preguntas de ensayo editables.</p>' +
        '</div>' +
      '</div>' +
      '<div class="card mt-24">' +
        '<div class="row-between">' +
          '<h3 class="mt-0">Prácticas analizadas</h3>' +
          '<span class="badge badge-green">' + practices.length + ' detectadas</span>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<table class="practice-table">' +
            '<thead><tr><th>#</th><th>Práctica</th><th>Criterios</th><th>Lectura</th><th>Comprensión</th><th>Pasos</th><th>Puntos de control</th></tr></thead>' +
            '<tbody>' +
              practices.map(function (practice) {
                const checkpoints = practice.steps.filter(function (step) { return step.checkpoint; }).length;
                return '<tr>' +
                  '<td><span class="badge badge-gray">P' + practice.number + '</span></td>' +
                  '<td><div class="practice-title">' + esc(practice.title) + '</div><div class="practice-sub">' + esc(practice.objective ? Util.truncate(practice.objective, 100) : '') + '</div></td>' +
                  '<td><span class="badge badge-orange">' + esc(practice.criteriaLabel || '—') + '</span></td>' +
                  '<td>' + esc(Util.truncate(practice.reading.title || '—', 64)) + '</td>' +
                  '<td>' + practice.reading.questions.length + '</td>' +
                  '<td>' + practice.steps.length + '</td>' +
                  '<td>' + checkpoints + '</td>' +
                '</tr>';
              }).join('') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>';
  }

  async function handleSourceFile(file) {
    if (!file) return;
    if (state.source || state.bank.length) {
      const proceed = window.confirm('Se sustituirá la fuente actual y se generará un banco de preguntas nuevo. Se perderán los cambios manuales del banco actual. ¿Continuar?');
      if (!proceed) return;
    }
    try {
      const text = await Util.readFileAsText(file);
      const parsed = Parser.parse(text, file.name);
      loadParsedSource(parsed);
    } catch (error) {
      toast(error.message || 'No se pudo analizar el archivo HTML.', 'error');
    }
  }

  function loadParsedSource(parsed) {
    state.source = parsed;
    state.bank = Generator.generate(parsed, state.settings);
    const detected = applyDetectedCurriculum(parsed);
    if (!detected && !curriculumSelection()) {
      state.exam.raNumbers = [];
      state.exam.raCriteria = {};
      state.exam.criteria = parsed.criteria.map(function (criterion) {
        return criterion.letter;
      });
      state.exam.course = parsed.course || '';
      state.exam.ra = parsed.ra || '';
      state.exam.raText = parsed.raText || '';
      state.exam.cycleKey = '';
      state.exam.cycleName = '';
      state.exam.moduleCode = '';
      state.exam.moduleName = '';
    }
    state.exam.title = 'Examen ' + (parsed.unit ? parsed.unit + ' · ' : '') + parsed.title;
    state.exam.category = 'Examen ' + (parsed.unit || parsed.title);
    state.exam.fileName = Util.slug(state.exam.title, 'examen-moodle');
    state.exam.count = Math.min(50, Math.max(1, state.bank.length));
    state.exam.selectedIds = [];
    if (state.exam.defaultPoints <= 0) state.exam.defaultPoints = 1;

    const selection = Generator.selectQuestions(state.bank, state.exam);
    state.exam.selectedIds = selection.ids;
    persist();
    renderAll();
    setTab('exam');
    toast('Analizadas ' + parsed.practices.length + ' prácticas. Se han generado ' + state.bank.length + ' preguntas y se han seleccionado ' + selection.ids.length + '.', 'success');
  }

  async function loadSampleSource() {
    if (state.source || state.bank.length) {
      const proceed = window.confirm('Se sustituirá la fuente actual y el banco de preguntas. ¿Continuar?');
      if (!proceed) return;
    }
    try {
      const response = await fetch('practicas.html', { cache: 'no-store' });
      if (!response.ok) throw new Error('No se encontró practicas.html junto a la aplicación.');
      const text = await response.text();
      loadParsedSource(Parser.parse(text, 'practicas.html'));
    } catch (error) {
      toast('No se pudo cargar el ejemplo. Si abres la app con file://, usa el botón «Seleccionar archivo».', 'error');
    }
  }

  async function importCurriculumFile(file) {
    if (!file) return;
    try {
      const text = await Util.readFileAsText(file);
      Curriculum.parseText(text, file.name);
      if (state.source && !curriculumSelection()) {
        if (applyDetectedCurriculum(state.source)) persist();
      }
      renderAll();
      toast('Ciclos cargados desde ' + file.name + '.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo cargar el archivo de ciclos.', 'error');
    }
  }

  function loadCurriculumData() {
    if (!Curriculum) return;
    Curriculum.load().then(function (db) {
      if (db) {
        if (state.source && !curriculumSelection()) {
          if (applyDetectedCurriculum(state.source)) persist();
        }
        renderExam();
        renderBank();
        updateTabBadges();
      } else {
        renderExamForm();
      }
    });
  }

  function regenerateBank() {
    if (!ensureSource()) return;
    const manualCount = state.bank.filter(function (question) {
      return question.source === 'manual';
    }).length;
    const message = manualCount
      ? 'Se regenerarán todas las preguntas automáticas y se perderán las ' + manualCount + ' preguntas manuales. ¿Continuar?'
      : 'Se regenerará el banco de preguntas a partir de la fuente. ¿Continuar?';
    if (!window.confirm(message)) return;
    state.bank = Generator.generate(state.source, state.settings);
    const selection = Generator.selectQuestions(state.bank, state.exam);
    state.exam.selectedIds = selection.ids;
    persist();
    renderAll();
    toast('Banco regenerado: ' + state.bank.length + ' preguntas.', 'success');
  }

  function clearSource() {
    if (!window.confirm('Se quitará la fuente, el banco y la selección del examen. ¿Continuar?')) return;
    state.source = null;
    state.bank = [];
    state.exam.selectedIds = [];
    if (!curriculumSelection()) {
      state.exam.raNumbers = [];
      state.exam.raCriteria = {};
      state.exam.criteria = [];
    }
    state.exam.title = 'Examen UD1 · Gestores de contenidos';
    state.exam.category = 'Examen UD1';
    state.exam.fileName = 'examen-moodle';
    persist();
    renderAll();
    setTab('source');
    toast('Fuente eliminada.');
  }

  /* ============================================================
     EXAMEN
     ============================================================ */
  function availableTypeCounts() {
    const allTypes = {};
    TYPE_ORDER.forEach(function (type) { allTypes[type] = true; });
    const pool = Generator.getPool(state.bank, Object.assign({}, state.exam, { types: allTypes }));
    const counts = {};
    TYPE_ORDER.forEach(function (type) { counts[type] = 0; });
    pool.forEach(function (question) {
      counts[question.type] = (counts[question.type] || 0) + 1;
    });
    return counts;
  }

  function renderExam() {
    renderExamForm();
    renderExamSummary();
    renderExamSelection();
  }

  function renderExamForm() {
    const container = $('#examFormCard');
    if (!container) return;
    const exam = state.exam;
    if (Curriculum && Curriculum.isLoaded() && Array.isArray(exam.raNumbers) && exam.raNumbers.length) {
      syncExamRaState();
    }
    const counts = availableTypeCounts();
    const curriculumReady = Boolean(Curriculum && Curriculum.isLoaded());
    const cycles = curriculumReady ? Curriculum.getCycles() : [];
    const selectedCycle = curriculumReady ? Curriculum.getCycle(exam.cycleKey) : null;
    const modules = selectedCycle ? selectedCycle.modules : [];
    const selectedModule = curriculumReady ? Curriculum.getModule(exam.cycleKey, exam.moduleCode) : null;
    const ras = selectedModule ? selectedModule.ras : [];
    const selectedRas = selectedRaDetails();
    const selectedRaNumbersList = selectedRaNumbers();

    const cycleOptions = '<option value="">Selecciona un ciclo…</option>' + cycles.map(function (cycle) {
      const selected = exam.cycleKey === cycle.key;
      return '<option value="' + esc(cycle.key) + '"' + (selected ? ' selected' : '') + '>' + esc(cycle.name) + '</option>';
    }).join('');

    const moduleOptions = !selectedCycle
      ? '<option value="">Elige primero un ciclo</option>'
      : '<option value="">Selecciona un módulo…</option>' + modules.map(function (module) {
          const selected = exam.moduleCode === module.code;
          return '<option value="' + esc(module.code) + '"' + (selected ? ' selected' : '') + '>' +
            esc(module.code) + ' · ' + esc(module.name) + (module.course ? ' (' + esc(module.course) + 'º)' : '') +
          '</option>';
        }).join('');

    const raChecklist = !selectedModule
      ? '<p class="hint">Elige primero un ciclo y un módulo.</p>'
      : '<div class="ra-checklist">' + ras.map(function (ra) {
          const checked = selectedRaNumbersList.indexOf(String(ra.number)) !== -1;
          return '<label class="ra-option' + (checked ? ' is-on' : '') + '">' +
            '<input type="checkbox" data-action="toggle-ra" data-ra="' + esc(ra.number) + '"' + (checked ? ' checked' : '') + '>' +
            '<span><strong>' + esc(ra.display) + '</strong><small>' + esc(Util.truncate(ra.text, 110)) + '</small></span>' +
            '<span class="badge badge-gray">' + ra.criteria.length + ' CE</span>' +
          '</label>';
        }).join('') + '</div>';

    const criteriaGroupsHtml = selectedRas.length
      ? selectedRas.map(function (item) {
          const raNumber = item.raNumber;
          const letters = raCriteria(raNumber);
          return '<div class="ra-criteria-group">' +
            '<div class="ra-criteria-head">' +
              '<strong>' + esc(item.selection.ra.display) + '</strong>' +
              '<span class="badge badge-blue">' + esc(Util.truncate(item.selection.ra.text, 70)) + '</span>' +
            '</div>' +
            '<div class="criteria-grid">' +
              item.selection.ra.criteria.map(function (criterion) {
                const on = letters.indexOf(criterion.letter) !== -1;
                return '<button type="button" class="criteria-chip' + (on ? ' is-on' : '') + '" data-action="toggle-criterion" data-ra="' + esc(raNumber) + '" data-criterion="' + esc(criterion.letter) + '" aria-pressed="' + on + '">' +
                  '<strong>CE ' + esc(criterion.letter) + ')</strong>' +
                  '<small>' + esc(criterion.text) + '</small>' +
                '</button>';
              }).join('') +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="info-box">' +
          (selectedModule
            ? 'Marca uno o varios resultados de aprendizaje para cargar sus criterios de evaluación.'
            : 'Selecciona un ciclo y un módulo para ver los resultados de aprendizaje.') +
        '</div>';

    let curriculumNotice = '';
    if (!curriculumReady) {
      curriculumNotice = Curriculum && Curriculum.isLoading()
        ? '<div class="info-box curriculum-loading">Cargando <code>ciclos_db.json</code>…</div>'
        : '<div class="warn-box">No se pudo cargar <code>ciclos_db.json</code>' +
            (Curriculum && Curriculum.getError() ? ': ' + esc(Curriculum.getError()) : '.') +
            ' Puedes seleccionarlo manualmente. <button type="button" class="btn btn-small btn-ghost" data-action="load-curriculum">Cargar ciclos_db.json</button></div>';
    }

    const curriculumBlock = curriculumReady
      ? '<div class="field-grid">' +
          '<label class="field"><span>Ciclo formativo</span>' +
            '<select data-curriculum-field="cycleKey">' + cycleOptions + '</select>' +
          '</label>' +
          '<label class="field"><span>Módulo profesional</span>' +
            '<select data-curriculum-field="moduleCode"' + (selectedCycle ? '' : ' disabled') + '>' + moduleOptions + '</select>' +
          '</label>' +
        '</div>' +
        (selectedModule
          ? '<div class="field mt-16"><span class="field-label">Resultados de aprendizaje que se evalúan</span>' +
              raChecklist +
            '</div>' +
            '<div class="field mt-16"><span class="field-label">Criterios por resultado de aprendizaje</span>' +
              criteriaGroupsHtml +
            '</div>'
          : '<div class="info-box mt-16">Selecciona un módulo para ver sus resultados de aprendizaje.</div>') +
        curriculumNotice
      : curriculumNotice;

    const typesHtml = TYPE_ORDER.map(function (type) {
      return '<label class="type-option">' +
        '<input type="checkbox" data-exam-field="type:' + type + '"' + (exam.types[type] ? ' checked' : '') + '>' +
        '<span><strong>' + TYPE_LABELS[type] + '</strong><small>' + (type === 'essay' ? 'Preguntas abiertas de comprensión' : (type === 'matching' ? 'Relacionar elementos' : 'Disponible en el banco')) + '</small></span>' +
        '<span class="count" data-type-count="' + type + '">' + (counts[type] || 0) + '</span>' +
      '</label>';
    }).join('');

    container.innerHTML =
      '<form id="examSettingsForm" autocomplete="off">' +
        '<div class="form-section">' +
          '<h4>Identificación</h4>' +
          '<label class="field"><span>Título del examen</span>' +
            '<input type="text" data-exam-field="title" value="' + esc(exam.title) + '" placeholder="Examen UD1 · Gestores de contenidos">' +
          '</label>' +
          '<div class="field-grid">' +
            '<label class="field"><span>Categoría en Moodle</span>' +
              '<input type="text" data-exam-field="category" value="' + esc(exam.category) + '" placeholder="Examen UD1">' +
            '</label>' +
            '<label class="field"><span>Módulo / curso</span>' +
              '<input type="text" data-exam-field="course" value="' + esc(exam.course) + '" placeholder="Aplicaciones Web (0228)">' +
            '</label>' +
          '</div>' +
          '<div class="field-grid">' +
            '<label class="field"><span>Resultado de aprendizaje</span>' +
              '<input type="text" data-exam-field="ra" value="' + esc(exam.ra) + '" placeholder="RA1">' +
            '</label>' +
            '<label class="field"><span>Puntos por defecto</span>' +
              '<input type="number" min="0.1" step="0.1" data-exam-field="defaultPoints" value="' + esc(exam.defaultPoints) + '">' +
            '</label>' +
          '</div>' +
          '<label class="field"><span>Descripción o nota para el profesorado</span>' +
            '<textarea data-exam-field="description" placeholder="Se guarda en el proyecto JSON; Moodle no la importa como cabecera del cuestionario.">' + esc(exam.description) + '</textarea>' +
          '</label>' +
        '</div>' +
        '<div class="form-section">' +
          '<h4>Módulo, resultado de aprendizaje y criterios</h4>' +
          curriculumBlock +
        '</div>' +
        '<div class="form-section">' +
          '<h4>Número y tipos de pregunta</h4>' +
          '<div class="field-grid-3">' +
            '<label class="field"><span>Número de preguntas</span>' +
              '<input type="number" min="1" step="1" data-exam-field="count" value="' + esc(exam.count) + '">' +
            '</label>' +
            '<label class="field"><span>Preguntas disponibles</span>' +
              '<input type="text" value="' + Generator.getPool(state.bank, exam).length + '" readonly>' +
            '</label>' +
            '<label class="field"><span>Barajar respuestas</span>' +
              '<span class="checkline" style="padding-top:9px"><input type="checkbox" data-exam-field="shuffleAnswers"' + (exam.shuffleAnswers ? ' checked' : '') + '> Sí, en opción múltiple</span>' +
            '</label>' +
          '</div>' +
          '<div class="type-grid">' + typesHtml + '</div>' +
          '<p class="hint mt-8">La selección automática reparte las preguntas entre las prácticas disponibles y evita repeticiones.</p>' +
        '</div>' +
        '<div class="actions end mt-16">' +
          '<button type="button" class="btn btn-primary" data-action="generate-exam">Generar selección de preguntas</button>' +
        '</div>' +
      '</form>';

    const form = $('#examSettingsForm');
    form.addEventListener('change', onExamFieldChange);
  }

  function onExamFieldChange(event) {
    const target = event.target;
    const curriculumField = target.dataset.curriculumField;
    if (curriculumField) {
      onCurriculumFieldChange(curriculumField, target.value);
      return;
    }
    const field = target.dataset.examField;
    if (!field) return;
    if (field.indexOf('type:') === 0) {
      const type = field.split(':')[1];
      state.exam.types[type] = target.checked;
      updateTypeCountBadges();
      renderExamSummary();
      persist();
      return;
    }
    if (field === 'shuffleAnswers') {
      state.exam.shuffleAnswers = target.checked;
    } else if (field === 'count') {
      state.exam.count = Math.max(1, parseInt(target.value, 10) || 1);
    } else if (field === 'defaultPoints') {
      state.exam.defaultPoints = Math.max(0.1, Number(target.value) || 1);
    } else {
      state.exam[field] = target.value;
    }
    persist();
    renderExamSummary();
    updateTypeCountBadges();
  }

  function onCurriculumFieldChange(field, value) {
    if (!Curriculum || !Curriculum.isLoaded()) return;
    if (field === 'cycleKey') {
      if (!value) {
        state.exam.cycleKey = '';
        state.exam.cycleName = '';
        state.exam.moduleCode = '';
        state.exam.moduleName = '';
        state.exam.raNumbers = [];
        state.exam.raCriteria = {};
        syncExamRaState();
      } else {
        const cycle = Curriculum.getCycle(value);
        const module = cycle && cycle.modules.length ? cycle.modules[0] : null;
        state.exam.raNumbers = [];
        state.exam.raCriteria = {};
        if (module) {
          selectRa(value, module.code, module.ras.length ? module.ras[0].number : '', true);
        } else {
          state.exam.cycleKey = value;
          state.exam.cycleName = cycle ? cycle.name : '';
          syncExamRaState();
        }
      }
    } else if (field === 'moduleCode') {
      if (!value) {
        state.exam.moduleCode = '';
        state.exam.moduleName = '';
        state.exam.raNumbers = [];
        state.exam.raCriteria = {};
        syncExamRaState();
      } else {
        const module = Curriculum.getModule(state.exam.cycleKey, value);
        state.exam.raNumbers = [];
        state.exam.raCriteria = {};
        if (module && module.ras.length) {
          selectRa(state.exam.cycleKey, value, module.ras[0].number, true);
        } else {
          state.exam.moduleCode = value;
          state.exam.moduleName = module ? module.name : '';
          syncExamRaState();
        }
      }
    }
    persist();
    renderExamForm();
    renderExamSummary();
    renderBank();
    updateTabBadges();
  }

  function updateTypeCountBadges() {
    const counts = availableTypeCounts();
    $$('[data-type-count]').forEach(function (node) {
      node.textContent = counts[node.dataset.typeCount] || 0;
    });
    const available = $('#examFormCard input[readonly]');
    if (available) available.value = Generator.getPool(state.bank, state.exam).length;
  }

  function toggleCriterion(letter, raNumber) {
    const targetRa = raNumber || (selectedRaNumbers().length ? selectedRaNumbers()[0] : '');
    if (targetRa) {
      toggleRaCriterion(targetRa, letter);
    } else {
      const index = state.exam.criteria.indexOf(letter);
      if (index === -1) state.exam.criteria.push(letter);
      else state.exam.criteria.splice(index, 1);
    }
    persist();
    renderExamForm();
    renderExamSummary();
    renderBank();
  }

  function generateSelection() {
    if (!ensureSource()) return;
    if (!state.bank.length) {
      toast('El banco está vacío. Importa la fuente o crea preguntas manualmente.', 'error');
      return;
    }
    const selection = Generator.selectQuestions(state.bank, state.exam);
    state.exam.selectedIds = selection.ids;
    persist();
    renderExamSummary();
    renderExamSelection();
    renderBank();
    updateTabBadges();
    if (selection.shortfall > 0) {
      toast('Se han seleccionado ' + selection.ids.length + ' preguntas de las ' + state.exam.count + ' solicitadas: no hay suficientes con los filtros actuales.', 'error');
    } else {
      toast('Selección generada: ' + selection.ids.length + ' preguntas.', 'success');
    }
    const card = $('#examSelectionCard');
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderExamSummary() {
    const container = $('#examSummaryCard');
    if (!container) return;
    const selected = selectedQuestions();
    const pool = Generator.getPool(state.bank, state.exam);
    const totalPoints = selected.reduce(function (total, question) {
      return total + (Number(question.points) || 0);
    }, 0);
    const criteria = state.exam.criteria.length
      ? activeCriteria().filter(function (criterion) {
          return state.exam.criteria.indexOf(criterion.letter) !== -1;
        })
      : activeCriteria();
    const coverage = {};
    selected.forEach(function (question) {
      (question.criteria || []).forEach(function (letter) {
        coverage[letter] = (coverage[letter] || 0) + 1;
      });
    });
    const maxCoverage = Math.max.apply(null, criteria.map(function (criterion) {
      return coverage[criterion.letter] || 0;
    }).concat([1]));

    let warning = '';
    if (selected.length < state.exam.count) {
      warning = '<div class="warn-box">Hay ' + selected.length + ' preguntas seleccionadas y se solicitaron ' + state.exam.count + '. Reduce el número o amplía los criterios y tipos activos.</div>';
    }
    if (selected.some(function (question) { return questionIssues(question).length; })) {
      warning += '<div class="warn-box">Alguna pregunta seleccionada tiene datos incompletos. Revísala en el banco antes de exportar.</div>';
    }

    container.innerHTML =
      '<h3>Resumen del examen</h3>' +
      '<div class="big-number">' + selected.length + '<small> / ' + state.exam.count + ' preguntas</small></div>' +
      '<div class="summary-list mt-16">' +
        '<div class="summary-row"><span>Disponibles con filtros</span><strong>' + pool.length + '</strong></div>' +
        '<div class="summary-row"><span>Puntos totales</span><strong>' + totalPoints.toFixed(2).replace(/\.00$/, '') + '</strong></div>' +
        '<div class="summary-row"><span>Banco total</span><strong>' + state.bank.length + '</strong></div>' +
        '<div class="summary-row"><span>Módulo</span><strong>' + esc(state.exam.moduleName || state.exam.course || '—') + '</strong></div>' +
        '<div class="summary-row"><span>Resultado de aprendizaje</span><strong>' + esc(state.exam.ra || '—') + '</strong></div>' +
        '<div class="summary-row"><span>Criterios activos</span><strong>' + (state.exam.criteria.length ? state.exam.criteria.length : 'Todos') + '</strong></div>' +
      '</div>' +
      '<hr class="summary-divider">' +
      '<h3>Cobertura por criterio</h3>' +
      (criteria.length
        ? '<div class="coverage-list">' + criteria.map(function (criterion) {
            const value = coverage[criterion.letter] || 0;
            const percent = Math.round((value / maxCoverage) * 100);
            return '<div class="coverage-row">' +
              '<span class="coverage-label">CE ' + esc(criterion.letter) + ')</span>' +
              '<span class="coverage-bar"><span style="width:' + percent + '%"></span></span>' +
              '<span class="coverage-num">' + value + '</span>' +
            '</div>';
          }).join('') + '</div>'
        : '<p class="hint">Sin criterios detectados.</p>') +
      warning +
      (selected.length
        ? '<button type="button" class="btn btn-ghost btn-small mt-16" data-action="go-export">Ir a exportar →</button>'
        : '<div class="info-box mt-16">Pulsa «Generar selección de preguntas» para crear el examen.</div>');
  }

  function renderExamSelection() {
    const container = $('#examSelectionCard');
    if (!container) return;
    const selected = selectedQuestions();
    if (!selected.length) {
      container.innerHTML =
        '<div class="empty-mini">' +
          '<strong>No hay preguntas seleccionadas</strong>' +
          '<span>Configura el examen y pulsa «Generar selección de preguntas», o marca preguntas en el banco.</span>' +
        '</div>';
      return;
    }

    const totalPoints = selected.reduce(function (total, question) {
      return total + (Number(question.points) || 0);
    }, 0);

    container.innerHTML =
      '<div class="row-between">' +
        '<div><h3 class="mt-0">Preguntas del examen</h3><p class="muted small mb-0">' + selected.length + ' preguntas · ' + totalPoints.toFixed(2).replace(/\.00$/, '') + ' puntos</p></div>' +
        '<div class="actions"><button type="button" class="btn btn-ghost btn-small" data-action="go-bank">Editar en el banco</button><button type="button" class="btn btn-ghost btn-small" data-action="go-export">Exportar XML</button></div>' +
      '</div>' +
      '<div class="table-wrap mt-16">' +
        '<table class="selected-table">' +
          '<thead><tr><th class="num">#</th><th>Pregunta</th><th class="hide-sm">Tipo</th><th class="hide-sm">Criterios</th><th>Pts.</th><th></th></tr></thead>' +
          '<tbody>' +
            selected.map(function (question, index) {
              return '<tr>' +
                '<td class="num">' + (index + 1) + '</td>' +
                '<td><div class="qtitle">' + esc(question.title) + '</div><div class="qsub">' + esc(Util.truncate(question.text, 120)) + '</div></td>' +
                '<td class="hide-sm"><span class="badge badge-gray">' + esc(TYPE_LABELS[question.type] || question.type) + '</span></td>' +
                '<td class="hide-sm">' + esc(criteriaLabel(question)) + '</td>' +
                '<td>' + esc(question.points) + '</td>' +
                '<td><button type="button" class="icon-btn danger" data-action="remove-selected" data-id="' + esc(question.id) + '" title="Quitar del examen" aria-label="Quitar del examen">×</button></td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  /* ============================================================
     BANCO DE PREGUNTAS
     ============================================================ */
  function renderBank() {
    ensureBankToolbar();
    renderBankMeta();
    renderBankList();
    updateTabBadges();
  }

  function ensureBankToolbar() {
    const toolbar = $('#bankToolbar');
    if (!toolbar) return;
    const sourceKey = [
      state.source ? (state.source.parsedAt || state.source.fileName || 'source') : 'none',
      state.exam.cycleKey || '',
      state.exam.moduleCode || '',
      state.exam.raNumber || '',
    ].join('|');
    if (toolbar.dataset.ready === '1' && toolbar.dataset.sourceKey === sourceKey) return;

    const criteria = activeCriteria();
    if (ui.bankCriteria && !criteria.some(function (criterion) { return criterion.letter === ui.bankCriteria; })) {
      ui.bankCriteria = '';
    }
    toolbar.dataset.ready = '1';
    toolbar.dataset.sourceKey = sourceKey;
    toolbar.innerHTML =
      '<label class="field search-field"><span>Buscar</span>' +
        '<input type="search" id="bankSearch" placeholder="Título, enunciado o criterio…" value="' + esc(ui.bankSearch) + '">' +
      '</label>' +
      '<label class="field"><span>Tipo</span>' +
        '<select id="bankTypeFilter">' +
          '<option value="">Todos</option>' +
          TYPE_ORDER.map(function (type) {
            return '<option value="' + type + '"' + (ui.bankType === type ? ' selected' : '') + '>' + TYPE_LABELS[type] + '</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      '<label class="field"><span>Criterio</span>' +
        '<select id="bankCriteriaFilter">' +
          '<option value="">Todos</option>' +
          criteria.map(function (criterion) {
            return '<option value="' + esc(criterion.letter) + '"' + (ui.bankCriteria === criterion.letter ? ' selected' : '') + '>CE ' + esc(criterion.letter) + ') · ' + esc(Util.truncate(criterion.text, 50)) + '</option>';
          }).join('') +
        '</select>' +
      '</label>' +
      '<label class="field"><span>Selección</span>' +
        '<select id="bankSelectionFilter">' +
          '<option value="">Todas</option>' +
          '<option value="selected"' + (ui.bankSelection === 'selected' ? ' selected' : '') + '>En el examen</option>' +
          '<option value="unselected"' + (ui.bankSelection === 'unselected' ? ' selected' : '') + '>Fuera del examen</option>' +
        '</select>' +
      '</label>' +
      '<div class="actions">' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="select-visible">Marcar visibles</button>' +
        '<button type="button" class="btn btn-ghost btn-small" data-action="unselect-visible">Desmarcar</button>' +
      '</div>';
  }

  function getFilteredBank() {
    const search = ui.bankSearch.trim().toLowerCase();
    const selectedSet = new Set(state.exam.selectedIds || []);
    return state.bank.filter(function (question) {
      if (ui.bankType && question.type !== ui.bankType) return false;
      if (ui.bankCriteria && (question.criteria || []).indexOf(ui.bankCriteria) === -1) return false;
      if (ui.bankSelection === 'selected' && !selectedSet.has(question.id)) return false;
      if (ui.bankSelection === 'unselected' && selectedSet.has(question.id)) return false;
      if (search) {
        const practice = question.practiceIds && question.practiceIds.length ? practiceById(question.practiceIds[0]) : null;
        const haystack = [
          question.title,
          question.text,
          question.generalFeedback,
          criteriaLabel(question),
          practice ? practice.title : '',
          TYPE_LABELS[question.type] || question.type,
        ].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }
      return true;
    });
  }

  function renderBankMeta() {
    const meta = $('#bankMeta');
    if (!meta) return;
    ui.filteredBank = getFilteredBank();
    const selectedCount = (state.exam.selectedIds || []).length;
    meta.innerHTML =
      '<span><strong>' + ui.filteredBank.length + '</strong> preguntas visibles · <strong>' + state.bank.length + '</strong> en el banco</span>' +
      '<span><strong>' + selectedCount + '</strong> marcadas para el examen · ' + (state.source ? state.source.practices.length : 0) + ' prácticas</span>';
  }

  function renderBankList() {
    const list = $('#bankList');
    if (!list) return;
    const questions = ui.filteredBank.length || ui.bankSearch || ui.bankType || ui.bankCriteria || ui.bankSelection
      ? ui.filteredBank
      : state.bank;

    if (!questions.length) {
      list.innerHTML =
        '<div class="empty-mini">' +
          '<strong>' + (state.bank.length ? 'No hay preguntas con estos filtros' : 'El banco está vacío') + '</strong>' +
          '<span>' + (state.bank.length ? 'Cambia la búsqueda o los filtros.' : 'Importa un cuaderno de prácticas o crea una pregunta manual.') + '</span>' +
          (state.bank.length ? '' : '<button type="button" class="btn btn-primary btn-small mt-16" data-action="new-question">Crear pregunta</button>') +
        '</div>';
      return;
    }

    const selectedSet = new Set(state.exam.selectedIds || []);
    list.innerHTML = questions.map(function (question) {
      const selected = selectedSet.has(question.id);
      const practice = question.practiceIds && question.practiceIds.length ? practiceById(question.practiceIds[0]) : null;
      const issues = questionIssues(question);
      return '<article class="question-card' + (selected ? ' is-selected' : '') + '" data-question-id="' + esc(question.id) + '">' +
        '<div class="q-check"><input type="checkbox" data-select-question="' + esc(question.id) + '"' + (selected ? ' checked' : '') + ' aria-label="Incluir en el examen"></div>' +
        '<div>' +
          '<h3 class="question-title">' + esc(question.title) + '</h3>' +
          '<div class="question-text">' + esc(Util.truncate(question.text, 220)) + '</div>' +
          '<div class="q-meta">' +
            '<span class="badge badge-orange">' + esc(TYPE_LABELS[question.type] || question.type) + '</span>' +
            (practice ? '<span class="badge badge-gray">P' + practice.number + '</span>' : '') +
            '<span class="badge badge-blue">' + esc(criteriaLabel(question)) + '</span>' +
            '<span class="dot">·</span><span class="hint">' + esc(question.points) + ' pto' + (Number(question.points) === 1 ? '' : 's') + '</span>' +
            (question.source === 'manual' ? '<span class="badge badge-green">Manual</span>' : '') +
            (issues.length ? '<span class="badge badge-red" title="' + esc(issues.join(' · ')) + '">Revisar</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="q-actions">' +
          '<button type="button" class="icon-btn" data-action="edit-question" data-id="' + esc(question.id) + '" title="Editar" aria-label="Editar">✎</button>' +
          '<button type="button" class="icon-btn" data-action="duplicate-question" data-id="' + esc(question.id) + '" title="Duplicar" aria-label="Duplicar">⧉</button>' +
          '<button type="button" class="icon-btn danger" data-action="delete-question" data-id="' + esc(question.id) + '" title="Eliminar" aria-label="Eliminar">🗑</button>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function setQuestionSelection(id, selected) {
    const ids = new Set(state.exam.selectedIds || []);
    if (selected) {
      if (!ids.has(id)) {
        const order = state.bank.map(function (question) { return question.id; });
        ids.add(id);
        state.exam.selectedIds = order.filter(function (questionId) { return ids.has(questionId); });
      }
    } else {
      ids.delete(id);
      state.exam.selectedIds = (state.exam.selectedIds || []).filter(function (questionId) {
        return questionId !== id;
      });
    }
    persist();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
  }

  function addVisibleToExam() {
    const ids = new Set(state.exam.selectedIds || []);
    getFilteredBank().forEach(function (question) {
      ids.add(question.id);
    });
    const order = state.bank.map(function (question) { return question.id; });
    state.exam.selectedIds = order.filter(function (id) { return ids.has(id); });
    persist();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
    toast('Preguntas visibles añadidas al examen.');
  }

  function removeVisibleFromExam() {
    const ids = new Set(getFilteredBank().map(function (question) { return question.id; }));
    state.exam.selectedIds = (state.exam.selectedIds || []).filter(function (id) {
      return !ids.has(id);
    });
    persist();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
    toast('Preguntas visibles quitadas del examen.');
  }

  function deleteUnselectedQuestions() {
    const selected = new Set(state.exam.selectedIds || []);
    const toDelete = state.bank.filter(function (question) {
      return !selected.has(question.id);
    });
    if (!toDelete.length) {
      toast('No hay preguntas no seleccionadas para borrar.', 'info');
      return;
    }
    if (!window.confirm('Se eliminarán ' + toDelete.length + ' pregunta' + (toDelete.length === 1 ? '' : 's') + ' no seleccionadas. ¿Continuar?')) return;
    state.bank = state.bank.filter(function (question) {
      return selected.has(question.id);
    });
    persist();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
    toast(toDelete.length + ' pregunta' + (toDelete.length === 1 ? '' : 's') + ' no seleccionadas eliminadas.', 'success');
  }

  function deleteQuestion(id) {
    const question = state.bank.find(function (item) { return item.id === id; });
    if (!question) return;
    if (!window.confirm('¿Eliminar la pregunta «' + question.title + '»?')) return;
    state.bank = state.bank.filter(function (item) { return item.id !== id; });
    state.exam.selectedIds = (state.exam.selectedIds || []).filter(function (item) { return item !== id; });
    persist();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
    toast('Pregunta eliminada.');
  }

  function duplicateQuestion(id) {
    const question = state.bank.find(function (item) { return item.id === id; });
    if (!question) return;
    const copy = Util.clone(question);
    copy.id = Util.uid('q');
    copy.title = question.title + ' (copia)';
    copy.source = 'manual';
    copy.autoKind = '';
    const index = state.bank.indexOf(question);
    state.bank.splice(index + 1, 0, copy);
    persist();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
    toast('Pregunta duplicada.');
  }

  /* ============================================================
     EDITOR DE PREGUNTAS
     ============================================================ */
  function blankQuestion() {
    return {
      id: Util.uid('q'),
      title: '',
      type: 'multichoice',
      text: '',
      generalFeedback: '',
      points: state.exam.defaultPoints || 1,
      criteria: (state.exam.criteria || []).slice(),
      practiceIds: [],
      source: 'manual',
      autoKind: '',
      options: [
        { text: '', correct: true },
        { text: '', correct: false },
        { text: '', correct: false },
        { text: '', correct: false },
      ],
      trueAnswer: true,
      answers: [],
      essay: { responseLines: 10, graderInfo: '', responseTemplate: '' },
      matchingPairs: [
        { left: '', right: '' },
        { left: '', right: '' },
      ],
    };
  }

  function openQuestionEditor(id) {
    if (id) {
      const question = state.bank.find(function (item) { return item.id === id; });
      if (!question) return;
      editingQuestion = Util.clone(question);
      editingIsNew = false;
    } else {
      editingQuestion = blankQuestion();
      editingIsNew = true;
    }
    if (!editingQuestion.options || !editingQuestion.options.length) {
      editingQuestion.options = [
        { text: '', correct: true },
        { text: '', correct: false },
      ];
    }
    if (!editingQuestion.matchingPairs || !editingQuestion.matchingPairs.length) {
      editingQuestion.matchingPairs = [
        { left: '', right: '' },
        { left: '', right: '' },
      ];
    }
    $('#modalEyebrow').textContent = editingIsNew ? 'Nueva pregunta' : 'Editar pregunta';
    $('#modalTitle').textContent = editingIsNew ? 'Crear pregunta' : 'Editar pregunta';
    $('#modalError').textContent = '';
    renderModalBody();
    const modal = $('#questionModal');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      const first = $('#questionForm [name="qTitle"]');
      if (first) first.focus();
    }, 30);
  }

  function closeQuestionEditor() {
    $('#questionModal').hidden = true;
    document.body.style.overflow = '';
    editingQuestion = null;
    editingIsNew = false;
  }

  function renderModalBody() {
    const body = $('#modalBody');
    if (!body || !editingQuestion) return;
    const question = editingQuestion;
    const source = state.source;
    const criteria = activeCriteria();
    const practiceOptions = source ? source.practices.map(function (practice) {
      return '<option value="' + esc(practice.id) + '"' + (question.practiceIds && question.practiceIds[0] === practice.id ? ' selected' : '') + '>P' + practice.number + ' · ' + esc(practice.title) + '</option>';
    }).join('') : '';

    const typeFields = renderTypeFields(question);

    body.innerHTML =
      '<div class="form-section">' +
        '<div class="field-grid">' +
          '<label class="field"><span>Título de la pregunta</span>' +
            '<input type="text" name="qTitle" value="' + esc(question.title) + '" placeholder="P1 · Objetivo de la práctica">' +
          '</label>' +
          '<label class="field"><span>Tipo</span>' +
            '<select name="qType">' +
              TYPE_ORDER.map(function (type) {
                return '<option value="' + type + '"' + (question.type === type ? ' selected' : '') + '>' + TYPE_LABELS[type] + '</option>';
              }).join('') +
            '</select>' +
          '</label>' +
        '</div>' +
        '<label class="field"><span>Enunciado</span>' +
          '<textarea name="qText" class="tall" placeholder="Escribe la pregunta…">' + esc(question.text) + '</textarea>' +
        '</label>' +
        '<label class="field"><span>Retroalimentación general (opcional)</span>' +
          '<textarea name="qFeedback" placeholder="Explicación que verá el alumnado después de responder.">' + esc(question.generalFeedback) + '</textarea>' +
        '</label>' +
        '<div class="field-grid">' +
          '<label class="field"><span>Puntos</span>' +
            '<input type="number" min="0.1" step="0.1" name="qPoints" value="' + esc(question.points) + '">' +
          '</label>' +
          '<label class="field"><span>Práctica asociada</span>' +
            '<select name="qPractice">' +
              '<option value="">Sin práctica</option>' + practiceOptions +
            '</select>' +
          '</label>' +
        '</div>' +
        '<div class="field"><span class="field-label">Criterios de evaluación</span>' +
          (criteria.length
            ? '<div class="criteria-grid">' + criteria.map(function (criterion) {
                const checked = (question.criteria || []).indexOf(criterion.letter) !== -1;
                return '<label class="criteria-chip' + (checked ? ' is-on' : '') + '" style="cursor:pointer">' +
                  '<strong><input type="checkbox" name="qCriteria" value="' + esc(criterion.letter) + '"' + (checked ? ' checked' : '') + ' style="accent-color:var(--orange);margin-right:5px">CE ' + esc(criterion.letter) + ')</strong>' +
                  '<small>' + esc(Util.truncate(criterion.text || 'Criterio de evaluación', 130)) + '</small>' +
                '</label>';
              }).join('') + '</div>'
            : '<p class="hint">Selecciona un módulo y un RA, o importa una fuente, para poder asociar criterios.</p>') +
        '</div>' +
      '</div>' +
      '<div class="form-section">' +
        '<h4>' + TYPE_LABELS[question.type] + '</h4>' +
        typeFields +
      '</div>';

    const typeSelect = body.querySelector('[name="qType"]');
    typeSelect.addEventListener('change', function () {
      collectEditor();
      editingQuestion.type = typeSelect.value;
      renderModalBody();
    });
  }

  function renderTypeFields(question) {
    if (question.type === 'multichoice') {
      return '<div class="field"><span class="field-label">Opciones · marca la correcta</span>' +
        '<div class="option-list">' +
          question.options.map(function (option, index) {
            return '<div class="option-row" data-option-row>' +
              '<input type="radio" name="qCorrect" data-option-correct="' + index + '"' + (option.correct ? ' checked' : '') + ' aria-label="Respuesta correcta">' +
              '<input type="text" data-option-text value="' + esc(option.text) + '" placeholder="Opción ' + (index + 1) + '">' +
              '<button type="button" class="icon-btn danger" data-modal-action="remove-option" data-index="' + index + '" aria-label="Quitar opción">×</button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="actions mt-8"><button type="button" class="btn btn-ghost btn-small" data-modal-action="add-option">＋ Añadir opción</button></div>' +
        '<p class="hint mt-8">Debe haber al menos dos opciones y exactamente una marcada como correcta.</p>' +
      '</div>';
    }
    if (question.type === 'truefalse') {
      return '<div class="field"><span class="field-label">Respuesta correcta</span>' +
        '<label class="checkline mt-8"><input type="radio" name="qTrueFalse" value="true"' + (question.trueAnswer !== false ? ' checked' : '') + '> Verdadero</label>' +
        '<label class="checkline"><input type="radio" name="qTrueFalse" value="false"' + (question.trueAnswer === false ? ' checked' : '') + '> Falso</label>' +
      '</div>';
    }
    if (question.type === 'shortanswer') {
      return '<label class="field"><span>Respuestas aceptadas · una por línea</span>' +
        '<textarea name="qAnswers" placeholder="respuesta correcta&#10;otra variante aceptada">' + esc((question.answers || []).join('\n')) + '</textarea>' +
        '<span class="hint">Moodle comparará la respuesta del alumnado con cada línea (sin distinguir mayúsculas).</span>' +
      '</label>';
    }
    if (question.type === 'essay') {
      return '<div class="field-grid">' +
          '<label class="field"><span>Líneas de respuesta</span>' +
            '<input type="number" min="1" step="1" name="qResponseLines" value="' + esc(question.essay.responseLines || 10) + '">' +
          '</label>' +
        '</div>' +
        '<label class="field"><span>Información para el evaluador</span>' +
          '<textarea name="qGraderInfo" placeholder="Criterios de corrección, respuesta esperada…">' + esc(question.essay.graderInfo || '') + '</textarea>' +
        '</label>' +
        '<label class="field"><span>Plantilla de respuesta (opcional)</span>' +
          '<textarea name="qResponseTemplate" placeholder="Texto que aparecerá precargado en el editor del alumnado.">' + esc(question.essay.responseTemplate || '') + '</textarea>' +
        '</label>';
    }
    if (question.type === 'matching') {
      return '<div class="field"><span class="field-label">Parejas · elemento y respuesta</span>' +
        '<div class="pair-list">' +
          question.matchingPairs.map(function (pair, index) {
            return '<div class="pair-row" data-pair-row>' +
              '<input type="text" data-pair-left value="' + esc(pair.left) + '" placeholder="Elemento ' + (index + 1) + '">' +
              '<input type="text" data-pair-right value="' + esc(pair.right) + '" placeholder="Respuesta ' + (index + 1) + '">' +
              '<button type="button" class="icon-btn danger" data-modal-action="remove-pair" data-index="' + index + '" aria-label="Quitar pareja">×</button>' +
            '</div>';
          }).join('') +
        '</div>' +
        '<div class="actions mt-8"><button type="button" class="btn btn-ghost btn-small" data-modal-action="add-pair">＋ Añadir pareja</button></div>' +
        '<p class="hint mt-8">Moodle barajará las respuestas. Se necesitan al menos dos parejas completas.</p>' +
      '</div>';
    }
    return '';
  }

  function collectEditor() {
    const form = $('#questionForm');
    if (!form || !editingQuestion) return editingQuestion;
    const value = function (name) {
      const field = form.querySelector('[name="' + name + '"]');
      return field ? field.value : '';
    };
    editingQuestion.title = value('qTitle').trim();
    editingQuestion.type = value('qType');
    editingQuestion.text = value('qText').trim();
    editingQuestion.generalFeedback = value('qFeedback').trim();
    editingQuestion.points = Math.max(0.1, Number(value('qPoints')) || 1);
    editingQuestion.practiceIds = value('qPractice') ? [value('qPractice')] : [];
    editingQuestion.criteria = $$('input[name="qCriteria"]:checked', form).map(function (input) {
      return input.value;
    });
    if (editingQuestion.type === 'multichoice') {
      editingQuestion.options = $$('[data-option-row]', form).map(function (row) {
        return {
          text: row.querySelector('[data-option-text]').value.trim(),
          correct: row.querySelector('[data-option-correct]').checked,
        };
      });
    }
    if (editingQuestion.type === 'truefalse') {
      const checked = form.querySelector('input[name="qTrueFalse"]:checked');
      editingQuestion.trueAnswer = !checked || checked.value !== 'false';
    }
    if (editingQuestion.type === 'shortanswer') {
      editingQuestion.answers = value('qAnswers').split(/\r?\n/).map(function (answer) {
        return answer.trim();
      }).filter(Boolean);
    }
    if (editingQuestion.type === 'essay') {
      editingQuestion.essay = {
        responseLines: Math.max(1, parseInt(value('qResponseLines'), 10) || 10),
        graderInfo: value('qGraderInfo').trim(),
        responseTemplate: value('qResponseTemplate').trim(),
      };
    }
    if (editingQuestion.type === 'matching') {
      editingQuestion.matchingPairs = $$('[data-pair-row]', form).map(function (row) {
        return {
          left: row.querySelector('[data-pair-left]').value.trim(),
          right: row.querySelector('[data-pair-right]').value.trim(),
        };
      });
    }
    return editingQuestion;
  }

  function saveEditor(event) {
    event.preventDefault();
    const errorBox = $('#modalError');
    errorBox.textContent = '';
    const question = collectEditor();

    if (!question.title) {
      errorBox.textContent = 'El título es obligatorio.';
      return;
    }
    if (!question.text) {
      errorBox.textContent = 'El enunciado es obligatorio.';
      return;
    }
    if (question.type === 'multichoice') {
      const options = question.options.filter(function (option) { return option.text; });
      if (options.length < 2) {
        errorBox.textContent = 'Añade al menos dos opciones con texto.';
        return;
      }
      if (options.filter(function (option) { return option.correct; }).length !== 1) {
        errorBox.textContent = 'Marca exactamente una opción como correcta.';
        return;
      }
      question.options = options;
    }
    if (question.type === 'shortanswer' && !question.answers.length) {
      errorBox.textContent = 'Añade al menos una respuesta aceptada.';
      return;
    }
    if (question.type === 'matching') {
      question.matchingPairs = question.matchingPairs.filter(function (pair) {
        return pair.left && pair.right;
      });
      if (question.matchingPairs.length < 2) {
        errorBox.textContent = 'Añade al menos dos parejas completas.';
        return;
      }
    }

    if (editingIsNew) {
      question.source = 'manual';
      question.autoKind = '';
      state.bank.push(question);
    } else {
      const index = state.bank.findIndex(function (item) { return item.id === question.id; });
      if (index !== -1) state.bank[index] = question;
    }
    if ((state.exam.selectedIds || []).indexOf(question.id) === -1 && editingIsNew) {
      state.exam.selectedIds.push(question.id);
    }
    const wasNew = editingIsNew;
    persist();
    closeQuestionEditor();
    renderBank();
    renderExamSummary();
    renderExamSelection();
    updateTabBadges();
    toast(wasNew ? 'Pregunta creada y añadida al examen.' : 'Pregunta actualizada.', 'success');
  }

  function handleModalAction(action, index) {
    if (!editingQuestion) return;
    collectEditor();
    if (action === 'add-option') {
      editingQuestion.options.push({ text: '', correct: false });
    } else if (action === 'remove-option') {
      editingQuestion.options.splice(index, 1);
      if (!editingQuestion.options.some(function (option) { return option.correct; }) && editingQuestion.options.length) {
        editingQuestion.options[0].correct = true;
      }
    } else if (action === 'add-pair') {
      editingQuestion.matchingPairs.push({ left: '', right: '' });
    } else if (action === 'remove-pair') {
      editingQuestion.matchingPairs.splice(index, 1);
    }
    renderModalBody();
  }

  /* ============================================================
     EXPORTAR
     ============================================================ */
  function renderExport() {
    const summary = $('#exportSummary');
    const selected = selectedQuestions();
    const totalPoints = selected.reduce(function (total, question) {
      return total + (Number(question.points) || 0);
    }, 0);
    if (summary) {
      summary.innerHTML =
        '<div><span>Examen</span><strong>' + esc(state.exam.title) + '</strong></div>' +
        '<div><span>Categoría Moodle</span><strong>' + esc(state.exam.category) + '</strong></div>' +
        '<div><span>Módulo</span><strong>' + esc(state.exam.moduleName || state.exam.course || '—') + '</strong></div>' +
        '<div><span>RA</span><strong>' + esc(state.exam.ra || '—') + '</strong></div>' +
        '<div><span>Preguntas</span><strong>' + selected.length + '</strong></div>' +
        '<div><span>Puntos</span><strong>' + totalPoints.toFixed(2).replace(/\.00$/, '') + '</strong></div>' +
        '<div><span>Tipos</span><strong>' + (Array.from(new Set(selected.map(function (q) { return q.type; }))).map(function (type) { return TYPE_LABELS[type] || type; }).join(', ') || '—') + '</strong></div>';
    }

    const nameInput = $('#xmlFileName');
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = state.exam.fileName || Util.slug(state.exam.title, 'examen-moodle');
    }

    const quality = $('#qualityBox');
    if (quality) {
      const items = [];
      items.push({
        kind: state.source ? 'ok' : 'warn',
        text: state.source ? 'Fuente analizada: ' + state.source.practices.length + ' prácticas.' : 'No hay fuente HTML importada.',
      });
      items.push({
        kind: selected.length ? 'ok' : 'bad',
        text: selected.length ? selected.length + ' preguntas seleccionadas para el XML.' : 'No hay preguntas seleccionadas.',
      });
      if (selected.length && selected.length < state.exam.count) {
        items.push({ kind: 'warn', text: 'Se solicitaron ' + state.exam.count + ' preguntas y hay ' + selected.length + '.' });
      }
      const invalid = selected.filter(function (question) { return questionIssues(question).length; });
      items.push({
        kind: invalid.length ? 'bad' : 'ok',
        text: invalid.length ? invalid.length + ' preguntas con datos incompletos.' : 'Todas las preguntas seleccionadas tienen los datos mínimos.',
      });
      const criteriaWithoutQuestions = activeCriteria().filter(function (criterion) {
        return (state.exam.criteria || []).indexOf(criterion.letter) !== -1 && !selected.some(function (question) {
          return (question.criteria || []).indexOf(criterion.letter) !== -1;
        });
      });
      if (criteriaWithoutQuestions.length) {
        items.push({ kind: 'warn', text: 'Sin preguntas seleccionadas para: ' + criteriaWithoutQuestions.map(function (criterion) { return 'CE ' + criterion.letter + ')'; }).join(', ') });
      }
      quality.innerHTML = items.map(function (item) {
        return '<div class="quality-item ' + item.kind + '"><span class="mark">' + (item.kind === 'ok' ? '✓' : (item.kind === 'warn' ? '!' : '×')) + '</span><span>' + esc(item.text) + '</span></div>';
      }).join('');
    }
  }

  function generateXml() {
    return MoodleXml.generate(state);
  }

  function updateXmlPreview() {
    const preview = $('#xmlPreview');
    if (!preview) return;
    try {
      const xml = generateXml();
      ui.xmlPreview = xml;
      const clipped = xml.length > 12000 ? xml.slice(0, 12000) + '\n\n… vista previa recortada. Descarga el XML para ver el archivo completo.' : xml;
      preview.textContent = clipped;
    } catch (error) {
      preview.textContent = 'No se pudo generar el XML: ' + error.message;
    }
  }

  function downloadXml() {
    const selected = selectedQuestions();
    if (!selected.length) {
      toast('No hay preguntas seleccionadas. Genera el examen primero.', 'error');
      return;
    }
    const invalid = selected.filter(function (question) { return questionIssues(question).length; });
    if (invalid.length && !window.confirm('Hay ' + invalid.length + ' preguntas con datos incompletos. ¿Descargar de todos modos?')) return;
    try {
      const xml = generateXml();
      const name = Util.slug(state.exam.fileName || state.exam.title, 'examen-moodle');
      Util.download(name + '.xml', xml, 'application/xml;charset=utf-8');
      updateXmlPreview();
      toast('XML descargado.', 'success');
    } catch (error) {
      toast('No se pudo generar el XML: ' + error.message, 'error');
    }
  }

  function downloadOdt() {
    const selected = selectedQuestions();
    if (!selected.length) {
      toast('No hay preguntas seleccionadas. Genera el examen primero.', 'error');
      return;
    }
    const EB = window.ExamBuilder || {};
    if (!EB.Odt) {
      toast('No se pudo cargar el módulo ODT.', 'error');
      return;
    }
    EB.Odt.fillAndDownload(state).then(function () {
      toast('ODT descargado.', 'success');
    }).catch(function (error) {
      toast(error && error.message ? error.message : 'No se pudo generar el ODT.', 'error');
    });
  }

  function downloadJson() {
    if (Curriculum && Curriculum.isLoaded() && state.exam.raNumbers && state.exam.raNumbers.length) {
      syncExamRaState();
    }
    const payload = Store.toExport(state);
    const content = JSON.stringify(payload, null, 2);
    const name = Util.slug(state.exam.title || 'examen', 'examen') + '.json';
    Util.download(name, content, 'application/json;charset=utf-8');
    toast('Proyecto exportado en JSON.', 'success');
  }

  async function importJsonFile(file) {
    if (!file) return;
    try {
      const text = await Util.readFileAsText(file);
      const imported = Store.fromJson(text);
      if ((state.source || state.bank.length) && !window.confirm('Se sustituirá el examen actual por el contenido del JSON. ¿Continuar?')) return;
      state = imported;
      persist();
      renderAll();
      setTab('exam');
      toast('Proyecto importado: ' + state.bank.length + ' preguntas.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo importar el JSON.', 'error');
    }
  }

  function copyXml() {
    if (!ui.xmlPreview) updateXmlPreview();
    if (!ui.xmlPreview) {
      toast('Todavía no hay XML generado.', 'error');
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ui.xmlPreview).then(function () {
        toast('XML copiado al portapapeles.', 'success');
      }).catch(function () {
        toast('No se pudo copiar automáticamente.', 'error');
      });
    } else {
      const area = document.createElement('textarea');
      area.value = ui.xmlPreview;
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        toast('XML copiado al portapapeles.', 'success');
      } catch (error) {
        toast('No se pudo copiar automáticamente.', 'error');
      }
      area.remove();
    }
  }

  /* ============================================================
     EVENTOS
     ============================================================ */
  function bindEvents() {
    $('#btnTheme').addEventListener('click', toggleTheme);

    $$('.tab').forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.dataset.tab);
      });
    });

    $('#btnDismissRestore').addEventListener('click', function () {
      $('#restoreBanner').hidden = true;
    });

    $('#btnNewQuestion').addEventListener('click', function () {
      openQuestionEditor(null);
    });
    $('#btnDeleteUnselected').addEventListener('click', deleteUnselectedQuestions);

    const sourceFile = $('#sourceFile');
    const dropzone = $('#dropzone');
    dropzone.addEventListener('click', function () {
      sourceFile.click();
    });
    dropzone.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        sourceFile.click();
      }
    });
    sourceFile.addEventListener('change', function () {
      if (sourceFile.files && sourceFile.files[0]) handleSourceFile(sourceFile.files[0]);
      sourceFile.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropzone.classList.add('is-over');
      });
    });
    ['dragleave', 'drop'].forEach(function (eventName) {
      dropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        dropzone.classList.remove('is-over');
      });
    });
    dropzone.addEventListener('drop', function (event) {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) handleSourceFile(file);
    });
    $('#btnSampleSource').addEventListener('click', loadSampleSource);

    $('#btnImportJson').addEventListener('click', function () {
      $('#jsonFile').click();
    });
    $('#btnImportJson2').addEventListener('click', function () {
      $('#jsonFile').click();
    });
    $('#jsonFile').addEventListener('change', function () {
      const file = $('#jsonFile').files && $('#jsonFile').files[0];
      if (file) importJsonFile(file);
      $('#jsonFile').value = '';
    });
    $('#curriculumFile').addEventListener('change', function () {
      const file = $('#curriculumFile').files && $('#curriculumFile').files[0];
      if (file) importCurriculumFile(file);
      $('#curriculumFile').value = '';
    });
    $('#btnExportJson').addEventListener('click', downloadJson);
    $('#btnDownloadJson').addEventListener('click', downloadJson);

    $('#btnReset').addEventListener('click', function () {
      if (!window.confirm('Se borrarán la fuente, el banco y toda la configuración guardada. ¿Continuar?')) return;
      Store.clear();
      state = Store.createDefaultState();
      persist();
      renderAll();
      setTab('source');
      toast('Aplicación reiniciada.');
    });

    $('#btnDownloadXml').addEventListener('click', downloadXml);
    $('#btnDownloadOdt').addEventListener('click', downloadOdt);
    $('#btnPreviewXml').addEventListener('click', updateXmlPreview);
    $('#btnCopyXml').addEventListener('click', copyXml);

    $('#xmlFileName').addEventListener('change', function (event) {
      state.exam.fileName = Util.slug(event.target.value, 'examen-moodle');
      event.target.value = state.exam.fileName;
      persist();
    });

    $('#questionForm').addEventListener('submit', saveEditor);
    $('#btnCloseModal').addEventListener('click', closeQuestionEditor);
    $('#btnCancelModal').addEventListener('click', closeQuestionEditor);
    $('#questionModal').addEventListener('click', function (event) {
      if (event.target.closest('[data-close-modal]')) closeQuestionEditor();
    });
    $('#modalBody').addEventListener('click', function (event) {
      const button = event.target.closest('[data-modal-action]');
      if (!button) return;
      handleModalAction(button.dataset.modalAction, parseInt(button.dataset.index, 10));
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !$('#questionModal').hidden) closeQuestionEditor();
    });

    document.addEventListener('change', function (event) {
      const target = event.target;
      if (target.matches('[data-select-question]')) {
        setQuestionSelection(target.dataset.selectQuestion, target.checked);
        return;
      }
      if (target.id === 'bankTypeFilter') {
        ui.bankType = target.value;
        renderBankMeta();
        renderBankList();
      } else if (target.id === 'bankCriteriaFilter') {
        ui.bankCriteria = target.value;
        renderBankMeta();
        renderBankList();
      } else if (target.id === 'bankSelectionFilter') {
        ui.bankSelection = target.value;
        renderBankMeta();
        renderBankList();
      } else if (target.name === 'qCriteria') {
        const chip = target.closest('.criteria-chip');
        if (chip) chip.classList.toggle('is-on', target.checked);
      }
    });
    document.addEventListener('input', function (event) {
      if (event.target.id === 'bankSearch') {
        ui.bankSearch = event.target.value;
        renderBankMeta();
        renderBankList();
      }
    });

    document.addEventListener('click', function (event) {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      const id = actionEl.dataset.id;
      if (action === 'regenerate-bank') regenerateBank();
      else if (action === 'clear-source') clearSource();
      else if (action === 'go-bank') setTab('bank');
      else if (action === 'go-export') setTab('export');
      else if (action === 'new-question') openQuestionEditor(null);
      else if (action === 'generate-exam') generateSelection();
      else if (action === 'toggle-criterion') toggleCriterion(actionEl.dataset.criterion, actionEl.dataset.ra);
      else if (action === 'toggle-ra') toggleRaSelection(actionEl.dataset.ra);
      else if (action === 'remove-selected') setQuestionSelection(id, false);
      else if (action === 'edit-question') openQuestionEditor(id);
      else if (action === 'duplicate-question') duplicateQuestion(id);
      else if (action === 'delete-question') deleteQuestion(id);
      else if (action === 'select-visible') addVisibleToExam();
      else if (action === 'unselect-visible') removeVisibleFromExam();
      else if (action === 'load-curriculum') $('#curriculumFile').click();
      else if (action === 'delete-unselected') deleteUnselectedQuestions();
    });
  }

  function renderAll() {
    renderSource();
    renderExam();
    renderBank();
    renderExport();
    updateTabBadges();
    if (ui.tab === 'export') updateXmlPreview();
  }

  /* ============================================================
     INICIO
     ============================================================ */
  bindEvents();
  applyTheme(currentTheme(), false);
  loadCurriculumData();
  if (restoredFromStorage) {
    $('#restoreBanner').hidden = false;
    setTimeout(function () {
      $('#restoreBanner').hidden = true;
    }, 8000);
  }
  renderAll();
  if (restoredFromStorage && state.source) {
    /* Mantener la pestaña inicial para que el usuario vea el estado general. */
    setTab('source');
  }
})();

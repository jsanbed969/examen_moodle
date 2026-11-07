/* Carga y normalización de ciclos, módulos, RA y criterios desde ciclos_db.json */
(function (global) {
  'use strict';

  const ExamBuilder = (global.ExamBuilder = global.ExamBuilder || {});
  const DB_URL = 'ciclos_db.json';

  let database = null;
  let loading = false;
  let errorMessage = '';
  let label = DB_URL;

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function letterAt(index) {
    let number = index;
    let letters = '';
    do {
      letters = String.fromCharCode(97 + (number % 26)) + letters;
      number = Math.floor(number / 26) - 1;
    } while (number >= 0);
    return letters;
  }

  function displayRa(number, fallbackIndex) {
    const parsed = parseInt(String(number || '').replace(/\D/g, ''), 10);
    return 'RA' + (parsed || fallbackIndex + 1);
  }

  function normalizeRa(raw, index) {
    const number = clean(raw && raw.numero_ra) || String(index + 1);
    const rawText = clean(raw && raw.resultado_aprendizaje);
    const text = rawText.replace(/\s*Criterios de evaluación:?\s*$/i, '').trim();
    const rawCriteria = raw && Array.isArray(raw.criterios_evaluacion) ? raw.criterios_evaluacion : [];
    const criteria = rawCriteria.map(function (criterion, criterionIndex) {
      return {
        letter: letterAt(criterionIndex),
        number: criterionIndex + 1,
        text: clean(criterion),
      };
    }).filter(function (criterion) {
      return criterion.text;
    });
    return {
      number: number,
      display: displayRa(number, index),
      text: text,
      content: clean(raw && raw.contenido),
      criteria: criteria,
    };
  }

  function normalizeModule(raw, cycleKey, fallbackCode) {
    const code = clean(raw && raw.codigo) || clean(fallbackCode);
    const name = clean(raw && raw.nombre_modulo) || code || 'Módulo';
    const ras = (raw && Array.isArray(raw.resultados_aprendizaje) ? raw.resultados_aprendizaje : [])
      .map(normalizeRa)
      .filter(function (ra) { return ra.text || ra.criteria.length; });
    return {
      code: code,
      name: name,
      course: clean(raw && raw.curso),
      hours: clean(raw && raw.horas),
      weeklyHours: clean(raw && raw.horas_semanales),
      ects: clean(raw && raw.ects),
      ras: ras,
    };
  }

  function normalizeCycle(raw, key) {
    const modulesRaw = raw && raw.modulos;
    const modules = [];
    if (modulesRaw && typeof modulesRaw === 'object' && !Array.isArray(modulesRaw)) {
      Object.keys(modulesRaw).forEach(function (moduleKey) {
        const moduleRaw = modulesRaw[moduleKey];
        if (!moduleRaw || typeof moduleRaw !== 'object' || Array.isArray(moduleRaw)) return;
        if (!Array.isArray(moduleRaw.resultados_aprendizaje)) return;
        const module = normalizeModule(moduleRaw, key, moduleKey);
        if (module.ras.length) modules.push(module);
      });
    }
    return {
      key: key,
      name: clean(raw && raw.denominacion_ciclo) || key.toUpperCase(),
      level: clean(raw && raw.nivel),
      family: clean(raw && raw.familia_profesional),
      hours: clean(raw && raw.duracion_horas),
      modules: modules,
    };
  }

  function setData(raw, sourceLabel) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('ciclos_db.json no contiene un objeto de ciclos válido.');
    }
    const cycles = Object.keys(raw).map(function (key) {
      return normalizeCycle(raw[key], key);
    }).filter(function (cycle) {
      return cycle.modules.length;
    });
    if (!cycles.length) {
      throw new Error('ciclos_db.json no contiene módulos con resultados de aprendizaje.');
    }
    database = { cycles: cycles };
    label = sourceLabel || DB_URL;
    errorMessage = '';
    return database;
  }

  function parseText(text, sourceLabel) {
    let raw;
    try {
      raw = JSON.parse(String(text || ''));
    } catch (error) {
      throw new Error('El archivo de ciclos no es un JSON válido.');
    }
    return setData(raw, sourceLabel);
  }

  async function load() {
    if (database) return database;
    if (loading) return database;
    loading = true;
    errorMessage = '';
    try {
      const response = await fetch(DB_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('No se encontró ' + DB_URL + ' junto a la aplicación.');
      const raw = await response.json();
      setData(raw, DB_URL);
    } catch (error) {
      errorMessage = error.message || 'No se pudo cargar ciclos_db.json.';
    } finally {
      loading = false;
    }
    return database;
  }

  function isLoaded() {
    return Boolean(database);
  }

  function isLoading() {
    return loading;
  }

  function getError() {
    return errorMessage;
  }

  function getLabel() {
    return label;
  }

  function getCycles() {
    return database ? database.cycles : [];
  }

  function getCycle(key) {
    return getCycles().find(function (cycle) {
      return cycle.key === key;
    }) || null;
  }

  function getModules(cycleKey) {
    const cycle = getCycle(cycleKey);
    return cycle ? cycle.modules : [];
  }

  function getModule(cycleKey, moduleCode) {
    return getModules(cycleKey).find(function (module) {
      return module.code === moduleCode;
    }) || null;
  }

  function getRa(module, raNumber) {
    if (!module || !module.ras.length) return null;
    const digits = String(raNumber == null ? '' : raNumber).replace(/\D/g, '');
    if (digits) {
      const found = module.ras.find(function (ra) {
        return String(parseInt(ra.number, 10)) === String(parseInt(digits, 10));
      });
      if (found) return found;
    }
    return module.ras[0];
  }

  function getSelection(cycleKey, moduleCode, raNumber) {
    const cycle = getCycle(cycleKey);
    if (!cycle) return null;
    const module = getModule(cycleKey, moduleCode);
    if (!module) return null;
    const ra = getRa(module, raNumber);
    if (!ra) return null;
    return { cycle: cycle, module: module, ra: ra };
  }

  function findModulesByCode(code) {
    const normalized = clean(code).replace(/\D/g, '');
    if (!normalized) return [];
    const matches = [];
    getCycles().forEach(function (cycle) {
      cycle.modules.forEach(function (module) {
        if (clean(module.code).replace(/\D/g, '') === normalized) {
          matches.push({ cycle: cycle, module: module });
        }
      });
    });
    return matches;
  }

  function scoreCandidate(candidate, haystack) {
    let score = 0;
    const moduleName = candidate.module.name.toLowerCase();
    const cycleName = candidate.cycle.name.toLowerCase();
    if (moduleName && haystack.indexOf(moduleName) !== -1) score += 8;
    if (cycleName && haystack.indexOf(cycleName) !== -1) score += 5;
    if (haystack.indexOf(candidate.cycle.key.toLowerCase()) !== -1) score += 2;
    moduleName.split(/\s+/).filter(function (word) {
      return word.length > 3;
    }).forEach(function (word) {
      if (haystack.indexOf(word) !== -1) score += 1;
    });
    return score;
  }

  function detectRa(module, source) {
    if (!module || !module.ras.length) return null;
    const sourceRa = clean(source && source.ra);
    const digits = sourceRa.replace(/\D/g, '');
    if (digits) {
      const found = getRa(module, digits);
      if (found) return found;
    }
    const sourceText = clean(source && source.raText).toLowerCase();
    if (sourceText) {
      const found = module.ras.find(function (ra) {
        const text = ra.text.toLowerCase();
        return text.indexOf(sourceText) !== -1 || sourceText.indexOf(text) !== -1 ||
          (sourceText.length > 30 && text.indexOf(sourceText.slice(0, 30)) !== -1);
      });
      if (found) return found;
    }
    return module.ras[0];
  }

  function detectSource(source) {
    if (!database || !source) return null;
    const haystack = [
      source.course,
      source.courseCode,
      source.courseLevel,
      source.subject,
      source.title,
      source.raText,
      source.unit,
    ].map(clean).join(' ').toLowerCase();
    if (!haystack.trim()) return null;

    let code = clean(source.courseCode).replace(/\D/g, '');
    if (!code) {
      const codeMatch = haystack.match(/\b(\d{4})\b/);
      if (codeMatch) code = codeMatch[1];
    }

    let candidates = code ? findModulesByCode(code) : [];
    if (!candidates.length) {
      getCycles().forEach(function (cycle) {
        cycle.modules.forEach(function (module) {
          const name = module.name.toLowerCase();
          if (!name) return;
          const words = name.split(/\s+/).filter(function (word) { return word.length > 4; });
          if (name && haystack.indexOf(name) !== -1 || words.some(function (word) { return haystack.indexOf(word) !== -1; })) {
            candidates.push({ cycle: cycle, module: module });
          }
        });
      });
    }
    if (!candidates.length) return null;

    candidates.sort(function (a, b) {
      return scoreCandidate(b, haystack) - scoreCandidate(a, haystack);
    });
    const chosen = candidates[0];
    const ra = detectRa(chosen.module, source);
    if (!ra) return null;
    return {
      cycleKey: chosen.cycle.key,
      moduleCode: chosen.module.code,
      raNumber: ra.number,
    };
  }

  ExamBuilder.Curriculum = {
    DB_URL: DB_URL,
    load: load,
    parseText: parseText,
    isLoaded: isLoaded,
    isLoading: isLoading,
    getError: getError,
    getLabel: getLabel,
    getCycles: getCycles,
    getCycle: getCycle,
    getModules: getModules,
    getModule: getModule,
    getRa: getRa,
    getSelection: getSelection,
    findModulesByCode: findModulesByCode,
    detectSource: detectSource,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* Persistencia local e importación/exportación JSON */
(function (global) {
  'use strict';

  const ExamBuilder = (global.ExamBuilder = global.ExamBuilder || {});
  const Util = ExamBuilder.Util;
  const STORAGE_KEY = 'moodle-exam-builder-v1';
  const FORMAT = 'moodle-exam-builder';

  function createDefaultExam() {
    return {
      title: 'Examen UD1 · Gestores de contenidos',
      category: 'Examen UD1',
      description: '',
      course: '',
      ra: '',
      raText: '',
      cycleKey: '',
      cycleName: '',
      moduleCode: '',
      moduleName: '',
      raNumbers: [],
      raCriteria: {},
      selectedRas: [],
      count: 50,
      criteria: [],
      types: {
        multichoice: true,
        truefalse: true,
        essay: true,
        matching: true,
        shortanswer: true,
      },
      shuffleAnswers: true,
      defaultPoints: 1,
      selectedIds: [],
      fileName: 'examen-moodle',
      updatedAt: new Date().toISOString(),
    };
  }

  function createDefaultState() {
    return {
      format: FORMAT,
      version: 1,
      source: null,
      exam: createDefaultExam(),
      bank: [],
      settings: {
        comprehensionType: 'essay',
      },
    };
  }

  function normalizeQuestion(question) {
    const normalized = Object.assign({
      id: Util.uid('q'),
      title: 'Pregunta',
      type: 'multichoice',
      text: '',
      generalFeedback: '',
      points: 1,
      criteria: [],
      practiceIds: [],
      source: 'manual',
      autoKind: '',
      options: [],
      trueAnswer: true,
      answers: [],
      essay: { responseLines: 10, graderInfo: '', responseTemplate: '' },
      matchingPairs: [],
    }, question || {});
    normalized.id = normalized.id || Util.uid('q');
    normalized.title = String(normalized.title || 'Pregunta');
    normalized.text = String(normalized.text || '');
    normalized.points = Number(normalized.points) > 0 ? Number(normalized.points) : 1;
    normalized.criteria = Array.isArray(normalized.criteria) ? normalized.criteria : [];
    normalized.practiceIds = Array.isArray(normalized.practiceIds) ? normalized.practiceIds : [];
    normalized.options = Array.isArray(normalized.options) ? normalized.options.map(function (option) {
      return { text: String(option.text || ''), correct: Boolean(option.correct) };
    }) : [];
    normalized.answers = Array.isArray(normalized.answers) ? normalized.answers.map(String) : [];
    normalized.matchingPairs = Array.isArray(normalized.matchingPairs) ? normalized.matchingPairs.map(function (pair) {
      return { left: String(pair.left || ''), right: String(pair.right || '') };
    }) : [];
    normalized.essay = Object.assign({ responseLines: 10, graderInfo: '', responseTemplate: '' }, normalized.essay || {});
    normalized.trueAnswer = normalized.trueAnswer !== false;
    return normalized;
  }

  function normalizeSource(source) {
    if (!source || typeof source !== 'object') return null;
    const normalized = Object.assign({}, source);
    normalized.title = String(normalized.title || 'Cuaderno de prácticas');
    normalized.practices = Array.isArray(normalized.practices) ? normalized.practices : [];
    normalized.criteria = Array.isArray(normalized.criteria) ? normalized.criteria : [];
    normalized.practices.forEach(function (practice) {
      practice.id = practice.id || 'p' + (practice.number || 0);
      practice.number = Number(practice.number) || 0;
      practice.criteria = Array.isArray(practice.criteria) ? practice.criteria : [];
      practice.criteriaLabel = practice.criteriaLabel || 'CE ' + practice.criteria.join(', ');
      practice.data = practice.data || {};
      practice.reading = Object.assign({ title: '', source: '', paragraphs: [], questions: [] }, practice.reading || {});
      practice.reading.questions = Array.isArray(practice.reading.questions) ? practice.reading.questions : [];
      practice.materials = Array.isArray(practice.materials) ? practice.materials : [];
      practice.steps = Array.isArray(practice.steps) ? practice.steps : [];
      practice.commonErrors = Array.isArray(practice.commonErrors) ? practice.commonErrors : [];
      practice.rubric = Array.isArray(practice.rubric) ? practice.rubric : [];
      practice.deliverables = Array.isArray(practice.deliverables) ? practice.deliverables : [];
      practice.annexes = Array.isArray(practice.annexes) ? practice.annexes : [];
    });
    normalized.stats = Object.assign({
      practices: normalized.practices.length,
      criteria: normalized.criteria.length,
      readingQuestions: 0,
      steps: 0,
    }, normalized.stats || {});
    return normalized;
  }

  function normalizeExam(exam, source) {
    const normalized = Object.assign(createDefaultExam(), exam || {});
    normalized.title = String(normalized.title || '');
    normalized.category = String(normalized.category || '');
    normalized.description = String(normalized.description || '');
    normalized.course = String(normalized.course || '');
    normalized.ra = String(normalized.ra || '');
    normalized.raText = String(normalized.raText || '');
    normalized.cycleKey = String(normalized.cycleKey || '');
    normalized.cycleName = String(normalized.cycleName || '');
    normalized.moduleCode = String(normalized.moduleCode || '');
    normalized.moduleName = String(normalized.moduleName || '');
    normalized.raNumbers = Array.isArray(normalized.raNumbers) ? normalized.raNumbers.map(String) : (normalized.raNumber ? [String(normalized.raNumber)] : []);
    normalized.raCriteria = normalized.raCriteria && typeof normalized.raCriteria === 'object' && !Array.isArray(normalized.raCriteria) ? normalized.raCriteria : {};
    if (!normalized.raNumbers.length && normalized.raNumber) normalized.raNumbers = [String(normalized.raNumber)];
    if (normalized.raNumbers.length && !Object.keys(normalized.raCriteria).length && Array.isArray(normalized.criteria)) {
      normalized.raCriteria[normalized.raNumbers[0]] = normalized.criteria.map(String);
    }
    normalized.raNumbers.forEach(function (raNumber) {
      if (!Array.isArray(normalized.raCriteria[raNumber])) normalized.raCriteria[raNumber] = [];
    });
    normalized.selectedRas = Array.isArray(normalized.selectedRas) ? normalized.selectedRas : [];
    normalized.count = Math.max(1, parseInt(normalized.count, 10) || 50);
    normalized.criteria = Array.isArray(normalized.criteria) ? normalized.criteria.map(String) : [];
    normalized.types = Object.assign({
      multichoice: true,
      truefalse: true,
      essay: true,
      matching: true,
      shortanswer: true,
    }, normalized.types || {});
    normalized.types.essay = true;
    normalized.selectedIds = Array.isArray(normalized.selectedIds) ? normalized.selectedIds.map(String) : [];
    normalized.shuffleAnswers = normalized.shuffleAnswers !== false;
    normalized.defaultPoints = Number(normalized.defaultPoints) > 0 ? Number(normalized.defaultPoints) : 1;
    if (!normalized.title && source) normalized.title = 'Examen ' + (source.unit || '') + ' · ' + source.title;
    return normalized;
  }

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('El JSON no contiene un objeto válido.');
    const state = createDefaultState();
    state.source = normalizeSource(raw.source);
    state.exam = normalizeExam(raw.exam, state.source);
    state.bank = Array.isArray(raw.bank) ? raw.bank.map(normalizeQuestion) : [];
    state.settings = Object.assign({}, state.settings, raw.settings || {});
    if (state.source && Array.isArray(state.source.criteria) && !state.exam.criteria.length) {
      state.exam.criteria = state.source.criteria.map(function (criterion) {
        return criterion.letter;
      });
    }
    const ids = new Set(state.bank.map(function (question) { return question.id; }));
    state.exam.selectedIds = state.exam.selectedIds.filter(function (id) {
      return ids.has(id);
    });
    return state;
  }

  function load() {
    try {
      const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      return null;
    }
  }

  function save(state) {
    try {
      if (!global.localStorage) return false;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      return false;
    }
  }

  function clear() {
    try {
      if (global.localStorage) global.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* Sin espacio o sin localStorage: no es crítico. */
    }
  }

  function toExport(state) {
    return {
      format: FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      source: state.source,
      exam: state.exam,
      bank: state.bank,
      settings: state.settings,
    };
  }

  function fromJson(text) {
    let raw;
    try {
      raw = JSON.parse(String(text || ''));
    } catch (error) {
      throw new Error('El archivo no es un JSON válido.');
    }
    if (raw && raw.format && raw.format !== FORMAT) {
      throw new Error('El JSON no ha sido generado por esta aplicación (formato: ' + raw.format + ').');
    }
    if (!raw.source && !raw.bank && !raw.exam) {
      throw new Error('El JSON no contiene datos de examen reconocibles.');
    }
    return normalizeState(raw);
  }

  ExamBuilder.Store = {
    STORAGE_KEY: STORAGE_KEY,
    FORMAT: FORMAT,
    createDefaultState: createDefaultState,
    createDefaultExam: createDefaultExam,
    normalizeQuestion: normalizeQuestion,
    normalizeState: normalizeState,
    load: load,
    save: save,
    clear: clear,
    toExport: toExport,
    fromJson: fromJson,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* Exportador de preguntas al formato XML de importación de Moodle */
(function (global) {
  'use strict';

  const ExamBuilder = (global.ExamBuilder = global.ExamBuilder || {});
  const Util = ExamBuilder.Util;

  function sanitizeXml(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function xmlEscape(value) {
    return sanitizeXml(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function cdata(value) {
    const safe = sanitizeXml(value).replace(/\]\]>/g, ']]]]><![CDATA[>');
    return '<![CDATA[' + safe + ']]>';
  }

  function html(value) {
    return Util.textToHtml(sanitizeXml(value || ''));
  }

  function formatGrade(value) {
    const number = Number(value);
    return (isFinite(number) && number > 0 ? number : 1).toFixed(7);
  }

  function questionName(question) {
    return '<name>\n      <text>' + xmlEscape(question.title || 'Pregunta') + '</text>\n    </name>';
  }

  function questionText(question) {
    return '<questiontext format="html">\n      <text>' + cdata(html(question.text)) + '</text>\n    </questiontext>';
  }

  function generalFeedback(question) {
    const text = question.generalFeedback ? html(question.generalFeedback) : '';
    return '<generalfeedback format="html">\n      <text>' + cdata(text) + '</text>\n    </generalfeedback>';
  }

  function commonFields(question) {
    return [
      '    <defaultgrade>' + formatGrade(question.points) + '</defaultgrade>',
      '    <penalty>' + (question.type === 'essay' ? '0.0000000' : (question.type === 'truefalse' ? '1.0000000' : '0.3333333')) + '</penalty>',
      '    <hidden>0</hidden>',
      '    <idnumber>' + xmlEscape(question.id || '') + '</idnumber>',
    ].join('\n');
  }

  function emptyFeedback() {
    return '<feedback format="html"><text></text></feedback>';
  }

  function renderMultichoice(question, exam) {
    const options = (question.options || []).filter(function (option) {
      return option && String(option.text || '').trim();
    });
    if (!options.length) {
      options.push({ text: 'Sin opciones', correct: true });
    }
    let correctIndex = options.findIndex(function (option) {
      return option.correct;
    });
    if (correctIndex === -1) correctIndex = 0;

    const answers = options.map(function (option, index) {
      const fraction = index === correctIndex ? '100' : '0';
      return [
        '    <answer fraction="' + fraction + '" format="html">',
        '      <text>' + cdata(html(option.text)) + '</text>',
        '      ' + emptyFeedback(),
        '    </answer>',
      ].join('\n');
    }).join('\n');

    return [
      '    <single>true</single>',
      '    <shuffleanswers>' + (exam.shuffleAnswers === false ? 'false' : 'true') + '</shuffleanswers>',
      '    <answernumbering>abc</answernumbering>',
      '    <correctfeedback format="html"><text>Respuesta correcta.</text></correctfeedback>',
      '    <partiallycorrectfeedback format="html"><text>Respuesta parcialmente correcta.</text></partiallycorrectfeedback>',
      '    <incorrectfeedback format="html"><text>Respuesta incorrecta.</text></incorrectfeedback>',
      answers,
    ].join('\n');
  }

  function renderTrueFalse(question) {
    const trueFraction = question.trueAnswer === false ? '0' : '100';
    const falseFraction = question.trueAnswer === false ? '100' : '0';
    return [
      '    <answer fraction="' + trueFraction + '" format="moodle_auto_format">',
      '      <text>true</text>',
      '      ' + emptyFeedback(),
      '    </answer>',
      '    <answer fraction="' + falseFraction + '" format="moodle_auto_format">',
      '      <text>false</text>',
      '      ' + emptyFeedback(),
      '    </answer>',
    ].join('\n');
  }

  function renderShortAnswer(question) {
    const answers = (question.answers || []).filter(function (answer) {
      return String(answer || '').trim();
    });
    if (!answers.length) answers.push('Respuesta');
    return [
      '    <usecase>0</usecase>',
      answers.map(function (answer) {
        return [
          '    <answer fraction="100" format="moodle_auto_format">',
          '      <text>' + xmlEscape(answer) + '</text>',
          '      ' + emptyFeedback(),
          '    </answer>',
        ].join('\n');
      }).join('\n'),
    ].join('\n');
  }

  function renderEssay(question) {
    const essay = question.essay || {};
    const lines = parseInt(essay.responseLines, 10) || 10;
    const graderInfo = essay.graderInfo ? html(essay.graderInfo) : '';
    const template = essay.responseTemplate ? html(essay.responseTemplate) : '';
    return [
      '    <responseformat>editorfilepicker</responseformat>',
      '    <responserequired>1</responserequired>',
      '    <responsefieldlines>' + lines + '</responsefieldlines>',
      '    <minwordlimit></minwordlimit>',
      '    <maxwordlimit></maxwordlimit>',
      '    <attachments>-1</attachments>',
      '    <attachmentsrequired>0</attachmentsrequired>',
      '    <maxbytes>0</maxbytes>',
      '    <filetypeslist></filetypeslist>',
      '    <graderinfo format="html">',
      '      <text>' + cdata(graderInfo) + '</text>',
      '    </graderinfo>',
      '    <responsetemplate format="html">',
      '      <text>' + cdata(template) + '</text>',
      '    </responsetemplate>',
    ].join('\n');
  }

  function renderMatching(question) {
    const pairs = (question.matchingPairs || []).filter(function (pair) {
      return pair && String(pair.left || '').trim() && String(pair.right || '').trim();
    });
    if (!pairs.length) {
      pairs.push({ left: 'Elemento', right: 'Respuesta' });
    }
    return [
      '    <shuffleanswers>true</shuffleanswers>',
      '    <correctfeedback format="html"><text>Respuesta correcta.</text></correctfeedback>',
      '    <partiallycorrectfeedback format="html"><text>Respuesta parcialmente correcta.</text></partiallycorrectfeedback>',
      '    <incorrectfeedback format="html"><text>Respuesta incorrecta.</text></incorrectfeedback>',
      pairs.map(function (pair) {
        return [
          '    <subquestion format="html">',
          '      <text>' + cdata(html(pair.left)) + '</text>',
          '      <answer>',
          '        <text>' + xmlEscape(pair.right) + '</text>',
          '      </answer>',
          '    </subquestion>',
        ].join('\n');
      }).join('\n'),
    ].join('\n');
  }

  function renderQuestion(question, exam, index) {
    let specific = '';
    if (question.type === 'multichoice') specific = renderMultichoice(question, exam);
    else if (question.type === 'truefalse') specific = renderTrueFalse(question);
    else if (question.type === 'shortanswer') specific = renderShortAnswer(question);
    else if (question.type === 'essay') specific = renderEssay(question);
    else if (question.type === 'matching') specific = renderMatching(question);
    else specific = renderMultichoice(question, exam);

    return [
      '  <!-- question: ' + index + ' -->',
      '  <question type="' + xmlEscape(question.type) + '">',
      '    ' + questionName(question),
      '    ' + questionText(question),
      '    ' + generalFeedback(question),
      commonFields(question),
      specific,
      '  </question>',
    ].join('\n');
  }

  function generate(state) {
    const exam = state.exam || {};
    const bank = state.bank || [];
    const selectedIds = exam.selectedIds || [];
    const byId = {};
    bank.forEach(function (question) {
      byId[question.id] = question;
    });
    const questions = selectedIds.map(function (id) {
      return byId[id];
    }).filter(Boolean);

    const category = (exam.category || exam.title || 'Examen').replace(/\//g, '-');
    const infoParts = ['Preguntas del examen: ' + (exam.title || category)];
    if (exam.moduleName || exam.course) {
      infoParts.push('Módulo: ' + (exam.moduleName || exam.course) + (exam.moduleCode ? ' (' + exam.moduleCode + ')' : ''));
    }
    if (exam.ra || exam.raText) {
      infoParts.push((exam.ra || 'RA') + (exam.raText ? ': ' + exam.raText : ''));
    }
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<quiz>');
    lines.push('  <!-- Generado por el Generador de exámenes Moodle -->');
    lines.push('  <question type="category">');
    lines.push('    <category>');
    lines.push('      <text>$module$/top/' + xmlEscape(category) + '</text>');
    lines.push('    </category>');
    lines.push('    <info format="moodle_auto_format">');
    lines.push('      <text>' + xmlEscape(infoParts.join(' · ')) + '</text>');
    lines.push('    </info>');
    lines.push('    <idnumber></idnumber>');
    lines.push('  </question>');
    questions.forEach(function (question, index) {
      lines.push('');
      lines.push(renderQuestion(question, exam, index + 1));
    });
    lines.push('');
    lines.push('</quiz>');
    lines.push('');
    return lines.join('\n');
  }

  ExamBuilder.MoodleXml = {
    generate: generate,
    escape: xmlEscape,
    cdata: cdata,
  };
})(typeof window !== 'undefined' ? window : globalThis);

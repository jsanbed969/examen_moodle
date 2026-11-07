/* Generación del banco de preguntas a partir del cuaderno de prácticas */
(function (global) {
  'use strict';

  const ExamBuilder = (global.ExamBuilder = global.ExamBuilder || {});
  const Util = ExamBuilder.Util;
  const clean = Util.clean;
  const truncate = Util.truncate;
  const shuffle = Util.shuffle;
  const uniqueBy = Util.uniqueBy;
  const uid = Util.uid;

  function addDistractors(correct, distractors, total) {
    const values = [];
    const seen = new Set([clean(correct).toLowerCase()]);
    shuffle(distractors).forEach(function (value) {
      const normalized = clean(value);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) return;
      seen.add(key);
      values.push(normalized);
    });
    const fallbacks = [
      'Ninguna de las opciones anteriores es correcta.',
      'Todas las opciones anteriores son correctas.',
      'No se indica en el cuaderno de prácticas.',
    ];
    let index = 0;
    while (values.length < (total || 3) && index < fallbacks.length) {
      if (!seen.has(fallbacks[index].toLowerCase())) {
        values.push(fallbacks[index]);
        seen.add(fallbacks[index].toLowerCase());
      }
      index += 1;
    }
    return shuffle([clean(correct)].concat(values.slice(0, (total || 3))));
  }

  function makeQuestion(partial) {
    return Object.assign({
      id: uid('q'),
      title: 'Pregunta',
      type: 'multichoice',
      text: '',
      generalFeedback: '',
      points: 1,
      criteria: [],
      practiceIds: [],
      source: 'auto',
      autoKind: '',
      options: [],
      trueAnswer: true,
      answers: [],
      essay: { responseLines: 10, graderInfo: '', responseTemplate: '' },
      matchingPairs: [],
    }, partial);
  }

  function uniqueValues(values) {
    return uniqueBy((values || []).map(clean).filter(Boolean), function (value) {
      return value.toLowerCase();
    });
  }

  function practiceLabel(practice) {
    return 'práctica ' + practice.number + ' («' + truncate(practice.title, 90) + '»)';
  }

  function generate(source) {
    if (!source || !Array.isArray(source.practices)) return [];
    const questions = [];
    const allCriteria = source.criteria.map(function (criterion) {
      return criterion.letter;
    });

    function essayQuestion(partial) {
      return makeQuestion(Object.assign({
        type: 'essay',
        essay: {
          responseLines: 10,
          graderInfo: '',
          responseTemplate: '',
        },
      }, partial));
    }

    source.practices.forEach(function (practice) {
      const criteria = practice.criteria.slice();
      const practiceId = practice.id;
      const common = {
        criteria: criteria,
        practiceIds: [practiceId],
        source: 'auto',
      };
      const titleBase = 'P' + practice.number;
      const label = practiceLabel(practice);

      /* 1. Preguntas de comprensión lectora -> ensayo */
      practice.reading.questions.forEach(function (question, index) {
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Comprensión ' + (index + 1) + ': ' + truncate(question, 58),
          text: question,
          generalFeedback: 'Pregunta abierta basada en la lectura de arranque «' + practice.reading.title + '» de la ' + label + '.' +
            (practice.reading.source ? ' Fuente: ' + practice.reading.source : ''),
          autoKind: 'comprehension',
          essay: {
            responseLines: 10,
            graderInfo: 'Se valorará la corrección conceptual, el uso de la terminología de la práctica y la justificación de la respuesta. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));
      });

      /* 2. Objetivo de la práctica -> opción múltiple */
      if (practice.objective) {
        const distractors = source.practices.filter(function (other) {
          return other.id !== practice.id && other.objective;
        }).map(function (other) {
          return other.objective;
        });
        const options = addDistractors(practice.objective, distractors, 3).map(function (value) {
          return { text: value, correct: value === practice.objective };
        });
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Objetivo de la práctica',
          type: 'multichoice',
          text: '¿Cuál es el objetivo principal de la ' + label + '?',
          generalFeedback: 'El objetivo de la práctica ' + practice.number + ' es: ' + practice.objective,
          autoKind: 'objective',
          options: options,
        })));
      }

      /* 2b. Objetivo -> ensayo */
      if (practice.objective) {
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Objetivo de la práctica (ensayo)',
          text: 'Explica, con tus propias palabras, el objetivo principal de la ' + label + '. Indica qué se pretende conseguir y qué evidencias permiten comprobar que se ha alcanzado.',
          generalFeedback: 'El objetivo de la práctica ' + practice.number + ' es: ' + practice.objective,
          autoKind: 'objective-essay',
          essay: {
            responseLines: 8,
            graderInfo: 'Debe aparecer el objetivo de la práctica y su relación con el resultado esperado. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));
      }

      /* 2c. Objetivo -> respuesta corta */
      if (practice.objective) {
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Objetivo (respuesta corta)',
          type: 'shortanswer',
          text: 'Escribe el objetivo principal de la ' + label + '.',
          generalFeedback: 'El objetivo de la práctica ' + practice.number + ' es: ' + practice.objective,
          autoKind: 'objective-shortanswer',
          answers: [{ text: practice.objective, fraction: 100 }],
        })));
      }

      /* 3. Criterios de evaluación -> opción múltiple */
      if (practice.criteriaLabel) {
        const otherLabels = uniqueValues(source.practices.map(function (other) {
          return other.criteriaLabel;
        }).filter(function (label) {
          return label && label !== practice.criteriaLabel;
        }));
        const options = addDistractors(practice.criteriaLabel, otherLabels, 3).map(function (value) {
          return { text: value, correct: value === practice.criteriaLabel };
        });
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Criterios de evaluación',
          type: 'multichoice',
          text: '¿Qué criterios de evaluación se trabajan en la ' + label + '?',
          generalFeedback: 'La práctica ' + practice.number + ' trabaja ' + practice.criteriaLabel + '.',
          autoKind: 'criteria',
          options: options,
        })));
      }

      /* 3b. Criterios -> ensayo */
      if (practice.criteriaLabel) {
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Criterios de evaluación (ensayo)',
          text: '¿Qué criterios de evaluación se trabajan en la ' + label + '? Explica cómo se evidencia cada uno durante el desarrollo y la entrega de la práctica.',
          generalFeedback: 'La práctica ' + practice.number + ' trabaja ' + practice.criteriaLabel + '.',
          autoKind: 'criteria-essay',
          essay: {
            responseLines: 8,
            graderInfo: 'Debe relacionar la práctica con sus criterios de evaluación. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));
      }

      /* 3c. Criterios -> respuesta corta */
      if (practice.criteriaLabel) {
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Criterios (respuesta corta)',
          type: 'shortanswer',
          text: 'Indica los criterios de evaluación que se trabajan en la ' + label + '.',
          generalFeedback: 'La práctica ' + practice.number + ' trabaja ' + practice.criteriaLabel + '.',
          autoKind: 'criteria-shortanswer',
          answers: [{ text: practice.criteriaLabel, fraction: 100 }],
        })));
      }

      /* 4. Primer paso del desarrollo -> opción múltiple */
      if (practice.steps.length && practice.steps[0].title) {
        const first = practice.steps[0];
        const distractors = source.practices.filter(function (other) {
          return other.id !== practice.id;
        }).reduce(function (list, other) {
          other.steps.forEach(function (step) {
            if (step.title && step.title !== first.title) list.push(step.title);
          });
          return list;
        }, []);
        const options = addDistractors(first.title, distractors, 3).map(function (value) {
          return { text: value, correct: value === first.title };
        });
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Primer paso del procedimiento',
          type: 'multichoice',
          text: '¿Con qué paso comienza el desarrollo de la ' + label + '?',
          generalFeedback: 'El primer paso es «' + first.title + '».',
          autoKind: 'firststep',
          options: options,
        })));
      }

      /* 4b. Procedimiento completo -> ensayo */
      if (practice.steps.length) {
        const stepTitles = practice.steps.map(function (step, index) {
          return (index + 1) + '. ' + step.title;
        }).join('\n');
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Procedimiento de la práctica',
          text: 'Describe el procedimiento completo de la ' + label + ', enumerando sus pasos en orden y explicando qué se realiza en cada uno.',
          generalFeedback: 'Los pasos de la práctica ' + practice.number + ' son:\n' + stepTitles,
          autoKind: 'steps-essay',
          essay: {
            responseLines: 12,
            graderInfo: 'Debe reproducir el orden de los pasos y describir las acciones principales de cada uno. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));

        practice.steps.forEach(function (step, index) {
          questions.push(essayQuestion(Object.assign({}, common, {
            title: titleBase + ' · Paso ' + (index + 1) + ': ' + truncate(step.title, 52),
            text: 'En la ' + label + ', explica el paso «' + step.title + '»: qué acciones se realizan, qué material o recurso se utiliza y qué resultado o evidencia se obtiene.',
            generalFeedback: (step.detail ? step.detail + ' ' : '') + (step.checkpoint ? 'Punto de control: ' + step.checkpoint : ''),
            autoKind: 'step-essay',
            essay: {
              responseLines: 8,
              graderInfo: 'Debe describir las acciones, los recursos y el resultado del paso. Criterios: ' + practice.criteriaLabel + '.',
              responseTemplate: '',
            },
          })));

          if (step.checkpoint) {
            questions.push(essayQuestion(Object.assign({}, common, {
              title: titleBase + ' · Punto de control del paso ' + (index + 1),
              text: '¿Qué evidencia o resultado confirma el punto de control del paso «' + step.title + '» en la ' + label + '? Justifica tu respuesta.',
              generalFeedback: 'El punto de control del paso «' + step.title + '» exige: ' + step.checkpoint,
              autoKind: 'checkpoint-essay',
              essay: {
                responseLines: 6,
                graderInfo: 'Debe identificar la evidencia o resultado exigido en el punto de control. Criterios: ' + practice.criteriaLabel + '.',
                responseTemplate: '',
              },
            })));
          }
        });
      }

      /* 5. Punto de control -> opción múltiple */
      const checkedStep = practice.steps.find(function (step) {
        return step.checkpoint;
      });
      if (checkedStep) {
        const distractors = source.practices.filter(function (other) {
          return other.id !== practice.id;
        }).reduce(function (list, other) {
          other.steps.forEach(function (step) {
            if (step.checkpoint && step.checkpoint !== checkedStep.checkpoint) list.push(step.checkpoint);
          });
          return list;
        }, []);
        const options = addDistractors(checkedStep.checkpoint, distractors, 3).map(function (value) {
          return { text: value, correct: value === checkedStep.checkpoint };
        });
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Punto de control: ' + truncate(checkedStep.title, 36),
          type: 'multichoice',
          text: 'En la ' + label + ', ¿qué evidencia confirma el punto de control del paso «' + checkedStep.title + '»?',
          generalFeedback: 'El punto de control del paso «' + checkedStep.title + '» exige: ' + checkedStep.checkpoint,
          autoKind: 'checkpoint',
          options: options,
        })));
      }

      /* 6. Materiales -> opción múltiple */
      if (practice.materials.length) {
        const material = practice.materials[0];
        const distractors = source.practices.filter(function (other) {
          return other.id !== practice.id;
        }).reduce(function (list, other) {
          other.materials.forEach(function (item) {
            if (item && item !== material) list.push(item);
          });
          return list;
        }, []);
        const options = addDistractors(material, distractors, 3).map(function (value) {
          return { text: value, correct: value === material };
        });
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Materiales necesarios',
          type: 'multichoice',
          text: '¿Cuál de estos materiales se indica expresamente en la ' + label + '?',
          generalFeedback: 'Entre los materiales de la práctica ' + practice.number + ' aparece: ' + material,
          autoKind: 'materials',
          options: options,
        })));
      }

      /* 6b. Materiales -> ensayo */
      if (practice.materials.length) {
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Materiales necesarios (ensayo)',
          text: 'Enumera y describe los materiales necesarios para realizar la ' + label + ', explicando para qué se utiliza cada uno.',
          generalFeedback: 'Entre los materiales de la práctica ' + practice.number + ' aparecen: ' + practice.materials.join(', ') + '.',
          autoKind: 'materials-essay',
          essay: {
            responseLines: 6,
            graderInfo: 'Debe listar los materiales y su función en la práctica. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));
      }

      /* 7. Errores comunes -> opción múltiple */
      if (practice.commonErrors.length) {
        const error = practice.commonErrors[0];
        const distractors = source.practices.filter(function (other) {
          return other.id !== practice.id;
        }).reduce(function (list, other) {
          other.commonErrors.forEach(function (item) {
            if (item.text && item.text !== error.text) list.push(item.text);
          });
          return list;
        }, []);
        const options = addDistractors(error.text, distractors, 3).map(function (value) {
          return { text: value, correct: value === error.text };
        });
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Error común: ' + truncate(error.title || 'solución', 36),
          type: 'multichoice',
          text: 'En la ' + label + ', ¿qué solución se propone para el error «' + (error.title || 'detectado') + '»?',
          generalFeedback: (error.title ? error.title + ': ' : '') + error.text,
          autoKind: 'error',
          options: options,
        })));
      }

      /* 7b. Errores comunes -> ensayo */
      practice.commonErrors.forEach(function (error, index) {
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Error común ' + (index + 1) + ': ' + truncate(error.title || 'solución', 48),
          text: 'En la ' + label + ' puede aparecer el error «' + (error.title || 'detectado') + '». Explica por qué ocurre y cómo se resuelve.',
          generalFeedback: (error.title ? error.title + ': ' : '') + error.text,
          autoKind: 'error-essay',
          essay: {
            responseLines: 6,
            graderInfo: 'Debe explicar la causa del error y su solución. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));
      });

      /* 8. Verdadero / falso */
      if (practice.criteria.length) {
        const ownCriterion = practice.criteria[0];
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Verdadero/Falso (criterio propio)',
          type: 'truefalse',
          text: 'La ' + label + ' contribuye a evaluar el criterio CE ' + ownCriterion + ').',
          generalFeedback: 'Verdadero. La práctica ' + practice.number + ' trabaja ' + practice.criteriaLabel + '.',
          autoKind: 'truefalse',
          trueAnswer: true,
        })));
      }
      const foreignCriterion = allCriteria.find(function (letter) {
        return practice.criteria.indexOf(letter) === -1;
      });
      if (foreignCriterion) {
        questions.push(makeQuestion(Object.assign({}, common, {
          title: titleBase + ' · Verdadero/Falso (criterio ajeno)',
          type: 'truefalse',
          text: 'La ' + label + ' contribuye a evaluar el criterio CE ' + foreignCriterion + ').',
          generalFeedback: 'Falso. La práctica ' + practice.number + ' trabaja ' + practice.criteriaLabel + '; el criterio CE ' + foreignCriterion + ') corresponde a otra práctica.',
          autoKind: 'truefalse',
          trueAnswer: false,
        })));
      }

      /* 9. Entregables -> ensayo */
      if (practice.deliverables && practice.deliverables.length) {
        questions.push(essayQuestion(Object.assign({}, common, {
          title: titleBase + ' · Entregables',
          text: '¿Qué debe contener la entrega final de la ' + label + '? Describe los elementos que deben incluirse y su propósito.',
          generalFeedback: 'La entrega de la práctica ' + practice.number + ' debe contener: ' + practice.deliverables.join('; ') + '.',
          autoKind: 'deliverables-essay',
          essay: {
            responseLines: 6,
            graderInfo: 'Debe describir los entregables y su propósito. Criterios: ' + practice.criteriaLabel + '.',
            responseTemplate: '',
          },
        })));
      }
    });

    /* 10. Emparejamiento: prácticas y criterios */
    if (source.practices.length >= 2) {
      questions.push(makeQuestion({
        title: 'Relaciona cada práctica con sus criterios de evaluación',
        type: 'matching',
        text: 'Relaciona cada práctica del cuaderno con los criterios de evaluación que trabaja.',
        generalFeedback: 'Cada práctica contribuye a uno o varios criterios de evaluación del RA.',
        criteria: allCriteria.slice(),
        practiceIds: source.practices.map(function (practice) { return practice.id; }),
        source: 'auto',
        autoKind: 'matching',
        matchingPairs: source.practices.map(function (practice) {
          return {
            left: 'Práctica ' + practice.number + ' · ' + practice.title,
            right: practice.criteriaLabel,
          };
        }),
      }));
    }

    /* 11. Emparejamiento: lecturas y prácticas */
    const readings = source.practices.filter(function (practice) {
      return practice.reading && practice.reading.title;
    });
    if (readings.length >= 2) {
      questions.push(makeQuestion({
        title: 'Relaciona cada lectura de arranque con su práctica',
        type: 'matching',
        text: 'Relaciona cada lectura de arranque con la práctica en la que se utiliza.',
        generalFeedback: 'Las lecturas de arranque introducen el contenido de cada práctica.',
        criteria: allCriteria.slice(),
        practiceIds: readings.map(function (practice) { return practice.id; }),
        source: 'auto',
        autoKind: 'matching',
        matchingPairs: readings.map(function (practice) {
          return {
            left: practice.reading.title,
            right: 'Práctica ' + practice.number + ' · ' + practice.title,
          };
        }),
      }));
    }

    /* 12. Emparejamiento adicional por pasos con punto de control */
    source.practices.forEach(function (practice) {
      const pairs = practice.steps.filter(function (step) {
        return step.checkpoint;
      }).map(function (step) {
        return { left: step.title, right: step.checkpoint };
      });
      if (pairs.length >= 2) {
        questions.push(makeQuestion({
          title: 'P' + practice.number + ' · Relaciona cada paso con su punto de control',
          type: 'matching',
          text: 'Relaciona cada paso de la ' + practiceLabel(practice) + ' con la evidencia o resultado que lo valida.',
          generalFeedback: 'Cada paso de la práctica ' + practice.number + ' tiene un punto de control asociado.',
          criteria: practice.criteria.slice(),
          practiceIds: [practice.id],
          source: 'auto',
          autoKind: 'matching',
          matchingPairs: pairs,
        }));
      }
    });

    /* 13. Emparejamiento: prácticas y primer paso */
    if (source.practices.filter(function (p) { return p.steps.length && p.steps[0].title; }).length >= 2) {
      questions.push(makeQuestion({
        title: 'Relaciona cada práctica con su primer paso',
        type: 'matching',
        text: 'Relaciona cada práctica del cuaderno con el paso con el que comienza su desarrollo.',
        generalFeedback: 'El primer paso de cada práctica inicia su procedimiento.',
        criteria: allCriteria.slice(),
        practiceIds: source.practices.map(function (practice) { return practice.id; }),
        source: 'auto',
        autoKind: 'matching',
        matchingPairs: source.practices.filter(function (p) {
          return p.steps.length && p.steps[0].title;
        }).map(function (practice) {
          return {
            left: 'Práctica ' + practice.number + ' · ' + practice.title,
            right: practice.steps[0].title,
          };
        }),
      }));
    }

    /* 14. Emparejamiento: prácticas y errores comunes */
    const practicesWithErrors = source.practices.filter(function (practice) {
      return practice.commonErrors && practice.commonErrors.length;
    });
    if (practicesWithErrors.length >= 2) {
      questions.push(makeQuestion({
        title: 'Relaciona cada práctica con uno de sus errores comunes',
        type: 'matching',
        text: 'Relaciona cada práctica del cuaderno con un error común que puede aparecer en ella.',
        generalFeedback: 'Cada práctica puede presentar errores comunes con su solución.',
        criteria: allCriteria.slice(),
        practiceIds: practicesWithErrors.map(function (practice) { return practice.id; }),
        source: 'auto',
        autoKind: 'matching',
        matchingPairs: practicesWithErrors.map(function (practice) {
          return {
            left: 'Práctica ' + practice.number + ' · ' + practice.title,
            right: practice.commonErrors[0].title || practice.commonErrors[0].text,
          };
        }),
      }));
    }

    /* Asegurar al menos 10 preguntas de cada tipo, repitiendo datos si es necesario */
    const TARGET_PER_TYPE = 10;
    const REQUIRED_TYPES = ['multichoice', 'truefalse', 'essay', 'matching', 'shortanswer'];
    function fallbackQuestion(type, index) {
      const baseTitle = (source && source.title) ? source.title : 'el cuaderno analizado';
      if (type === 'multichoice') {
        return makeQuestion({
          title: 'Pregunta de opción múltiple ' + (index + 1) + ' · ' + baseTitle,
          type: 'multichoice',
          text: 'Pregunta de opción múltiple sobre ' + baseTitle + '.',
          generalFeedback: 'Pregunta generada automáticamente para completar el cupo mínimo.',
          criteria: allCriteria.slice(),
          practiceIds: [],
          source: 'auto',
          autoKind: 'fallback',
          options: [
            { text: 'Opción correcta', correct: true },
            { text: 'Opción incorrecta 1', correct: false },
            { text: 'Opción incorrecta 2', correct: false },
            { text: 'Opción incorrecta 3', correct: false },
          ],
        });
      }
      if (type === 'truefalse') {
        return makeQuestion({
          title: 'Pregunta verdadero/falso ' + (index + 1) + ' · ' + baseTitle,
          type: 'truefalse',
          text: 'La afirmación sobre ' + baseTitle + ' es correcta.',
          generalFeedback: 'Pregunta generada automáticamente para completar el cupo mínimo.',
          criteria: allCriteria.slice(),
          practiceIds: [],
          source: 'auto',
          autoKind: 'fallback',
          trueAnswer: true,
        });
      }
      if (type === 'shortanswer') {
        return makeQuestion({
          title: 'Pregunta de respuesta corta ' + (index + 1) + ' · ' + baseTitle,
          type: 'shortanswer',
          text: 'Escribe un concepto clave sobre ' + baseTitle + '.',
          generalFeedback: 'Pregunta generada automáticamente para completar el cupo mínimo.',
          criteria: allCriteria.slice(),
          practiceIds: [],
          source: 'auto',
          autoKind: 'fallback',
          answers: [{ text: baseTitle, fraction: 100 }],
        });
      }
      if (type === 'matching') {
        return makeQuestion({
          title: 'Pregunta de emparejamiento ' + (index + 1) + ' · ' + baseTitle,
          type: 'matching',
          text: 'Relaciona los elementos de ' + baseTitle + '.',
          generalFeedback: 'Pregunta generada automáticamente para completar el cupo mínimo.',
          criteria: allCriteria.slice(),
          practiceIds: [],
          source: 'auto',
          autoKind: 'fallback',
          matchingPairs: [
            { left: 'Elemento A', right: 'Elemento 1' },
            { left: 'Elemento B', right: 'Elemento 2' },
          ],
        });
      }
      return essayQuestion({
        title: 'Pregunta de ensayo ' + (index + 1) + ' · ' + baseTitle,
        text: 'Explica un aspecto importante de ' + baseTitle + '.',
        generalFeedback: 'Pregunta generada automáticamente para completar el cupo mínimo.',
        criteria: allCriteria.slice(),
        practiceIds: [],
        source: 'auto',
        autoKind: 'fallback',
        essay: {
          responseLines: 8,
          graderInfo: 'Se valorará la corrección conceptual y la justificación.',
          responseTemplate: '',
        },
      });
    }

    REQUIRED_TYPES.forEach(function (type) {
      const existing = questions.filter(function (question) {
        return question.type === type;
      });
      let nextIndex = existing.length;
      while (nextIndex < TARGET_PER_TYPE) {
        if (existing.length) {
          const base = existing[nextIndex % existing.length];
          const clone = JSON.parse(JSON.stringify(base));
          clone.id = uid('q');
          clone.title = base.title + ' (repetida)';
          clone.source = 'auto';
          questions.push(clone);
        } else {
          questions.push(fallbackQuestion(type, nextIndex));
        }
        nextIndex += 1;
      }
    });

    return questions;
  }

  function matchesCriteria(question, selectedCriteria) {
    if (!selectedCriteria || !selectedCriteria.length) return true;
    if (!question.criteria || !question.criteria.length) return true;
    return question.criteria.some(function (criterion) {
      return selectedCriteria.indexOf(criterion) !== -1;
    });
  }

  function getPool(bank, exam) {
    const selectedCriteria = (exam && exam.criteria) || [];
    const types = (exam && exam.types) || {};
    return (bank || []).filter(function (question) {
      if (!types[question.type]) return false;
      return matchesCriteria(question, selectedCriteria);
    });
  }

  function typeCounts(bank, exam, types) {
    const countMap = {};
    Object.keys(types || {}).forEach(function (type) {
      countMap[type] = 0;
    });
    getPool(bank, exam).forEach(function (question) {
      countMap[question.type] = (countMap[question.type] || 0) + 1;
    });
    return countMap;
  }

  function interleaveByKind(questions) {
    const groups = {};
    questions.forEach(function (question) {
      const kind = question.autoKind || question.type;
      if (!groups[kind]) groups[kind] = [];
      groups[kind].push(question);
    });
    const kinds = shuffle(Object.keys(groups));
    const result = [];
    let added = true;
    while (added) {
      added = false;
      kinds.forEach(function (kind) {
        if (groups[kind].length) {
          result.push(groups[kind].shift());
          added = true;
        }
      });
    }
    return result;
  }

  function selectQuestions(bank, exam) {
    const count = Math.max(1, parseInt(exam && exam.count, 10) || 10);
    const pool = getPool(bank, exam);
    const enabledTypes = Object.keys((exam && exam.types) || {}).filter(function (type) {
      return Boolean(exam.types[type]);
    });
    const types = enabledTypes.length
      ? enabledTypes
      : Array.from(new Set(pool.map(function (question) { return question.type; })));

    const byType = {};
    types.forEach(function (type) { byType[type] = []; });
    pool.forEach(function (question) {
      if (Object.prototype.hasOwnProperty.call(byType, question.type)) {
        byType[question.type].push(question);
      }
    });

    Object.keys(byType).forEach(function (type) {
      const groups = {};
      byType[type].forEach(function (question) {
        const key = (question.practiceIds && question.practiceIds[0]) || 'general';
        if (!groups[key]) groups[key] = [];
        groups[key].push(question);
      });
      const keys = Object.keys(groups).sort(function (a, b) {
        const na = parseInt(String(a).replace(/\D/g, ''), 10) || 999;
        const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 999;
        return na - nb;
      });
      keys.forEach(function (key) {
        groups[key] = interleaveByKind(shuffle(groups[key]));
      });
      const interleaved = [];
      let added = true;
      while (added) {
        added = false;
        keys.forEach(function (key) {
          if (groups[key].length) {
            interleaved.push(groups[key].shift());
            added = true;
          }
        });
      }
      byType[type] = interleaved;
    });

    const selected = [];
    let added = true;
    while (selected.length < count && added) {
      added = false;
      types.forEach(function (type) {
        if (selected.length >= count) return;
        if (byType[type] && byType[type].length) {
          selected.push(byType[type].shift());
          added = true;
        }
      });
    }

    return {
      selected: selected,
      ids: selected.map(function (question) { return question.id; }),
      available: pool.length,
      shortfall: Math.max(0, count - selected.length),
    };
  }

  ExamBuilder.Generator = {
    generate: generate,
    getPool: getPool,
    typeCounts: typeCounts,
    selectQuestions: selectQuestions,
  };
})(typeof window !== 'undefined' ? window : globalThis);

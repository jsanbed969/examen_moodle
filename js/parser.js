/* Parser del cuaderno de prácticas HTML -> modelo de datos */
(function (global) {
  'use strict';

  const ExamBuilder = (global.ExamBuilder = global.ExamBuilder || {});
  const clean = function (value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  };

  function text(el) {
    return clean(el && el.textContent);
  }

  function directChildren(el, tagName) {
    if (!el) return [];
    return Array.from(el.children || []).filter(function (child) {
      return child.tagName === tagName;
    });
  }

  function findHeading(container, needle) {
    const headings = Array.from(container.querySelectorAll('h2, h3, h4'));
    return headings.find(function (heading) {
      return text(heading).toLowerCase().indexOf(needle.toLowerCase()) !== -1;
    }) || null;
  }

  function parseFields(listEl) {
    const result = {};
    if (!listEl) return result;
    Array.from(listEl.children).forEach(function (item) {
      if (item.tagName !== 'LI') return;
      const strong = item.querySelector('strong');
      if (!strong) return;
      const label = text(strong).replace(/:\s*$/, '');
      const full = text(item);
      result[label] = clean(full.slice(text(strong).length));
    });
    return result;
  }

  function parsePractice(details) {
    const summary = details.querySelector('summary');
    if (!summary) return null;

    const summarySpans = Array.from(summary.querySelectorAll('span'));
    const badgeText = summarySpans.length ? text(summarySpans[0]) : text(summary);
    const numberMatch = badgeText.match(/Pr[aá]ctica\s+(\d+)/i) || details.id.match(/(\d+)/);
    const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

    let title = summarySpans.length > 1 ? text(summarySpans[1]) : text(summary);
    title = title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
    if (!title) title = 'Práctica ' + number;

    const criteria = [];
    const criteriaRegex = /CE\s+([^)·]+(?:\)[^·]*)?)/gi;
    let criteriaMatch;
    while ((criteriaMatch = criteriaRegex.exec(badgeText))) {
      const chunk = criteriaMatch[1];
      const letters = chunk.match(/([a-z])\)/gi) || [];
      letters.forEach(function (letter) {
        const normalized = letter.replace(')', '').toLowerCase();
        if (criteria.indexOf(normalized) === -1) criteria.push(normalized);
      });
    }
    if (!criteria.length) {
      const fallback = badgeText.match(/([a-z])\)/gi) || [];
      fallback.forEach(function (letter) {
        const normalized = letter.replace(')', '').toLowerCase();
        if (criteria.indexOf(normalized) === -1) criteria.push(normalized);
      });
    }
    let criteriaLabel = '';
    if (criteria.length === 1) {
      criteriaLabel = 'CE ' + criteria[0] + ')';
    } else if (criteria.length === 2) {
      criteriaLabel = 'CE ' + criteria[0] + ') y ' + criteria[1] + ')';
    } else if (criteria.length > 2) {
      criteriaLabel = 'CE ' + criteria.slice(0, -1).map(function (letter) {
        return letter + ')';
      }).join(', ') + ' y ' + criteria[criteria.length - 1] + ')';
    }

    const content = Array.from(details.children).find(function (child) {
      return child.tagName === 'DIV';
    }) || details;

    /* ---- Datos de la tarea ---- */
    const data = {};
    const divs = Array.from(content.querySelectorAll('div'));
    const dataBox = divs.find(function (box) {
      const labels = Array.from(box.children || []).map(function (child) {
        const first = child.children && child.children[0];
        return first ? text(first) : '';
      });
      return labels.indexOf('Modalidad') !== -1 &&
        labels.indexOf('Duración') !== -1 &&
        labels.indexOf('Archivo') !== -1 &&
        labels.indexOf('Formato admitido') !== -1;
    });
    if (dataBox) {
      Array.from(dataBox.children).forEach(function (item) {
        const labelEl = item.children && item.children[0];
        const valueEl = item.children && item.children[1];
        if (!labelEl) return;
        data[text(labelEl)] = valueEl ? text(valueEl) : clean(text(item).slice(text(labelEl).length));
      });
    }

    /* ---- Lectura de arranque ---- */
    const reading = {
      title: '',
      source: '',
      paragraphs: [],
      questions: [],
    };
    const readingBadge = Array.from(content.querySelectorAll('span')).find(function (span) {
      return text(span).toLowerCase().indexOf('lectura de arranque') !== -1;
    });
    const readingBlock = readingBadge ? readingBadge.parentElement : null;
    if (readingBlock) {
      const heading = readingBlock.querySelector('h3');
      if (heading) reading.title = text(heading);

      Array.from(readingBlock.querySelectorAll('p')).forEach(function (paragraph) {
        const value = text(paragraph);
        if (!value) return;
        if (/^fuente\s*:/i.test(value)) {
          reading.source = value.replace(/^fuente\s*:\s*/i, '');
        } else if (/^[✏️📖🎯].*preguntas/i.test(value) || /preguntas de comprensi[oó]n/i.test(value)) {
          /* Encabezado de las preguntas: no es un párrafo de lectura. */
        } else if (/^estas tres respuestas/i.test(value)) {
          /* Nota final de la tarea. */
        } else {
          reading.paragraphs.push(value);
        }
      });

      Array.from(readingBlock.querySelectorAll('ol')).forEach(function (list) {
        Array.from(list.children).forEach(function (item) {
          if (item.tagName !== 'LI') return;
          const question = text(item);
          if (question) reading.questions.push(question);
        });
      });
    }

    /* ---- Objetivo ---- */
    let objective = '';
    const objectiveP = Array.from(content.querySelectorAll('p')).find(function (paragraph) {
      return text(paragraph).toLowerCase().indexOf('objetivo') !== -1 && text(paragraph).indexOf('🎯') !== -1;
    });
    if (objectiveP) {
      objective = text(objectiveP).replace(/^[^\p{L}\p{N}]*Objetivo\.?\s*/iu, '').trim();
    }

    /* ---- Materiales ---- */
    let materials = [];
    const materialsHeading = findHeading(content, 'Materiales necesarios');
    if (materialsHeading) {
      let sibling = materialsHeading.nextElementSibling;
      while (sibling && sibling.tagName !== 'UL' && sibling.tagName !== 'OL') {
        sibling = sibling.nextElementSibling;
      }
      if (sibling) {
        materials = Array.from(sibling.children).filter(function (item) {
          return item.tagName === 'LI';
        }).map(text).filter(Boolean);
      }
    }

    /* ---- Desarrollo paso a paso ---- */
    const steps = [];
    const stepsHeading = findHeading(content, 'Desarrollo paso a paso');
    if (stepsHeading) {
      let stepsBox = stepsHeading.nextElementSibling;
      while (stepsBox && stepsBox.tagName !== 'DIV') {
        stepsBox = stepsBox.nextElementSibling;
      }
      if (stepsBox) {
        let current = null;
        Array.from(stepsBox.children).forEach(function (child) {
          if (child.tagName === 'P') {
            const value = text(child);
            const match = value.match(/^Paso\s+(\d+)\s*[·.\-–—]\s*(.+)$/i);
            if (match) {
              current = {
                number: parseInt(match[1], 10),
                title: clean(match[2]),
                items: [],
                checkpoint: '',
              };
              steps.push(current);
            }
          } else if ((child.tagName === 'OL' || child.tagName === 'UL') && current) {
            current.items = Array.from(child.children).filter(function (item) {
              return item.tagName === 'LI';
            }).map(text).filter(Boolean);
          } else if (child.tagName === 'DIV' && current) {
            const value = text(child);
            if (/PC\s*\d+/i.test(value)) {
              current.checkpoint = value.replace(/^[^\p{L}\p{N}]*PC\s*\d+\.?\s*/iu, '').trim();
            }
          }
        });
      }
    }

    /* ---- Errores comunes ---- */
    const commonErrors = [];
    const errorsBox = divs.find(function (box) {
      const strong = box.querySelector(':scope > strong');
      return strong && /errores comunes/i.test(text(strong));
    });
    if (errorsBox) {
      Array.from(errorsBox.querySelectorAll('li')).forEach(function (item) {
        const strong = item.querySelector('strong');
        const full = text(item);
        const label = strong ? text(strong).replace(/:\s*$/, '') : '';
        const detail = label ? clean(full.slice(text(strong).length)) : full;
        if (label || detail) commonErrors.push({ title: label, text: detail });
      });
    }

    /* ---- Rúbrica ---- */
    const rubric = [];
    const rubricHeading = findHeading(content, 'Rúbrica');
    if (rubricHeading) {
      let sibling = rubricHeading.nextElementSibling;
      let table = null;
      while (sibling && !table) {
        if (sibling.tagName === 'TABLE') table = sibling;
        else table = sibling.querySelector ? sibling.querySelector('table') : null;
        sibling = sibling.nextElementSibling;
      }
      if (table) {
        Array.from(table.querySelectorAll('tr')).forEach(function (row) {
          const cells = Array.from(row.querySelectorAll('th, td')).map(text).filter(Boolean);
          if (cells.length) rubric.push(cells);
        });
      }
    }

    /* ---- Entregables ---- */
    let deliverables = [];
    const deliverableStrong = Array.from(content.querySelectorAll('strong')).find(function (strong) {
      return /documento debe contener/i.test(text(strong));
    });
    if (deliverableStrong) {
      const deliverableBox = deliverableStrong.parentElement;
      deliverables = Array.from(deliverableBox.querySelectorAll('li')).map(text).filter(Boolean);
    }

    /* ---- Anexos ---- */
    const annexes = Array.from(content.querySelectorAll('details')).map(function (detail) {
      const heading = detail.querySelector(':scope > summary');
      return { title: heading ? text(heading) : 'Anexo' };
    }).filter(function (annex) {
      return annex.title && !/documento debe contener/i.test(annex.title);
    });

    return {
      id: 'p' + number,
      number: number,
      title: title,
      criteria: criteria,
      criteriaLabel: criteriaLabel,
      data: data,
      objective: objective,
      reading: reading,
      materials: materials,
      steps: steps,
      commonErrors: commonErrors,
      rubric: rubric,
      deliverables: deliverables,
      annexes: annexes,
    };
  }

  function parse(html, fileName) {
    const Parser = global.DOMParser || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!Parser) throw new Error('El navegador no soporta DOMParser.');

    const doc = new Parser().parseFromString(String(html || ''), 'text/html');
    const practices = Array.from(doc.querySelectorAll('details[id]'))
      .filter(function (details) {
        return /^p\d+$/i.test(details.id);
      })
      .map(parsePractice)
      .filter(Boolean)
      .sort(function (a, b) {
        return a.number - b.number;
      });

    if (!practices.length) {
      throw new Error('No se han encontrado prácticas (<details id="p1">, <details id="p2">…). Revisa que el HTML tenga el mismo formato que practicas.html.');
    }

    const header = doc.querySelector('header') || doc.body;
    const headerText = text(header);
    const h1 = doc.querySelector('h1');
    const title = h1 ? text(h1) : text(doc.querySelector('title')) || 'Cuaderno de prácticas';

    const unitMatch = headerText.match(/\bUD\s*(\d+)\b/i);
    const raMatch = headerText.match(/\b(RA\s*\d+)\s*[.:]?\s*([^]*?)(?=\s+Criterios de evaluación|$)/i);
    const courseP = Array.from(header.querySelectorAll('p')).find(function (paragraph) {
      return /C[oó]digo\s*\d+/i.test(text(paragraph));
    });
    const courseMatch = (courseP ? text(courseP) : headerText).match(/^(.+?)\s*·\s*C[oó]digo\s*(\d{3,6})\s*·\s*(.+)$/i);
    const yearMatch = headerText.match(/(?:Curso|curso)\s+(\d{4}\s*[–\-]\s*\d{4})/);

    let subject = '';
    let courseCode = '';
    let courseLevel = '';
    if (courseMatch) {
      subject = clean(courseMatch[1]);
      courseCode = clean(courseMatch[2]);
      courseLevel = clean(courseMatch[3]);
    } else {
      const moduleMatch = headerText.match(/M[oó]dulo:\s*(.+?)\s*\(([A-Za-z0-9]{3,8})\)/i) ||
        headerText.match(/(.+?)\s*\(([A-Za-z0-9]{3,8})\)/);
      if (moduleMatch) {
        subject = clean(moduleMatch[1].replace(/^M[oó]dulo:\s*/i, ''));
        courseCode = clean(moduleMatch[2]);
      }
      const levelSegments = headerText.split('·').map(function (part) {
        return clean(part);
      }).filter(function (part) {
        return part && !/^C[oó]digo/i.test(part) && !/\bRA\s*\d/i.test(part);
      });
      const levelSegment = levelSegments.find(function (part) {
        return /Curso|SMR|ASIR|DAM|DAW|Grado|ESO|Bachillerato/i.test(part);
      });
      if (levelSegment) courseLevel = levelSegment;
      if (!courseLevel) {
        const looseLevel = headerText.match(/(\d+[º°]?\s*(?:Curso|SMR|ASIR|DAM|DAW|ESO|Bachillerato)|Grado\s+(?:Medio|Superior))/i);
        if (looseLevel) courseLevel = clean(looseLevel[1]);
      }
      if (!subject && h1) {
        const h1Module = text(h1).match(/·\s*(.+)$/);
        if (h1Module) subject = clean(h1Module[1]);
      }
    }

    const schoolStrong = Array.from(header.querySelectorAll('strong')).find(function (strong) {
      return /^IES\s+/i.test(text(strong));
    });

    const criteriaMap = {};
    practices.forEach(function (practice) {
      practice.criteria.forEach(function (letter) {
        if (!criteriaMap[letter]) criteriaMap[letter] = { letter: letter, label: 'CE ' + letter + ')', practices: [] };
        criteriaMap[letter].practices.push(practice.number);
      });
    });
    const criteria = Object.keys(criteriaMap).sort().map(function (letter) {
      return criteriaMap[letter];
    });

    return {
      fileName: fileName || 'practicas.html',
      parsedAt: new Date().toISOString(),
      title: title,
      subject: subject,
      courseCode: courseCode,
      courseLevel: courseLevel,
      course: clean(subject + (courseCode ? ' (' + courseCode + ')' : '') + (courseLevel ? ' · ' + courseLevel : '')),
      unit: unitMatch ? 'UD' + unitMatch[1] : '',
      ra: raMatch ? clean(raMatch[1]) : '',
      raText: raMatch ? clean(raMatch[2]) : '',
      school: schoolStrong ? text(schoolStrong) : '',
      academicYear: yearMatch ? clean(yearMatch[1]).replace(/\s*-\s*/, '–') : '',
      practices: practices,
      criteria: criteria,
      stats: {
        practices: practices.length,
        criteria: criteria.length,
        readingQuestions: practices.reduce(function (total, practice) {
          return total + practice.reading.questions.length;
        }, 0),
        steps: practices.reduce(function (total, practice) {
          return total + practice.steps.length;
        }, 0),
      },
    };
  }

  ExamBuilder.Parser = { parse: parse };
})(typeof window !== 'undefined' ? window : globalThis);

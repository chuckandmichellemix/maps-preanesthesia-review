/* ===================================================================
   Pre-Anesthesia Questionnaire — form-specific behavior.
   Runs entirely in the browser. Nothing here transmits data anywhere.
   =================================================================== */

/* ---------- Date of Birth -> age (adult/pediatric flag) ---------- */
(function () {
  const dob = document.getElementById('dob');
  const banner = document.getElementById('age-banner');
  const guardianField = document.getElementById('parent-guardian-field');
  const guardianInput = document.getElementById('parent_guardian_name');
  const guardianPhoneInput = document.getElementById('parent_guardian_phone');
  const womenOnlySection = document.getElementById('women-only-section');
  if (!dob) return;

  /* Generic helper for [data-age-scope="..."] groups that aren't a plain
     field (e.g. checklist items): shows/hides matching elements, and when
     hiding, unchecks any checkbox inside them via a real 'change' event so
     dependent logic (None-of-the-above exclusivity, conditional "describe"
     boxes, data-reveals sub-fields) all stay in sync. */
  function setAgeScopeVisible(scopeValue, visible) {
    document.querySelectorAll('[data-age-scope="' + scopeValue + '"]').forEach(function (el) {
      el.hidden = !visible;
      if (!visible) {
        el.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          if (cb.checked) {
            cb.checked = false;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      }
    });
  }

  function calcAge(dobStr) {
    const d = new Date(dobStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    const today = new Date();
    if (d > today) return null;
    let age = today.getFullYear() - d.getFullYear();
    const monthDiff = today.getMonth() - d.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d.getDate())) age--;
    return age;
  }

  function apply() {
    const age = calcAge(dob.value);
    const form = document.getElementById('paq-form');
    if (age === null) {
      form.removeAttribute('data-age-group');
      form.removeAttribute('data-patient-age');
      banner.classList.add('is-empty');
      banner.textContent = '';
      if (guardianField) {
        guardianField.hidden = true;
        if (guardianInput) guardianInput.removeAttribute('required');
        if (guardianPhoneInput) guardianPhoneInput.removeAttribute('required');
      }
      if (womenOnlySection) womenOnlySection.hidden = false;
      setAgeScopeVisible('pulm-under12', false);
      setAgeScopeVisible('pulm-12plus', false);
      return;
    }
    form.setAttribute('data-patient-age', String(age));
    const group = age < 18 ? 'pediatric' : 'adult';
    form.setAttribute('data-age-group', group);
    banner.classList.remove('is-empty');
    banner.textContent = 'Age: ' + age + (age === 1 ? ' year' : ' years') + (group === 'pediatric' ? ' (pediatric)' : '');

    if (guardianField) {
      const isPediatric = group === 'pediatric';
      guardianField.hidden = !isPediatric;
      if (guardianInput) {
        if (isPediatric) {
          guardianInput.setAttribute('required', 'required');
        } else {
          guardianInput.removeAttribute('required');
        }
      }
      if (guardianPhoneInput) {
        if (isPediatric) {
          guardianPhoneInput.setAttribute('required', 'required');
        } else {
          guardianPhoneInput.removeAttribute('required');
        }
      }
    }

    if (womenOnlySection) {
      const hideWomenOnly = age < 12;
      womenOnlySection.hidden = hideWomenOnly;
      if (hideWomenOnly) {
        const radios = womenOnlySection.querySelectorAll('input[name="women_only_status"]');
        radios.forEach(function (r) { r.checked = false; });
      }
    }

    setAgeScopeVisible('pulm-under12', age < 12);
    setAgeScopeVisible('pulm-12plus', age >= 12);

    document.dispatchEvent(new CustomEvent('maps:age-group-change', { detail: { age: age, group: group } }));
  }

  dob.addEventListener('change', apply);
  dob.addEventListener('input', apply);
  apply();
})();

/* ---------- Height / Weight: type or scroll, with unit auto-translation ---------- */
(function () {
  const heightInput = document.getElementById('height');
  const weightInput = document.getElementById('weight');
  if (!heightInput || !weightInput) return;

  const outCm = document.getElementById('calc-cm');
  const outKg = document.getElementById('calc-kg');
  const outBmi = document.getElementById('calc-bmi');
  const outBsa = document.getElementById('calc-bsa');
  const heightHint = document.getElementById('height-hint');
  const weightHint = document.getElementById('weight-hint');

  function setBox(el, text, empty) {
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-empty', !!empty);
  }

  /* Accepts: 5'8", 5' 8, 5ft8in, 5 feet 8, 68, 68", 68in -> inches or null. */
  function parseHeightToInches(raw) {
    const str = (raw || '').trim().toLowerCase();
    if (!str) return null;

    const feetInches = str.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(\d+(?:\.\d+)?)?\s*(?:"|''|in|inch(?:es)?)?\s*$/);
    if (feetInches) {
      const feet = parseFloat(feetInches[1]);
      const inches = feetInches[2] ? parseFloat(feetInches[2]) : 0;
      if (Number.isFinite(feet)) return feet * 12 + (Number.isFinite(inches) ? inches : 0);
    }

    const inchesOnly = str.match(/^(\d+(?:\.\d+)?)\s*(?:"|''|in|inch(?:es)?)?\s*$/);
    if (inchesOnly) {
      const val = parseFloat(inchesOnly[1]);
      if (Number.isFinite(val)) return val;
    }

    return null;
  }

  /* Accepts: 165, 165 lb, 165lbs, 165 pounds -> lbs or null. */
  function parseWeightToLbs(raw) {
    const str = (raw || '').trim().toLowerCase();
    if (!str) return null;
    const m = str.match(/^(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)?\s*$/);
    if (m) {
      const val = parseFloat(m[1]);
      if (Number.isFinite(val)) return val;
    }
    return null;
  }

  let suppressRollerSync = false;
  let curFt = 5;
  let curIn = 8;
  let curTotalIn = 32;

  function compute() {
    const inches = parseHeightToInches(heightInput.value);
    const lbs = parseWeightToLbs(weightInput.value);
    const hasH = Number.isFinite(inches) && inches > 0;
    const hasW = Number.isFinite(lbs) && lbs > 0;

    const rawHeight = heightInput.value.trim();
    const heightUnrecognized = rawHeight.length > 0 && inches === null;
    const rawWeight = weightInput.value.trim();
    const weightUnrecognized = rawWeight.length > 0 && lbs === null;

    if (hasH) {
      const cm = inches * 2.54;
      const ft = Math.floor(inches / 12);
      const rem = Math.round((inches - ft * 12) * 10) / 10;
      setBox(outCm, cm.toFixed(1) + ' cm \u00b7 ' + ft + "'" + rem + '"', false);
      /* Always keep the tracking variables current, even for the roller mode
         that isn't visible right now — otherwise switching age groups later
         would show stale values. suppressRollerSync only skips re-pushing
         setValue() into whichever roller just originated this change, to
         avoid a redundant scroll-to-self. */
      curFt = Math.min(Math.max(ft, 1), 8);
      curIn = Math.min(Math.max(Math.round(inches - ft * 12), 0), 11);
      curTotalIn = Math.min(Math.max(Math.round(inches), 12), 48);
      if (!suppressRollerSync) {
        if (window.__mapsHeightRollerFt) window.__mapsHeightRollerFt.setValue(curFt, false);
        if (window.__mapsHeightRollerIn) window.__mapsHeightRollerIn.setValue(curIn, false);
        if (window.__mapsHeightRollerTotalIn) window.__mapsHeightRollerTotalIn.setValue(curTotalIn, false);
      }
    } else {
      setBox(outCm, '\u2014', true);
    }
    if (heightHint) {
      heightHint.textContent = heightUnrecognized
        ? "Couldn't read that \u2014 try 5'8\", 68, or 68in"
        : "Accepts 5'8\", 5' 8, 68, or 68in";
      heightHint.classList.toggle('field__hint--error', heightUnrecognized);
    }

    if (hasW) {
      const kg = lbs * 0.453592;
      setBox(outKg, kg.toFixed(1) + ' kg', false);
      if (!suppressRollerSync && window.__mapsWeightRoller) {
        window.__mapsWeightRoller.setValue(Math.round(Math.min(Math.max(lbs, 1), 400)), false);
      }
    } else {
      setBox(outKg, '\u2014', true);
    }
    if (weightHint) {
      weightHint.textContent = weightUnrecognized
        ? "Couldn't read that \u2014 try 165 or 165lbs"
        : 'Accepts 165, 165 lb, or 165lbs';
      weightHint.classList.toggle('field__hint--error', weightUnrecognized);
    }

    if (hasH && hasW) {
      const bmi = (703 * lbs) / (inches * inches);
      setBox(outBmi, bmi.toFixed(1), false);

      const cm = inches * 2.54;
      const kg = lbs * 0.453592;
      const bsa = Math.sqrt((cm * kg) / 3600);
      setBox(outBsa, bsa.toFixed(2) + ' m\u00b2', false);
    } else {
      setBox(outBmi, '\u2014', true);
      setBox(outBsa, '\u2014', true);
    }
  }

  heightInput.addEventListener('input', compute);
  weightInput.addEventListener('input', compute);

  function applyRollerHeight() {
    suppressRollerSync = true;
    heightInput.value = curFt + "'" + curIn + '"';
    compute();
    suppressRollerSync = false;
  }

  const ftEl = document.getElementById('height-roller-ft');
  const inEl = document.getElementById('height-roller-in');
  const totalInEl = document.getElementById('height-roller-total-in');
  const wtEl = document.getElementById('weight-roller');

  /* ---------- Under-3 height mode: single total-inches roller instead of feet+inches ---------- */
  const standardPickers = document.getElementById('height-roller-pickers-standard');
  const infantPickers = document.getElementById('height-roller-pickers-infant');

  /* MapsRoller reads container.clientHeight at construction time to center its
     track, and while a container is hidden (display:none) its scrollTop always
     reads 0 — so any setValue()/scroll settle that happens while hidden can
     silently snap the picker back to its minimum value or fire a stray
     onChange. Guard each onChange so it's ignored unless its own picker group
     is the one currently visible, and force a fresh setValue() right after a
     group becomes visible so it reflects the authoritative curFt/curIn/curTotalIn. */
  if (ftEl && inEl && window.MapsRoller) {
    window.__mapsHeightRollerFt = window.MapsRoller(ftEl, {
      min: 1,
      max: 8,
      value: curFt,
      suffix: "'",
      onChange: function (v) {
        if (standardPickers && standardPickers.hidden) return;
        curFt = v;
        applyRollerHeight();
      }
    });
    window.__mapsHeightRollerIn = window.MapsRoller(inEl, {
      min: 0,
      max: 11,
      value: curIn,
      suffix: '"',
      onChange: function (v) {
        if (standardPickers && standardPickers.hidden) return;
        curIn = v;
        applyRollerHeight();
      }
    });
  }

  function applyRollerTotalIn() {
    suppressRollerSync = true;
    heightInput.value = curTotalIn + '"';
    compute();
    suppressRollerSync = false;
  }

  /* Built lazily, only once its container is actually visible (see comment above). */
  function ensureTotalInRoller() {
    if (window.__mapsHeightRollerTotalIn || !totalInEl || !window.MapsRoller) return;
    window.__mapsHeightRollerTotalIn = window.MapsRoller(totalInEl, {
      min: 12,
      max: 48,
      value: curTotalIn,
      suffix: '"',
      onChange: function (v) {
        if (infantPickers && infantPickers.hidden) return;
        curTotalIn = v;
        applyRollerTotalIn();
      }
    });
  }

  function setHeightRollerMode(isInfantMode) {
    if (standardPickers) standardPickers.hidden = isInfantMode;
    if (infantPickers) infantPickers.hidden = !isInfantMode;
    if (isInfantMode) {
      ensureTotalInRoller();
      if (window.__mapsHeightRollerTotalIn) window.__mapsHeightRollerTotalIn.setValue(curTotalIn, false);
    } else {
      if (window.__mapsHeightRollerFt) window.__mapsHeightRollerFt.setValue(curFt, false);
      if (window.__mapsHeightRollerIn) window.__mapsHeightRollerIn.setValue(curIn, false);
    }
  }

  document.addEventListener('maps:age-group-change', function (e) {
    const age = e.detail && typeof e.detail.age === 'number' ? e.detail.age : null;
    setHeightRollerMode(age !== null && age < 3);
  });

  /* Sync immediately in case DOB was already filled before this listener attached. */
  (function syncInitialHeightRollerMode() {
    const form = document.getElementById('paq-form');
    const ageAttr = form ? form.getAttribute('data-patient-age') : null;
    if (ageAttr !== null && ageAttr !== '') {
      setHeightRollerMode(parseInt(ageAttr, 10) < 3);
    }
  })();

  if (wtEl && window.MapsRoller) {
    window.__mapsWeightRoller = window.MapsRoller(wtEl, {
      min: 1,
      max: 400,
      value: 165,
      suffix: ' lb',
      onChange: function (v) {
        suppressRollerSync = true;
        weightInput.value = String(v);
        compute();
        suppressRollerSync = false;
      }
    });
  }

  compute();
})();

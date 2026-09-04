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
  if (!dob) return;

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
      }
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
    }

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
      if (!suppressRollerSync) {
        curFt = Math.min(Math.max(ft, 1), 8);
        curIn = Math.min(Math.max(Math.round(inches - ft * 12), 0), 11);
        if (window.__mapsHeightRollerFt) window.__mapsHeightRollerFt.setValue(curFt, false);
        if (window.__mapsHeightRollerIn) window.__mapsHeightRollerIn.setValue(curIn, false);
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
  const wtEl = document.getElementById('weight-roller');

  if (ftEl && inEl && window.MapsRoller) {
    window.__mapsHeightRollerFt = window.MapsRoller(ftEl, {
      min: 1,
      max: 8,
      value: curFt,
      suffix: "'",
      onChange: function (v) {
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
        curIn = v;
        applyRollerHeight();
      }
    });
  }

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

/* ===================================================================
   MapsRoller — lightweight numeric scroll-wheel picker.
   Renders a scrollable, snap-to-center list of integers inside a
   container element, keeping it in sync with a linked text input.
   No dependencies; works with touch, mouse wheel, and click-to-select.
   =================================================================== */
window.MapsRoller = function (container, opts) {
  const min = opts.min;
  const max = opts.max;
  const suffix = opts.suffix || '';
  const onChange = opts.onChange || function () {};
  const itemHeight = 40;

  const track = document.createElement('ul');
  track.className = 'roller__track';

  for (let v = min; v <= max; v++) {
    const li = document.createElement('li');
    li.className = 'roller__item';
    li.textContent = suffix ? v + suffix : String(v);
    li.dataset.value = String(v);
    track.appendChild(li);
  }

  const window_ = document.createElement('div');
  window_.className = 'roller__window';
  const fadeTop = document.createElement('div');
  fadeTop.className = 'roller__fade roller__fade--top';
  const fadeBottom = document.createElement('div');
  fadeBottom.className = 'roller__fade roller__fade--bottom';

  container.appendChild(track);
  container.appendChild(window_);
  container.appendChild(fadeTop);
  container.appendChild(fadeBottom);

  const visibleHeight = container.clientHeight || 200;
  const pad = Math.max((visibleHeight - itemHeight) / 2, 0);
  track.style.paddingTop = pad + 'px';
  track.style.paddingBottom = pad + 'px';

  function clamp(v) {
    return Math.min(Math.max(v, min), max);
  }

  function indexForValue(v) {
    return clamp(Math.round(v)) - min;
  }

  function scrollToValue(v, smooth) {
    const idx = indexForValue(v);
    container.scrollTo({ top: idx * itemHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  function markSelected() {
    const idx = clamp(min + Math.round(container.scrollTop / itemHeight)) - min;
    const items = track.children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-selected', i === idx);
    }
    return idx;
  }

  let settleTimer = null;
  let ready = false;
  container.addEventListener(
    'scroll',
    function () {
      markSelected();
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        const idx = markSelected();
        if (ready) onChange(min + idx);
      }, 130);
    },
    { passive: true }
  );

  track.addEventListener('click', function (e) {
    const li = e.target.closest('.roller__item');
    if (!li) return;
    scrollToValue(parseInt(li.dataset.value, 10), true);
  });

  scrollToValue(opts.value != null ? opts.value : min, false);
  requestAnimationFrame(markSelected);
  setTimeout(function () { ready = true; }, 250);

  return {
    setValue: function (v, smooth) {
      scrollToValue(v, smooth !== false);
      requestAnimationFrame(markSelected);
    }
  };
};

import { exampleInfo, loadExample } from './examples.js';

// The same discovered .gdl files power selection and the actual diagram previews.
export function mountExampleBrowser({ onSelect, renderPreview }) {
  const panel = document.getElementById('examples-panel');
  const list = document.getElementById('examples-list');
  const toggle = document.getElementById('examples-toggle');
  const close = document.getElementById('examples-close');
  const count = document.getElementById('examples-count');
  const current = document.getElementById('example-name');
  const wide = window.matchMedia('(min-width: 1100px)');
  const cards = new Map();
  let selected = '';
  let previewQueue = Promise.resolve();

  function setOpen(open, restoreFocus = false) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (!open && restoreFocus) toggle.focus();
  }
  setOpen(wide.matches && !location.hash);
  toggle.addEventListener('click', () => {
    setOpen(panel.hidden);
    if (!panel.hidden) (cards.get(selected) || close).focus();
  });
  close.addEventListener('click', () => setOpen(false, true));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false, true);
    }
  });
  wide.addEventListener('change', () => setOpen(false, panel.contains(document.activeElement)));
  document.addEventListener('pointerdown', (event) => {
    if (!wide.matches && !panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) {
      setOpen(false);
    }
  });

  // Hidden panels do no layout work. Each preview is solved once when visible.
  const previews = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      previews.unobserve(entry.target);
      previewQueue = previewQueue.then(async () => {
        const preview = entry.target;
        if (panel.hidden) {
          previews.observe(preview);
          return;
        }
        try {
          const source = await loadExample(preview.dataset.example);
          if (await renderPreview(preview, source) === false) {
            previews.observe(preview);
            return;
          }
          preview.classList.add('loaded');
        } catch (err) {
          preview.textContent = 'Preview unavailable';
          preview.classList.add('unavailable');
          console.warn('Example preview:', err);
        }
      });
    }
  }, { root: list });

  function setSelected(name) {
    selected = name;
    current.textContent = name ? exampleInfo(name).title : 'Custom diagram';
    for (const [file, card] of cards) {
      card.setAttribute('aria-pressed', String(file === name));
    }
  }

  function setExamples(names) {
    list.replaceChildren();
    previews.disconnect();
    cards.clear();
    count.textContent = String(names.length);
    for (const name of names) {
      const info = exampleInfo(name);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'example-card';
      card.setAttribute('aria-label', `Load ${info.title}`);
      const preview = document.createElement('span');
      preview.className = 'example-preview';
      preview.dataset.example = name;
      preview.setAttribute('aria-hidden', 'true');
      preview.inert = true;
      const caption = document.createElement('span');
      caption.className = 'example-caption';
      for (const [className, text] of [
        ['example-capability', info.capability],
        ['example-title', info.title],
        ['example-description', info.description],
      ]) {
        const line = document.createElement('span');
        line.className = className;
        line.textContent = text;
        caption.appendChild(line);
      }
      card.append(preview, caption);
      card.addEventListener('click', () => {
        if (!wide.matches) setOpen(false, true);
        onSelect(name);
      });
      cards.set(name, card);
      list.appendChild(card);
      previews.observe(preview);
    }
    if (!names.length) list.textContent = 'No examples found.';
    setSelected(selected);
  }

  function showError(message) {
    list.textContent = message;
  }

  return { setExamples, setSelected, showError };
}

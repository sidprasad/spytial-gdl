function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Copy failed');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // A denied clipboard permission can still allow a user-initiated copy.
    }
  }
  fallbackCopy(text);
}

for (const button of document.querySelectorAll('[data-copy-target]')) {
  const source = document.getElementById(button.dataset.copyTarget);
  const status = document.getElementById(button.getAttribute('aria-describedby'));
  if (!source || !status) continue;
  button.hidden = false;
  let reset;
  button.addEventListener('click', async () => {
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    window.clearTimeout(reset);
    try {
      await copyText(source.textContent);
      button.textContent = 'Copied';
      status.textContent = 'Copied to clipboard.';
    } catch {
      status.textContent = 'Select and copy the text above.';
    }
    button.focus({ preventScroll: true });
    reset = window.setTimeout(() => { button.textContent = original; }, 1800);
  });
}

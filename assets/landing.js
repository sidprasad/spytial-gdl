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
    await navigator.clipboard.writeText(text);
    return;
  }
  fallbackCopy(text);
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const status = button.parentElement.parentElement.querySelector('.copy-status') ||
      button.parentElement.querySelector('.copy-status');
    const original = button.textContent;
    try {
      await copyText(button.dataset.copy);
      button.textContent = 'Copied';
      if (status) status.textContent = 'Copied to clipboard.';
    } catch {
      button.textContent = 'Select text above';
      if (status) status.textContent = 'Clipboard access was blocked; select the text above.';
    }
    window.setTimeout(() => { button.textContent = original; }, 1800);
  });
}

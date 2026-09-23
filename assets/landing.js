// Capture the source before autoRender replaces its HTML container.
for (const link of document.querySelectorAll('[data-playground-source]')) {
  const source = document.getElementById(link.dataset.playgroundSource);
  if (!source) continue;
  const bytes = new TextEncoder().encode(JSON.stringify({ m: source.textContent.trim() }));
  const payload = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  link.href = `./playground/#g=${payload}`;
}

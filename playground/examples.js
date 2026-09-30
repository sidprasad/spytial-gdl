export async function listExamples(fetchSource = fetch) {
  const url = new URL('./examples.json', import.meta.url);
  const response = await fetchSource(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not list examples (HTTP ${response.status}).`);
  return response.json();
}

export async function loadExample(name, fetchSource = fetch) {
  if (!name?.endsWith('.gdl') || name.startsWith('.') || /[/\\]/.test(name)) {
    throw new Error(`Invalid example: ${name}`);
  }
  const url = new URL(`./examples/${encodeURIComponent(name)}`, import.meta.url);
  // Revalidate on every selection so editing the file is enough to update it.
  const response = await fetchSource(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${name} example (HTTP ${response.status}).`);
  return response.text();
}

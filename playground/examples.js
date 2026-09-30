// Paths are relative to this module, so examples also work under a Pages prefix.
export const EXAMPLE_FILES = {
  tree: './examples/binary-tree.gdl',
  cycle: './examples/five-node-cycle.gdl',
  compiler: './examples/compiler.gdl',
  counterfactual: './examples/counterfactual.gdl',
  apples: './examples/apples.gdl',
};

export async function loadExample(name, fetchSource = fetch) {
  if (!Object.hasOwn(EXAMPLE_FILES, name)) throw new Error(`Unknown example: ${name}`);
  const url = new URL(EXAMPLE_FILES[name], import.meta.url);
  // Revalidate on every selection so editing the file is enough to update it.
  const response = await fetchSource(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Could not load ${name} example (HTTP ${response.status}).`);
  return response.text();
}

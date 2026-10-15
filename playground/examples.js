const descriptions = {
  'binary-tree.gdl': {
    title: 'Binary tree',
    description: 'Position subtrees left and right. Align nodes at the same depth.',
    capability: 'Orientation · Alignment',
  },
  'ring.gdl': {
    title: 'A cycle, arranged',
    description: 'Arrange a cycle clockwise, leaving other connections free.',
    capability: 'Cyclic layout',
  },
  'apples.gdl': {
    title: 'Bags of apples',
    description: 'Group apples into bags, hiding the helper nodes and edges.',
    capability: 'Grouping · Visibility',
  },
};

export function exampleInfo(name) {
  return descriptions[name] || {
    title: name.replace(/\.gdl$/, '').replace(/[-_]/g, ' '),
    description: 'Open this diagram to explore its graph and layout rules.',
    capability: 'Graph + layout rules',
  };
}

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

const descriptions = {
  'arithmetic.gdl': {
    title: 'Arithmetic expression',
    description: 'Drag the operands of (6 ÷ 2) × 3 and see how the tree preserves their order.',
    capability: 'Orientation',
  },
  'state-sequence.gdl': {
    title: 'A list across states',
    description: 'Insert nodes in a list. Drag an arrangement and carry it forward or backward, in one-state or two-state view.',
    capability: 'Sequences · Layout policies',
  },
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
    title: 'Bags of apples and cherries',
    description: 'Style apples and cherries with icons across bags, then group them and hide the helper nodes and edges.',
    capability: 'Grouping · Visibility · Icons',
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

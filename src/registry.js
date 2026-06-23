// Class-keyed spec registry. Multiple specs (one per class) merge by
// concatenating their `constraints` and `directives` arrays in registration
// order. An optional `extraSpec` is appended last (highest precedence by way
// of arriving last in the merged arrays — spytial reads in order).
//
// Specs are stored as YAML strings to keep the public API stringly-typed
// and avoid leaking a YAML parser dep into the registry surface. Parsing
// happens once at merge time.

const registry = new Map();

export function registerSpec(className, yamlSpec) {
  if (typeof className !== 'string' || !className) {
    throw new Error('registerSpec: className must be a non-empty string');
  }
  if (typeof yamlSpec !== 'string') {
    throw new Error('registerSpec: yamlSpec must be a string');
  }
  registry.set(className, yamlSpec);
}

export function clearRegistry() {
  registry.clear();
}

export function getRegisteredClasses() {
  return Array.from(registry.keys());
}

// Concatenate several authoring-YAML specs into one. Each source contributes
// its `constraints` and `directives` list items; within a category, later
// entries simply follow earlier ones (spytial's solver processes both as
// ordered lists, so concatenation is the natural composition — no deep merge).
// Empty / whitespace-only / null entries in the list are ignored.
//
// Returns the merged spec as a YAML string (so the caller can pass it back
// through parseLayoutSpec — keeps the wire format consistent). This is the
// shared merge path used both by the class registry and by inline annotations.
export function mergeSpecStrings(yamlList) {
  const allConstraints = [];
  const allDirectives = [];
  for (const yaml of yamlList) {
    if (!yaml || !String(yaml).trim()) continue;
    const { constraints, directives } = extractBlocks(yaml);
    allConstraints.push(...constraints);
    allDirectives.push(...directives);
  }

  let out = '';
  out += 'constraints:\n';
  if (allConstraints.length === 0) {
    out += '  []\n';
  } else {
    for (const c of allConstraints) out += `  - ${c}\n`;
  }
  out += 'directives:\n';
  if (allDirectives.length === 0) {
    out += '  []\n';
  } else {
    for (const d of allDirectives) out += `  - ${d}\n`;
  }
  return out;
}

// Merge the registered specs for the given class names (in registration order),
// with an optional `extraSpec` appended last. Delegates to mergeSpecStrings.
export function mergeSpecsForClasses(classNames, extraSpec) {
  const specs = [];
  for (const cn of classNames) {
    const s = registry.get(cn);
    if (s) specs.push(s);
  }
  if (extraSpec) specs.push(extraSpec);
  return mergeSpecStrings(specs);
}

// Pull the lines under `constraints:` and `directives:` from a YAML spec.
// Each returned entry is the body of a single `- ...` list item, without
// the leading `- ` and with surrounding whitespace trimmed.
function extractBlocks(yaml) {
  const lines = yaml.split(/\r?\n/);
  const out = { constraints: [], directives: [] };
  let current = null;
  let buffer = null;

  const flush = () => {
    if (buffer !== null && current) {
      out[current].push(buffer.trim());
      buffer = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (/^constraints\s*:/i.test(line.trim())) {
      flush();
      current = 'constraints';
      buffer = null;
      continue;
    }
    if (/^directives\s*:/i.test(line.trim())) {
      flush();
      current = 'directives';
      buffer = null;
      continue;
    }
    if (!current) continue;
    if (line.trim() === '' || line.trim() === '[]') continue;

    // List item start: `  - ...`
    const itemMatch = line.match(/^\s*-\s+(.*)$/);
    if (itemMatch) {
      flush();
      buffer = itemMatch[1];
      continue;
    }
    // Continuation line under the current item — keep it inline as a
    // single YAML mapping (most spytial entries fit on one line anyway).
    if (buffer !== null) {
      buffer += ' ' + line.trim();
    }
  }
  flush();
  return out;
}

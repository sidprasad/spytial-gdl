// Block delimiters occupy their own lines. In particular, Mermaid's
// %%{init: ...}%% directives remain ordinary lines for the parser to diagnose.
export function blockCommentLine(line, inBlock = false) {
  const marker = line.trim();
  if (inBlock) return { comment: true, inBlock: marker !== '}%%' };
  if (marker === '%%{') return { comment: true, inBlock: true };
  return { comment: false, inBlock: false };
}

// Blank commented lines rather than removing them, keeping source locations.
// Also used before annotation extraction so commented @calls never run.
export function maskBlockComments(source) {
  const errors = [];
  let inBlock = false;
  let start = 0;
  const rawLines = String(source ?? '').split(/\r?\n/);
  const lines = rawLines.map((line, index) => {
    const next = blockCommentLine(line, inBlock);
    if (!inBlock && next.inBlock) start = index;
    inBlock = next.inBlock;
    if (next.comment) return '';
    if (line.trim() === '}%%') {
      errors.push({ line: index + 1, text: line.trim(), severity: 'error',
        message: 'unexpected block comment closer: no matching "%%{"' });
      return '';
    }
    return line;
  });
  if (inBlock) errors.push({ line: start + 1, text: rawLines[start].trim(), severity: 'error',
    message: 'unterminated block comment: missing "}%%"' });
  return { lines, errors };
}

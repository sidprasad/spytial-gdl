import { readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const EXAMPLES_DIR = fileURLToPath(new URL('../playground/examples/', import.meta.url));

export async function exampleManifest() {
  const files = await readdir(EXAMPLES_DIR, { withFileTypes: true });
  const featured = ['binary-tree.gdl', 'ring.gdl'];
  return files
    .filter((file) => file.isFile() && !file.name.startsWith('.') && file.name.endsWith('.gdl'))
    .map((file) => file.name)
    .sort((a, b) => {
      const aRank = featured.indexOf(a);
      const bRank = featured.indexOf(b);
      return (aRank < 0 ? featured.length : aRank) - (bRank < 0 ? featured.length : bRank)
        || a.localeCompare(b);
    });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node scripts/example-manifest.mjs OUTPUT_PATH');
  await writeFile(output, `${JSON.stringify(await exampleManifest(), null, 2)}\n`);
}

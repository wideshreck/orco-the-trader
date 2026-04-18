#!/usr/bin/env node
// Copies built-in skill markdown files from src/ to dist/ so the compiled
// bundle can resolve them via import.meta.url at runtime. tsc doesn't
// touch non-TS assets, so this runs as a postbuild step.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src/features/trading/skills');
const DEST = path.resolve('dist/features/trading/skills');

async function main() {
  const entries = await fs.readdir(SRC, { withFileTypes: true }).catch(() => []);
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));
  if (mdFiles.length === 0) {
    console.warn(`copy-skills: no .md files in ${SRC}`);
    return;
  }
  await fs.mkdir(DEST, { recursive: true });
  for (const entry of mdFiles) {
    await fs.copyFile(path.join(SRC, entry.name), path.join(DEST, entry.name));
  }
  console.log(`copy-skills: copied ${mdFiles.length} skill file(s) to ${DEST}`);
}

main().catch((err) => {
  console.error('copy-skills failed:', err);
  process.exit(1);
});

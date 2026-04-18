import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Skill, SkillMeta } from './types.js';

const USER_SKILLS_DIR = path.join(os.homedir(), '.config', 'orco', 'skills');

// Built-in playbooks live next to this file's compiled location, under
// ../trading/skills/. We resolve via import.meta.url so both bun-run-from-
// source and the tsc-built dist/ layout find them. The build step copies
// the .md files from src/ into dist/ so this stays valid post-compile.
function builtinSkillsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'trading', 'skills');
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]+?)\n---\s*\n?([\s\S]*)$/;

export type ParsedFrontmatter = {
  fields: Record<string, string>;
  body: string;
};

export function parseFrontmatter(raw: string): ParsedFrontmatter | null {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return null;
  const [, block = '', body = ''] = m;
  const fields: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields[key] = value;
  }
  return { fields, body: body.trim() };
}

function readSkillFile(filePath: string): Skill | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const parsed = parseFrontmatter(raw);
  if (!parsed) return null;
  const name = parsed.fields.name;
  const description = parsed.fields.description;
  if (!name || !description) return null;
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) return null;
  return { name, description, path: filePath, body: parsed.body };
}

function listSkillFilesIn(dir: string): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const inner = path.join(dir, entry.name, 'SKILL.md');
        if (fs.existsSync(inner)) out.push(inner);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(path.join(dir, entry.name));
      }
    }
    return out;
  } catch {
    return [];
  }
}

let cache: Map<string, Skill> | null = null;

function loadAll(): Map<string, Skill> {
  if (cache) return cache;
  const map = new Map<string, Skill>();
  // Built-ins first; user skills with the same name override them.
  for (const filePath of listSkillFilesIn(builtinSkillsDir())) {
    const skill = readSkillFile(filePath);
    if (skill && !map.has(skill.name)) map.set(skill.name, skill);
  }
  for (const filePath of listSkillFilesIn(USER_SKILLS_DIR)) {
    const skill = readSkillFile(filePath);
    if (skill) map.set(skill.name, skill);
  }
  cache = map;
  return map;
}

export function listSkills(): SkillMeta[] {
  return [...loadAll().values()].map(({ name, description, path: p }) => ({
    name,
    description,
    path: p,
  }));
}

export function getSkill(name: string): Skill | undefined {
  return loadAll().get(name);
}

export function reloadSkills(): void {
  cache = null;
}

export function skillsDir(): string {
  return USER_SKILLS_DIR;
}

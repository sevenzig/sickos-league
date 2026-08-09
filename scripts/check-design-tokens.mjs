/**
 * Design token regression guard.
 * Scans src/ for banned patterns and exits non-zero on any match.
 * Run via: npm run lint:tokens
 *
 * To mark a line as a justified exception, add a trailing comment:
 *   // design-token-ok: <reason>
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

const RULES = [
  {
    // gray-100 … gray-950 — use slate-* instead.
    pattern: /(?<![a-zA-Z])gray-\d/g,
    message: 'Use slate-* neutrals instead of gray-*',
  },
  {
    // Box-shadow arbitrary values only. Excludes drop-shadow-[ (CSS filter) which is
    // allowed for glow/text effects.
    pattern: /(?<!drop-)shadow-\[/g,
    message: 'Use shadow-panel or shadow-panel-hover instead of arbitrary shadow-[...] box shadows',
  },
  {
    // sub-12px text sizes: text-[1px] through text-[11px]
    pattern: /text-\[([1-9]|10|11)px\]/g,
    message: 'Use text-caption (12px) as the minimum; sub-12px text is not allowed outside justified data cells',
  },
];

/** Recursively collect .tsx and .ts files (exclude .d.ts) */
function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

let totalViolations = 0;

for (const file of collectFiles(SRC)) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const relPath = relative(join(__dirname, '..'), file).replace(/\\/g, '/');

  for (const { pattern, message } of RULES) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      const lineContent = lines[lineNum - 1] ?? '';

      // Skip lines with a justified exception comment
      if (lineContent.includes('design-token-ok')) {
        if (pattern.lastIndex === match.index) pattern.lastIndex++;
        continue;
      }

      console.error(`${relPath}:${lineNum}: [design-token] ${message}`);
      console.error(`  > ${lineContent.trim()}`);
      totalViolations++;
      if (pattern.lastIndex === match.index) pattern.lastIndex++;
    }
  }
}

if (totalViolations > 0) {
  console.error(`\n${totalViolations} design token violation(s) found.`);
  process.exit(1);
} else {
  console.log('✓ No design token violations found.');
}

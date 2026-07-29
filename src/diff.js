'use strict';

/**
 * Parse a unified diff into per-file hunks.
 *
 * @param {string} diffText
 * @returns {Array<{path: string, added: Array<{line: number, text: string}>, removed: Array<{line: number, text: string}>}>}
 */
function parseUnifiedDiff(diffText) {
  const files = [];
  let current = null;
  let lineNo = 0;

  for (const raw of String(diffText ?? '').split(/\r?\n/)) {
    const fileHeader = /^\+\+\+ (?:b\/)?(.+)$/.exec(raw);
    if (raw.startsWith('diff --git')) {
      current = null;
      continue;
    }
    if (fileHeader) {
      const path = fileHeader[1].trim();
      if (path === '/dev/null') {
        current = null;
        continue;
      }
      current = { path, added: [], removed: [] };
      files.push(current);
      continue;
    }

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      lineNo = Number(hunk[1]);
      continue;
    }
    if (current == null) continue;

    if (raw.startsWith('+')) {
      current.added.push({ line: lineNo, text: raw.slice(1) });
      lineNo += 1;
    } else if (raw.startsWith('-')) {
      current.removed.push({ line: lineNo, text: raw.slice(1) });
    } else if (raw.startsWith(' ')) {
      lineNo += 1;
    }
  }

  return files;
}

const normalize = (text) => text.replace(/\s+/g, '');

/**
 * Detect changes that alter only formatting. These are the lines that make a
 * focused fix look like a sweeping rewrite, and they are the most common reason
 * a reviewer dismisses a patch as machine-generated.
 *
 * @param {string} diffText
 * @returns {Array<{path: string, kind: string, count: number, samples: Array<{line: number, before: string, after: string}>}>}
 */
function findFormattingNoise(diffText) {
  const results = [];

  for (const file of parseUnifiedDiff(diffText)) {
    const buckets = new Map();

    // Pair removed and added lines positionally within the file.
    const pairCount = Math.min(file.added.length, file.removed.length);
    for (let i = 0; i < pairCount; i += 1) {
      const before = file.removed[i].text;
      const after = file.added[i].text;
      if (before === after) continue;

      const strippedBefore = before.trimEnd();
      const strippedAfter = after.trimEnd();

      let kind = null;
      if (normalize(before) === normalize(after)) {
        kind = 'whitespace-only';
      } else if (
        strippedBefore.replace(/,$/, '') === strippedAfter.replace(/,$/, '') &&
        strippedBefore !== strippedAfter
      ) {
        kind = 'trailing-comma';
      } else if (
        strippedBefore.replace(/['"]/g, '"') === strippedAfter.replace(/['"]/g, '"')
      ) {
        kind = 'quote-style';
      } else if (strippedBefore.replace(/;$/, '') === strippedAfter.replace(/;$/, '')) {
        kind = 'semicolon';
      }

      if (kind == null) continue;

      if (!buckets.has(kind)) buckets.set(kind, []);
      buckets.get(kind).push({
        line: file.added[i].line,
        before: before.trim().slice(0, 120),
        after: after.trim().slice(0, 120),
      });
    }

    for (const [kind, samples] of buckets) {
      results.push({
        path: file.path,
        kind,
        count: samples.length,
        samples: samples.slice(0, 3),
      });
    }
  }

  return results;
}

module.exports = { parseUnifiedDiff, findFormattingNoise };

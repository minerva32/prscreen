'use strict';

const { parseUnifiedDiff } = require('./diff');

const TEST_PATH =
  /(^|\/)(tests?|spec|__tests__|e2e)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.[a-z]+$/i;
const DOC_PATH = /\.(md|mdx|txt|rst|adoc)$|^(docs?|examples?)\//i;
const LOCK_PATH =
  /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|go\.sum|composer\.lock)$/i;
const GENERATED_PATH = /(^|\/)(dist|build|vendor|node_modules)\/|\.min\./i;

/**
 * Files where writing to stdout is the purpose rather than a leftover: command
 * line entry points, loggers, reporters, and build or release scripts.
 */
const CONSOLE_IS_EXPECTED =
  /(^|\/)(bin|cli|scripts?|tools?)(\/|$)|(^|\/)(cli|logger|log|reporter|printer)\.[a-z]+$/i;

/**
 * Leftovers reviewers routinely ask contributors to remove. Only added lines
 * are matched, so pre-existing debt in a file is never blamed on this change.
 */
const LEFTOVER_PATTERNS = [
  {
    id: 'debug-output',
    re: /^\s*(?:console\.(?:log|debug|dir)\s*\(|print\s*\(|println!\s*\(|fmt\.Print|System\.out\.print)/,
  },
  {
    id: 'debugger-statement',
    re: /^\s*(?:debugger\b|breakpoint\s*\(\)|pdb\.set_trace\s*\()/,
  },
  {
    id: 'focused-test',
    re: /^\s*(?:it|test|describe|context)\.only\b|^\s*(?:fit|fdescribe)\s*\(/,
  },
  {
    id: 'merge-conflict-marker',
    re: /^(?:<{7}|={7}|>{7})(?:\s|$)/,
  },
];

function classify(path) {
  if (LOCK_PATH.test(path)) return 'lock';
  if (GENERATED_PATH.test(path)) return 'generated';
  if (TEST_PATH.test(path)) return 'test';
  if (DOC_PATH.test(path)) return 'doc';
  return 'source';
}

/**
 * Judge a change on what it demonstrates, not on who or what wrote it.
 *
 * These answer questions a reviewer asks anyway: does behaviour change with no
 * test to prove it, and does the diff leave debugging leftovers behind? Both
 * are verifiable from the diff alone, with no guessing about authorship.
 *
 * @param {string} diffText unified diff
 */
function findEvidenceGaps(diffText) {
  const files = parseUnifiedDiff(diffText);
  const findings = [];

  const changedSource = files.filter(
    (f) => classify(f.path) === 'source' && (f.added.length > 0 || f.removed.length > 0),
  );
  const touchedTest = files.some(
    (f) => classify(f.path) === 'test' && (f.added.length > 0 || f.removed.length > 0),
  );

  if (changedSource.length > 0 && !touchedTest) {
    findings.push({
      id: 'no-test-evidence',
      severity: 'warning',
      summary:
        changedSource.length +
        ' source file' +
        (changedSource.length === 1 ? '' : 's') +
        ' changed with no accompanying test',
      advice:
        'Add a test that fails before the change and passes after, or state in the pull request why one is not possible.',
      evidence: changedSource
        .slice(0, 5)
        .map((f) => ({ path: f.path, line: f.added[0] ? f.added[0].line : 0 })),
    });
  }

  for (const rule of LEFTOVER_PATTERNS) {
    const hits = [];
    for (const file of files) {
      if (classify(file.path) === 'generated') continue;
      // Writing to stdout is the product in a CLI or logger, not a leftover.
      if (rule.id === 'debug-output' && CONSOLE_IS_EXPECTED.test(file.path)) {
        continue;
      }
      for (const added of file.added) {
        if (rule.re.test(added.text)) {
          hits.push({
            path: file.path,
            line: added.line,
            text: added.text.trim().slice(0, 120),
          });
        }
      }
    }
    if (hits.length > 0) {
      findings.push({
        id: rule.id,
        severity: 'warning',
        summary:
          hits.length +
          ' added line' +
          (hits.length === 1 ? '' : 's') +
          ' left ' +
          rule.id.replace(/-/g, ' '),
        advice: 'Reviewers usually ask for these to be removed before merge.',
        evidence: hits.slice(0, 5),
      });
    }
  }

  return findings;
}

module.exports = { findEvidenceGaps, classify };

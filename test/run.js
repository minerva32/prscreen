'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const { findPolicyGates } = require('../src/policy');
const { findFormattingNoise, parseUnifiedDiff } = require('../src/diff');

// Wording taken from real CONTRIBUTING files encountered while contributing.
const activepiecesContributing = `## Pull requests

**We've temporarily paused unsolicited pull requests from outside the core team.**
PRs from contributors who aren't organization members are automatically closed.

**Why:** a large share of incoming PRs are now AI-generated changes that are
plausible on the surface but miss the context of the codebase.
`;

const friendlyContributing = `# Contributing

Thanks for helping out! Run the tests with \`npm test\` and open a pull request.
We review most patches within a week.
`;

test('flags a repository that auto-closes outside pull requests', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: activepiecesContributing },
  ]);

  const blocker = findings.find((f) => f.id === 'unsolicited-pr-paused');
  assert.ok(blocker, 'expected the paused-PR gate to be reported');
  assert.strictEqual(blocker.severity, 'blocker');
  assert.strictEqual(blocker.evidence[0].path, 'CONTRIBUTING.md');
  assert.ok(blocker.evidence[0].line > 0);
});

test('flags AI contribution rules separately from the hard blocker', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: activepiecesContributing },
  ]);
  const ai = findings.find((f) => f.id === 'ai-disclosure');
  assert.ok(ai, 'expected AI wording to be surfaced');
  assert.strictEqual(ai.severity, 'warning');
});

test('stays quiet on a welcoming project', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: friendlyContributing },
  ]);
  assert.deepStrictEqual(findings, []);
});

test('detects a CLA requirement', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: 'You must sign our Contributor License Agreement.' },
  ]);
  assert.ok(findings.some((f) => f.id === 'cla-required'));
});

test('detects DCO sign-off requirements', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: 'All commits need a Signed-off-by line.' },
  ]);
  assert.ok(findings.some((f) => f.id === 'dco-signoff'));
});

test('does not report a requirement the project explicitly waives', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: 'We do not require a Contributor License Agreement.' },
  ]);
  assert.deepStrictEqual(findings, []);
});

test('treats an optional screenshot as not required', () => {
  const findings = findPolicyGates([
    { path: 'CONTRIBUTING.md', text: 'Screenshots are optional but appreciated.' },
  ]);
  assert.deepStrictEqual(findings, []);
});

test('ignores AI mentioned as a product feature rather than a contribution rule', () => {
  const findings = findPolicyGates([
    { path: 'README.md', text: 'Our platform uses AI-generated summaries to help users.' },
  ]);
  assert.deepStrictEqual(findings, []);
});

// Regression: an incidental negation inside a real gate once cancelled the
// strongest blocker. "contributors who aren't organization members" describes
// who is affected, it does not waive the rule.
test('keeps the blocker when the sentence contains an incidental negation', () => {
  const text =
    "**We've temporarily paused unsolicited pull requests from outside the core team.** " +
    "PRs from contributors who aren't organization members or collaborators are automatically closed.";
  const findings = findPolicyGates([{ path: 'CONTRIBUTING.md', text }]);
  const blocker = findings.find((f) => f.id === 'unsolicited-pr-paused');
  assert.ok(blocker, 'incidental negation must not cancel a real gate');
  assert.strictEqual(blocker.severity, 'blocker');
});

test('parses added and removed lines per file', () => {
  const diff = `diff --git a/a.js b/a.js
--- a/a.js
+++ b/a.js
@@ -1,3 +1,3 @@
 const a = 1;
-const b = 2
+const b = 2;
 const c = 3;
`;
  const files = parseUnifiedDiff(diff);
  assert.strictEqual(files.length, 1);
  assert.strictEqual(files[0].path, 'a.js');
  assert.strictEqual(files[0].added.length, 1);
  assert.strictEqual(files[0].added[0].line, 2);
});

test('catches trailing-comma churn that a formatter introduced', () => {
  // This is the exact shape of damage a mismatched prettier version causes.
  const diff = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -40,7 +40,7 @@
 function setPieceVisible(
   pieces: PieceSelection,
-  visible: boolean,
+  visible: boolean
 ): PieceSelection {
`;
  const noise = findFormattingNoise(diff);
  const comma = noise.find((n) => n.kind === 'trailing-comma');
  assert.ok(comma, 'expected trailing-comma noise to be detected');
  assert.strictEqual(comma.path, 'x.ts');
  assert.strictEqual(comma.count, 1);
});

test('catches whitespace-only reindentation', () => {
  const diff = `diff --git a/y.js b/y.js
--- a/y.js
+++ b/y.js
@@ -1,2 +1,2 @@
-  const value = compute();
+    const value = compute();
`;
  const noise = findFormattingNoise(diff);
  assert.ok(noise.some((n) => n.kind === 'whitespace-only'));
});

test('catches quote-style rewrites', () => {
  const diff = `diff --git a/z.js b/z.js
--- a/z.js
+++ b/z.js
@@ -1,2 +1,2 @@
-import x from "x";
+import x from 'x';
`;
  const noise = findFormattingNoise(diff);
  assert.ok(noise.some((n) => n.kind === 'quote-style'));
});

test('ignores a genuine behavioral change', () => {
  const diff = `diff --git a/w.js b/w.js
--- a/w.js
+++ b/w.js
@@ -1,2 +1,2 @@
-return a + b;
+return a * b;
`;
  assert.deepStrictEqual(findFormattingNoise(diff), []);
});

test('ignores newly added files with no removals', () => {
  const diff = `diff --git a/new.js b/new.js
--- /dev/null
+++ b/new.js
@@ -0,0 +1,2 @@
+const a = 1;
+const b = 2;
`;
  assert.deepStrictEqual(findFormattingNoise(diff), []);
});

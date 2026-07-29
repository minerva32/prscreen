'use strict';

const assert = require('node:assert');
const { test } = require('node:test');

const { findPolicyGates } = require('../src/policy');
const { findFormattingNoise, parseUnifiedDiff } = require('../src/diff');
const { findEvidenceGaps, classify } = require('../src/evidence');

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

// Regression: "There is no CLA and no sign-off requirement" is the natural way
// to say a project has neither gate, and it must not read as having both.
test('does not report gates a project says it does not have', () => {
  const phrasings = [
    'Pull requests are welcome. There is no CLA and no sign-off requirement.',
    'Contributions are accepted without a CLA.',
    'No DCO sign-off is needed.',
  ];
  for (const text of phrasings) {
    assert.deepStrictEqual(
      findPolicyGates([{ path: 'CONTRIBUTING.md', text }]),
      [],
      'expected no gate for: ' + text,
    );
  }
});

// Regression: a refusal limited to one kind of change is not a closed door.
// Reporting it as a blanket blocker sends contributors away from a project that
// would have taken their work.
test('does not treat a scoped refusal as a blanket blocker', () => {
  const text =
    'Prettier is an opinionated formatter and is not accepting pull requests ' +
    'that add new formatting options.';
  const findings = findPolicyGates([{ path: 'CONTRIBUTING.md', text }]);
  assert.ok(
    !findings.some((f) => f.id === 'unsolicited-pr-paused'),
    'a scope rule must not be reported as paused contributions',
  );
});

// Regression: "a Signed-off-by line is not enough" describes an insufficient
// measure, not a sign-off requirement.
test('does not read an insufficiency note as a sign-off gate', () => {
  const text =
    'A `Signed-off-by` line in the commit message is not enough to satisfy this requirement.';
  const findings = findPolicyGates([{ path: 'CONTRIBUTING.md', text }]);
  assert.deepStrictEqual(findings, []);
});

// Regression: closing pull requests for contributor inactivity is routine
// housekeeping. Calling it a blanket pause would badly misrepresent a project
// that actively wants contributions.
test('does not treat stale-PR auto-close as paused contributions', () => {
  const text =
    'Please address the requested changes or provide feedback within 14 days. ' +
    'If there is no response during this time, it will be automatically closed.';
  const findings = findPolicyGates([{ path: 'CONTRIBUTING.md', text }]);
  assert.ok(!findings.some((f) => f.id === 'unsolicited-pr-paused'));
});

// A deadline attached to a real requirement must still be reported.
test('keeps a requirement that carries its own deadline', () => {
  const text = 'You must sign the Contributor License Agreement within 30 days.';
  const findings = findPolicyGates([{ path: 'CONTRIBUTING.md', text }]);
  assert.ok(findings.some((f) => f.id === 'cla-required'));
});

test('ignores explicitly neutral wording about AI assistance', () => {
  const text =
    'All the details on how to contribute (with or without AI assistance) are in the guide.';
  const findings = findPolicyGates([{ path: 'CONTRIBUTING.md', text }]);
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

test('classifies paths by role', () => {
  assert.strictEqual(classify('src/index.js'), 'source');
  assert.strictEqual(classify('test/run.js'), 'test');
  assert.strictEqual(classify('src/thing.test.ts'), 'test');
  assert.strictEqual(classify('README.md'), 'doc');
  assert.strictEqual(classify('package-lock.json'), 'lock');
  assert.strictEqual(classify('dist/bundle.js'), 'generated');
});

test('flags a source change that ships without a test', () => {
  const diff = `diff --git a/src/pay.js b/src/pay.js
--- a/src/pay.js
+++ b/src/pay.js
@@ -10,3 +10,3 @@
-  return amount * 1.1;
+  return amount * 1.2;
`;
  const gap = findEvidenceGaps(diff).find((x) => x.id === 'no-test-evidence');
  assert.ok(gap, 'expected a missing-test finding');
  assert.strictEqual(gap.evidence[0].path, 'src/pay.js');
});

test('stays quiet when a test accompanies the source change', () => {
  const diff = `diff --git a/src/pay.js b/src/pay.js
--- a/src/pay.js
+++ b/src/pay.js
@@ -10,3 +10,3 @@
-  return amount * 1.1;
+  return amount * 1.2;
diff --git a/test/pay.test.js b/test/pay.test.js
--- a/test/pay.test.js
+++ b/test/pay.test.js
@@ -1,3 +1,4 @@
+test('applies the new rate', () => {});
`;
  const gaps = findEvidenceGaps(diff);
  assert.ok(!gaps.some((x) => x.id === 'no-test-evidence'));
});

// A docs-only or lockfile-only change must not be told to add tests.
test('does not demand tests for documentation or lockfile changes', () => {
  const diff = `diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,2 +1,2 @@
-old wording
+new wording
diff --git a/package-lock.json b/package-lock.json
--- a/package-lock.json
+++ b/package-lock.json
@@ -5,3 +5,3 @@
-    "version": "1.0.0",
+    "version": "1.0.1",
`;
  assert.deepStrictEqual(findEvidenceGaps(diff), []);
});

test('flags debugging leftovers on added lines', () => {
  const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,4 +1,5 @@
 function run() {
+  console.log('here');
   return 1;
 }
diff --git a/test/a.test.js b/test/a.test.js
--- a/test/a.test.js
+++ b/test/a.test.js
@@ -1,2 +1,3 @@
+it.only('runs', () => {});
`;
  const gaps = findEvidenceGaps(diff);
  assert.ok(gaps.some((x) => x.id === 'debug-output'));
  assert.ok(gaps.some((x) => x.id === 'focused-test'));
});

// Removing a debug line is an improvement, not a finding.
test('does not flag removed debug lines', () => {
  const diff = `diff --git a/src/a.js b/src/a.js
--- a/src/a.js
+++ b/src/a.js
@@ -1,4 +1,3 @@
 function run() {
-  console.log('here');
   return 1;
 }
diff --git a/test/a.test.js b/test/a.test.js
--- a/test/a.test.js
+++ b/test/a.test.js
@@ -1,2 +1,3 @@
+it('runs', () => {});
`;
  const gaps = findEvidenceGaps(diff);
  assert.ok(!gaps.some((x) => x.id === 'debug-output'));
});

// Regression: a CLI writes to stdout by design. Flagging that would fire on
// every command line tool, logger, and build script, including this project.
test('does not treat stdout in a CLI or script as a leftover', () => {
  const diff = `diff --git a/bin/tool.js b/bin/tool.js
--- a/bin/tool.js
+++ b/bin/tool.js
@@ -1,3 +1,4 @@
+  console.log('Verdict: ready');
diff --git a/scripts/release.js b/scripts/release.js
--- a/scripts/release.js
+++ b/scripts/release.js
@@ -1,3 +1,4 @@
+console.log('published');
`;
  const gaps = findEvidenceGaps(diff);
  assert.ok(!gaps.some((x) => x.id === 'debug-output'));
});

test('still flags stdout added to library code', () => {
  const diff = `diff --git a/src/parser.js b/src/parser.js
--- a/src/parser.js
+++ b/src/parser.js
@@ -1,3 +1,4 @@
+  console.log('debugging parser', token);
diff --git a/test/parser.test.js b/test/parser.test.js
--- a/test/parser.test.js
+++ b/test/parser.test.js
@@ -1,2 +1,3 @@
+it('parses', () => {});
`;
  const gaps = findEvidenceGaps(diff);
  assert.ok(gaps.some((x) => x.id === 'debug-output'));
});

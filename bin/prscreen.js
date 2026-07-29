#!/usr/bin/env node
'use strict';

const { screen } = require('../src/index');

const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const RED = '\u001b[31m';
const YELLOW = '\u001b[33m';
const GREEN = '\u001b[32m';
const RESET = '\u001b[0m';

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColor ? code + text + RESET : text);

function parseArgs(argv) {
  const options = { repo: null, diff: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') options.repo = argv[++i];
    else if (arg === '--diff') options.diff = argv[++i];
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
  });
}

const USAGE = `prscreen - check contribution rules and diff hygiene before you open a pull request

Usage:
  prscreen --repo owner/name
  git diff --cached | prscreen --diff -
  git diff origin/main... | prscreen --repo owner/name --diff -

Options:
  --repo owner/name   Read the repository's published contribution documents
  --diff <path|->     Screen a unified diff ("-" reads stdin)
  --json              Emit machine-readable output
  -h, --help          Show this message

Exits 1 when a blocker is found, otherwise 0.`;

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help || (!options.repo && !options.diff)) {
    console.log(USAGE);
    process.exit(0);
  }

  let diff = null;
  if (options.diff === '-') diff = await readStdin();
  else if (options.diff) diff = require('node:fs').readFileSync(options.diff, 'utf8');

  const result = await screen({ repo: options.repo, diff });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.verdict.submit ? 0 : 1);
  }

  if (options.repo) {
    console.log('');
    console.log(paint(BOLD, options.repo));
    const read = result.documentsRead.length
      ? 'read ' + result.documentsRead.join(', ')
      : 'no contribution documents published';
    console.log('  ' + paint(DIM, read));
  }

  for (const finding of result.policy) {
    const isBlocker = finding.severity === 'blocker';
    const label = isBlocker ? paint(RED, 'BLOCKER') : paint(YELLOW, 'WARNING');
    console.log('');
    console.log('  ' + label + '  ' + finding.summary);
    for (const e of finding.evidence) {
      console.log('           ' + paint(DIM, e.path + ':' + e.line));
    }
    console.log('           ' + finding.advice);
  }

  for (const noise of result.formatting) {
    console.log('');
    console.log(
      '  ' + paint(YELLOW, 'WARNING') + '  ' + noise.count + ' ' + noise.kind +
        ' change' + (noise.count === 1 ? '' : 's') + ' in ' + noise.path,
    );
    for (const s of noise.samples) {
      console.log('           ' + paint(DIM, 'line ' + s.line));
    }
    console.log('           Formatting-only edits make a focused fix read as a rewrite.');
  }

  for (const gap of result.evidence) {
    console.log('');
    console.log('  ' + paint(YELLOW, 'WARNING') + '  ' + gap.summary);
    for (const e of gap.evidence) {
      console.log('           ' + paint(DIM, e.path + (e.line ? ':' + e.line : '')));
    }
    console.log('           ' + gap.advice);
  }

  console.log('');
  if (result.verdict.submit) {
    console.log('  ' + paint(GREEN, 'Verdict: no documented gate found'));
  } else {
    const parts = [];
    if (result.verdict.blockers) parts.push(result.verdict.blockers + ' blocker' + (result.verdict.blockers === 1 ? '' : 's'));
    if (result.verdict.warnings) parts.push(result.verdict.warnings + ' warning' + (result.verdict.warnings === 1 ? '' : 's'));
    if (result.verdict.noisyLines) parts.push(result.verdict.noisyLines + ' formatting-only line' + (result.verdict.noisyLines === 1 ? '' : 's'));
    console.log('  ' + paint(RED, 'Verdict: resolve these first') + ' (' + parts.join(', ') + ')');
  }
  console.log('');

  process.exit(result.verdict.submit ? 0 : 1);
}

main().catch((error) => {
  console.error('prscreen: ' + error.message);
  process.exit(2);
});

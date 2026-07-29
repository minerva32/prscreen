'use strict';

const { findPolicyGates } = require('./policy');
const { findFormattingNoise } = require('./diff');

const CONTRIB_FILES = [
  'CONTRIBUTING.md',
  '.github/CONTRIBUTING.md',
  'docs/CONTRIBUTING.md',
  'CONTRIBUTING',
  '.github/PULL_REQUEST_TEMPLATE.md',
];

const RAW_BASE = 'https://raw.githubusercontent.com';

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'prscreen' } });
  if (!response.ok) return null;
  return await response.text();
}

/**
 * Read the contribution documents a repository publishes.
 *
 * @param {string} repo owner/name
 * @param {string} [branch]
 */
async function fetchContributionDocs(repo, branch = 'HEAD') {
  const docs = [];
  for (const path of CONTRIB_FILES) {
    const text = await fetchText(`${RAW_BASE}/${repo}/${branch}/${path}`);
    if (text != null) docs.push({ path, text });
  }
  return docs;
}

/**
 * Screen a contribution before it is submitted.
 *
 * @param {{repo?: string, docs?: Array<{path: string, text: string}>, diff?: string}} input
 */
async function screen(input) {
  const docs = input.docs ?? (input.repo ? await fetchContributionDocs(input.repo) : []);
  const policy = findPolicyGates(docs);
  const noise = input.diff ? findFormattingNoise(input.diff) : [];

  const blockers = policy.filter((p) => p.severity === 'blocker');
  const noisyLines = noise.reduce((sum, n) => sum + n.count, 0);

  return {
    repo: input.repo ?? null,
    documentsRead: docs.map((d) => d.path),
    policy,
    formatting: noise,
    verdict: {
      submit: blockers.length === 0 && noisyLines === 0,
      blockers: blockers.length,
      warnings: policy.length - blockers.length,
      noisyLines,
    },
  };
}

module.exports = { screen, fetchContributionDocs };

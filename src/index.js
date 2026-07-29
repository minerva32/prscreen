'use strict';

const { findPolicyGates } = require('./policy');
const { findFormattingNoise } = require('./diff');

// Raw URLs are case sensitive even though GitHub's UI is not, so a project that
// ships `contributing.md` would be missed by an uppercase-only list.
const CONTRIB_FILES = [
  'CONTRIBUTING.md',
  'contributing.md',
  '.github/CONTRIBUTING.md',
  '.github/contributing.md',
  'docs/CONTRIBUTING.md',
  'docs/contributing.md',
  'CONTRIBUTING',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/pull_request_template.md',
  'PULL_REQUEST_TEMPLATE.md',
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
  const results = await Promise.all(
    CONTRIB_FILES.map(async (path) => {
      const text = await fetchText(`${RAW_BASE}/${repo}/${branch}/${path}`);
      return text == null ? null : { path, text };
    }),
  );

  // Keep only one document per distinct body so a repository that serves the
  // same file from two casings is not reported twice.
  const seen = new Set();
  const docs = [];
  for (const doc of results) {
    if (doc == null || seen.has(doc.text)) continue;
    seen.add(doc.text);
    docs.push(doc);
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

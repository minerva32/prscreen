'use strict';

/**
 * Contribution gates that reject a pull request before a human reads it.
 * Each rule matches wording maintainers actually use in CONTRIBUTING files.
 */
/**
 * Wording that cancels a requirement, such as "we do not require a CLA".
 *
 * The negation must attach to the requirement verb itself. A bare negation
 * anywhere in the sentence is not enough: real gates often contain incidental
 * negations ("contributors who aren't organization members are auto-closed"),
 * and treating those as cancellations hides the strongest blockers.
 */
const CANCELLED = [
  /\b(?:do|does|will|would)\s+not\s+(?:require|need|ask|expect|enforce)\b/i,
  /\b(?:don't|doesn't|won't)\s+(?:require|need|ask|expect|enforce)\b/i,
  /\b(?:no|without)\s+(?:\w+\s+){0,2}(?:required|necessary|needed)\b/i,
  /\bis\s+not\s+required\b/i,
  /\bare\s+not\s+required\b/i,
  /\bno\s+longer\s+(?:require|required|need|needed)\b/i,
  // "There is no CLA", "no sign-off requirement", "without a CLA"
  /\b(?:no|without\s+(?:a|an)?)\s*(?:CLA|DCO|contributor\s+license\s+agreement|sign-?off|signed-off-by)\b/i,
  /\b(?:CLA|DCO|sign-?off)\s+is\s+not\b/i,
  /\bexempt\s+from\b/i,
  // "A Signed-off-by line is not enough to satisfy this requirement" describes
  // an insufficient measure, not a gate this tool can check.
  /\bis\s+not\s+(?:enough|sufficient)\b/i,
  /\bdoes\s+not\s+(?:satisfy|count|suffice)\b/i,
  // "contribute (with or without AI assistance)" is explicitly neutral.
  /\bwith\s+or\s+without\b/i,
  /\beither\s+way\b/i,
];

/**
 * Wording that marks a requirement as optional, illustrative, or conditional
 * rather than mandatory. Template comments in particular tend to suggest
 * artifacts ("e.g. a short screen recording") without requiring them.
 */
const OPTIONAL =
  /\b(?:optional(?:ly)?|encouraged|appreciated|nice to have|if you (?:can|want|like)|feel free|as needed|if (?:relevant|applicable|possible|helpful)|e\.g\.|for example|such as|where appropriate)\b/i;

/**
 * Wording that limits a refusal to a specific kind of change rather than to
 * contributions in general. "not accepting pull requests that add new
 * formatting options" is a scope rule, not a closed door, and reporting it as a
 * blanket blocker sends contributors away from a project that would take their
 * work.
 */
const SCOPED_REFUSAL =
  /\b(?:not\s+accepting|won't\s+accept|do\s+not\s+accept|no)\b[^.\n]{0,60}\b(?:pull\s+requests?|PRs?|contributions?)\b[^.\n]{0,20}\b(?:that|which|for|adding|to\s+add|containing|introducing|unless|without|other\s+than)\b/i;

/**
 * Auto-close driven by contributor inactivity is routine stale-PR housekeeping,
 * not a closed door. Treating "closed after 14 days without a response" as a
 * blanket pause would be badly misleading.
 */
const STALE_HOUSEKEEPING =
  /\b(?:stale|inactiv\w+|no\s+(?:response|activity|updates?)|within\s+\d+\s+days?|after\s+\d+\s+days?)\b/i;

function isDefused(line, ruleId) {
  if (CANCELLED.some((pattern) => pattern.test(line))) return true;
  if (OPTIONAL.test(line)) return true;
  if (SCOPED_REFUSAL.test(line)) return true;
  // Only the auto-close rule can be defused by inactivity wording; a deadline
  // elsewhere ("sign the CLA within 30 days") is a real requirement.
  if (ruleId === 'unsolicited-pr-paused' && STALE_HOUSEKEEPING.test(line)) {
    return true;
  }
  return false;
}

const POLICY_RULES = [
  {
    id: 'unsolicited-pr-paused',
    severity: 'blocker',
    summary: 'Outside pull requests are paused or auto-closed',
    patterns: [
      /paused\s+unsolicited\s+pull\s+requests/i,
      /automatically\s+closed/i,
      /auto-?close(?:d|s)?\b[^.]{0,60}\bpull\s+requests?/i,
      /not\s+accepting\s+(?:new\s+)?(?:external\s+|outside\s+)?(?:contributions|pull\s+requests)/i,
    ],
    advice:
      'Confirm with the maintainers before spending time on a patch. A PR opened now is likely to be closed unread.',
  },
  {
    id: 'cla-required',
    severity: 'blocker',
    summary: 'A Contributor License Agreement must be signed',
    patterns: [
      /contributor\s+license\s+agreement/i,
      /\bCLA\b(?=[^a-z])/,
      /cla-assistant/i,
    ],
    advice:
      'Sign the CLA with the same account that opens the pull request, otherwise checks stay red.',
  },
  {
    id: 'dco-signoff',
    severity: 'blocker',
    summary: 'Commits must carry a Developer Certificate of Origin sign-off',
    patterns: [
      /developer\s+certificate\s+of\s+origin/i,
      /\bDCO\b(?=[^a-z])/,
      /signed-off-by/i,
      /git\s+commit\s+(?:[^\n]*\s)?-s\b/,
    ],
    advice: 'Commit with `git commit -s` so each commit gets a Signed-off-by trailer.',
  },
  {
    id: 'issue-first',
    severity: 'warning',
    summary: 'An issue or discussion is expected before a pull request',
    patterns: [
      /open\s+an\s+issue\s+(?:first|before)/i,
      /discuss[^.]{0,40}before\s+(?:you\s+)?(?:start|open|submit)/i,
      /please\s+file\s+an\s+issue\s+before/i,
    ],
    advice: 'Open an issue and get a maintainer reply before implementing.',
  },
  {
    id: 'ai-disclosure',
    severity: 'warning',
    summary: 'The project has rules about AI-assisted contributions',
    patterns: [
      // Require the AI mention to sit next to contribution wording, otherwise
      // any project that merely ships an AI feature trips this rule.
      /\b(?:AI|LLM|AI-?generated|AI-?assisted|generative\s+AI|agentic)\b[^.\n]{0,80}\b(?:contribut\w*|pull\s+requests?|\bPRs?\b|patch\w*|submissions?|code\s+review)/i,
      /\b(?:contribut\w*|pull\s+requests?|\bPRs?\b|patch\w*|submissions?)\b[^.\n]{0,80}\b(?:AI|LLM|AI-?generated|AI-?assisted|generative\s+AI|agentic)\b/i,
    ],
    advice:
      'Read the wording carefully. Some projects require disclosure, others reject AI-assisted patches outright.',
  },
  {
    id: 'manual-proof',
    severity: 'warning',
    summary: 'The project asks for manual proof such as a screenshot or recording',
    patterns: [
      /\bscreen\s?cast\b/i,
      /\bscreen\s?recording\b/i,
      /\bvideo\b[^.]{0,50}\b(?:show|demonstrat|record)/i,
      /\bscreenshots?\b[^.]{0,40}\brequired\b/i,
    ],
    advice: 'Budget time to capture the artifact the maintainers ask for; a patch alone will not be reviewed.',
  },
];

/**
 * Scan contribution documents for gates that block a pull request.
 *
 * @param {Array<{path: string, text: string}>} documents
 * @returns {Array<{id: string, severity: string, summary: string, advice: string, evidence: Array<{path: string, line: number, text: string}>}>}
 */
function findPolicyGates(documents) {
  const findings = [];

  for (const rule of POLICY_RULES) {
    const evidence = [];

    for (const doc of documents) {
      const lines = String(doc.text ?? '').split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (!rule.patterns.some((pattern) => pattern.test(line))) continue;
        // A line that negates or softens the requirement is not a gate.
        if (isDefused(line, rule.id)) continue;
        evidence.push({ path: doc.path, line: i + 1, text: line.trim().slice(0, 200) });
        break;
      }
    }

    if (evidence.length > 0) {
      findings.push({
        id: rule.id,
        severity: rule.severity,
        summary: rule.summary,
        advice: rule.advice,
        evidence,
      });
    }
  }

  return findings;
}

module.exports = { POLICY_RULES, findPolicyGates };

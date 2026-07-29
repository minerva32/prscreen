# prscreen

Check a repository's contribution rules and your own diff **before** you open a
pull request.

Maintainers are closing outside pull requests faster than ever, and most of the
rejections have nothing to do with whether the code works. A missing sign-off, an
unsigned CLA, a project that has paused outside contributions entirely, or a diff
where your formatter quietly rewrote fifty unrelated lines. All of it is knowable
up front.

## Install

```bash
npm install -g prscreen
```

## Use

Screen a repository before you start work:

```bash
prscreen --repo activepieces/activepieces
```

```
activepieces/activepieces
  read CONTRIBUTING.md

  BLOCKER  Outside pull requests are paused or auto-closed
           CONTRIBUTING.md:16
           Confirm with the maintainers before spending time on a patch.

  WARNING  The project has rules about AI-assisted contributions
           CONTRIBUTING.md:18

  Verdict: do not submit yet (1 blocker, 1 warning)
```

Screen your staged changes for formatting churn:

```bash
git diff --cached | prscreen --diff -
```

Both at once, which is what you want in a pre-push hook:

```bash
git diff origin/main... | prscreen --repo owner/name --diff -
```

Exit code is `0` when it is safe to submit and `1` when there is a blocker, so it
drops into CI or a git hook without extra glue.

## What it checks

Contribution gates, read from `CONTRIBUTING.md`, `.github/CONTRIBUTING.md`,
`docs/CONTRIBUTING.md`, and the pull request template:

- outside pull requests paused or auto-closed
- Contributor License Agreement required
- Developer Certificate of Origin sign-off required
- issue or discussion expected before a pull request
- rules about AI-assisted contributions
- manual proof required, such as a screen recording

Diff hygiene, from a unified diff:

- whitespace-only reindentation
- trailing-comma churn from a mismatched formatter version
- quote-style rewrites
- semicolon-only changes

The formatting checks exist because a mismatched local formatter is the fastest
way to turn a three-line fix into a hundred-line diff that reads as machine
output. Reviewers notice.

Evidence, also from a unified diff:

- source changed with no accompanying test
- debugging output left in library code
- `debugger` / `breakpoint()` / `pdb.set_trace()` statements
- focused tests (`it.only`, `fdescribe`) that would silently skip the rest
- merge conflict markers

These checks do not try to guess whether a human or a model wrote the change.
That is not knowable from a diff, and it is not the useful question. They ask
what a reviewer asks: does the change prove itself, and is it clean?
Documentation and lockfile edits are never asked for tests, and a CLI or logger
writing to stdout is not treated as a leftover.

## What it does not do

It reads published documents, not minds. Specifically:

- **Policies stated only in issue comments are invisible to it.** A maintainer who
  writes "I'm not accepting contributions for this feature" in an issue thread
  will not show up here. Read the thread you are about to work in.
- It does not judge whether your change is wanted, correct, or well designed.
- A clean verdict means no *documented* gate was found, not that your pull
  request will be merged.

## Library

```js
const { screen } = require('prscreen');

const result = await screen({ repo: 'owner/name', diff: diffText });
if (!result.verdict.submit) {
  console.error(result.policy, result.formatting);
}
```

## Support

prscreen is free under the MIT license and always will be. If it saved you from
a wasted pull request, you can [buy me a coffee](https://ko-fi.com/minerva32).
That is voluntary and buys no extra features, priority, or support guarantees.

## License

MIT

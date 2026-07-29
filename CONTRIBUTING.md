# Contributing

Pull requests are welcome. There is no CLA and no sign-off requirement.

## Before you open a pull request

Run the tests:

```bash
node --test test/run.js
```

Then screen your own diff with the tool:

```bash
git diff origin/master... | node bin/prscreen.js --diff -
```

## Adding a rule

Rules live in `src/policy.js`. Each one needs:

- a `severity` of `blocker` when it stops a pull request from being reviewed at
  all, or `warning` when it only changes how you should proceed
- patterns specific enough that a project merely *mentioning* the topic does not
  match. A project that ships an AI feature is not a project with an AI
  contribution policy
- a test in `test/run.js` covering both a real match and a near miss

False positives are worse than misses here. A wrong blocker tells someone to
walk away from a repository that would have accepted their work, so please add
the negative case alongside the positive one.

## Scope

This tool reads published documents. It does not read issue threads, and it does
not try to judge whether a change is wanted. Suggestions that require guessing
maintainer intent are probably out of scope.

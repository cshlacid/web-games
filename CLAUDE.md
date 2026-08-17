# CLAUDE.md

Guidance for AI assistants working in this repository.

## Status: pre-code

**This repository currently contains no application code.** As of the latest
commit the entire tree is:

```
README.md    # one line: "# web-games"
CLAUDE.md    # this file
```

There is no `package.json`, no build tooling, no source directory, no tests, no
CI configuration, and no open issues or pull requests describing intended work.

Practical consequences:

- **Do not assume a stack.** Nothing here establishes a framework, language,
  bundler, or package manager. If a task requires one and the user has not said
  which, ask before scaffolding — the first choice made here will be hard to
  undo cheaply.
- **Do not invent commands.** There are no build, test, lint, or dev-server
  commands to run yet. If you need one, create it deliberately and document it
  in the [Commands](#commands) section below in the same change.
- **Treat the sections below marked _(to fill in)_ as a checklist.** Whoever
  lands the first real code should update them in that same commit, so this file
  never describes a repository that doesn't exist.

## Intended scope

The repository name (`web-games`) and its README are the only statements of
intent: browser-playable games. Nothing further has been committed — the number
of games, whether they share a runtime or are independent, and how they are
served are all still open.

When that shape is decided, record it here before building on it. In particular
write down the answer to: **is this one app containing many games, or many
independent games in one repo?** That single decision drives directory layout,
build configuration, dependency sharing, and deploy strategy, and it is the
thing a future assistant will most need stated plainly.

## Repository layout

_(to fill in)_ — describe the top-level directories and what belongs in each
once they exist. Until then, place new work thoughtfully rather than by
convention-guessing, and document the layout you chose here.

## Commands

_(to fill in)_ — the canonical invocations for install, dev server, build,
test, lint, and typecheck. Prefer listing the exact command line, including the
package manager, e.g.:

```
# install       <command>
# dev server    <command>
# build         <command>
# test          <command>   (single test: <command>)
# lint          <command>
# typecheck     <command>
```

Record the single-test invocation alongside the full-suite one — iterating on
one failing test is the common case, and running the whole suite for it wastes
time.

## Conventions

_(to fill in)_ — naming, module boundaries, state management, asset handling,
and formatting rules, once there is code to be consistent with.

Two conventions apply from the start, regardless of stack:

- **Match surrounding code.** When editing an existing file, mirror its
  idiom, naming, and comment density rather than importing a different style.
- **Formatting is a tool's job, not a reviewer's.** When the first code lands,
  add a formatter and a lint config so style questions stop being discussed by
  hand.

## Git workflow

The default branch is `main`.

- **Never commit directly to `main`.** Work on a feature branch and push that.
- Assistant sessions are assigned a specific branch to develop on; push only to
  that branch unless the user says otherwise.
- Push with `git push -u origin <branch-name>`. On network failure, retry with
  exponential backoff (2s, 4s, 8s, 16s) rather than switching approach.
- **Open a pull request only when explicitly asked.** Pushing a branch is not an
  invitation to open a PR.
- If a branch's PR has already merged, do not stack new commits on it. Reset the
  branch onto the latest `main` (`git fetch origin main && git checkout -B
  <branch> origin/main`) and treat the follow-up as a fresh change.

There is no CI configured yet, so a green checkmark is not available as a
correctness signal. Until CI exists, run whatever checks the repo has locally
and say plainly in your report what you ran and what the output was.

## Reporting work

- State outcomes as they are. If tests fail, include the output; if a step was
  skipped, say which and why.
- When something is genuinely done and verified, say so without hedging.
- Don't describe this repository as having structure, tooling, or conventions
  that this file does not yet document — check the tree before making claims
  about it.

## Maintaining this file

This file is only useful while it is accurate. Update it in the same change
that invalidates it — adding a build command, choosing a framework, creating
the first source directory, adding CI. If you find a section that no longer
matches the tree, fix the section as part of your current task rather than
working around it.

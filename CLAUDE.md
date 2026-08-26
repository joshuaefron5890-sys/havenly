@AGENTS.md

# "Instructions" shorthand

When the user says "Instructions" (just that word, on its own), they mean: give them the steps to make sure their local checkout has the latest code before building for TestFlight. Reply with exactly this checklist, filling in the actual latest commit hash/message from `git log -1 --oneline` on `claude/haven-ly-mobile-setup-68t2vh` at the time.

Give every step that's a terminal command as its own separate fenced code block — one command (or one logical group of commands meant to run together) per block — so each is independently tappable/copyable to the clipboard on its own, not just inline backticks in a sentence. Non-command steps (like the expo.dev check) stay as plain text.

1. `git status` — confirm working tree is clean.
2.
```bash
git checkout claude/haven-ly-mobile-setup-68t2vh
git pull origin claude/haven-ly-mobile-setup-68t2vh
```
3. `git log -1 --oneline` — confirm it matches the latest commit.
4.
```bash
npm install
```
5.
```bash
npx eas-cli build --platform ios --profile production --clear-cache
```
(the `--clear-cache` matters — EAS has silently reused a stale native prebuild before).
6. On expo.dev, open the new build and check its "Git commit" field matches step 3's hash.
7.
```bash
npx eas-cli submit --platform ios --latest
```

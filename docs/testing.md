# Testing

The extension uses the official VS Code test stack: `@vscode/test-cli` (runner) + `@vscode/test-electron` (downloads and launches a sandboxed VS Code) + Mocha. Tests run inside a real Extension Host instance with the full `vscode` API available.

## Layout

- `tests/**/*.test.ts` — Mocha test files.
- `tsconfig.test.json` — compiles `src/` to CommonJS in `out/` for the test runner.
- `.vscode-test.mjs` — runner config (file glob, mocha options, workspace folder).

## Running

```sh
npm test          # runs build + compile-tests + vscode-test
npm run compile-tests   # tsc -p tsconfig.test.json (just the test compile)
```

`pretest` invokes `npm run build` so the extension under test is the freshly bundled `dist/extension.js`.

## Authoring tests that survive change

Features, prompts, and template defaults change frequently. Tests should assert on **structure and behavior**, not on specific strings or implementation details.

Do:
- Read expectations dynamically from `package.json` / `packageJSON`. The starter test reads the contributed command list from `ext.packageJSON.contributes.commands` instead of hardcoding it, so adding or renaming a command updates the assertion automatically.
- Test **state transitions** — given a sequence of `SidebarOutMessage`s, assert which `AppScreen` variant is broadcast, not the prose inside it.
- Test **invariants** — e.g. "after `submitSpecPrompt`, the next screen is one of `{promptRefinement, specEditing}`", not "the prompt was refined to exactly `<text>`".
- Use `vscode.commands.getCommands(true)` and `vscode.extensions.getExtension(...)` so the test environment is the source of truth.

Avoid:
- Asserting on full prompt text or system-prompt strings — those are tuned often.
- Asserting on model IDs or default template names by literal value.
- Snapshot tests on streamed agent output.
- Coupling tests to private state (`_status`, `_rateLimitInfo`, etc.) — assert on what the extension emits, not internal fields.

## Mocking the agent

Workflow tests need to drive the state machine without hitting Claude. Inject a fake `ClaudeSession` (it already has a small interface: `prompt`, `getSessionId`, `fork`, `abort`) that yields canned `SDKMessage` streams. This is intentionally not part of the starter scaffold — add it when the first workflow test demands it.

## Smoke tests vs. workflow tests

The starter test covers wiring (extension activates, commands register). For real behavioral coverage, add workflow tests under `tests/workflows/` that drive `App` through a sequence of messages and assert on the resulting screens. Keep one workflow per file and name them after the user-visible flow (`onboarding.test.ts`, `prompt-to-plan.test.ts`, etc.).

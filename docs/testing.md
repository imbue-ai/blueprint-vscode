# Testing

Two runners cover two layers of the codebase:

- **Mocha + `@vscode/test-cli` + `@vscode/test-electron`** for unit and integration tests that need a real Extension Host (anything that imports `vscode` or drives the App through real state transitions).
- **Vitest + `@testing-library/react` + `happy-dom`** for component tests of the webview React tree. These run in-process; no VS Code instance.

## Layout

- `tests/components/**/*.test.tsx` — Vitest component tests (webview React).
- `tests/**/*.test.ts` (excluding `tests/components/`) — Mocha integration / unit tests.
- `tests/helpers/harness.ts` — `setupHarness()` returns the live App with a captured broadcast list, plus a `send(msg)` shortcut and a `screenOfType(type)` lookup.
- `tests/helpers/fakeSession.ts` — `FakeSessionFactory` + `FakeClaudeSession` and SDK-message builders (`systemInit`, `assistantText`, `streamTextDelta`, `assistantToolUse`, `rateLimitRejected`, `resultDone`).
- `tests/components/setup.ts` — Vitest preamble: stubs `acquireVsCodeApi`, mocks `@vscode-elements/react-elements` to native HTML, mocks `InputComponents`.
- `tsconfig.test.json` — compiles `src/` + `tests/` to CommonJS in `out/` for the Mocha runner. Vitest reads TS directly.
- `.vscode-test.mjs` — Mocha runner config.
- `vitest.config.ts` — Vitest config.

## Running

```sh
npm test                    # components + integration
npm run test:components     # vitest run
npm run test:components:watch
npm run test:integration    # build + compile-tests + vscode-test
npm run check               # lint + typecheck
```

`pretest:integration` invokes `npm run build` so the bundled `dist/extension.js` under test is fresh.

## Mocking the agent

`ClaudeSession` is an interface; the live implementation (`LiveClaudeSession`) calls the Claude SDK. `App.ctx.createSession: ClaudeSessionFactory` produces sessions on demand. `setupHarness()` swaps the live factory for `FakeSessionFactory.factory()` so tests script SDK message streams without hitting Claude.

```ts
const h = await setupHarness();
h.fakes.script([systemInit('s'), assistantText('hello', 's'), resultDone('s')]);
h.send({ type: 'submitSpecPrompt' });
const screen = await waitFor(() => h.screenOfType('promptRefinement'));
```

The fake's `script` queue is FIFO across all sessions (forks share the queue), so script in prompt-call order: round-1 questioning → slug → writing → editor warmup, etc.

## Cross-module gotcha

The bundled extension (`dist/extension.js` from esbuild) and the test-compiled source (`out/src/...` from tsc) are two distinct module instances. `instanceof` checks across that boundary fail because each bundle has its own class identity. `RateLimitError` is checked via `isRateLimitError(err)` (compares `err.name`), not `instanceof RateLimitError`, so the propagation tests work end-to-end.

## Authoring tests that survive change

Features, prompts, and template defaults change frequently. Tests should assert on **structure and behavior**, not on specific strings or implementation details.

Do:

- Read expectations dynamically from `package.json` / `packageJSON` where possible.
- Test **state transitions** — given a sequence of `SidebarOutMessage`s, assert which `AppScreen` variant is broadcast, not the prose inside it.
- Test **invariants** — e.g. "after `submitSpecPrompt`, the next screen is one of `{promptRefinement, specEditing}`", not "the prompt was refined to exactly `<text>`".
- Use `vscode.commands.getCommands(true)` and `vscode.extensions.getExtension(...)` so the test environment is the source of truth.

Avoid:

- Asserting on full prompt text or system-prompt strings — those are tuned often.
- Asserting on model IDs or default template names by literal value.
- Snapshot tests on streamed agent output.
- Coupling tests to private state — assert on what the extension emits, not internal fields.

## Test categories

- **Unit** (`*.unit.test.ts`) — pure-function or class-level tests with stubs. No live App, no streaming.
- **Integration** (`*.test.ts` outside `unit.test.ts`) — drives the live App via the harness; uses the FakeSessionFactory.
- **Workflow** (`tests/workflows/`) — end-to-end user journeys through the state machine (Onboarding → Prompt → Questions → Writing → Editor, plus the tributaries: reset, multi-round, panel/feedback submit).
- **Exhaustiveness** (`tests/app/exhaustiveness.test.ts`) — every `SidebarOutMessage` variant has a handler, every `AppScreen.type` has a render, every `package.json` command/config key is referenced in source.
- **State invariants** (`tests/app/stateInvariants.test.ts`) — every `AppState` class must have a non-throwing `getScreen()`, an idempotent `interrupt()`, and a consistent `isInteractive()`.
- **Component** (`tests/components/`) — Vitest + happy-dom. Webview React components in isolation.

## Shared App across integration tests

`setupHarness()` returns the *live, singleton* App from the activated extension — it doesn't create a fresh App per test. Each test must arrange its starting state explicitly:

```ts
await resetExtensionState(h.app);                    // clears global config + flags
await h.app.resetOnboarding();                       // → OnboardingState
h.send({ type: 'completeOnboarding' });              // → PromptState
```

Setting state directly via `h.app.setState(new PromptState(...))` runs into the cross-module identity problem (`isSessionActive()` uses `instanceof`); drive transitions via the message API instead.

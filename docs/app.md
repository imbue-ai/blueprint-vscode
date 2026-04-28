# App Module

The `App` class (`core/app.ts`) is the central controller managing state transitions and message routing.

## State Machine

Uses an `AppState` interface with concrete state classes. Only one state is active at a time. Transitions happen via `app.setState()`, which calls `interrupt()` on the old state and `onEnter()` on the new one. `setState` also broadcasts the new state's screen *before* `onEnter` runs — states that kick off async work in `onEnter` should seed any "in-flight" flags in their constructor (see `GeneratingPromptQuestionsState` for the pattern).

States:
- `OnboardingState` — Welcome / template setup screen
- `PromptState` — Prompt entry
- `GeneratingPromptQuestionsState` — Exploring codebase, streaming clarifying questions, refining prompt
- `PromptQuestionsState` — Idle, waiting for the user to answer questions, refine, or generate the plan
- `WritingSpecState` — Refining prompt with Q&A answers (if any), then generating the plan file
- `StartingEditorAgentState` — Editor agent reads the plan and scopes the codebase
- `EditorReadyState` — Idle; chat / panel question / feedback handlers; runs background plan-question generation
- `EditingState` — Streams an editor-agent reply to a chat message or feedback submission

Transitions:
- `OnboardingState` → `PromptState` (onboarding complete)
- `PromptState` → `GeneratingPromptQuestionsState` (user submits prompt)
- `GeneratingPromptQuestionsState` → `PromptQuestionsState` (streaming complete)
- `PromptQuestionsState` → `GeneratingPromptQuestionsState` (user clicks "Keep planning")
- `PromptQuestionsState` | `GeneratingPromptQuestionsState` → `WritingSpecState` (user clicks "Generate plan" — handled by both so the click works mid-stream)
- `WritingSpecState` → `StartingEditorAgentState` (plan written)
- `StartingEditorAgentState` → `EditorReadyState` (editor warmup complete; questions session created)
- `EditorReadyState` → `EditingState` (user sends chat or submits feedback)
- `EditingState` → `EditorReadyState` (editing complete; resumes background question generation if it was running)

`App` also tracks `lastInteractiveState` (the most recent state where `isInteractive() === true`). On a rate-limit error, the current state is interrupted and `lastInteractiveState` is restored so the user keeps a usable screen.

## Views

`AppView` overlays temporarily replace the screen without changing the underlying state. Views are stored in a `viewStack` on `App`; the topmost view's `getScreen()` is shown when the stack is non-empty.

- `SettingsView` — Extension settings (model + templates)
- `TemplateEditorView` — Plan template editor (structured or freeform)

Open a view by mutating the stack: `openSettings` resets the stack to `[SettingsView]`; `openTemplateEditor` pushes a `TemplateEditorView`. `returnFromView` pops the top view; the underlying state's screen reappears when the stack is empty.

## Message Routing

`App.handleMessage` handles a fixed set of global messages directly: `requestData`, `openNewSpecView`, `openSettings`, `returnFromView`, `openSpec`, `openExistingSpec`, `openTemplateEditor`. Everything else is delegated to the topmost view (if any) or the current state.

Template CRUD (`deleteTemplate`, `setSpecTemplate`, etc.) is handled by `SettingsView`; template editor messages (`saveTemplateEditor`, `setTemplateEditorMode`, etc.) are handled by `TemplateEditorView`.

## Gotchas

- Clicking "+ New plan" while a session is active shows a modal warning, clears the view stack, and transitions to a fresh `PromptState` (the active state is interrupted, but plan files on disk stay).
- "Open existing plan" skips writing entirely — `App` validates the file is inside the workspace and non-empty, then transitions directly to `StartingEditorAgentState`.
- Pending feedback is invalidated whenever the plan content changes (line numbers go stale).
- `setState` broadcasts before `onEnter` runs, so any async work in `onEnter` should be reflected by flags seeded in the constructor — otherwise the first frame can show stale "ready" status.

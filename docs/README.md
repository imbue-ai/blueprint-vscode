# Blueprint

A VS Code extension for collaboratively writing implementation plans with an AI agent through guided Q&A before writing any code.

## Documentation index

- [app.md](app.md) — `App` state machine, view stack, message routing
- [screens-and-views.md](screens-and-views.md) — `AppScreen` union and per-screen UI
- [messages.md](messages.md) — webview ↔ extension-host message protocol
- [onboarding.md](onboarding.md) — first-launch flow and Default template generation
- [prompt-refinement.md](prompt-refinement.md) — question-first workflow before plan generation
- [prompts.md](prompts.md) — prompt building, system prompts, the plan-start marker
- [prompt-templates.md](prompt-templates.md) — template storage, editing, selection, agent integration
- [spec-editor.md](spec-editor.md) — custom file system provider for plan files
- [spec-filename.md](spec-filename.md) — feature slugs and plan file paths
- [spec-questions.md](spec-questions.md) — agentic plan-question generation
- [snapshots.md](snapshots.md) — in-memory plan version history
- [chat.md](chat.md) — Chat tab, `ActivityStream`, stream items
- [user-feedback.md](user-feedback.md) — comment-thread feedback on plan sections
- [testing.md](testing.md) — test runner, conventions, how to write tests that survive change

## Architecture Overview

The extension uses a multi-session Claude architecture:

1. **Prompt questioning session** — Explores the codebase and generates clarifying questions about the user's prompt.
2. **Writing session** — Generates the plan file using the selected prompt template (forked from the questioning session when `FORK_EDITOR_FROM_QUESTIONS` is true).
3. **Editor session** — Refines the plan based on chat messages, panel question answers, and inline feedback.
4. **Plan questions session** — Generates clarifying questions about the plan in the background; long-lived across rounds so follow-ups don't repeat.

The UI is a single VS Code sidebar webview. The extension host drives a state machine that produces `AppScreen` data, which the webview renders. See [screens-and-views.md](screens-and-views.md) for details.

## Key Modules

- `core/app.ts` — Main `App` class, state/view management, message routing
- `core/states/` — State machine states (`onboarding`, `prompt`, `generatingPromptQuestions`, `promptQuestions`, `writingSpec`, `startingEditorAgent`, `editorReady`, `editing`)
- `core/views/` — View overlays (`settings`, `templateEditor`)
- `core/snapshotManager.ts` — Snapshot history (single source of truth for plan state during editing)
- `core/session.ts` — `ClaudeSession` wrapper for the Claude SDK; auto-renames sessions with a `[BLUEPRINT]` prefix
- `core/prompts.ts` — Prompt interpolation, template wrapping, and prompt template management
- `core/promptDefaults.ts` — Default prompt text constants
- `core/systemPrompts.ts` — System prompts for each AI session type
- `core/featureManager.ts` — Feature directory listing and AI-powered feature slug generation (`SPEC_DIR = 'blueprint'`)
- `core/featureFlags.ts` — Feature flags toggling experimental behavior
- `core/templateGenerator.ts` — Generates the "Default" prompt template after onboarding
- `core/questionGeneration.ts` — Agentic plan question generation (initial + continue)
- `core/feedbackSubmit.ts` — Builds the combined feedback prompt from pending feedback items
- `core/utils/panelQuestionHandlers.ts` — Plan question panel handlers (answer, submit, refresh, jump-to-line, background generation)
- `core/utils/questionsAgent.ts` — Derives the questions-tab `AgentStatus` from panel and editor state
- `core/utils/questionStreamParsing.ts` — Parses the questioning agent's interleaved text/tool/question stream
- `core/xmlQuestionParser.ts` — Parses `<question>` XML tags from streaming output
- `editor/editor.ts` — VS Code editor integration: comment controller, gutter "+" feedback, decorations
- `editor/feedbackThreads.ts` — `FeedbackThreadManager` (one comment thread per feedback item)
- `editor/specFilesystem.ts` — `SpecFileSystemProvider` for the `blueprint-spec:` scheme
- `types/screens.ts` — `AppScreen` discriminated union and `AgentStatus`/`AgentPhase`
- `types/messages.ts` — Webview ↔ extension host message types
- `types/data.ts` — `ExtensionData` wrapper
- `types/promptQuestion.ts`, `types/promptTemplate.ts`, `types/question.ts`, `types/onboarding.ts`, `types/questioningMessage.ts` — Shared data types
- `webview/index.tsx` — Webview entry point; mounts `App` and wires the message bridge
- `webview/App.tsx` — Top-level webview component (screen switch)
- `webview/platform.ts` — VS Code webview platform shims (acquireVsCodeApi, etc.)
- `webview/styles.ts` — Shared style constants
- `webview/screens/` — React screen components (one per `AppScreen` variant)
- `webview/components/` — Shared React components (`ActivityStream`, `QuestioningStream`, `SpecQuestionsPanel`, `FeedbackTab`, `ChatInput`, `MenuBar`, `ToolCallItem`, `ToolCallGroup`, etc.)
- `webview/useVSCodeMessaging.ts`, `webview/usePersistentState.ts`, `webview/useAutoGrowTextarea.ts` — React hooks for messaging, persisted UI state, and textarea auto-grow
- `sidebarProvider.ts` — `WebviewViewProvider` bridging extension host and webview
- `utils/anchorUtils.ts` — Anchor line matching for plan questions
- `utils/promptRefinement.ts` — Streams a refined prompt from Q&A pairs
- `utils/specTemplate.ts` — Writes/cleans up the temp template file shared by sessions
- `utils/toolUse.ts` — Tool-use extraction and `StreamItem` formatting
- `utils/questionParser.ts`, `utils/questionUtils.ts`, `utils/promptQuestionUtils.ts` — Question parsing and formatting helpers
- `utils/findClaude.ts` — Locates and validates the Claude CLI executable
- `utils/webviewContent.ts` — Webview HTML bootstrapping

## Workflow

1. Extension activates and checks the `blueprint.onboardingComplete` flag (see [onboarding.md](onboarding.md))
2. If not set, the sidebar shows the onboarding screen; otherwise it shows the prompt screen
3. Onboarding generates a "Default" prompt template from the user's choices and persists it to `blueprint.promptTemplates`
4. User enters a feature description on the prompt screen and clicks **Submit**
5. The questioning agent explores the codebase and streams clarifying questions in the sidebar
6. User answers some/all questions and chooses:
   - **Keep planning** — refines the prompt with answers, then streams new questions
   - **Generate plan** — refines the prompt (if there are answers) and writes the plan
7. The writing agent generates a plan using the selected template, streamed to `blueprint/<feature>/<template-filename>` (default `plan.md`)
8. The editor session warms up by reading the plan; meanwhile a separate plan-questions session is created and starts generating questions in the background
9. The sidebar shows the plan-editing screen with three tabs: **Chat**, **Questions**, and **Feedback**
10. User can chat with the editor agent, answer plan questions in the panel, or leave inline feedback in the open plan file
11. Each chat or feedback submission forks the editor session
12. Pending feedback is cleared whenever the plan content changes (line numbers go stale)
13. Plan questions whose anchor line disappears from the plan are dropped
14. The user can start a new plan (via "+" button) or open an existing plan at any time

### Open existing plan

Users can open any `.md` file in the workspace as a plan (file icon button). This skips the writing phase and goes directly to `StartingEditorAgentState`, which creates a fresh editing session and starts background question generation.

## Code Quality

ESLint (with Prettier) and TypeScript handle formatting, linting, and type checking.

- `npm run format` — auto-fix formatting and lint issues
- `npm run lint` — check for errors without fixing
- `npm run typecheck` — type check with `tsc --noEmit`
- `npm run check` — run lint + typecheck (same as CI)

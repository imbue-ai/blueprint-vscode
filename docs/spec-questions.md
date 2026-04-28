# Plan Question System

Generates clarifying questions about the generated plan. Questions are displayed in the **Questions** tab of the plan-editing sidebar.

## Question Generation

Located in `core/questionGeneration.ts`.

### State Flow

```
StartingEditorAgentState
  warmup: editor agent reads the plan and scopes the codebase
  create questionsSession (no generation yet)
        │
        ▼
EditorReadyState ◄────────────────────────────────────────────────┐
  background: startAgenticQuestions  (non-blocking)               │
  ┌──────────────────────────────────────────────────────────┐    │
  │  chat / inline feedback   → always unblocked             │    │
  │  panel Submit / Refresh   → blocked while generating     │    │
  └──────────────────────────────────────────────────────────┘    │
        │                                                          │
  sendMessage / submitSpecFeedback                                 │
  (cancels background gen if running;                              │
   sets backgroundRegenOnComplete=true if it was)                  │
        │                                                          │
        ▼                                                          │
  EditingState                                                     │
  (streams edit to file)                                           │
        │                                                          │
        └── backgroundRegenOnComplete? ── YES ── backgroundGeneration='continue' ─┘
                                        └─ NO  ── backgroundGeneration='none'    ──┘
```

### Agentic Session

A dedicated `ClaudeSession` is created for plan questions with tool access (`Read`, `Glob`, `Grep`). The session is long-lived and maintains conversation history across rounds, preventing duplicate questions.

- `startAgenticQuestions(session, specFilePath, onProgress, abortSignal, onToolUse?)` — initial generation: reads the plan, explores the codebase, and generates questions
- `continueAgenticQuestions(session, qaPairs, specFilePath, onProgress, abortSignal, onToolUse?)` — continues with user answers and generates follow-up questions

The UI shows all rounds — previous rounds are rendered as frozen (read-only); the latest unfrozen round is interactive.

## Data Model

Both `PromptQuestion` and `SpecQuestion` extend a shared `QuestionBase` (`types/question.ts`) with unified answer storage:

```typescript
interface QuestionBase {
  text: string;
  context?: string | null;
  choices?: string[];       // MCQ or multiselect options
  multiSelect?: boolean;    // true = checkboxes, false/absent = radio
  chosenIndices: number[];  // selected option indices
  textAnswer: string;       // freeform text answer
}
```

`SpecQuestion` adds `anchor` (a substring used to locate the question's line in the plan) and `line` (resolved by `findAnchorLine` at render time).

Questions are organized into rounds stored in `snapshot.questionRounds`:

```typescript
interface QuestionRound {
  questions: SpecQuestion[];
  frozen: boolean;            // true after submission/refresh
}
```

## Session Lifecycle

1. `StartingEditorAgentState` creates the questions `ClaudeSession` (separate from the editor session) at the *end* of warmup, but does not start generation.
2. On transition to `EditorReadyState`, initial questions are generated in the background via `startAgenticQuestions` — the user can submit feedback and chat immediately without waiting.
3. The questions session is forked through each `EditingState` (`questionsSession.fork('Editor questions')`) so context carries forward.
4. **On Submit** in the panel: answers are sent to the editor session as a plan-refine prompt; after the edit completes, follow-up question generation runs in the background non-blocking.
5. **On Refresh**: the active round is frozen (if not already), and a fresh continuation is started with a "more questions" prompt.
6. If the user submits feedback or chat while background generation is running, the partial round is discarded (`abortSignal.aborted = true`); after the edit completes, a fresh non-blocking continuation starts automatically.

## Panel Message Handlers

Located in `core/utils/panelQuestionHandlers.ts`. Extracted from `EditorReadyState` for file size.

- `handleAnswerPanelQuestion` — sets `textAnswer` and `chosenIndices` on a question in the active (non-frozen) round
- `handleSubmitPanelAnswers` — freezes the active round, builds a plan-refine prompt, transitions to `EditingState` with `backgroundRegenOnComplete=true`. Blocked during background generation.
- `handleRefreshQuestions` — freezes the current round (if active), continues the agentic session for new questions. Blocked during background generation.
- `runBackgroundGeneration` — shared utility for running question generation in the background (initial, post-edit, refresh)
- `handleJumpToLine` — opens the plan file and scrolls to a question's anchor; `flashLineHighlight` briefly highlights the line
- `handleJumpToLineNumber` — opens the plan file and scrolls to a 1-based line (used by feedback cards)
- `buildQuestionsPanelRounds` — re-resolves `q.line` from the current plan content via `findAnchorLine`, drops questions whose anchors no longer resolve, and sorts each round by line

## Post-Submit Flow

1. User clicks **Submit** in the panel
2. Active round is frozen, answered Q&A pairs are formatted into a plan-refine prompt
3. `EditingState` runs with `backgroundRegenOnComplete=true` and the questions session forked along
4. After the plan edit completes, transitions to `EditorReadyState` with `backgroundGeneration='continue'`
5. `EditorReadyState.onEnter` kicks off non-blocking `continueAgenticQuestions` using the last frozen round's Q&A pairs as context

## Panel UI

`SpecQuestionsPanel` (`webview/components/SpecQuestionsPanel.tsx`) renders all rounds in the Questions tab.

- Each question has an optional "Line N" jump-to-line button via the shared `QuestionItem`
- **Submit** is disabled until at least one answer is set in the active round
- **Refresh questions** is a small text button below Submit
- A `StreamEndStatus` reflects `questionsAgent.phase` and shows tool calls during initial generation

`QuestionItem` (`webview/components/QuestionItem.tsx`) is shared by both prompt and plan question UIs. It supports MCQ (radio + reset), multiselect (checkboxes), text input, optional jump-to-line, and frozen display (read-only block showing question + formatted answer).

## Anchor Matching

Located in `utils/anchorUtils.ts`.

- `normalizeForSearch(text)` — normalizes text to lowercase alphanumeric for matching
- `findAnchorLine(specContent, anchor)` — returns the line number where the anchor appears, or `-1` if not found

## Snapshot Integration

Question state is preserved per snapshot in `questionRounds`. When navigating, the panel shows the rounds from that snapshot.

`EditorReadyState.handleSpecFileChanged` and `EditingState`'s post-stream pass call `filterValidQuestionRounds` to drop unfrozen-round questions whose anchors broke after a plan edit. Frozen rounds are left intact even if their anchors no longer resolve (they're read-only history).

## Gotchas

- The **Submit feedback** badge counts only inline feedback items, not panel question answers.
- The questions session is independent from the editing session — they run in parallel but are passed together through state transitions.
- `editorAgent.working` is always `false` in `EditorReadyState` — background question generation does not block feedback or chat. The work shows up in `questionsAgent.phase` (and, internally, `panelState.questionGenerating`), not in `editorAgent`.
- The Questions-tab phase is computed on the extension host by `core/utils/questionsAgent.ts::computeQuestionsAgent(panel, editor)`. The webview just renders it via `agentStatusLabel` and never string-matches on labels. See the priority table in [screens-and-views.md](screens-and-views.md).
- Panel Submit and Refresh are blocked during background generation (`panelState.questionGenerating`) to prevent concurrent generation.
- Use `hasAnswer(q)` and `formatAnswer(q)` from `utils/questionUtils.ts` to check/format answers — never check `textAnswer` or `chosenIndices` directly.

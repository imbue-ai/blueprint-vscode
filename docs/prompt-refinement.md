# Prompt Refinement System

A question-first workflow where the user refines their prompt through clarifying questions before plan generation begins.

## Flow

1. User enters a prompt and clicks **Submit**
2. `GeneratingPromptQuestionsState` creates a `ClaudeSession` (named "Prompt questions") with tool access (`Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`) and explores the codebase
3. The agent streams questions using `<question>` XML tags inline with explanatory text
4. On streaming completion, transitions to `PromptQuestionsState` (idle)
5. User answers some/all questions and chooses:
   - **Keep planning** — transitions back to `GeneratingPromptQuestionsState` with a `QuestioningContinuation`. The state refines the prompt with answers, then streams new questions, then transitions back to `PromptQuestionsState`.
   - **Generate plan** — transitions to `WritingSpecState`

## Question Generation

Two states implement the questioning loop, analogous to `EditorReadyState`/`EditingState`:

- `GeneratingPromptQuestionsState` (`core/states/generatingPromptQuestions.ts`) — active state that streams. On first entry it creates a new session; on refinement entries it inherits the existing session via the `QuestioningContinuation`.
- `PromptQuestionsState` (`core/states/promptQuestions.ts`) — idle state where the user answers and chooses the next step.

The currently selected plan template is written to a temp file via `writeSpecTemplateFile`, and the agent is instructed to read it so questions match the template's structure and depth. The temp file is cleaned up on `interrupt()` or when transitioning to plan generation.

Questions appear in a chat-like stream (`QuestioningStream` component) mixing:
- Individual tool calls (`ToolCallItem`) and grouped tool calls (`ToolCallGroup`)
- Markdown text explanations
- Interactive question blocks

Tool calls and text are interleaved chronologically — `core/utils/questionStreamParsing.ts` builds the message list by inserting tool calls between text segments. Hidden tool calls (e.g. reading the plan template file) are skipped to keep the chronology aligned with what the user sees.

On **Keep planning**: questions in the previous round are frozen (read-only); `GeneratingPromptQuestionsState` refines the prompt and streams follow-up questions. On **Generate plan**: handled by *both* `PromptQuestionsState` and `GeneratingPromptQuestionsState`, so clicking it mid-refinement or mid-streaming transitions immediately — the in-flight session is aborted via `interrupt()` and the collected answers are handed off to `WritingSpecState` for refinement.

When the `FORK_EDITOR_FROM_QUESTIONS` flag is on (default), the questioning session is forked for the writing/editing phase so that exploration context carries over.

## Prompt Refinement

Shared utility in `utils/promptRefinement.ts`. Creates a `ClaudeSession` that streams refined prompt text. Called from two places:

- `GeneratingPromptQuestionsState.handleRefine` — refines the prompt with answers before generating follow-up questions (the **Keep planning** path).
- `WritingSpecState.writeSpec` — refines the prompt with handed-off answers as the first step of plan generation (the **Generate plan** path). Moving the refinement into `WritingSpecState` lets the button transition to the plan-editing screen immediately instead of blocking on refinement.

## Gotchas

- `GeneratingPromptQuestionsState` seeds `refining = true` (continuation path) or `streaming = true` (initial path) in the constructor. `app.setState` broadcasts *before* calling `onEnter`, so without this seed the first render would show "Ready" until the async path sets the flag itself.
- On the continuation path, `roundStartMessages` is seeded from `continuation.messages` so `roundStartIndex` starts at the end of the existing stream. Without the seed, the default `[]` would make `roundStartIndex = 0`, which `QuestioningStream`'s scroll effect treats as a new-round trigger and scrolls all the way to the top before the real scroll fires.
- The `PromptRefinementScreen` holds the agent-status text on `updating_prompt` between rounds (after the backend has flipped to `generating_questions`) until the new round produces at least one message. This lines up the text change with the scroll-to-new-round animation.

## Question Types

Questions use the `PromptQuestion` discriminated union (`types/promptQuestion.ts`):
- `simple` — free-text only
- `mcq` — single-select with radio buttons
- `multiselect` — multi-select with checkboxes

Validation and answer collection are shared via `utils/promptQuestionUtils.ts`.

## XML Question Format

The agent outputs questions wrapped in XML tags:
```
<question>
{"text": "...", "context": "...", "choices": [...], "multiSelect": false}
</question>
```

Parsed by `core/xmlQuestionParser.ts`, which splits streaming text into text segments and structured question objects.

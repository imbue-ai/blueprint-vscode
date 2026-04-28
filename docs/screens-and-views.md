# Screens and Views

The webview UI is driven by a single discriminated union `AppScreen`. The extension host computes the current screen and sends it to the webview, which renders the matching React component. There is no client-side routing — the extension host is the sole source of truth for the displayed screen.

## Data Flow

```
AppState/AppView  →  getScreen(): AppScreen  →  SidebarProvider  →  App.tsx switch  →  Screen component
```

1. `App` calls `getScreen()` on the topmost view (if any) or the active state.
2. The screen is wrapped in `ExtensionData` (`{ status: 'ok', screen, rateLimitResetsAt? }` or `{ status: 'error', msg, link? }`).
3. `SidebarProvider` sends it to the webview as `{ type: 'data' }`.
4. `App.tsx` switches on `screen.type` and renders the matching component.

## States vs Views

- **`AppState`** — the primary state machine. Only one state is active at a time. States transition via `app.setState()`, which calls `interrupt()` on the old state and `onEnter()` on the new one. `setState` broadcasts before `onEnter` runs.
- **`AppView`** — an overlay stored in a `viewStack`. Views temporarily replace the screen without changing the underlying state. `openSettings` resets the stack to `[SettingsView]`; `openTemplateEditor` pushes a `TemplateEditorView`. `returnFromView` pops the top view; the underlying state's screen reappears when the stack is empty.

This separation lets the user open the template editor while in the middle of editing — the underlying state (with its sessions and snapshots) is preserved.

## Screens

### `OnboardingScreen`

**Type:** `{ type: 'onboarding', data: TemplateConfig, selectedModel }`
**File:** `webview/screens/OnboardingScreen.tsx`
**State:** `OnboardingState`

First-launch screen with three collapsible groups (sections, writing style, model) and a **Get started** button. See [onboarding.md](onboarding.md).

### `PromptScreen`

**Type:** `{ type: 'prompt', prompt }`
**File:** `webview/screens/PromptScreen.tsx`
**State:** `PromptState`

Centered prompt entry with a textarea and **Submit** button. The Blueprint icon and tagline anchor the empty state. There is no template UI on this screen — selection lives in Settings.

The "+ New plan", "Open existing plan", and "Settings" affordances are added by VS Code in the sidebar's title bar via the `view/title` menu in `package.json`, not by the screen itself.

### `PromptRefinementScreen`

**Type:** `{ type: 'promptRefinement', questions, currentPrompt, questionsLoading, refining, agentStatus, questioningMessages, isFirstRound, roundStartIndex }`
**File:** `webview/screens/PromptRefinementScreen.tsx`
**States:** `GeneratingPromptQuestionsState` (streaming) and `PromptQuestionsState` (idle)

Shows the current prompt in a collapsible drawer (`PromptDrawer`) and a stream of clarifying questions with interleaved tool calls and text explanations (`QuestioningStream`). A `StreamEndStatus` pill at the bottom shows the agent phase.

| Phase | State | `questionsLoading` | `refining` | Agent working |
|---|---|---|---|---|
| Exploring & generating questions | `GeneratingPromptQuestionsState` | `true` | `false` | Yes |
| Refining prompt after answers | `GeneratingPromptQuestionsState` | `false` | `true` | Yes |
| Waiting for user answers | `PromptQuestionsState` | `false` | `false` | No |

User actions:
- **Keep planning** (only `PromptQuestionsState`) — refine prompt and stream new questions
- **Generate plan** — handled by *both* states; click is honored even mid-stream

The screen holds the agent-status text on `updating_prompt` between rounds (after the backend has flipped to `generating_questions`) until the new round produces at least one message — this lines up the text change with the scroll-to-new-round animation.

This same screen is also rendered transiently by `WritingSpecState` while the feature slug is generated and (if applicable) the prompt is being refined with handed-off answers, before the plan file exists.

### `SpecEditingScreen`

**Type:** `{ type: 'specEditing', specFilePath, prompt, streamItems, messageDraft, feedbackItems, nFeedback, editorAgent, questionsAgent, questionsPanel?, sessionId?, freshEntry? }`
**File:** `webview/screens/SpecEditingScreen.tsx`
**States:** `WritingSpecState` (after the file is created), `StartingEditorAgentState`, `EditorReadyState`, `EditingState`

A three-tab layout: **Chat**, **Questions**, **Feedback**. All three tabs are always mounted and toggled via `display: none` so each tab's scroll position and component state survives tab switches. The active tab is persisted via `usePersistentState`, but on a fresh entry to this screen (`freshEntry: true`, injected by `App.getData` only on the first broadcast after switching from another screen type), the webview snaps back to the **Chat** tab.

- **Chat** — `ActivityStream` with the original prompt, tool calls, and messages; `ChatInput` at the bottom; a `StreamEndStatus` reflecting `editorAgent`.
- **Questions** — `SpecQuestionsPanel` with the active and frozen rounds; `Submit` and `Refresh questions` controls; a `StreamEndStatus` reflecting `questionsAgent`. The tab badge shows the count of unanswered questions in the active round, replaced by a pulsing dot while the questions agent is generating.
- **Feedback** — `FeedbackTab` lists pending feedback items (added via the gutter "+" or right-click in the plan file); a **Submit feedback (N)** button at the bottom batches them all to the editor agent.

Below the tab content, when a session id is available, a **Copy resume command** button appears that writes `claude --resume <sessionId>` to the clipboard.

Multiple states render this screen at different phases:

| State | `editorAgent.phase` | Notes |
|---|---|---|
| `WritingSpecState` (post slug) | `writing_plan` (or `updating_prompt` while refining) | Streaming plan content to the file |
| `StartingEditorAgentState` | `reviewing_plan` | Editor agent reads the plan + scopes the codebase |
| `EditorReadyState` | `ready` | Idle; chat / panel question / feedback handlers |
| `EditingState` | `responding` → `editing_plan` once an `Edit`/`Write` tool fires | Streaming reply / plan edits |

**Status placement.** Two independent agents track separate work: the **editor agent** (writes/edits the plan, drives chat replies) and the **questions agent** (generates clarifying questions in the background). The screen ships two `AgentStatus` values:

- `editorAgent` — drives the bottom-of-screen `StreamEndStatus` on the Chat tab and gates the chat input + feedback submit
- `questionsAgent` — drives the Questions tab. Computed by `core/utils/questionsAgent.ts::computeQuestionsAgent(panel, editor)`; phase priority (first match wins):

| Condition | `questionsAgent.phase` |
|---|---|
| No `questionsPanel` yet (plan still being written) | `waiting_for_plan` |
| `panel.loading` (questions actively streaming) | `generating_questions` |
| `editor.phase === 'editing_plan'` && `panel.willRegenerate` | `waiting_for_plan_edit` |
| `panel.willRegenerate` (questions interrupted; will resume after the editor finishes) | `generating_questions` |
| Otherwise | `ready` |

`panel.willRegenerate` is set by `transitionToEditing` only when question generation was actively in progress when the user took an action (chat or feedback). A plain chat reply that didn't interrupt anything has `willRegenerate=false` and falls through to `ready`.

UI display labels come from `agentStatusLabel(phase)` in `types/screens.ts` — the UI never string-matches on labels.

`StartingEditorAgentState` reports `questionsAgent.phase = 'waiting_for_plan_review'` because the questions session is created at the *end* of that state — its `getScreen()` overrides the derivation since there is no panel yet.

### `SettingsScreen`

**Type:** `{ type: 'settings', selectedModel, templates, selectedTemplateId }`
**File:** `webview/screens/SettingsScreen.tsx`
**View:** `SettingsView`

Has a `MenuBar` with title "Settings" and two sections:
- **Model** — `ModelSelector` for `claude-sonnet-4-6` / `claude-opus-4-6`
- **Templates** — list of `TemplateListItem` rows with edit/delete affordances and a **+ New** button that opens the template editor

### `TemplateEditorScreen`

**Type:** `{ type: 'templateEditor', name, filename, mode, data, rawPrompt, isCreate }`
**File:** `webview/screens/TemplateEditorScreen.tsx`
**View:** `TemplateEditorView`

Full-screen overlay for editing or creating templates. Two modes:
- **Structured** — reuses onboarding-style controls via `TemplateFormFields`
- **Freeform** — direct textarea editing (`TemplateEditorRawMode`)

Switching from structured to freeform pre-fills the textarea with the prompt rebuilt from the current config.

## State Machine Flow

```
OnboardingState ──completeOnboarding──→ PromptState
                                          │
                                     submitSpecPrompt
                                          │
                                          ▼
                           GeneratingPromptQuestionsState
                                          │
                                   (streaming complete)
                                          │
                                          ▼
                                PromptQuestionsState ◄─────────┐
                                    │              │           │
                              generateSpec    refinePrompt     │
                                    │              │           │
                                    │              ▼           │
                                    │   GeneratingPromptQuestionsState
                                    │              │           │
                                    │       (streaming complete)┘
                                    ▼
                              WritingSpecState
                                          │
                                    (plan written)
                                          │
                                          ▼
                              StartingEditorAgentState
                                          │
                                    (warmup complete)
                                          │
                                          ▼
                                  EditorReadyState ◄───┐
                                    │          │       │
                              sendMessage  submitSpecFeedback
                                    │          │       │
                                    ▼          ▼       │
                                 EditingState ─────────┘
```

## Shared Components

Components in `webview/components/`:

- `MenuBar` — title bar (used by Settings)
- `StreamEndStatus` — dot + text agent-status indicator (pulsing when working, green "Ready" when idle)
- `PromptDrawer` — collapsible prompt preview (PromptRefinement screen)
- `QuestioningStream` — interleaved text, questions, and tool calls (PromptRefinement screen)
- `QuestioningMessageItem` — renders a single `QuestioningMessage`
- `RoundHintCard` — between-rounds card shown while a new round is starting
- `QuestionItem` — shared question UI (used by prompt and plan questions): MCQ, multiselect, text, optional jump-to-line, frozen mode
- `SpecQuestionsPanel` — plan questions panel (Questions tab)
- `FeedbackTab` — feedback list with Submit button (Feedback tab)
- `ActivityStream` — flat chronological stream with last-user-message scroll-to-top behavior
- `ToolCallItem` / `ToolCallGroup` — tool call display
- `ChatInput` — message textarea with send button
- `TemplateFormFields` — shared section/style/depth form components
- `SectionItem`, `AddSectionMenu`, `CollapsibleGroup`, `ScrollPanel`, `ModelSelector`, `TemplateListItem`, `Tooltip`, `CopyButton`, `DropdownTrigger`, `BlueprintIcon`, `RateLimitBanner`, `InputComponents`

## Message Protocol

The webview communicates with the extension host through typed messages:

- **`SidebarInMessage`** (`extension → webview`): `{ type: 'data', data: ExtensionData }` — full screen state on every state change
- **`SidebarOutMessage`** (`webview → extension`): user actions like `submitSpecPrompt`, `sendMessage`, `submitSpecFeedback`, etc.

Global messages handled by `App` directly: `requestData`, `openNewSpecView`, `openSettings`, `openTemplateEditor`, `returnFromView`, `openSpec`, `openExistingSpec`. Everything else is delegated to the topmost view (if any) or the current state.

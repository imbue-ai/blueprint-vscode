# Snapshot System

Provides in-memory version history for plans during an editing session. `SnapshotManager` (`core/snapshotManager.ts`) is the single source of truth for all plan-related state.

## Snapshot Contents

Each `Snapshot` captures:
- `id`, `timestamp`
- `prompt` — the (refined) prompt used to generate the plan
- `specContent` — the plan text at that point
- `chatMessages` — conversation history (legacy `ChatMessage` format, kept for compatibility)
- `streamItems` — chronological list of `StreamItem` entries (tool calls, user messages, assistant messages); the primary chat display data
- `editingSession` — the editor `ClaudeSession` for this snapshot
- `submittedFeedback` — feedback items already sent to the agent (not rendered)
- `pendingFeedback` — unsubmitted feedback items
- `questionRounds` — plan-question rounds with answers and frozen status

## When Snapshots Are Created

- **Initial snapshot** — created in `StartingEditorAgentState` after the editor warmup completes, capturing the freshly written plan and the warmed-up editing session.
- **Per send** — `EditingState.sendMessage` creates a new snapshot for the going-forward state at the start of every chat or feedback submission. The previous snapshot is preserved untouched (its prompt, plan content, feedback, and questions remain intact for history/navigation), and the new snapshot's `editingSession` is a fork of the previous one.

After streaming completes, `EditingState` reads the plan back from disk and updates the current snapshot's `specContent`, also dropping any plan-question rounds whose anchors broke.

## Snapshot Clearing

Snapshots are bound to a single editing session — `App.handleStartNewSpec` builds a fresh `PromptState`, which on submission creates a new questioning/editing session and a brand new `SnapshotManager` is created in `StartingEditorAgentState`. The previous plan file stays on disk; only the in-memory snapshot history is dropped.

## Cloning

`SnapshotManager.clone()` deep-copies all snapshots, including forking each snapshot's editing session (`Snapshot <id-prefix>`). Used by `EditingState` when handing the manager to the next `EditorReadyState` so concurrent state references don't share mutable history.

## Key Files

- `core/snapshotManager.ts` — `SnapshotManager` class and `Snapshot` type
- `core/states/editing.ts` — creates per-send snapshots and updates the current one after streaming

## Gotchas

- Snapshots are in-memory only (cleared on extension deactivation or new plan). There is no UI for navigating between snapshots — they accumulate in memory but only the current one is shown.

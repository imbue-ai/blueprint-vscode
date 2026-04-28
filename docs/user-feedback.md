# User Feedback

## Overview

Users provide feedback on plan sections via comment threads in the VS Code plan editor. Pending feedback is also mirrored in the **Feedback** tab of the sidebar so the user can review and submit without leaving the sidebar.

## Architecture

- `editor/editor.ts` — registers the `blueprint-feedback` `CommentController`, the gutter "+" affordance (via `commentingRangeProvider`), the line-highlight decoration, and the feedback commands. Forwards comment-thread interactions as `addFeedback`/`editFeedback`/`deleteFeedback` messages.
- `editor/feedbackThreads.ts` — `FeedbackThreadManager` owns the live `vscode.CommentThread` for each tracked feedback id.
- `core/feedbackSubmit.ts` — `buildFeedbackPrompt(snapshotManager)` formats pending items into a single agent prompt (sorted by line, with line-range labels).
- `core/states/editorReady.ts` and `editing.ts` — `addFeedback`/`editFeedback`/`deleteFeedback`/`submitSpecFeedback` handlers that mutate the current snapshot's `pendingFeedback`. `submitSpecFeedback` calls `buildFeedbackPrompt` and transitions to `EditingState` with `consumeFeedback=true`.
- `webview/components/FeedbackTab.tsx` — sidebar Feedback tab UI.

## User Flow

1. **Create**: click the "+" icon in the gutter → type feedback in the reply box → submit → a comment thread is created at that line. Alternatively: select text, right-click, and choose **Add feedback on selection**.
2. **View**: the thread shows the feedback text with a label showing the line range; threads are expanded by default.
3. **Edit**: type new text in the reply box → click **Submit** → the feedback text is replaced.
4. **Delete**: click the trash icon in the thread title bar → the feedback is removed immediately.
5. **Submit**: click **Submit feedback (N)** in the Feedback tab → all pending items are batched into a single prompt to the editor agent. After submission, items move from `pendingFeedback` to `submittedFeedback` on the snapshot.

## Sidebar Feedback Tab

`FeedbackTab` (`webview/components/FeedbackTab.tsx`):
- Shows each pending feedback item as a card with text, line label, and a delete button
- Clicking a card sends `jumpToLineNumber` to scroll the plan editor to that line
- Tab badge shows the pending count
- Bottom **Submit feedback (N)** button is disabled while the editor agent is working or if there are no items

The list updates live as feedback is added, edited, or deleted in the editor. After submission the tab clears (pending → submitted).

## Line Highlighting

- Feedback lines are highlighted with a light blue whole-line background (`rgba(0, 120, 215, 0.12)`) via a `TextEditorDecorationType` in `Editor`.
- The highlight spans `startLine`–`endLine` for each feedback item.
- This is distinct from the jump-to-line flash highlight used for plan questions (a brief blue flash at the target line).
- Decorations update when feedback changes or the active editor switches.

## Comment Thread Behavior

- Each feedback item gets its own `CommentThread` positioned at `startLine - 1` (0-based).
- Thread label is `Feedback (Line X)` or `Feedback (Lines X-Y)`.
- Threads are always expanded by default.
- **Submit** (rename for `blueprint.editFeedback`) and **Delete** (`blueprint.deleteFeedback`) are scoped to `commentController == blueprint-feedback`.
- A `commentingRangeProvider` is registered against the active plan URI so the gutter "+" appears only for the plan file.
- When the user submits via the gutter "+", the VS Code-created thread is *adopted* (`FeedbackThreadManager.adoptThread`) before the broadcast triggers `update()`, so it isn't disposed and re-created.

## Invalidation

All pending feedback is cleared whenever the plan content changes (via `onDidChangeTextDocument` in `Editor`, which sends `specFileChanged`; `EditorReadyState.handleSpecFileChanged` clears `pendingFeedback`). Line numbers stored on feedback items become unreliable after any insertion or deletion in the plan, and the feedback prompt references specific line ranges, so stale numbers would point the agent at the wrong content.

## Snapshot Integration

- `pendingFeedback` is saved on the current snapshot and restored on snapshot navigation.
- `submittedFeedback` is recorded on the snapshot but never rendered (it exists for history only).
- Starting a new plan creates a fresh `SnapshotManager`, so feedback from the previous plan is dropped along with everything else.

# Chat System

The chat is the **Chat** tab within the `SpecEditingScreen`. It uses the `ActivityStream` component to display a chronological feed of the original prompt, user messages, assistant messages, and tool calls.

## Message Flow

1. User types in `ChatInput` and presses Send (or Cmd/Ctrl+Enter)
2. Webview sends `sendMessage` to the extension
3. `EditorReadyState` transitions to `EditingState`, which forks the editor session
4. `EditingState` creates a new snapshot for the going-forward state and streams the response, pushing `StreamItem` entries to it
5. On completion, transitions back to `EditorReadyState`

## Stream Items

The chat history uses `StreamItem` (a discriminated union) instead of `ChatMessage`:

- `{ type: 'user_message', content }` — user chat message
- `{ type: 'assistant_message', content }` — streamed assistant text (appended incrementally)
- `{ type: 'tool_call', name, summary, args, result? }` — agent tool invocation

Stream items are stored on each snapshot.

## ActivityStream Component

`webview/components/ActivityStream.tsx` renders the flat stream. It groups consecutive `tool_call` items:
- Single tool call → `ToolCallItem` (expandable inline)
- Multiple consecutive tool calls → `ToolCallGroup` (collapsed summary)

The original plan prompt is rendered as a non-interactive bubble at the top of the stream (passed in via the `prompt` prop) and is followed by an `AgentStatus` pill at the bottom of the panel.

`ActivityStream` does **not** auto-scroll to the bottom. Whenever a new user message arrives, it scrolls so that the user message sits at the top of the visible area, with a dynamically sized spacer below the content so the user message can be scrolled to the top but no further.

## Editing Logic

`EditingState` (`core/states/editing.ts`):
- Forks the current snapshot's editing session before prompting (fork-per-edit pattern)
- Always creates a new snapshot at the start of the message — the previous snapshot is preserved untouched for history/navigation
- Pushes user messages, assistant text deltas, and tool calls as `StreamItem`s onto the new snapshot
- Tracks `hasEditedSpec` to flip the agent phase from `responding` to `editing_plan` once an `Edit`/`Write` tool fires
- Also maintains `chatMessages` on the snapshot for backward compatibility

After streaming, the latest plan content is read back from disk and any plan-question rounds whose anchor lines disappeared are filtered out.

## Components

- `ActivityStream` — chronological stream of prompt, tool calls, and messages with a top-anchored scroll for the latest user message
- `ToolCallItem` — expandable single tool call (name, summary, args, result)
- `ToolCallGroup` — collapsible group of consecutive tool calls
- `ChatInput` — textarea with send button (disabled while the editor agent is working)
- `StreamEndStatus` — agent-status pill rendered at the tail of the stream

## Messages

- Webview → extension: `sendMessage`, `setDraftMessage`, `submitSpecFeedback`
- Extension → webview: full `ExtensionData` (with the current `AppScreen`) is pushed via `SidebarProvider` on every state change

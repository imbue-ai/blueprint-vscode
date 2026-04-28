# Webview Messaging

Communication between the extension host and the sidebar webview uses VS Code's message-passing API. The webview is the only UI surface — there is no separate panel.

## Message Flow

1. Webview sends `requestData` on mount.
2. Extension host responds by broadcasting the current `ExtensionData`.
3. On any state change, the extension calls `App.broadcast()` which pushes a fresh `ExtensionData` to the webview.
4. The webview sends action messages when the user interacts.

## Extension Data (`ExtensionData`)

`ExtensionData` is the top-level payload sent to the webview:

- `{ status: 'error', msg, link? }` — fatal error (e.g. no workspace, missing Claude CLI). The webview shows the message and optional install link.
- `{ status: 'ok', screen: AppScreen, rateLimitResetsAt? }` — normal operation. `screen` is one of the variants in `AppScreen`. `rateLimitResetsAt` triggers the rate-limit banner overlay.

The extension never sends partial state — every broadcast is a full screen. `AppScreen` is the discriminated union the webview switches on. See [screens-and-views.md](screens-and-views.md) for the per-screen shape.

## Extension → Webview (`SidebarInMessage`)

Only one variant: `{ type: 'data', data: ExtensionData }`.

## Webview → Extension (`SidebarOutMessage`)

Grouped by phase:

**Bootstrapping & links**
- `requestData` — initial state request on mount
- `openLink` — open an external URL (handled directly by `SidebarProvider`)

**View overlays**
- `openNewSpecView` — new plan from anywhere (interrupts active session after confirmation)
- `openExistingSpec` — file-picker → open existing plan
- `openSettings` / `openTemplateEditor` / `returnFromView`

**Onboarding**
- `completeOnboarding`

**Template config (shared by onboarding and the template editor)**
- `addTemplateSection`, `removeTemplateSection`, `updateTemplateSection`, `moveTemplateSection`
- `setTemplateStyles`, `setTemplateDepth`, `setTemplateNotes`

**Settings**
- `setModel` — global setting `blueprint.model`
- `deleteTemplate` — by template id
- `setSpecTemplate` — workspace-state selection (`blueprint.selectedTemplateId`)

**Prompt screen**
- `setPrompt`, `submitSpecPrompt`

**Template editor overlay**
- `setTemplateEditorMode`, `setTemplateEditorName`, `setTemplateEditorFilename`, `setTemplateEditorRawPrompt`, `saveTemplateEditor`

**Prompt refinement screen**
- `answerPromptQuestion` — user-typed text + chosen indices
- `refinePrompt` — "Keep planning"
- `generateSpec` — "Generate plan"

**Plan editing screen**
- `setDraftMessage`, `sendMessage`
- `submitSpecFeedback` — submits all pending feedback as a single agent prompt
- `openSpec` — open the plan file in the editor

**Editor-routed feedback (forwarded by `Editor` from VS Code comment thread interactions)**
- `addFeedback`, `editFeedback`, `deleteFeedback`
- `specFileChanged` — fired by `Editor` when the plan document changes; clears stale pending feedback and removes plan questions whose anchors broke

**Plan questions panel**
- `answerPanelQuestion`, `submitPanelAnswers`, `refreshPanelQuestions`, `toggleQuestionsPanel`
- `jumpToLine { anchor }` — open and scroll the plan editor to a question's anchor
- `jumpToLineNumber { line }` — open and scroll to a specific line (used by feedback cards)

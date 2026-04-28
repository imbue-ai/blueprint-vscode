# Prompt Templates

Prompt templates let users create and switch between named templates that drive plan generation.

## Storage

Templates live in the global VS Code setting `blueprint.promptTemplates`:

```json
"blueprint.promptTemplates": [
  {
    "id": "<uuid>",
    "name": "Default",
    "filename": "plan.md",
    "mode": "structured",
    "config": { "sections": [...], "styles": ["bullet"], "depth": "concise", "notes": "" },
    "prompt": "The plan should contain EXACTLY the following sections..."
  }
]
```

Each `PromptTemplate` (`types/promptTemplate.ts`) has:
- `id` — uuid; stable identifier used by selection and edit/delete
- `name` — display name (no longer the identifier; can be changed)
- `filename` — output filename for the generated plan, e.g. `plan.md`. The plan is written to `blueprint/<feature>/<filename>`
- `mode` — `'structured'` or `'freeform'`; controls which input the template editor exposes
- `config` — `TemplateConfig` (sections / styles / depth / notes) used by structured mode
- `prompt` — raw template text used by freeform mode and at generation time

Selection is persisted per workspace in `blueprint.selectedTemplateId`. If the persisted id no longer exists, `resolveSelectedTemplate` falls back to the first template.

## Automatic Prompt Wrapping

`wrapTemplatePrompt` (`core/prompts.ts`) wraps the template body with a standard preamble and postamble at generation time, so users only need to write the section instructions:

- **Preamble**: `I want to build: {{userPrompt}}` + intro instructions to explore the codebase first
- **Postamble**: a "do not write code" rule, `{{toolGuidance}}`, and instructions to write the file content directly without preamble

Inside the wrapped template, `{{featurePath}}` is interpolated with the plan's parent directory (`blueprint/<feature>`), and `{{userPrompt}}` with the (refined) user prompt.

## Initial Template

When onboarding completes, a "Default" template is created from the user's choices via `generateDefaultTemplate`. Users can edit it or create more later.

## Template Editor

The Settings view's Templates section has a **+ New** button to create a template and an edit affordance per row. Both open `TemplateEditorView`, a full-screen overlay (`TemplateEditorScreen`).

The editor has two modes:
- **Structured** (default for new templates) — same section/style/depth UI as onboarding, via shared components in `TemplateFormFields`. On save, the prompt body is generated from the config via `buildPromptFromConfig`.
- **Freeform** — a textarea for direct prompt editing. Switching from structured to freeform pre-fills the textarea with the generated prompt; switching back is not destructive but the textarea content is discarded.

Templates created during onboarding store `config` and open in structured mode. Switching `mode` is part of the saved template state.

In structured mode, the save button stays clickable when sections have empty titles or descriptions, but clicking it does not save — instead, the sections group header surfaces an error ("Section title cannot be empty" / "Section description cannot be empty"). The error is gated on a local `submitAttempted` flag, so it only appears after the first save attempt and clears once all sections are valid.

## Template Selection

Template selection lives in the Settings view: each template row in `TemplateListItem` is a radio-style selector, and clicking a row sends `setSpecTemplate { id }` which updates `blueprint.selectedTemplateId` in workspace state. `PromptState` reads the persisted id when submitting; the prompt screen itself does not expose a template UI.

## Agent Integration

The selected template's text is written to a temp file by `utils/specTemplate.ts`. Both the questioning agent and the editor agent read this file:
- The questioning agent uses it to calibrate question depth and structure
- The editor agent uses it to preserve the plan's format when making edits

The temp file is cleaned up on `interrupt()` or on transition out of any state that owns it.

## Persistence

- Templates are stored in global VS Code settings (`blueprint.promptTemplates`)
- Selected template id is persisted per workspace (`blueprint.selectedTemplateId`)
- If the persisted id is missing or stale, `resolveSelectedTemplate` falls back to the first template

## API (`core/prompts.ts`)

- `getTemplates()` — reads and validates templates from settings
- `getTemplate(id)` — by id
- `resolveSelectedTemplate(persistedId, templates?)` — returns the matching template or the first template as fallback
- `createTemplate(template)` / `saveTemplate(id, template)` / `deleteTemplate(id)` — write back to settings
- `getTemplatePrompt(template)` — returns the prompt body for the template's active `mode` (re-builds from `config` when structured)
- `wrapTemplatePrompt(prompt)` — adds the standard preamble/postamble
- `interpolatePrompt(template, vars)` — `{{key}}` replacement

# Onboarding

The extension shows an onboarding screen the first time a user opens it. The onboarding flow lets users configure their default plan template by choosing sections, writing style, and the model.

## Flow

1. `App` is created with `needsOnboarding: true` if `blueprint.onboardingComplete` is not set in `globalState`.
2. `App` starts in `OnboardingState`.
3. The sidebar renders `OnboardingScreen` with three collapsible groups:
   - **Sections** — a reorderable list of plan sections seeded from `DEFAULT_TEMPLATE_SECTIONS` (Overview, Expected behavior). A "+" menu adds presets or a blank custom section. Each section has inline title/description editing, up/down reorder, and delete.
   - **Writing style** — checkboxes for `bullet` and `diagrams` styles, plus a `concise` / `comprehensive` depth toggle.
   - **Model** — radio selection for `claude-sonnet-4-6` or `claude-opus-4-6`; persisted to the `blueprint.model` setting.
4. The user configures the template and clicks **Get started**.
5. `OnboardingState.complete()` calls `generateDefaultTemplate(data)` which builds the prompt via `buildPromptFromConfig`, writes a single "Default" `PromptTemplate` (with `mode: 'structured'` and `filename: 'plan.md'`) to `blueprint.promptTemplates`, sets `blueprint.onboardingComplete`, and transitions to `PromptState`.

## Preset Sections

Available via the "+" menu in `AddSectionMenu`. Already-added presets are grayed out. "Custom" adds a blank section. Defined in `PRESET_SECTIONS`:

- Overview
- Summary
- Implementation plan
- Implementation phases
- Open questions
- Expected behavior
- Testing strategy
- Data model
- API design

## State

All onboarding state lives in `OnboardingState` (single source of truth). The screen data carries a `TemplateConfig` (`{ sections, styles, depth, notes }`) plus the currently selected model. The webview sends one message per interaction; the state updates and broadcasts.

## Debug

The command **"Blueprint: Reset onboarding"** (`blueprint.resetOnboarding`) clears `blueprint.onboardingComplete`, deletes `blueprint.promptTemplates`, and returns to `OnboardingState`. The command is always exposed in the command palette.

## Key Files

- `types/onboarding.ts` — `SpecSection`, `TemplateConfig`, `SpecStyle`, `SpecDepth`, `PRESET_SECTIONS`, `DEFAULT_TEMPLATE_SECTIONS`, `DEFAULT_STYLES`, `DEFAULT_DEPTH`, `buildPromptFromConfig()`
- `core/states/onboarding.ts` — `OnboardingState`
- `core/templateGenerator.ts` — `generateDefaultTemplate()` — writes the "Default" template after onboarding
- `webview/screens/OnboardingScreen.tsx` — main onboarding screen (uses `CollapsibleGroup` for sections, style, model)
- `webview/components/TemplateFormFields.tsx` — shared section/style/depth controls (also used by the template editor)
- `webview/components/SectionItem.tsx` — inline-editable section row with reorder/delete
- `webview/components/AddSectionMenu.tsx` — "+" button with preset context menu
- `webview/components/ModelSelector.tsx` — model radio selector

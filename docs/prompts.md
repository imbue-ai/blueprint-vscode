# Prompts Module

The prompts module (`core/prompts.ts`) builds the agent prompts for each phase. The default text lives in `core/promptDefaults.ts` and is not user-configurable. System prompts (per session role) live in `core/systemPrompts.ts`.

## Template Interpolation

Variables use `{{variableName}}` notation:

```typescript
interpolatePrompt("Build {{feature}} for {{platform}}", {
  feature: "authentication",
  platform: "web"
});
// -> "Build authentication for web"
```

Missing variables are replaced with empty strings.

The plan-generation prompt is composed of: the user's (refined) prompt, the selected `PromptTemplate`'s body, and the wrapping preamble/postamble. See [prompt-templates.md](prompt-templates.md).

## System Prompts

Each Claude session is given a fixed system prompt that sets the role:

| Constant | Used by | Purpose |
|----------|---------|---------|
| `SLUG_SYSTEM_PROMPT` | `featureManager.ts` | Feature slug generation (kebab-case dir name) |
| `PROMPT_REFINEMENT_SYSTEM_PROMPT` | `utils/promptRefinement.ts` | Streaming prompt refinement |
| `SPEC_WRITING_SYSTEM_PROMPT` | `states/writingSpec.ts` | Plan generation |
| `SPEC_START_MARKER` | `states/writingSpec.ts` | Marker the writing agent must output before the plan content |
| `getSpecEditingSystemPrompt(specFilePath)` | `startingEditorAgent.ts`, `editing.ts` | Editor session warmup and chat editing |
| `QUESTIONING_SYSTEM_PROMPT` | `generatingPromptQuestions.ts` | Prompt-questioning mode |
| `AGENTIC_SPEC_QUESTIONS_SYSTEM_PROMPT` | `questionGeneration.ts` | Plan-questions mode (background) |

System prompts are passed via `PromptOptions.systemPrompt` on each `.prompt()` call.

## Plan Start Marker

During plan generation, the writing agent's streamed text is appended directly to the plan file. To keep preamble or non-plan text out of the file, a marker-based approach is used:

1. The plan file is cleared at the start of each new agent message (`message_start` event).
2. All streamed text is buffered until the agent outputs `SPEC_START_MARKER` (`<!-- spec-start -->`).
3. Only text after the marker is written to the file. The marker itself is stripped.
4. The system prompt instructs the agent to output this marker before the plan content.

## API

- `interpolatePrompt(template, vars)` — `{{key}}` replacement
- `getEditingPrompt(specFilePath, specTemplatePath | null)` — editor warmup prompt; appends a "read the template" instruction when a template path is provided
- `getRefinementPrompt(originalPrompt, qaPairs)` — prompt refinement (initial round)
- `getSpecRefinePrompt(qaPairs)` — refine the plan from panel-question Q&A pairs (sent to the editor agent)
- `getFeedbackPrompt(feedbackText)` — refine the plan from inline feedback
- `getQuestionPrompt(userPrompt, specTemplatePath)` — initial questioning prompt
- `getQuestionContinuePrompt(qaPairs, specTemplatePath)` — continuation questioning prompt
- `getAgenticSpecQuestionPrompt(specFilePath)` — initial plan-questions prompt
- `getAgenticSpecQuestionContinuePrompt(qaPairs, specFilePath)` — continuation plan-questions prompt
- `wrapTemplatePrompt(templatePrompt)` — wraps a template body with the standard preamble/postamble
- `getTemplatePrompt(template)` — resolves a `PromptTemplate` to its prompt body, rebuilding from `config` in structured mode

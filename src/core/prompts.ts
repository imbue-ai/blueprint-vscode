import * as vscode from 'vscode';

import type { TemplateConfig } from '../types/onboarding';
import { buildPromptFromConfig } from '../types/onboarding';
import type { PromptTemplate } from '../types/promptTemplate';
import {
  AGENTIC_SPEC_QUESTION_CONTINUE_PROMPT,
  AGENTIC_SPEC_QUESTION_PROMPT,
  EDITING_PROMPT,
  FEEDBACK_PROMPT,
  QUESTION_CONTINUE_PROMPT,
  QUESTION_PROMPT,
  REFINEMENT_PROMPT,
  SPEC_PROMPT,
  SPEC_REFINE_PROMPT,
} from './promptDefaults';

export { SPEC_PROMPT };

export function interpolatePrompt(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? '');
}

export function getEditingPrompt(specFilePath: string, specTemplatePath: string | null): string {
  const base = interpolatePrompt(EDITING_PROMPT, { specFilePath });
  if (specTemplatePath) {
    return `${base} Also read the spec template at ${specTemplatePath} — when making edits, preserve the structure and sections defined in the template.`;
  }
  return base;
}

export function getRefinementPrompt(originalPrompt: string, qaPairs: string): string {
  return interpolatePrompt(REFINEMENT_PROMPT, { originalPrompt, qaPairs });
}

export function getSpecRefinePrompt(qaPairs: string): string {
  return interpolatePrompt(SPEC_REFINE_PROMPT, { qaPairs });
}

export function getFeedbackPrompt(feedbackText: string): string {
  return interpolatePrompt(FEEDBACK_PROMPT, { feedbackText });
}

export function getAgenticSpecQuestionPrompt(specFilePath: string): string {
  return interpolatePrompt(AGENTIC_SPEC_QUESTION_PROMPT, { specFilePath });
}

export function getAgenticSpecQuestionContinuePrompt(qaPairs: string, specFilePath: string): string {
  return interpolatePrompt(AGENTIC_SPEC_QUESTION_CONTINUE_PROMPT, {
    qaPairs,
    specFilePath,
  });
}

export function getQuestionPrompt(userPrompt: string, specTemplatePath: string): string {
  return interpolatePrompt(QUESTION_PROMPT, {
    userPrompt,
    specTemplatePath,
  });
}

export function getQuestionContinuePrompt(qaPairs: string, specTemplatePath: string): string {
  return interpolatePrompt(QUESTION_CONTINUE_PROMPT, {
    qaPairs,
    specTemplatePath,
  });
}

// --- Template wrapping ---

/**
 * Wraps a template prompt with the standard preamble and postamble so users
 * can write simple section instructions without boilerplate.
 */
export function wrapTemplatePrompt(templatePrompt: string): string {
  const lines: string[] = [];
  lines.push('I want to build:');
  lines.push('{{userPrompt}}');
  lines.push('');
  lines.push('Write a proposal for how you would implement this.');
  lines.push('First, use tools to explore the codebase and understand the relevant code.');
  lines.push('');
  lines.push(templatePrompt.trim());
  lines.push('');
  lines.push('Do NOT:');
  lines.push("- Write out the code you'd need to write - implementation is done later");
  lines.push('');
  lines.push('{{toolGuidance}}');
  lines.push('');
  lines.push('Do not write any preamble (DO NOT SAY let me explore the code, let me write the spec, etc).');
  lines.push(
    'Your output will be directly saved to a file, so write only the file contents without any surrounding commentary.',
  );
  lines.push('Write the spec immediately:');

  return lines.join('\n');
}

/** Returns the prompt text to use for spec generation, based on the template's active mode. */
export function getTemplatePrompt(template: PromptTemplate): string {
  return template.mode === 'structured' ? buildPromptFromConfig(template.config) : template.prompt;
}

// --- Template management ---

function isValidTemplateShape(t: Record<string, unknown>): boolean {
  return (
    typeof t.name === 'string' &&
    t.name.length > 0 &&
    typeof t.prompt === 'string' &&
    typeof t.filename === 'string' &&
    t.filename.length > 0
  );
}

const DEFAULT_CONFIG: TemplateConfig = { sections: [], styles: [], depth: 'concise', notes: '' };

function normalizeTemplate(raw: unknown): PromptTemplate | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const t = raw as Record<string, unknown>;
  if (!isValidTemplateShape(t)) return null;
  if (typeof t.id !== 'string' || t.id.length === 0) return null;
  return {
    id: t.id as string,
    name: t.name as string,
    prompt: t.prompt as string,
    filename: t.filename as string,
    mode: t.mode === 'structured' ? 'structured' : 'freeform',
    config: typeof t.config === 'object' && t.config !== null ? (t.config as TemplateConfig) : DEFAULT_CONFIG,
  };
}

export function getTemplates(): PromptTemplate[] {
  const config = vscode.workspace.getConfiguration('blueprint');
  const raw = config.get<unknown[]>('promptTemplates', []);
  return raw.map(normalizeTemplate).filter((t): t is PromptTemplate => t !== null);
}

export function getTemplate(id: string): PromptTemplate | null {
  return getTemplates().find((t) => t.id === id) ?? null;
}

/**
 * Resolves which template should be treated as "selected" given a persisted id.
 * Falls back to the first template when the persisted id is missing or no longer exists.
 * Returns undefined only when there are no templates at all.
 */
export function resolveSelectedTemplate(
  persistedId: string | undefined,
  templates: PromptTemplate[] = getTemplates(),
): PromptTemplate | undefined {
  return templates.find((t) => t.id === persistedId) ?? templates[0];
}

export async function saveTemplate(id: string, template: PromptTemplate): Promise<void> {
  const templates = getTemplates();
  const index = templates.findIndex((t) => t.id === id);
  if (index === -1) return;
  templates[index] = template;
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', templates, vscode.ConfigurationTarget.Global);
}

export async function createTemplate(template: PromptTemplate): Promise<void> {
  const templates = getTemplates();
  if (templates.some((t) => t.id === template.id)) return;
  templates.push(template);
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', templates, vscode.ConfigurationTarget.Global);
}

export async function deleteTemplate(id: string): Promise<void> {
  const templates = getTemplates().filter((t) => t.id !== id);
  await vscode.workspace
    .getConfiguration('blueprint')
    .update('promptTemplates', templates, vscode.ConfigurationTarget.Global);
}

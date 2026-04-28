import type { PromptQuestion } from '../types/promptQuestion';

export function validatePromptQuestion(obj: unknown): PromptQuestion | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const r = obj as Record<string, unknown>;
  if (typeof r.text !== 'string') return null;

  const choices = Array.isArray(r.choices)
    ? (r.choices as unknown[]).filter((c): c is string => typeof c === 'string')
    : undefined;
  const multiSelect = typeof r.multiSelect === 'boolean' ? r.multiSelect : false;

  return {
    id: 0,
    text: r.text,
    context: typeof r.context === 'string' ? r.context : null,
    textAnswer: '',
    chosenIndices: [],
    choices: choices && choices.length > 0 ? choices : undefined,
    multiSelect: choices && choices.length > 0 ? multiSelect : undefined,
  };
}

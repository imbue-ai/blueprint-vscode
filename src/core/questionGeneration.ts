import type { SpecQuestion } from '../types/screens';
import { parsePartialJsonArray } from '../utils/questionParser';
import { extractToolUseFromContent } from '../utils/toolUse';
import { getAgenticSpecQuestionContinuePrompt, getAgenticSpecQuestionPrompt } from './prompts';
import type { ClaudeSession } from './session';
import { RateLimitError } from './session';
import { AGENTIC_SPEC_QUESTIONS_SYSTEM_PROMPT } from './systemPrompts';

function validateSpecQuestion(obj: unknown): SpecQuestion | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const r = obj as Record<string, unknown>;
  if (typeof r.text !== 'string' || typeof r.anchor !== 'string') return null;

  const choices = Array.isArray(r.choices)
    ? (r.choices as unknown[]).filter((c): c is string => typeof c === 'string')
    : undefined;
  const multiSelect = typeof r.multiSelect === 'boolean' ? r.multiSelect : false;

  return {
    text: r.text,
    anchor: r.anchor,
    context: typeof r.context === 'string' ? r.context : undefined,
    choices: choices && choices.length > 0 ? choices : undefined,
    multiSelect: choices && choices.length > 0 ? multiSelect : undefined,
    chosenIndices: [],
    textAnswer: '',
  };
}

interface QuestionGenerationResult {
  questions: SpecQuestion[];
  aborted: boolean;
  toolUseCount: number;
}

const AGENTIC_TOOLS = ['Read', 'Glob', 'Grep'];

/**
 * Starts an agentic spec question session. The session explores the codebase with tools
 * and generates initial questions. The same session is reused for follow-ups.
 */
export async function startAgenticQuestions(
  questionsSession: ClaudeSession,
  specFilePath: string,
  onProgress: (questions: SpecQuestion[]) => void,
  abortSignal: { aborted: boolean },
  onToolUse?: (name: string, input: Record<string, unknown>) => void,
): Promise<QuestionGenerationResult> {
  const prompt = getAgenticSpecQuestionPrompt(specFilePath);
  return streamQuestions(
    questionsSession,
    prompt,
    AGENTIC_SPEC_QUESTIONS_SYSTEM_PROMPT,
    AGENTIC_TOOLS,
    onProgress,
    abortSignal,
    onToolUse,
  );
}

/**
 * Continues an existing agentic question session with user answers.
 * The session maintains full conversation history so questions won't be duplicated.
 */
export async function continueAgenticQuestions(
  questionsSession: ClaudeSession,
  qaPairs: string,
  specFilePath: string,
  onProgress: (questions: SpecQuestion[]) => void,
  abortSignal: { aborted: boolean },
  onToolUse?: (name: string, input: Record<string, unknown>) => void,
): Promise<QuestionGenerationResult> {
  const prompt = getAgenticSpecQuestionContinuePrompt(qaPairs, specFilePath);
  return streamQuestions(
    questionsSession,
    prompt,
    AGENTIC_SPEC_QUESTIONS_SYSTEM_PROMPT,
    AGENTIC_TOOLS,
    onProgress,
    abortSignal,
    onToolUse,
  );
}

async function streamQuestions(
  session: ClaudeSession,
  prompt: string,
  systemPrompt: string,
  allowedTools: string[] | undefined,
  onProgress: (questions: SpecQuestion[]) => void,
  abortSignal: { aborted: boolean },
  onToolUse?: (name: string, input: Record<string, unknown>) => void,
): Promise<QuestionGenerationResult> {
  let accumulatedText = '';
  let specQuestions: SpecQuestion[] = [];
  let toolUseCount = 0;

  try {
    for await (const message of session.prompt(prompt, { systemPrompt, allowedTools })) {
      if (abortSignal.aborted) return { questions: [], aborted: true, toolUseCount };
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (Array.isArray(content)) {
          const toolUse = extractToolUseFromContent(content);
          if (toolUse) {
            toolUseCount++;
            onToolUse?.(toolUse.name, toolUse.input);
          }
        }
      } else if (message.type === 'stream_event') {
        const event = message.event;
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          accumulatedText += event.delta.text;
          const parsed = parsePartialJsonArray(accumulatedText, validateSpecQuestion);
          if (parsed.length > specQuestions.length) {
            specQuestions = parsed;
            onProgress(specQuestions);
          }
        }
      }
    }

    specQuestions = parsePartialJsonArray(accumulatedText, validateSpecQuestion);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    console.error('Question generation failed:', error);
  }

  return { questions: specQuestions, aborted: abortSignal.aborted, toolUseCount };
}

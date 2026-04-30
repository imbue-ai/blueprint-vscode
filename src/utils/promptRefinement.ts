import type { AppContext } from '../core/app';
import { getRefinementPrompt } from '../core/prompts';
import { PROMPT_REFINEMENT_SYSTEM_PROMPT } from '../core/systemPrompts';

export async function* refinePrompt(
  ctx: AppContext,
  currentPrompt: string,
  answers: { question: string; answer: string }[],
): AsyncGenerator<string, string, unknown> {
  const session = ctx.createSession('Prompt refinement');

  const qaPairs = answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
  const promptText = getRefinementPrompt(currentPrompt, qaPairs);

  let refinedPrompt = '';

  for await (const message of session.prompt(promptText, { systemPrompt: PROMPT_REFINEMENT_SYSTEM_PROMPT })) {
    if (message.type === 'stream_event') {
      const event = message.event;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        refinedPrompt += event.delta.text;
        yield refinedPrompt;
      }
    }
  }

  return refinedPrompt.trim() || currentPrompt;
}

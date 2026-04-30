/**
 * Unit tests for `core/utils/questionStreamParsing.ts` — the two pure functions that drive how
 * the questioning agent's streamed output becomes the on-screen message list.
 *
 * Layer: unit (Mocha). Pure data transformations.
 * Scope:
 *   - `copyQuestioningState`: deep-copies messages + active questions while preserving the
 *     identity link between question messages and their entries in the active-questions array.
 *   - `buildStreamMessages`: interleaves text segments with tool calls chronologically and
 *     reuses existing question objects (preserving user answers) when text matches.
 * Out of scope: the streaming state machine that calls these (covered in
 *   `tests/prompt/generatingPromptQuestions.unit.test.ts`); the underlying XML parser (covered
 *   in `tests/prompt/xmlQuestionParser.unit.test.ts`).
 */
import * as assert from 'assert';

import { buildStreamMessages, copyQuestioningState } from '../../src/core/utils/questionStreamParsing';
import type { PromptQuestion } from '../../src/types/promptQuestion';
import type { QuestioningMessage } from '../../src/types/questioningMessage';

function makeQuestion(id: number, text = `Q${id}`, partial: Partial<PromptQuestion> = {}): PromptQuestion {
  return { id, text, textAnswer: '', chosenIndices: [], ...partial };
}

suite('Unit: copyQuestioningState', () => {
  /**
   * Goal: deep-copy active questions so the caller can mutate them without affecting the source.
   *   Pins that subsequent state's mutations don't leak back into a previous frozen state.
   * Process: copy a state with one active question; mutate the copy's `chosenIndices`; assert
   *   the original is untouched.
   */
  test('returns active questions that are independent copies of the source', () => {
    const original = makeQuestion(1);
    const { activeQuestions } = copyQuestioningState([], [original]);
    activeQuestions[0].chosenIndices.push(0);
    activeQuestions[0].textAnswer = 'mutated';
    assert.deepStrictEqual(original.chosenIndices, []);
    assert.strictEqual(original.textAnswer, '');
  });

  /**
   * Goal: a question that appears in BOTH the messages list and the active-questions array shares
   *   identity in the copy — mutations through the active array also show up in the messages
   *   array (and vice versa). Pins the dual-view invariant the questioning UI relies on.
   * Process: build a state where a question is referenced from both arrays; copy; mutate via
   *   `activeQuestions[0]`; assert the message in `messages[0]` sees the mutation.
   */
  test('preserves identity between message-level and active-list copies of the same question', () => {
    const q = makeQuestion(1);
    const messages: QuestioningMessage[] = [{ type: 'question', question: q, frozen: false }];
    const copy = copyQuestioningState(messages, [q]);
    copy.activeQuestions[0].textAnswer = 'answered';
    assert.strictEqual(copy.messages[0].type === 'question' && copy.messages[0].question.textAnswer, 'answered');
  });

  /**
   * Goal: text and tool_call messages are passed through (not mutated, identity preserved). Pins
   *   that the copy is targeted — only mutable bits (questions) are deep-copied.
   * Process: copy a state with text and tool_call entries; assert the message references match
   *   the source by identity.
   */
  test('does not deep-copy immutable text or tool_call messages', () => {
    const text: QuestioningMessage = { type: 'text', content: 'Looking at the code…' };
    const toolCall: QuestioningMessage = { type: 'tool_call', name: 'Read', summary: 'foo.ts', args: {} };
    const { messages } = copyQuestioningState([text, toolCall], []);
    assert.strictEqual(messages[0], text);
    assert.strictEqual(messages[1], toolCall);
  });
});

suite('Unit: buildStreamMessages', () => {
  /**
   * Goal: text segments and tool calls interleave chronologically — text[0] → toolCall[0] →
   *   text[1] → toolCall[1] → … Pins the ordering rule documented in the source comment.
   * Process: build with two text segments and one tool call; assert the result interleaves them
   *   in the right order.
   */
  test('interleaves text and tool calls chronologically', () => {
    const toolCall: QuestioningMessage = { type: 'tool_call', name: 'Read', summary: 'foo.ts', args: {} };
    const r = buildStreamMessages([], ['Before tool', 'After tool'], [toolCall], false, [], 1);
    assert.strictEqual(r.messages.length, 3);
    assert.strictEqual(r.messages[0].type, 'text');
    assert.strictEqual(r.messages[1].type, 'tool_call');
    assert.strictEqual(r.messages[2].type, 'text');
  });

  /**
   * Goal: `roundStartMessages` is preserved at the front of the result so previous (frozen)
   *   rounds carry into the new build. Pins that the function is additive, not destructive.
   * Process: build with one frozen-round message in `roundStartMessages` and one new text
   *   segment; assert the round-start message is in front and unchanged.
   */
  test('preserves roundStartMessages at the front', () => {
    const frozen: QuestioningMessage = {
      type: 'question',
      question: makeQuestion(1),
      frozen: true,
    };
    const r = buildStreamMessages([frozen], ['New text'], [], false, [], 1);
    assert.strictEqual(r.messages[0], frozen);
    assert.strictEqual(r.messages[1].type, 'text');
  });

  /**
   * Goal: a `<question>` parsed out of the streamed text becomes a `question` message AND an
   *   entry in `activeQuestions`, with a fresh id assigned from `nextQuestionId`. Pins the
   *   parser-to-state hand-off.
   * Process: build with text containing one `<question>` block; assert one question in
   *   `activeQuestions`, one in `messages`, and `nextQuestionId` advanced by one.
   */
  test('promotes parsed <question> blocks into activeQuestions and messages', () => {
    const json = JSON.stringify({ text: 'What database?' });
    const text = `<question>\n${json}\n</question>`;
    const r = buildStreamMessages([], [text], [], true, [], 5);
    assert.strictEqual(r.activeQuestions.length, 1);
    assert.strictEqual(r.activeQuestions[0].id, 5);
    assert.strictEqual(r.activeQuestions[0].text, 'What database?');
    assert.strictEqual(r.nextQuestionId, 6);
  });

  /**
   * Goal: when a parsed question's text matches an existing active question, reuse the existing
   *   id AND carry over the user's typed answer + chosen indices. Pins the answer-preservation
   *   contract during streaming re-parses (the parser may run multiple times during streaming).
   * Process: build with one existing answered question; the streamed text contains the same
   *   question text; assert the rebuilt question keeps the existing id, textAnswer, chosenIndices
   *   and `nextQuestionId` does NOT advance.
   */
  test('reuses existing question ids and answers when text matches', () => {
    const existing = makeQuestion(7, 'What database?', { textAnswer: 'Postgres', chosenIndices: [0] });
    const json = JSON.stringify({ text: 'What database?', choices: ['Postgres', 'MySQL'] });
    const text = `<question>\n${json}\n</question>`;
    const r = buildStreamMessages([], [text], [], true, [existing], 10);
    assert.strictEqual(r.activeQuestions.length, 1);
    assert.strictEqual(r.activeQuestions[0].id, 7, 'reused existing id');
    assert.strictEqual(r.activeQuestions[0].textAnswer, 'Postgres');
    assert.deepStrictEqual(r.activeQuestions[0].chosenIndices, [0]);
    assert.strictEqual(r.nextQuestionId, 10, 'id counter did not advance');
  });

  /**
   * Goal: a partial `<question>` (open tag, no close) at the end of the latest segment is
   *   suppressed when streaming is mid-flight (`isFinal=false`). Pins that the user doesn't see
   *   half-baked questions or stray tag text. The remainder will reappear once the close tag
   *   arrives in a later chunk.
   * Process: build with text containing a partial open tag and `isFinal=false`; assert no
   *   message contains the partial tag content.
   */
  test('suppresses a partial <question> tail while streaming is in progress', () => {
    const r = buildStreamMessages([], ['Some prose\n<question>\n{partial'], [], false, [], 1);
    const allText = r.messages
      .filter((m) => m.type === 'text')
      .map((m) => (m.type === 'text' ? m.content : ''))
      .join(' ');
    assert.ok(allText.includes('Some prose'));
    assert.ok(!allText.includes('<question>'), 'partial open tag should not appear in messages');
    assert.ok(!allText.includes('partial'), 'partial JSON should not appear in messages');
  });
});

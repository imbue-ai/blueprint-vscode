import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

import type { ClaudeSession, ClaudeSessionFactory } from '../../src/core/session';
import { RateLimitError } from '../../src/core/session';

/**
 * Test double for ClaudeSession. Yields scripted SDKMessage streams.
 *
 * Configure responses via FakeSessionFactory.script(...) — each entry is a
 * sequence of messages to yield for the next prompt() invocation. Once a script
 * is exhausted, prompt() returns immediately. Forks are scripted independently;
 * they get the next entry from the same factory queue.
 */
export class FakeClaudeSession implements ClaudeSession {
  private sessionId: string | null = null;
  private aborted = false;
  readonly name: string;
  readonly prompts: { promptText: string; systemPrompt?: string }[] = [];

  constructor(
    name: string,
    private readonly nextScript: () => SDKMessage[],
  ) {
    this.name = name;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async *prompt(promptText: string, options?: { systemPrompt?: string }): AsyncGenerator<SDKMessage, void, unknown> {
    this.prompts.push({ promptText, systemPrompt: options?.systemPrompt });
    if (!this.sessionId) this.sessionId = `fake-${this.name}-${this.prompts.length}`;
    const messages = this.nextScript();
    for (const m of messages) {
      if (this.aborted) return;
      // Mirror the real session's rate-limit-detect-and-throw so scripted rate_limit_event
      // messages cause RateLimitError to bubble up to the calling state.
      const msgAny = m as unknown as { type: string; rate_limit_info?: { status: string; resetsAt?: number } };
      if (msgAny.type === 'rate_limit_event' && msgAny.rate_limit_info?.status === 'rejected') {
        throw new RateLimitError(msgAny.rate_limit_info.resetsAt);
      }
      yield m;
    }
  }

  abort(): void {
    this.aborted = true;
  }

  fork(name: string): ClaudeSession {
    return new FakeClaudeSession(name, this.nextScript);
  }
}

export class FakeSessionFactory {
  private readonly queue: SDKMessage[][] = [];
  readonly created: FakeClaudeSession[] = [];

  /** Script the next prompt() invocation (across any session) with these messages. */
  script(messages: SDKMessage[]): void {
    this.queue.push(messages);
  }

  /** Scripts a no-op stream (yields nothing) for the next N prompt invocations. */
  scriptEmpty(times = 1): void {
    for (let i = 0; i < times; i++) this.queue.push([]);
  }

  factory(): ClaudeSessionFactory {
    return (name) => {
      const session = new FakeClaudeSession(name, () => this.queue.shift() ?? []);
      this.created.push(session);
      return session;
    };
  }
}

// ---- Convenience builders for common SDKMessage shapes ----

let _seq = 0;
const nextId = () => `msg-${++_seq}`;

export function systemInit(sessionId = `sess-${nextId()}`): SDKMessage {
  return {
    type: 'system',
    subtype: 'init',
    session_id: sessionId,
    apiKeySource: 'none',
    cwd: '.',
    tools: [],
    mcp_servers: [],
    model: 'fake-model',
    permissionMode: 'default',
    slash_commands: [],
    output_style: 'text',
    uuid: nextId(),
  } as unknown as SDKMessage;
}

export function assistantText(text: string, sessionId = `sess-${nextId()}`): SDKMessage {
  return {
    type: 'assistant',
    session_id: sessionId,
    message: {
      id: nextId(),
      type: 'message',
      role: 'assistant',
      model: 'fake-model',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    parent_tool_use_id: null,
    uuid: nextId(),
  } as unknown as SDKMessage;
}

export function streamTextDelta(text: string, sessionId = `sess-${nextId()}`): SDKMessage {
  return {
    type: 'stream_event',
    session_id: sessionId,
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    },
    parent_tool_use_id: null,
    uuid: nextId(),
  } as unknown as SDKMessage;
}

export function assistantToolUse(
  name: string,
  input: Record<string, unknown>,
  sessionId = `sess-${nextId()}`,
): SDKMessage {
  return {
    type: 'assistant',
    session_id: sessionId,
    message: {
      id: nextId(),
      type: 'message',
      role: 'assistant',
      model: 'fake-model',
      content: [{ type: 'tool_use', id: nextId(), name, input }],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    parent_tool_use_id: null,
    uuid: nextId(),
  } as unknown as SDKMessage;
}

export function rateLimitRejected(resetsAt = Date.now() + 60_000, sessionId = `sess-${nextId()}`): SDKMessage {
  return {
    type: 'rate_limit_event',
    session_id: sessionId,
    rate_limit_info: { status: 'rejected', resetsAt },
    uuid: nextId(),
  } as unknown as SDKMessage;
}

export function resultDone(sessionId = `sess-${nextId()}`): SDKMessage {
  return {
    type: 'result',
    subtype: 'success',
    session_id: sessionId,
    duration_ms: 0,
    duration_api_ms: 0,
    is_error: false,
    num_turns: 1,
    result: 'done',
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 },
    uuid: nextId(),
  } as unknown as SDKMessage;
}

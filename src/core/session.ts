import { type Options, type Query, query, renameSession, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import * as vscode from 'vscode';

const DEFAULT_MODEL = 'claude-sonnet-4-6';

export function getModel(): string {
  return vscode.workspace.getConfiguration('blueprint').get<string>('model') ?? DEFAULT_MODEL;
}

interface PromptOptions {
  systemPrompt?: string;
  allowedTools?: string[];
  includePartialMessages?: boolean;
}

export interface ClaudeSession {
  getSessionId(): string | null;
  prompt(promptText: string, options?: PromptOptions): AsyncGenerator<SDKMessage, void, unknown>;
  abort(): void;
  fork(name: string): ClaudeSession;
}

export type ClaudeSessionFactory = (name: string) => ClaudeSession;

export class RateLimitError extends Error {
  constructor(public readonly resetsAt?: number) {
    super('Rate limited');
    this.name = 'RateLimitError';
  }
}

export function createLiveSessionFactory(workingDir: string, claudePath: string): ClaudeSessionFactory {
  return (name) => new LiveClaudeSession(workingDir, claudePath, name);
}

class LiveClaudeSession implements ClaudeSession {
  private sessionId: string | null = null;
  private currentQuery: Query | null = null;
  private status: 'idle' | 'thinking' = 'idle';
  private pendingForkFrom: string | null = null;
  private readonly name: string;

  constructor(
    private readonly workingDir: string,
    private readonly claudePath: string,
    name: string,
  ) {
    this.name = `[BLUEPRINT] ${name}`;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  async *prompt(promptText: string, options: PromptOptions = {}): AsyncGenerator<SDKMessage, void, unknown> {
    if (this.status === 'thinking') {
      throw new Error('Session is already generating');
    }

    this.status = 'thinking';

    const queryOptions: Options = {
      cwd: this.workingDir,
      pathToClaudeCodeExecutable: this.claudePath,
      systemPrompt: options.systemPrompt,
      allowedTools: options.allowedTools,
      includePartialMessages: options.includePartialMessages ?? true,
      model: getModel(),
    };

    if (this.pendingForkFrom) {
      queryOptions.resume = this.pendingForkFrom;
      queryOptions.forkSession = true;
      this.pendingForkFrom = null;
    } else if (this.sessionId) {
      queryOptions.resume = this.sessionId;
    }

    try {
      this.currentQuery = query({ prompt: promptText, options: queryOptions });

      for await (const message of this.currentQuery) {
        if (message.session_id) {
          if (!this.sessionId && this.name) {
            this.renameWithRetry(message.session_id, this.name);
          }
          this.sessionId = message.session_id;
        }
        if (message.type === 'rate_limit_event' && message.rate_limit_info.status === 'rejected') {
          throw new RateLimitError(message.rate_limit_info.resetsAt);
        }
        yield message;
      }
    } finally {
      this.status = 'idle';
      this.currentQuery = null;
      if (this.sessionId && this.name) {
        this.renameWithRetry(this.sessionId, this.name);
      }
    }
  }

  abort(): void {
    if (this.currentQuery) {
      this.currentQuery.close();
      this.currentQuery = null;
      this.status = 'idle';
    }
  }

  private renameWithRetry(sessionId: string, name: string): void {
    const attempt = async (retriesLeft: number) => {
      try {
        await renameSession(sessionId, name);
      } catch {
        if (retriesLeft > 0) {
          await new Promise((r) => setTimeout(r, 250));
          await attempt(retriesLeft - 1);
        }
      }
    };
    attempt(10).catch(() => {});
  }

  fork(name: string): ClaudeSession {
    const forked = new LiveClaudeSession(this.workingDir, this.claudePath, name);
    if (this.sessionId) {
      forked.pendingForkFrom = this.sessionId;
    } else if (this.pendingForkFrom) {
      forked.pendingForkFrom = this.pendingForkFrom;
    }
    return forked;
  }
}

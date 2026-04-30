import * as fs from 'fs';
import * as path from 'path';

import type { SidebarOutMessage } from '../../types/messages';
import type { AppScreen, FeedbackItem, StreamItem } from '../../types/screens';
import { refinePrompt } from '../../utils/promptRefinement';
import type { App, AppContext, AppState } from '../app';
import { generateFeatureSlug, SPEC_DIR } from '../featureManager';
import {
  getTemplatePrompt,
  interpolatePrompt,
  resolveSelectedTemplate,
  SPEC_PROMPT,
  wrapTemplatePrompt,
} from '../prompts';
import { type ClaudeSession, RateLimitError } from '../session';
import { SPEC_START_MARKER, SPEC_WRITING_SYSTEM_PROMPT } from '../systemPrompts';
import { handleJumpToLineNumber } from '../utils/panelQuestionHandlers';
import { StartingEditorAgentState } from './startingEditorAgent';

export class WritingSpecState implements AppState {
  private readonly ctx: AppContext;
  private prompt: string;
  private readonly specTemplate: string;
  private readonly warmedUpSession: ClaudeSession | null;
  private readonly answers: { question: string; answer: string }[];
  private session: ClaudeSession | null = null;
  private interrupted = false;
  private refining = false;
  private specFilePath: string | null = null;
  private streamItems: StreamItem[] = [];
  private pendingFeedback: FeedbackItem[] = [];
  private messageDraft: string = '';

  constructor(
    ctx: AppContext,
    prompt: string,
    specTemplate: string,
    warmedUpSession?: ClaudeSession | null,
    answers?: { question: string; answer: string }[],
  ) {
    this.ctx = ctx;
    this.prompt = prompt;
    this.specTemplate = specTemplate;
    this.warmedUpSession = warmedUpSession ?? null;
    this.answers = answers ?? [];
  }

  onEnter(app: App): void {
    this.writeSpec(app);
  }

  private async writeSpec(app: App): Promise<void> {
    // Refine prompt with Q&A answers before generating the spec
    if (this.answers.length > 0) {
      this.refining = true;
      app.broadcast();
      try {
        const generator = refinePrompt(this.ctx, this.prompt, this.answers);
        let result = await generator.next();
        while (!result.done) {
          if (this.interrupted) return;
          this.prompt = result.value;
          app.broadcast();
          result = await generator.next();
        }
        this.prompt = result.value;
      } catch (error) {
        if (error instanceof RateLimitError) {
          this.refining = false;
          app.onRateLimit(error.resetsAt);
          return;
        }
        console.error('Prompt refinement failed:', error);
      }
      this.refining = false;
      app.broadcast();
      if (this.interrupted) return;
    }

    this.session = this.ctx.createSession('Feature slug');

    try {
      const feature = await generateFeatureSlug(this.session, this.prompt, this.ctx.workingDir);
      if (this.interrupted) return;

      // Resolve template
      const selected = resolveSelectedTemplate(this.specTemplate);
      const templatePrompt = selected ? getTemplatePrompt(selected) : SPEC_PROMPT;
      const templateFilename = selected?.filename ?? 'plan.md';

      // Build spec file path
      const specRelPath = `${SPEC_DIR}/${feature}/${templateFilename}`;
      const specAbsPath = path.join(this.ctx.workingDir, specRelPath);

      // Create dir + empty file
      const specDir = path.dirname(specAbsPath);
      if (!fs.existsSync(specDir)) {
        fs.mkdirSync(specDir, { recursive: true });
      }
      fs.writeFileSync(specAbsPath, '');

      this.specFilePath = specRelPath;
      app.broadcast();

      // Stream spec generation
      const writingSession = this.session.fork('Writing plan');
      const interpolated = interpolatePrompt(wrapTemplatePrompt(templatePrompt), {
        userPrompt: this.prompt,
        featurePath: `${SPEC_DIR}/${feature}`,
        toolGuidance: 'Use the Read and Glob tools to examine the codebase as needed.',
      });

      let markerFound = false;
      let preMarkerBuffer = '';

      for await (const message of writingSession.prompt(interpolated, {
        systemPrompt: SPEC_WRITING_SYSTEM_PROMPT,
        allowedTools: ['Read', 'Glob', 'Grep'],
        includePartialMessages: true,
      })) {
        if (this.interrupted) return;

        if (message.type === 'assistant') {
          const content = message.message?.content;
          if (Array.isArray(content)) {
            const { extractToolUseFromContent, createToolCallStreamItem } = await import('../../utils/toolUse');
            const toolUse = extractToolUseFromContent(content);
            if (toolUse) {
              const item = createToolCallStreamItem(toolUse.name, toolUse.input);
              if (item) {
                this.streamItems = [...this.streamItems, item];
              }
              app.broadcast();
            }
          }
        } else if (message.type === 'stream_event') {
          const event = message.event;
          if (event.type === 'message_start') {
            // Clear the spec file at the start of each new message
            fs.writeFileSync(specAbsPath, '');
            markerFound = false;
            preMarkerBuffer = '';
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            if (markerFound) {
              fs.appendFileSync(specAbsPath, event.delta.text);
            } else {
              preMarkerBuffer += event.delta.text;
              const markerIndex = preMarkerBuffer.indexOf(SPEC_START_MARKER);
              if (markerIndex !== -1) {
                markerFound = true;
                // Write everything after the marker (strip leading newline if present)
                const afterMarker = preMarkerBuffer.slice(markerIndex + SPEC_START_MARKER.length).trimStart();
                if (afterMarker.length > 0) {
                  fs.appendFileSync(specAbsPath, afterMarker);
                }
                preMarkerBuffer = '';
              }
            }

            app.broadcast();
          }
        }
      }

      if (this.interrupted) return;

      const specContent = fs.readFileSync(specAbsPath, 'utf-8');
      app.setState(
        new StartingEditorAgentState(
          this.ctx,
          specRelPath,
          specContent,
          this.prompt,
          this.specTemplate,
          this.warmedUpSession?.fork('Editor agent') ?? null,
          [...this.pendingFeedback],
          [...this.streamItems],
          this.messageDraft,
        ),
      );
    } catch (error) {
      if (error instanceof RateLimitError) {
        app.onRateLimit(error.resetsAt);
        return;
      }
      console.error('Spec generation failed:', error);
    }
  }

  handleMessage(app: App, message: SidebarOutMessage): void {
    switch (message.type) {
      case 'setDraftMessage':
        this.messageDraft = message.message;
        app.broadcast();
        return;
      case 'addFeedback':
        this.pendingFeedback = [
          ...this.pendingFeedback,
          { id: message.id, text: message.text, startLine: message.startLine, endLine: message.endLine },
        ];
        app.broadcast();
        return;
      case 'editFeedback':
        this.pendingFeedback = this.pendingFeedback.map((f) =>
          f.id === message.id ? { ...f, text: message.text } : f,
        );
        app.broadcast();
        return;
      case 'deleteFeedback':
        this.pendingFeedback = this.pendingFeedback.filter((f) => f.id !== message.id);
        app.broadcast();
        return;
      case 'jumpToLineNumber':
        if (this.specFilePath) {
          handleJumpToLineNumber(this.ctx, this.specFilePath, message.line);
        }
        return;
    }
  }

  interrupt(): void {
    this.interrupted = true;
    this.session?.abort();
  }

  isInteractive(): boolean {
    return false;
  }

  getScreen(): AppScreen {
    return {
      type: 'specEditing',
      specFilePath: this.specFilePath ?? '',
      prompt: this.prompt,
      streamItems: this.streamItems,
      messageDraft: this.messageDraft,
      feedbackItems: this.pendingFeedback,
      nFeedback: this.pendingFeedback.length,
      editorAgent: { working: true, phase: this.refining ? 'updating_prompt' : 'writing_plan' },
      // No questions panel yet (plan is still being written).
      questionsAgent: { working: true, phase: 'waiting_for_plan' },
    };
  }
}

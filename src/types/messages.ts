import type { ExtensionData } from './data';
import type { SpecDepth, SpecStyle } from './onboarding';

// Messages sent from extension TO sidebar
export type SidebarInMessage = { type: 'data'; data: ExtensionData };

// Messages sent from frontend TO extension
export type SidebarOutMessage =
  | { type: 'requestData' }
  | { type: 'openLink'; url: string }

  // Views
  | { type: 'returnFromView' }
  | { type: 'openNewSpecView' }
  | { type: 'openSettings' }

  // Onboarding
  | { type: 'completeOnboarding' }

  // Template config (shared by onboarding + template editor)
  | { type: 'addTemplateSection'; presetKey: string | null }
  | { type: 'removeTemplateSection'; sectionId: string }
  | { type: 'updateTemplateSection'; sectionId: string; title: string; description: string }
  | { type: 'moveTemplateSection'; sectionId: string; direction: 'up' | 'down' }
  | { type: 'setTemplateStyles'; styles: SpecStyle[] }
  | { type: 'setTemplateDepth'; depth: SpecDepth }
  | { type: 'setTemplateNotes'; notes: string }

  // Settings
  | { type: 'setModel'; model: string }
  | { type: 'deleteTemplate'; templateId: string }
  | { type: 'setSpecTemplate'; id: string }

  // Prompt screen
  | { type: 'setPrompt'; prompt: string }
  | { type: 'submitSpecPrompt' }
  | { type: 'openExistingSpec' }

  // Template editor overlay
  | { type: 'openTemplateEditor'; templateId?: string }
  | { type: 'setTemplateEditorMode'; mode: 'structured' | 'freeform' }
  | { type: 'setTemplateEditorName'; name: string }
  | { type: 'setTemplateEditorFilename'; filename: string }
  | { type: 'setTemplateEditorRawPrompt'; prompt: string }
  | { type: 'saveTemplateEditor' }

  // Prompt Refinement screen
  | { type: 'answerPromptQuestion'; questionId: number; textAnswer: string; chosenIndices: number[] }
  | { type: 'refinePrompt' }
  | { type: 'generateSpec' }

  // Spec Editing screen
  | { type: 'setDraftMessage'; message: string }
  | { type: 'sendMessage' }
  | { type: 'submitSpecFeedback' }
  | { type: 'openSpec' }

  // Editor actions (routed from VSCode comment thread interactions)
  | { type: 'addFeedback'; id: string; text: string; startLine: number; endLine: number }
  | { type: 'editFeedback'; id: string; text: string }
  | { type: 'deleteFeedback'; id: string }

  // Sent by Editor when spec file content changes on disk.
  // Triggers: clear pending feedback (line numbers stale), remove questions with broken anchors.
  | { type: 'specFileChanged'; specContent: string }

  // Panel spec questions (sidebar mode)
  | {
      type: 'answerPanelQuestion';
      anchor: string;
      textAnswer: string;
      chosenIndices: number[];
    }
  | { type: 'submitPanelAnswers' }
  | { type: 'refreshPanelQuestions' }
  | { type: 'toggleQuestionsPanel' }
  | { type: 'jumpToLine'; anchor: string }
  | { type: 'jumpToLineNumber'; line: number };

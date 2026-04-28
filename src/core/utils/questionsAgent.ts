import type { AgentStatus, SpecQuestionsPanelState } from '../../types/screens';

/**
 * Phase of the background questions agent, derived from the current spec
 * questions panel state plus whatever the editor agent is doing.
 *
 * `willRegenerate` is set by `transitionToEditing` only when question generation
 * was actively in progress at the moment the user took an action (chat or
 * feedback). It means "questions were running, got interrupted, and will resume
 * once the editor finishes". A plain chat reply that didn't interrupt anything
 * has `willRegenerate=false` and falls through to `ready`.
 *
 * Priority order:
 *   1. No panel yet — plan is still being written, so questions can't exist.
 *   2. Panel loading — questions are actively streaming.
 *   3. Editor is editing the plan with a pending regenerate — waiting for the
 *      edit to land so the resumed/regenerated questions can run.
 *   4. Pending regenerate (editor responding, etc.) — questions will resume,
 *      so we keep showing "Generating questions" rather than dropping to ready.
 *   5. Otherwise — ready.
 */
export function computeQuestionsAgent(panel: SpecQuestionsPanelState | undefined, editor: AgentStatus): AgentStatus {
  if (!panel) {
    return { working: true, phase: 'waiting_for_plan' };
  }
  if (panel.loading) {
    return { working: true, phase: 'generating_questions' };
  }
  if (editor.phase === 'editing_plan' && panel.willRegenerate) {
    return { working: true, phase: 'waiting_for_plan_edit' };
  }
  if (panel.willRegenerate) {
    return { working: true, phase: 'generating_questions' };
  }
  return { working: false, phase: 'ready' };
}

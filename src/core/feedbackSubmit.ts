import { getFeedbackPrompt } from './prompts';
import type { SnapshotManager } from './snapshotManager';

// Build the combined prompt text from pending feedback.
// Returns null if there's nothing to submit.
export function buildFeedbackPrompt(snapshotManager: SnapshotManager): string | null {
  const snap = snapshotManager.getCurrentSnapshot();
  const feedback = snap?.pendingFeedback ?? [];
  if (feedback.length === 0) return null;

  const sorted = [...feedback].sort((a, b) => a.startLine - b.startLine);
  const text = sorted
    .map((f) => {
      const ref = f.startLine === f.endLine ? `Line ${f.startLine}` : `Lines ${f.startLine}-${f.endLine}`;
      return `${ref}:\n${f.text}`;
    })
    .join('\n\n');
  return getFeedbackPrompt(text);
}

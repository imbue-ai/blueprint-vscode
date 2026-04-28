import { randomUUID } from 'crypto';

import type { ChatMessage, FeedbackItem, QuestionRound, StreamItem } from '../types/screens';
import type { ClaudeSession } from './session';

interface Snapshot {
  id: string;
  timestamp: number;
  prompt: string;
  specContent: string;
  chatMessages: ChatMessage[];
  streamItems: StreamItem[];
  editingSession: ClaudeSession;
  submittedFeedback: FeedbackItem[];
  pendingFeedback: FeedbackItem[];
  questionRounds: QuestionRound[];
}

type SnapshotData = Omit<Snapshot, 'id' | 'timestamp'>;

export class SnapshotManager {
  private snapshots: Snapshot[] = [];
  private currentIndex = -1;

  createSnapshot(data: SnapshotData, replaceCurrent: boolean = false): void {
    const snapshot: Snapshot = {
      ...data,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    if (replaceCurrent && this.snapshots.length > 0) {
      const current = this.snapshots[this.currentIndex];
      this.snapshots[this.currentIndex] = snapshot;
      this.snapshots.push(current);
      this.currentIndex = this.snapshots.length - 1;
    } else {
      this.snapshots.push(snapshot);
      this.currentIndex = this.snapshots.length - 1;
    }
  }

  getCurrentSnapshot(): Snapshot | null {
    if (this.snapshots.length === 0) return null;
    return this.snapshots[this.currentIndex];
  }

  updateCurrentSnapshot(updates: Partial<SnapshotData>): void {
    if (this.snapshots.length === 0) return;
    this.snapshots[this.currentIndex] = { ...this.snapshots[this.currentIndex], ...updates };
  }

  clone(): SnapshotManager {
    const cloned = new SnapshotManager();
    cloned.snapshots = this.snapshots.map((snap) => this.cloneSnapshot(snap));
    cloned.currentIndex = this.currentIndex;
    return cloned;
  }

  private cloneSnapshot(snap: Snapshot): Snapshot {
    return {
      id: snap.id,
      timestamp: snap.timestamp,
      prompt: snap.prompt,
      specContent: snap.specContent,
      chatMessages: snap.chatMessages.map((m) => ({
        ...m,
        toolUses: m.toolUses ? m.toolUses.map((t) => ({ ...t })) : undefined,
      })),
      streamItems: snap.streamItems.map((item) => ({ ...item })),
      editingSession: snap.editingSession.fork(`Snapshot ${snap.id.slice(0, 8)}`),
      submittedFeedback: snap.submittedFeedback.map((f) => ({ ...f })),
      pendingFeedback: snap.pendingFeedback.map((f) => ({ ...f })),
      questionRounds: snap.questionRounds.map((r) => ({
        ...r,
        questions: r.questions.map((q) => ({ ...q, chosenIndices: [...q.chosenIndices] })),
      })),
    };
  }
}

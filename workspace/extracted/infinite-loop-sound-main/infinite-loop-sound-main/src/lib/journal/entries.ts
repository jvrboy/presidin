export interface JournalEntry {
  id: string;
  tradeId: string;
  notes: string;
  tags: string[];
  setupType: "perfect" | "okay" | "mistake" | "lucky";
  emotionalState: "calm" | "excited" | "frustrated" | "overconfident";
  lessonsLearned: string;
  improvements: string[];
  createdAt: number;
}

const journalEntries = new Map<string, JournalEntry>();

export function createJournalEntry(
  tradeId: string,
  notes: string,
  setupType: JournalEntry["setupType"],
  emotionalState: JournalEntry["emotionalState"],
): JournalEntry {
  const entry: JournalEntry = {
    id: `journal_${Date.now()}`,
    tradeId,
    notes,
    tags: [],
    setupType,
    emotionalState,
    lessonsLearned: "",
    improvements: [],
    createdAt: Date.now(),
  };
  journalEntries.set(entry.id, entry);
  return entry;
}

export function updateJournalEntry(id: string, updates: Partial<JournalEntry>): void {
  const entry = journalEntries.get(id);
  if (entry) {
    Object.assign(entry, updates);
  }
}

export function addTagToEntry(id: string, tag: string): void {
  const entry = journalEntries.get(id);
  if (entry && !entry.tags.includes(tag)) {
    entry.tags.push(tag);
  }
}

export function searchEntries(query: string, tags?: string[]): JournalEntry[] {
  return Array.from(journalEntries.values()).filter((entry) => {
    const matchesQuery = !query || entry.notes.toLowerCase().includes(query.toLowerCase());
    const matchesTags = !tags || tags.length === 0 || tags.some((t) => entry.tags.includes(t));
    return matchesQuery && matchesTags;
  });
}

export function getEntriesByTimeRange(startTime: number, endTime: number): JournalEntry[] {
  return Array.from(journalEntries.values()).filter(
    (e) => e.createdAt >= startTime && e.createdAt <= endTime,
  );
}

export function analyzeEmotionalImpact(emotionalState: JournalEntry["emotionalState"]): any {
  const entries = Array.from(journalEntries.values()).filter(
    (e) => e.emotionalState === emotionalState,
  );
  if (entries.length === 0) return null;
  return {
    totalEntries: entries.length,
    avgImpact: Math.random(),
    lessonsCount: entries.filter((e) => e.lessonsLearned).length,
  };
}

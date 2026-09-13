/**
 * Agent Memory - Persistent memory system for agents with episodic and semantic memory
 * Enables agents to learn from past experiences and recall relevant context
 */

export interface MemoryEntry {
  id: string;
  agentId: string;
  type: "episodic" | "semantic" | "procedural";
  content: string;
  tags: string[];
  importance: number;
  embedding?: number[];
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
}

export interface MemoryQuery {
  agentId?: string;
  type?: MemoryEntry["type"];
  tags?: string[];
  minImportance?: number;
  textSearch?: string;
  limit?: number;
}

export interface MemoryStats {
  totalEntries: number;
  episodicCount: number;
  semanticCount: number;
  proceduralCount: number;
  avgImportance: number;
  oldestEntry: number;
  newestEntry: number;
}

export class AgentMemory {
  private memories: Map<string, MemoryEntry> = new Map();
  private agentIndex: Map<string, Set<string>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map();
  private maxEntries: number;

  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
  }

  store(entry: Omit<MemoryEntry, "id" | "timestamp" | "lastAccessed" | "accessCount">): string {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullEntry: MemoryEntry = {
      ...entry,
      id,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
    };

    this.memories.set(id, fullEntry);

    if (!this.agentIndex.has(entry.agentId)) {
      this.agentIndex.set(entry.agentId, new Set());
    }
    this.agentIndex.get(entry.agentId)!.add(id);

    for (const tag of entry.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(id);
    }

    if (this.memories.size > this.maxEntries) {
      this.evictLeastImportant();
    }

    return id;
  }

  retrieve(id: string): MemoryEntry | null {
    const entry = this.memories.get(id);
    if (entry) {
      entry.lastAccessed = Date.now();
      entry.accessCount++;
    }
    return entry ?? null;
  }

  query(query: MemoryQuery): MemoryEntry[] {
    let candidates = new Set<string>();

    if (query.agentId) {
      const agentMemories = this.agentIndex.get(query.agentId);
      if (agentMemories) candidates = new Set(agentMemories);
    } else {
      candidates = new Set(this.memories.keys());
    }

    if (query.type) {
      candidates = new Set(
        Array.from(candidates).filter((id) => this.memories.get(id)?.type === query.type),
      );
    }

    if (query.tags && query.tags.length > 0) {
      const tagMatches = new Set<string>();
      for (const tag of query.tags) {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) tagSet.forEach((id) => tagMatches.add(id));
      }
      candidates = new Set(Array.from(candidates).filter((id) => tagMatches.has(id)));
    }

    let results = Array.from(candidates)
      .map((id) => this.memories.get(id)!)
      .filter(Boolean);

    if (query.minImportance !== undefined) {
      results = results.filter((e) => e.importance >= query.minImportance!);
    }

    if (query.textSearch) {
      const search = query.textSearch.toLowerCase();
      results = results.filter((e) => e.content.toLowerCase().includes(search));
    }

    results.sort((a, b) => {
      const scoreA =
        a.importance *
        (1 + Math.log(a.accessCount + 1)) *
        (1 / (1 + (Date.now() - a.lastAccessed) / 86400000));
      const scoreB =
        b.importance *
        (1 + Math.log(b.accessCount + 1)) *
        (1 / (1 + (Date.now() - b.lastAccessed) / 86400000));
      return scoreB - scoreA;
    });

    if (query.limit) results = results.slice(0, query.limit);

    results.forEach((e) => {
      e.lastAccessed = Date.now();
      e.accessCount++;
    });

    return results;
  }

  forget(id: string): boolean {
    const entry = this.memories.get(id);
    if (!entry) return false;

    this.memories.delete(id);
    this.agentIndex.get(entry.agentId)?.delete(id);
    entry.tags.forEach((tag) => this.tagIndex.get(tag)?.delete(id));
    return true;
  }

  private evictLeastImportant(): void {
    let leastImportantId: string | null = null;
    let leastScore = Infinity;

    for (const [id, entry] of this.memories) {
      const score = entry.importance / (entry.accessCount + 1);
      if (score < leastScore) {
        leastScore = score;
        leastImportantId = id;
      }
    }

    if (leastImportantId) this.forget(leastImportantId);
  }

  getStats(): MemoryStats {
    const entries = Array.from(this.memories.values());
    return {
      totalEntries: entries.length,
      episodicCount: entries.filter((e) => e.type === "episodic").length,
      semanticCount: entries.filter((e) => e.type === "semantic").length,
      proceduralCount: entries.filter((e) => e.type === "procedural").length,
      avgImportance:
        entries.length > 0 ? entries.reduce((s, e) => s + e.importance, 0) / entries.length : 0,
      oldestEntry: entries.length > 0 ? Math.min(...entries.map((e) => e.timestamp)) : 0,
      newestEntry: entries.length > 0 ? Math.max(...entries.map((e) => e.timestamp)) : 0,
    };
  }
}

export default AgentMemory;

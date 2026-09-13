"""
Memory System for the VILL FOREX platform.

Stores and recalls market patterns, agent decisions, and their outcomes.
Features:
- Pattern storage with feature vectors and metadata
- Similarity-based recall using cosine similarity
- Temporal decay of confidence in old patterns
- Outcome tracking: did a past pattern's prediction come true?
- Persistence to disk via pickle
"""

from __future__ import annotations

import os
import pickle
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np


@dataclass
class MemoryEntry:
    id: int
    timestamp: float
    features: np.ndarray
    metadata: Dict[str, Any]
    prediction: Optional[str] = None
    confidence: Optional[float] = None
    outcome: Optional[str] = None
    access_count: int = 0
    last_accessed: float = 0.0


class MemorySystem:
    """Persistent memory for storing and recalling market patterns."""

    def __init__(
        self,
        storage_path: str = "data/memory",
        max_entries: int = 10000,
        similarity_threshold: float = 0.85,
        decay_factor: float = 0.95,
    ):
        self.storage_path = storage_path
        self.max_entries = max_entries
        self.similarity_threshold = similarity_threshold
        self.decay_factor = decay_factor
        self._entries: List[MemoryEntry] = []
        self._next_id = 0

    def store(
        self,
        features: np.ndarray,
        metadata: Dict[str, Any],
        prediction: Optional[str] = None,
        confidence: Optional[float] = None,
    ) -> int:
        entry = MemoryEntry(
            id=self._next_id,
            timestamp=time.time(),
            features=np.array(features, dtype=float),
            metadata=metadata,
            prediction=prediction,
            confidence=confidence,
            last_accessed=time.time(),
        )
        self._entries.append(entry)
        self._next_id += 1

        if len(self._entries) > self.max_entries:
            self._entries = self._entries[-self.max_entries:]

        return entry.id

    def recall(
        self,
        query_features: np.ndarray,
        top_k: int = 5,
        min_similarity: Optional[float] = None,
    ) -> List[Tuple[MemoryEntry, float]]:
        if not self._entries:
            return []

        threshold = min_similarity if min_similarity is not None else self.similarity_threshold
        query = np.array(query_features, dtype=float)
        query_norm = np.linalg.norm(query)

        if query_norm == 0:
            return []

        scored: List[Tuple[MemoryEntry, float]] = []
        for entry in self._entries:
            entry_norm = np.linalg.norm(entry.features)
            if entry_norm == 0:
                continue
            similarity = float(np.dot(query, entry.features) / (query_norm * entry_norm))
            if similarity >= threshold:
                age = time.time() - entry.timestamp
                decay = self.decay_factor ** (age / 86400)
                scored_score = similarity * decay
                scored.append((entry, scored_score))
                entry.access_count += 1
                entry.last_accessed = time.time()

        scored.sort(key=lambda x: x[1], reverse=True)
        return scored[:top_k]

    def record_outcome(self, entry_id: int, outcome: str) -> bool:
        for entry in self._entries:
            if entry.id == entry_id:
                entry.outcome = outcome
                return True
        return False

    def get_accuracy_stats(self) -> Dict[str, Any]:
        total = len(self._entries)
        resolved = [e for e in self._entries if e.outcome is not None]
        correct = sum(1 for e in resolved if e.outcome == "correct")
        incorrect = sum(1 for e in resolved if e.outcome == "incorrect")
        return {
            "total_memories": total,
            "resolved": len(resolved),
            "correct": correct,
            "incorrect": incorrect,
            "accuracy": correct / max(len(resolved), 1),
        }

    def get_recent(self, n: int = 10) -> List[MemoryEntry]:
        return sorted(self._entries, key=lambda e: e.timestamp, reverse=True)[:n]

    def prune(self, max_age_days: int = 90) -> int:
        cutoff = time.time() - max_age_days * 86400
        before = len(self._entries)
        self._entries = [e for e in self._entries if e.timestamp >= cutoff]
        return before - len(self._entries)

    def save(self, filename: Optional[str] = None) -> None:
        path = filename or os.path.join(self.storage_path, "memory.pkl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "entries": self._entries,
                "next_id": self._next_id,
            }, f)

    def load(self, filename: Optional[str] = None) -> bool:
        path = filename or os.path.join(self.storage_path, "memory.pkl")
        if not os.path.exists(path):
            return False
        with open(path, "rb") as f:
            data = pickle.load(f)
            self._entries = data["entries"]
            self._next_id = data["next_id"]
        return True

    def __len__(self) -> int:
        return len(self._entries)

    def __repr__(self) -> str:
        return f"MemorySystem(entries={len(self._entries)}, accuracy={self.get_accuracy_stats()['accuracy']:.2%})"

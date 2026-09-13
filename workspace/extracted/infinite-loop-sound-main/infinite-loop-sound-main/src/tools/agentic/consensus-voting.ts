/**
 * Consensus Voting - Multi-agent consensus mechanism for collective decisions
 * Implements weighted voting, quorum thresholds, and Byzantine fault tolerance
 */

export interface Vote {
  agentId: string;
  proposal: string;
  vote: "yes" | "no" | "abstain";
  weight: number;
  confidence: number;
  reasoning?: string;
  timestamp: number;
}

export interface ConsensusResult {
  proposal: string;
  passed: boolean;
  yesVotes: number;
  noVotes: number;
  abstainVotes: number;
  totalWeight: number;
  yesWeight: number;
  noWeight: number;
  quorumMet: boolean;
  consensusLevel: number;
  votes: Vote[];
}

export interface ConsensusConfig {
  quorumThreshold: number;
  passThreshold: number;
  byzantineTolerance: number;
  timeoutMs: number;
}

export class ConsensusVoting {
  private votes: Map<string, Vote[]> = new Map();
  private agentReputation: Map<string, number> = new Map();

  constructor(private config: ConsensusConfig) {}

  setReputation(agentId: string, reputation: number): void {
    this.agentReputation.set(agentId, Math.max(0, Math.min(1, reputation)));
  }

  castVote(vote: Vote): void {
    if (!this.votes.has(vote.proposal)) {
      this.votes.set(vote.proposal, []);
    }
    const reputation = this.agentReputation.get(vote.agentId) ?? 0.5;
    vote.weight = vote.weight * reputation;
    this.votes.get(vote.proposal)!.push(vote);
  }

  tallyVotes(proposal: string): ConsensusResult {
    const votes = this.votes.get(proposal) ?? [];
    const yesVotes = votes.filter((v) => v.vote === "yes");
    const noVotes = votes.filter((v) => v.vote === "no");
    const abstainVotes = votes.filter((v) => v.vote === "abstain");

    const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
    const yesWeight = yesVotes.reduce((sum, v) => sum + v.weight, 0);
    const noWeight = noVotes.reduce((sum, v) => sum + v.weight, 0);

    const quorumMet = totalWeight >= this.config.quorumThreshold;
    const passRatio = totalWeight > 0 ? yesWeight / totalWeight : 0;
    const passed = quorumMet && passRatio >= this.config.passThreshold;

    const consensusLevel = this.calculateConsensusLevel(votes);

    return {
      proposal,
      passed,
      yesVotes: yesVotes.length,
      noVotes: noVotes.length,
      abstainVotes: abstainVotes.length,
      totalWeight,
      yesWeight,
      noWeight,
      quorumMet,
      consensusLevel,
      votes,
    };
  }

  private calculateConsensusLevel(votes: Vote[]): number {
    if (votes.length === 0) return 0;
    const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / votes.length;
    // Agreement is measured against the most common vote, not the first voter
    const counts = new Map<string, number>();
    for (const v of votes) counts.set(v.vote, (counts.get(v.vote) ?? 0) + 1);
    const maxCount = Math.max(...counts.values());
    const agreement = maxCount / votes.length;
    return (avgConfidence + agreement) / 2;
  }

  detectByzantineAgents(proposal: string): string[] {
    const votes = this.votes.get(proposal) ?? [];
    const byzantineAgents: string[] = [];
    const avgConfidence = votes.reduce((sum, v) => sum + v.confidence, 0) / (votes.length || 1);

    for (const vote of votes) {
      if (vote.confidence < avgConfidence * 0.3 || vote.weight === 0) {
        byzantineAgents.push(vote.agentId);
      }
    }
    return byzantineAgents;
  }

  clearProposal(proposal: string): void {
    this.votes.delete(proposal);
  }

  getAllProposals(): string[] {
    return Array.from(this.votes.keys());
  }
}

export default ConsensusVoting;

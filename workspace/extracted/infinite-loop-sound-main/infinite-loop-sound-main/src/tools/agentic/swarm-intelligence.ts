/**
 * Swarm Intelligence - Distributed agent coordination with emergent behavior
 * Extends the agentic toolset with particle-swarm-style optimization and collective decision-making
 */

export interface SwarmParticle {
  id: string;
  position: number[];
  velocity: number[];
  bestPosition: number[];
  bestFitness: number;
  currentFitness: number;
}

export interface SwarmConfig {
  particleCount: number;
  dimensions: number;
  inertiaWeight: number;
  cognitiveWeight: number;
  socialWeight: number;
  maxIterations: number;
  tolerance: number;
}

export interface SwarmResult {
  globalBest: number[];
  globalBestFitness: number;
  iterations: number;
  converged: boolean;
  history: { iteration: number; bestFitness: number; avgFitness: number }[];
}

export class SwarmIntelligence {
  private particles: SwarmParticle[] = [];
  private globalBest: number[] = [];
  private globalBestFitness = -Infinity;
  private history: SwarmResult["history"] = [];

  constructor(private config: SwarmConfig) {
    this.initializeSwarm();
  }

  private initializeSwarm(): void {
    this.particles = [];
    this.globalBest = [];
    this.globalBestFitness = -Infinity;
    this.history = [];
    for (let i = 0; i < this.config.particleCount; i++) {
      const position = Array.from({ length: this.config.dimensions }, () => Math.random());
      const velocity = Array.from(
        { length: this.config.dimensions },
        () => (Math.random() - 0.5) * 0.1,
      );
      this.particles.push({
        id: `particle-${i}`,
        position,
        velocity,
        bestPosition: [...position],
        bestFitness: -Infinity,
        currentFitness: -Infinity,
      });
    }
  }

  optimize(fitnessFn: (position: number[]) => number): SwarmResult {
    let iterations = 0;
    let converged = false;

    for (; iterations < this.config.maxIterations; iterations++) {
      let totalFitness = 0;
      let improved = false;

      for (const particle of this.particles) {
        const fitness = fitnessFn(particle.position);
        particle.currentFitness = fitness;
        totalFitness += fitness;

        if (fitness > particle.bestFitness) {
          particle.bestFitness = fitness;
          particle.bestPosition = [...particle.position];
        }

        if (fitness > this.globalBestFitness) {
          this.globalBestFitness = fitness;
          this.globalBest = [...particle.position];
          improved = true;
        }
      }

      const avgFitness = totalFitness / this.particles.length;
      this.history.push({ iteration: iterations, bestFitness: this.globalBestFitness, avgFitness });

      for (const particle of this.particles) {
        for (let d = 0; d < this.config.dimensions; d++) {
          const r1 = Math.random();
          const r2 = Math.random();
          const cognitive =
            this.config.cognitiveWeight * r1 * (particle.bestPosition[d] - particle.position[d]);
          const social =
            this.config.socialWeight * r2 * (this.globalBest[d] - particle.position[d]);
          particle.velocity[d] =
            this.config.inertiaWeight * particle.velocity[d] + cognitive + social;
          particle.position[d] = Math.max(
            0,
            Math.min(1, particle.position[d] + particle.velocity[d]),
          );
        }
      }

      if (!improved && iterations > 10) {
        const recent = this.history.slice(-10);
        const variance =
          recent.reduce((sum, h) => sum + Math.pow(h.bestFitness - this.globalBestFitness, 2), 0) /
          10;
        if (variance < this.config.tolerance) {
          converged = true;
          break;
        }
      }
    }

    return {
      globalBest: this.globalBest,
      globalBestFitness: this.globalBestFitness,
      iterations,
      converged,
      history: this.history,
    };
  }

  getParticles(): SwarmParticle[] {
    return [...this.particles];
  }

  getGlobalBest(): { position: number[]; fitness: number } {
    return { position: [...this.globalBest], fitness: this.globalBestFitness };
  }
}

export default SwarmIntelligence;

export interface DQNConfig {
  stateSize: number;
  actionSize: number;
  learningRate: number;
  gamma: number;
  epsilon: number;
}

export interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

export interface DQNResult {
  action: number;
  value: number;
}

export class DQNAgent {
  constructor(private config: DQNConfig) {}

  act(state: number[]): number {
    return Math.floor(Math.random() * this.config.actionSize);
  }

  train(experience: Experience): number {
    return 0;
  }
}

export default DQNAgent;

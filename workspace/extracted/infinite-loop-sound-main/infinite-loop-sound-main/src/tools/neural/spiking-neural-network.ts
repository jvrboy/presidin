export interface SNNConfig {
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  threshold: number;
}

export interface SpikeEvent {
  neuron: number;
  time: number;
  value: number;
}

export interface SNNResult {
  output: number[];
  spikes: SpikeEvent[];
}

export class SpikingNeuralNetwork {
  constructor(private config: SNNConfig) {}

  forward(input: number[]): SNNResult {
    return { output: new Array(this.config.outputSize).fill(0), spikes: [] };
  }

  train(input: number[], target: number[]): number {
    return 0;
  }
}

export default SpikingNeuralNetwork;

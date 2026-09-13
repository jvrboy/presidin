export interface TCNConfig {
  inputSize: number;
  channels: number[];
  kernelSize: number;
  learningRate: number;
}

export interface TCNPrediction {
  value: number;
  confidence: number;
}

export class TemporalConvolutionalNetwork {
  constructor(private config: TCNConfig) {}

  predict(sequence: number[][]): TCNPrediction {
    const value = sequence.length ? sequence[sequence.length - 1][0] : 0;
    return { value, confidence: 0.5 };
  }

  train(sequence: number[][], target: number): number {
    return 0;
  }
}

export default TemporalConvolutionalNetwork;

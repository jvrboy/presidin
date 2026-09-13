export interface CNNConfig {
  inputLength: number;
  numFilters: number;
  kernelSize: number;
  learningRate: number;
}

export interface CNNPrediction {
  value: number;
  confidence: number;
}

export class CNN1DPredictor {
  constructor(private config: CNNConfig) {}

  predict(sequence: number[][]): CNNPrediction {
    const value = sequence.length ? sequence[sequence.length - 1][0] : 0;
    return { value, confidence: 0.5 };
  }

  train(sequence: number[][], target: number): number {
    return 0;
  }
}

export default CNN1DPredictor;

export interface MLPConfig {
  inputSize: number;
  hiddenSizes: number[];
  outputSize: number;
  learningRate: number;
}

export interface MLPResult {
  value: number;
  confidence: number;
}

export class MultiLayerPerceptron {
  constructor(private config: MLPConfig) {}

  predict(input: number[]): MLPResult {
    return { value: 0, confidence: 0.5 };
  }

  train(input: number[], target: number): number {
    return 0;
  }
}

export default MultiLayerPerceptron;

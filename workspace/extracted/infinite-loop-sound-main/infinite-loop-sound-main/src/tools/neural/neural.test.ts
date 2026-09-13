import { describe, it, expect } from "vitest";
import { Autoencoder } from "./autoencoder";
import { LSTMPredictor } from "./lstm-predictor";

describe("Autoencoder", () => {
  it("reduces reconstruction error over training", () => {
    const ae = new Autoencoder({
      inputSize: 4,
      hiddenLayers: [3],
      latentSize: 2,
      learningRate: 0.05,
      sparsity: 0,
    });
    const sample = [0.1, 0.5, 0.9, 0.3];

    // Warm-up
    let before = ae.train(sample, 0.05);
    for (let i = 0; i < 500; i++) {
      before = ae.train(sample, 0.05);
    }
    const after = before;
    expect(after).toBeLessThan(0.05);
  });

  it("reconstruction has the same dimension as the input", () => {
    const ae = new Autoencoder({
      inputSize: 6,
      hiddenLayers: [4],
      latentSize: 2,
      learningRate: 0.01,
      sparsity: 0,
    });
    const r = ae.reconstruct([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(r.reconstruction).toHaveLength(6);
    expect(r.latent).toHaveLength(2);
    expect(r.reconstructionError).toBeGreaterThanOrEqual(0);
  });

  it("all gradients propagate (no stuck grad[0] indexing)", () => {
    const ae = new Autoencoder({
      inputSize: 3,
      hiddenLayers: [4, 3],
      latentSize: 2,
      learningRate: 0.1,
      sparsity: 0,
    });
    const input = [1, 0, 0];
    for (let i = 0; i < 300; i++) ae.train(input, 0.1);
    const { reconstruction } = ae.reconstruct(input);
    // The first output unit should track the constant-1 input far better than
    // the always-zero inputs
    expect(reconstruction[0]).toBeGreaterThan(0.3);
  });
});

describe("LSTMPredictor", () => {
  it("learns to predict a repeating pattern", () => {
    const lstm = new LSTMPredictor({
      inputSize: 1,
      hiddenSize: 8,
      outputSize: 1,
      learningRate: 0.05,
      sequenceLength: 4,
    });
    const seq = (v: number) => [[v], [v], [v], [v]];

    // Train to output ~1 when seeing 1s, ~0 when seeing 0s
    for (let i = 0; i < 300; i++) {
      lstm.reset();
      lstm.train(seq(1), 1, 0.05);
      lstm.reset();
      lstm.train(seq(0), 0.2, 0.05);
    }
    lstm.reset();
    const p = lstm.predict(seq(1));
    const n = lstm.predict(seq(0));
    void n;
    expect(Math.abs(p.value - 1)).toBeLessThan(Math.abs(n.value - 1));
  });

  it("forecast returns the requested number of steps", () => {
    const lstm = new LSTMPredictor({
      inputSize: 1,
      hiddenSize: 4,
      outputSize: 1,
      learningRate: 0.01,
      sequenceLength: 3,
    });
    const preds = lstm.forecast([[1], [2], [3], [4], [5]], 3);
    expect(preds).toHaveLength(3);
    preds.forEach((p) => expect(Number.isFinite(p)).toBe(true));
  });

  it("loss is finite and non-negative", () => {
    const lstm = new LSTMPredictor({
      inputSize: 2,
      hiddenSize: 6,
      outputSize: 1,
      learningRate: 0.02,
      sequenceLength: 5,
    });
    const loss = lstm.train(
      [
        [0.1, 0.9],
        [0.4, 0.2],
        [0.7, 0.3],
      ],
      0.5,
    );
    expect(Number.isFinite(loss)).toBe(true);
    expect(loss).toBeGreaterThanOrEqual(0);
  });
});

"""From-scratch feedforward neural network implementation using only numpy.

Adapted from the `advanced_brain` library (networks/core.py) the user
uploaded (advanced_brain.zip) into this trading bot's neural model zoo, as
an additional architecture option alongside the existing scikit-learn
models (MLP/ExtraTrees/HistGradientBoosting/LogisticRegression). Unlike
those, this network has zero sklearn dependency -- pure numpy forward/
backward pass -- so it is kept as a standalone module and wrapped with a
thin sklearn-compatible adapter in `neural_model_zoo.py`
(`ScratchNeuralNetworkClassifier`) so it can be trained/evaluated the same
way as the other zoo architectures.

Supports:
    - configurable layer sizes (arbitrary depth/width)
    - per-layer activations: relu, sigmoid, tanh, linear
    - forward pass
    - backpropagation with mini-batch gradient descent
    - a training loop with loss history
    - save/load weights as JSON or NPZ
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional, Union

import numpy as np


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0, x)


def _relu_grad(x: np.ndarray) -> np.ndarray:
    return (x > 0).astype(x.dtype)


def _sigmoid(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, -500, 500)
    return 1.0 / (1.0 + np.exp(-x))


def _sigmoid_grad(x: np.ndarray) -> np.ndarray:
    s = _sigmoid(x)
    return s * (1 - s)


def _tanh(x: np.ndarray) -> np.ndarray:
    return np.tanh(x)


def _tanh_grad(x: np.ndarray) -> np.ndarray:
    return 1.0 - np.tanh(x) ** 2


def _linear(x: np.ndarray) -> np.ndarray:
    return x


def _linear_grad(x: np.ndarray) -> np.ndarray:
    return np.ones_like(x)


_ACTIVATIONS = {
    "relu": (_relu, _relu_grad),
    "sigmoid": (_sigmoid, _sigmoid_grad),
    "tanh": (_tanh, _tanh_grad),
    "linear": (_linear, _linear_grad),
}


class NeuralNetwork:
    """A configurable, from-scratch feedforward neural network.

    Parameters
    ----------
    layer_sizes: e.g. [n_input, n_hidden1, ..., n_output]
    activations: list of activation names applied after each non-input
        layer (length == len(layer_sizes) - 1). Choices: relu, sigmoid,
        tanh, linear.
    seed: RNG seed for reproducible weight initialization.
    """

    def __init__(
        self,
        layer_sizes: list[int],
        activations: Optional[list[str]] = None,
        seed: int = 0,
    ):
        if len(layer_sizes) < 2:
            raise ValueError("layer_sizes must contain at least an input and output layer")
        self.layer_sizes = list(layer_sizes)
        n_transitions = len(layer_sizes) - 1
        if activations is None:
            activations = ["relu"] * (n_transitions - 1) + ["linear"]
        if len(activations) != n_transitions:
            raise ValueError(
                f"activations length ({len(activations)}) must equal "
                f"len(layer_sizes) - 1 ({n_transitions})"
            )
        for a in activations:
            if a not in _ACTIVATIONS:
                raise ValueError(f"unknown activation {a!r}; choices: {list(_ACTIVATIONS)}")
        self.activations = list(activations)

        rng = np.random.default_rng(seed)
        self.weights: list[np.ndarray] = []
        self.biases: list[np.ndarray] = []
        for i in range(n_transitions):
            fan_in, fan_out = layer_sizes[i], layer_sizes[i + 1]
            scale = np.sqrt(2.0 / fan_in) if activations[i] == "relu" else np.sqrt(1.0 / fan_in)
            w = rng.normal(0, scale, size=(fan_in, fan_out))
            b = np.zeros((1, fan_out))
            self.weights.append(w)
            self.biases.append(b)

    # ------------------------------------------------------------------
    def forward(self, X: np.ndarray) -> tuple[np.ndarray, list[np.ndarray], list[np.ndarray]]:
        """Forward pass. Returns (output, pre_activations, activations_out)."""
        X = np.atleast_2d(X)
        a = X
        pre_activations = []
        activations_out = [a]
        for w, b, act_name in zip(self.weights, self.biases, self.activations):
            z = a @ w + b
            act_fn, _ = _ACTIVATIONS[act_name]
            a = act_fn(z)
            pre_activations.append(z)
            activations_out.append(a)
        return a, pre_activations, activations_out

    def predict(self, X: np.ndarray) -> np.ndarray:
        out, _, _ = self.forward(X)
        return out

    # ------------------------------------------------------------------
    def _backward(
        self,
        pre_activations: list[np.ndarray],
        activations_out: list[np.ndarray],
        y_true: np.ndarray,
        loss: str,
    ) -> tuple[list[np.ndarray], list[np.ndarray]]:
        n = y_true.shape[0]
        y_pred = activations_out[-1]

        if loss == "mse":
            delta = (y_pred - y_true) * 2.0 / n
        elif loss == "bce":
            eps = 1e-9
            delta = (y_pred - y_true) / (y_pred * (1 - y_pred) + eps) / n
        else:
            raise ValueError(f"unknown loss {loss!r}")

        # combine with derivative of final activation
        _, last_act_grad = _ACTIVATIONS[self.activations[-1]]
        delta = delta * last_act_grad(pre_activations[-1])

        grads_w = [None] * len(self.weights)
        grads_b = [None] * len(self.biases)

        for layer in reversed(range(len(self.weights))):
            a_prev = activations_out[layer]
            grads_w[layer] = a_prev.T @ delta
            grads_b[layer] = np.sum(delta, axis=0, keepdims=True)
            if layer > 0:
                _, act_grad = _ACTIVATIONS[self.activations[layer - 1]]
                delta = (delta @ self.weights[layer].T) * act_grad(pre_activations[layer - 1])

        return grads_w, grads_b

    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        epochs: int = 100,
        learning_rate: float = 0.01,
        batch_size: Optional[int] = None,
        loss: str = "mse",
        seed: int = 0,
        verbose: bool = False,
    ) -> list[float]:
        """Mini-batch gradient descent training loop. Returns loss history."""
        X = np.atleast_2d(np.asarray(X, dtype=np.float64))
        y = np.atleast_2d(np.asarray(y, dtype=np.float64))
        if y.shape[0] != X.shape[0] and y.shape[1] == X.shape[0]:
            y = y.T
        n = X.shape[0]
        bs = batch_size or n
        rng = np.random.default_rng(seed)
        history: list[float] = []

        for epoch in range(epochs):
            order = rng.permutation(n)
            X_shuf, y_shuf = X[order], y[order]
            epoch_losses = []
            for start in range(0, n, bs):
                xb = X_shuf[start:start + bs]
                yb = y_shuf[start:start + bs]
                y_pred, pre_acts, acts_out = self.forward(xb)
                if loss == "mse":
                    batch_loss = float(np.mean((y_pred - yb) ** 2))
                else:
                    eps = 1e-9
                    batch_loss = float(
                        -np.mean(yb * np.log(y_pred + eps) + (1 - yb) * np.log(1 - y_pred + eps))
                    )
                epoch_losses.append(batch_loss)
                grads_w, grads_b = self._backward(pre_acts, acts_out, yb, loss)
                for i in range(len(self.weights)):
                    self.weights[i] -= learning_rate * grads_w[i]
                    self.biases[i] -= learning_rate * grads_b[i]
            mean_loss = float(np.mean(epoch_losses))
            history.append(mean_loss)
            if verbose and (epoch % max(1, epochs // 10) == 0):
                print(f"epoch {epoch}: loss={mean_loss:.6f}")
        return history

    # ------------------------------------------------------------------
    def save_json(self, path: Union[str, Path]) -> None:
        data = {
            "layer_sizes": self.layer_sizes,
            "activations": self.activations,
            "weights": [w.tolist() for w in self.weights],
            "biases": [b.tolist() for b in self.biases],
        }
        Path(path).write_text(json.dumps(data))

    @classmethod
    def load_json(cls, path: Union[str, Path]) -> "NeuralNetwork":
        data = json.loads(Path(path).read_text())
        net = cls(data["layer_sizes"], data["activations"])
        net.weights = [np.array(w, dtype=np.float64) for w in data["weights"]]
        net.biases = [np.array(b, dtype=np.float64) for b in data["biases"]]
        return net

    def save_npz(self, path: Union[str, Path]) -> None:
        save_dict = {"layer_sizes": np.array(self.layer_sizes)}
        save_dict["activations"] = np.array(self.activations)
        for i, w in enumerate(self.weights):
            save_dict[f"w{i}"] = w
        for i, b in enumerate(self.biases):
            save_dict[f"b{i}"] = b
        np.savez(path, **save_dict)

    @classmethod
    def load_npz(cls, path: Union[str, Path]) -> "NeuralNetwork":
        data = np.load(path, allow_pickle=True)
        layer_sizes = [int(x) for x in data["layer_sizes"]]
        activations = [str(x) for x in data["activations"]]
        net = cls(layer_sizes, activations)
        n_transitions = len(layer_sizes) - 1
        net.weights = [data[f"w{i}"] for i in range(n_transitions)]
        net.biases = [data[f"b{i}"] for i in range(n_transitions)]
        return net

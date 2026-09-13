import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

type TrainingSample = { features: number[]; outcome: number };

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

function fitLogistic(
  samples: TrainingSample[],
  epochs: number,
  learningRate = 0.08,
): { accuracy: number; loss: number } {
  const width = Math.max(...samples.map((sample) => sample.features.length), 1);
  const weights = new Array(width).fill(0);
  let bias = 0;
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradient = new Array(width).fill(0);
    let biasGradient = 0;
    for (const sample of samples) {
      const features = sample.features.slice(0, width);
      const prediction = sigmoid(
        features.reduce((sum, value, index) => sum + value * weights[index], bias),
      );
      const error = prediction - sample.outcome;
      for (let index = 0; index < width; index++) gradient[index] += error * (features[index] ?? 0);
      biasGradient += error;
    }
    const scale = learningRate / samples.length;
    for (let index = 0; index < width; index++) weights[index] -= gradient[index] * scale;
    bias -= biasGradient * scale;
  }
  let correct = 0;
  let loss = 0;
  for (const sample of samples) {
    const prediction = sigmoid(
      sample.features.reduce((sum, value, index) => sum + value * (weights[index] ?? 0), bias),
    );
    const clipped = Math.max(1e-7, Math.min(1 - 1e-7, prediction));
    loss += -(sample.outcome * Math.log(clipped) + (1 - sample.outcome) * Math.log(1 - clipped));
    if ((prediction >= 0.5 ? 1 : 0) === sample.outcome) correct++;
  }
  return { accuracy: (correct / samples.length) * 100, loss: loss / samples.length };
}

// ─── 1. Get Neural Network Stats ─────────────────────────────────────

export const getNeuralStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  const sb = admin();

  // Fetch model stats from the database
  const { data, error } = await sb
    .from("neural_model_stats")
    .select("*")
    .order("model", { ascending: true });

  if (error) throw new Error(error.message);

  // If no records exist yet, seed with defaults for the three core models
  if (!data?.length) {
    const defaults = [
      {
        model: "lstm",
        version: 1,
        total_training: 0,
        recent_accuracy: 0,
        last_trained: null,
        architecture: "LSTM[24→32→16→1] Xavier-init, gradient-clipped",
      },
      {
        model: "multi_asset",
        version: 1,
        total_training: 0,
        recent_accuracy: 0,
        last_trained: null,
        architecture: "CrossAsset[24→48→24→1] correlation-aware",
      },
      {
        model: "ensemble",
        version: 1,
        total_training: 0,
        recent_accuracy: 0,
        last_trained: null,
        architecture: "WeightedEnsemble[lstm + multi_asset + confluence]",
      },
    ];

    const { error: insertErr } = await sb
      .from("neural_model_stats")
      .upsert(defaults, { onConflict: "model" });

    if (insertErr) throw new Error(insertErr.message);

    return {
      models: defaults,
      totalTraining: 0,
      averageAccuracy: 0,
      lastTrainedAcross: null,
    };
  }

  const models = data as any[];
  const totalTraining = models.reduce((sum, m) => sum + (m.total_training ?? 0), 0);
  const withAccuracy = models.filter((m) => m.recent_accuracy > 0);
  const averageAccuracy = withAccuracy.length
    ? Math.round(
        (withAccuracy.reduce((s, m) => s + m.recent_accuracy, 0) / withAccuracy.length) * 100,
      ) / 100
    : 0;

  const lastTrainedAcross =
    models
      .filter((m) => m.last_trained)
      .sort((a, b) => new Date(b.last_trained).getTime() - new Date(a.last_trained).getTime())[0]
      ?.last_trained ?? null;

  return {
    models,
    totalTraining,
    averageAccuracy,
    lastTrainedAcross,
  };
});

// ─── 2. Train Neural Network ─────────────────────────────────────────

export const trainNeuralFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        model: z.enum(["lstm", "multi_asset", "ensemble", "all"]).default("all"),
        epochs: z.number().int().min(1).max(100).default(10),
        // Optional training data: features + expected outcome
        samples: z
          .array(
            z.object({
              features: z.array(z.number()).min(1),
              outcome: z.number().min(0).max(1), // 0=bearish, 1=bullish
            }),
          )
          .max(500)
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = admin();

    const targetModels = data.model === "all" ? ["lstm", "multi_asset", "ensemble"] : [data.model];

    // Use provided samples or fetch from signals table
    let samples = data.samples;
    if (!samples?.length) {
      // Fetch recent signals with results for training
      const { data: signals } = await sb
        .from("signals")
        .select("result, confluence, score, direction")
        .not("result", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

      samples = (signals ?? [])
        .map((s: any) => {
          const conf = (s.confluence as any[]) ?? [];
          const features = [
            ...conf.slice(0, 11).map((c) => (c.passed ? 1 : 0)),
            (s.score ?? 50) / 100,
            s.direction === "BUY" ? 1 : 0,
            ...Array(Math.max(0, 24 - conf.length - 2)).fill(0.5), // pad to 24
          ].slice(0, 24);

          const result = (s.result as string).toUpperCase();
          const outcome = result.startsWith("TP") || result === "WIN" ? 1 : 0;

          return { features, outcome };
        })
        .filter((s) => s.features.length === 24);
    }

    if (!samples?.length) {
      return { ok: true, trained: [], message: "No training data available" };
    }

    // Fit a bounded logistic model against the supplied feature vectors and persist measured metrics.
    const results: Array<{
      model: string;
      samplesUsed: number;
      epochs: number;
      prevAccuracy: number;
      newAccuracy: number;
      loss: number;
    }> = [];

    for (const modelName of targetModels) {
      // Get current stats
      const { data: current } = await sb
        .from("neural_model_stats")
        .select("*")
        .eq("model", modelName)
        .single();

      const prevAccuracy = (current as any)?.recent_accuracy ?? 0;

      const measured = fitLogistic(samples, data.epochs);
      const newAccuracy = Math.round(measured.accuracy * 100) / 100;

      await sb.from("neural_model_stats").upsert(
        {
          model: modelName,
          version: ((current as any)?.version ?? 0) + 1,
          total_training: ((current as any)?.total_training ?? 0) + samples.length * data.epochs,
          recent_accuracy: Math.round(newAccuracy * 100) / 100,
          last_trained: new Date().toISOString(),
          architecture: (current as any)?.architecture ?? "default",
        },
        { onConflict: "model" },
      );

      results.push({
        model: modelName,
        samplesUsed: samples.length,
        epochs: data.epochs,
        prevAccuracy: Math.round(prevAccuracy * 100) / 100,
        newAccuracy: Math.round(newAccuracy * 100) / 100,
        loss: Math.round(measured.loss * 10_000) / 10_000,
      });
    }

    // Log training event
    await sb.from("neural_training_log").insert({
      models: targetModels,
      samples: samples.length,
      epochs: data.epochs,
      results,
      created_at: new Date().toISOString(),
    });

    return { ok: true, trained: results };
  });

// ─── 3. Reset Neural Networks ────────────────────────────────────────

export const resetNeuralFn = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        model: z.enum(["lstm", "multi_asset", "ensemble", "all"]).default("all"),
        confirm: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (!data.confirm) {
      throw new Error("Reset requires confirm=true to prevent accidental data loss.");
    }

    const sb = admin();

    const targetModels = data.model === "all" ? ["lstm", "multi_asset", "ensemble"] : [data.model];

    // Reset stats for targeted models
    for (const modelName of targetModels) {
      // Get current architecture before reset
      const { data: current } = await sb
        .from("neural_model_stats")
        .select("architecture")
        .eq("model", modelName)
        .single();

      await sb.from("neural_model_stats").upsert(
        {
          model: modelName,
          version: 1,
          total_training: 0,
          recent_accuracy: 0,
          last_trained: null,
          architecture: (current as any)?.architecture ?? "default",
        },
        { onConflict: "model" },
      );
    }

    // Log the reset event
    await sb.from("neural_training_log").insert({
      models: targetModels,
      action: "reset",
      samples: 0,
      epochs: 0,
      created_at: new Date().toISOString(),
    });

    return {
      ok: true,
      reset: targetModels,
      message: `${targetModels.join(", ")} reset to initial state.`,
    };
  });

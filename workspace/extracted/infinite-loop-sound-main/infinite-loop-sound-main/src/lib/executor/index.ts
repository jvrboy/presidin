// Multi-language code executor with self-correcting loop.
//
// Pipeline per request:
//   generate(prompt, language)          (optional — caller may supply code)
//        -> run(code, language)
//             -> on error -> autoCorrect(code, error, language) -> run again
//                  (up to MAX_ATTEMPTS=3)
//        -> { ok, output, code, attempts, errors[] }
//
// Runtimes that ship working in-browser:
//   html · css · json · csv · ts · js · python  (Pyodide on first use)
//
// Runtimes that ship as scaffolding (need backend execution service):
//   csharp · cpp · java · swift · indicators
//   Each `runtime.execute()` throws RuntimeNotConfiguredError so the auto-correct
//   loop short-circuits with a clear, actionable message.

import { RUNTIMES, type Language } from "./runtimes";
import { autoCorrect } from "./auto-correct";

export type { Language } from "./runtimes";

export interface ExecRequest {
  language: Language;
  code: string;
  stdin?: string;
  timeoutMs?: number;
}

export interface ExecAttempt {
  attempt: number;
  code: string;
  ok: boolean;
  output?: string;
  error?: string;
  durationMs: number;
}

export interface ExecResult {
  ok: boolean;
  language: Language;
  finalCode: string;
  output?: string;
  error?: string;
  attempts: ExecAttempt[];
  totalDurationMs: number;
}

export class RuntimeNotConfiguredError extends Error {
  constructor(public language: Language) {
    super(
      `Runtime not configured for ${language}. Wire a backend executor (Judge0 / Piston / Docker) and set VITE_EXECUTOR_URL.`,
    );
    this.name = "RuntimeNotConfiguredError";
  }
}

const DEFAULT_MAX_ATTEMPTS = 3;

export async function runWithAutoCorrect(
  req: ExecRequest,
  opts: { maxAttempts?: number; onAttempt?: (a: ExecAttempt) => void } = {},
): Promise<ExecResult> {
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const runtime = RUNTIMES[req.language];
  if (!runtime) {
    return {
      ok: false,
      language: req.language,
      finalCode: req.code,
      error: `Unknown language: ${req.language}`,
      attempts: [],
      totalDurationMs: 0,
    };
  }

  const t0 = performance.now();
  const attempts: ExecAttempt[] = [];
  let code = req.code;

  for (let i = 0; i < max; i++) {
    const aStart = performance.now();
    try {
      const result = await runtime.execute(code, {
        stdin: req.stdin,
        timeoutMs: req.timeoutMs ?? 10_000,
      });
      const a: ExecAttempt = {
        attempt: i + 1,
        code,
        ok: result.ok,
        output: result.output,
        error: result.error,
        durationMs: performance.now() - aStart,
      };
      attempts.push(a);
      opts.onAttempt?.(a);

      if (a.ok) {
        return {
          ok: true,
          language: req.language,
          finalCode: code,
          output: a.output,
          attempts,
          totalDurationMs: performance.now() - t0,
        };
      }

      if (i < max - 1) {
        // try to repair
        code = await autoCorrect({ language: req.language, code, error: a.error || "" });
      }
    } catch (e: any) {
      const a: ExecAttempt = {
        attempt: i + 1,
        code,
        ok: false,
        error: e?.message || String(e),
        durationMs: performance.now() - aStart,
      };
      attempts.push(a);
      opts.onAttempt?.(a);

      // Non-correctable: runtime missing entirely
      if (e instanceof RuntimeNotConfiguredError) {
        return {
          ok: false,
          language: req.language,
          finalCode: code,
          error: a.error,
          attempts,
          totalDurationMs: performance.now() - t0,
        };
      }
      if (i < max - 1) {
        code = await autoCorrect({ language: req.language, code, error: a.error || "" });
      }
    }
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    language: req.language,
    finalCode: code,
    error: last?.error ?? "max attempts reached",
    attempts,
    totalDurationMs: performance.now() - t0,
  };
}

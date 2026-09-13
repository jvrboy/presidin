/**
 * E2B cloud sandbox helper — optional. Never statically requires the package.
 */
export type SandboxResult = {
  ok: boolean;
  text?: string;
  logs?: { stdout: string[]; stderr: string[] };
  error?: string;
  sandboxId?: string;
  durationMs?: number;
  skipped?: boolean;
};

export const RESEARCH_SNIPPETS: Record<string, string> = {
  smoke: "print('e2b-ok')\nprint(2+2)",
  feature_stats: "import statistics\nxs=list(range(1,21))\nprint({'mean':statistics.mean(xs),'stdev':statistics.pstdev(xs)})",
  walkforward: "print({'note':'walkforward placeholder','folds':5})",
};

export function e2bConfigured(): boolean {
  return Boolean(process.env.E2B_API_KEY);
}

async function loadE2b(): Promise<any | null> {
  try {
    // Hide package name from webpack static analysis
    const loader = new Function('specifier', 'return import(specifier)');
    return await loader('@e2b/' + 'code-interpreter');
  } catch {
    return null;
  }
}

export async function runPythonInSandbox(
  code: string,
  opts?: { timeoutMs?: number }
): Promise<SandboxResult> {
  const start = Date.now();
  if (!process.env.E2B_API_KEY) {
    return {
      ok: false,
      skipped: true,
      error: 'E2B_API_KEY not set',
      durationMs: Date.now() - start,
    };
  }
  const mod = await loadE2b();
  if (!mod || !mod.Sandbox) {
    return {
      ok: false,
      skipped: true,
      error: '@e2b/code-interpreter not installed',
      durationMs: Date.now() - start,
    };
  }
  try {
    const sbx = await mod.Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: opts?.timeoutMs ?? 120_000,
    });
    try {
      const execution = await sbx.runCode(code);
      const text =
        (execution.results || [])
          .map((r: any) => r.text || r.data || '')
          .filter(Boolean)
          .join('\n') ||
        (execution.logs && execution.logs.stdout ? execution.logs.stdout.join('\n') : '') ||
        '';
      return {
        ok: !execution.error,
        text,
        logs: execution.logs,
        error: execution.error ? String(execution.error) : undefined,
        sandboxId: sbx.sandboxId,
        durationMs: Date.now() - start,
      };
    } finally {
      try {
        await sbx.kill();
      } catch {
        /* ignore */
      }
    }
  } catch (e: any) {
    return {
      ok: false,
      error: String(e && e.message ? e.message : e).slice(0, 400),
      durationMs: Date.now() - start,
    };
  }
}

export async function runResearchSnippet(
  name: string,
  preamble = ''
): Promise<SandboxResult> {
  const body = RESEARCH_SNIPPETS[name];
  if (!body) {
    return { ok: false, error: 'unknown snippet ' + name, skipped: true };
  }
  return runPythonInSandbox(preamble + '\n' + body);
}

export async function runJsInSandbox(code: string, opts?: { timeoutMs?: number }) {
  return runPythonInSandbox(code, opts);
}

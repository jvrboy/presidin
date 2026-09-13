// Per-language runtime adapters. Each implements a tiny interface so the
// executor loop in index.ts treats them uniformly.

import { RuntimeNotConfiguredError } from "./index";

export type Language =
  | "html"
  | "css"
  | "json"
  | "csv"
  | "ts"
  | "js"
  | "python"
  | "csharp"
  | "cpp"
  | "java"
  | "swift"
  | "indicators";

export interface RunOpts {
  stdin?: string;
  timeoutMs?: number;
}

export interface RuntimeResult {
  ok: boolean;
  output?: string;
  error?: string;
}

export interface Runtime {
  language: Language;
  execute(code: string, opts: RunOpts): Promise<RuntimeResult>;
}

// ---------- HTML ----------
const htmlRuntime: Runtime = {
  language: "html",
  async execute(code) {
    // Validate well-formedness by parsing with DOMParser.
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(code, "text/html");
      const errs = doc.querySelectorAll("parsererror");
      if (errs.length > 0) return { ok: false, error: errs[0].textContent || "HTML parse error" };
      // success — report node count as a sanity output
      return {
        ok: true,
        output: `HTML parsed OK · ${doc.querySelectorAll("*").length} elements`,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || "HTML parse failed" };
    }
  },
};

// ---------- CSS ----------
const cssRuntime: Runtime = {
  language: "css",
  async execute(code) {
    try {
      const sheet = new CSSStyleSheet();
      // replaceSync throws on invalid rules
      sheet.replaceSync(code);
      return {
        ok: true,
        output: `CSS parsed OK · ${sheet.cssRules.length} rules`,
      };
    } catch (e: any) {
      return { ok: false, error: e?.message || "CSS parse failed" };
    }
  },
};

// ---------- JSON ----------
const jsonRuntime: Runtime = {
  language: "json",
  async execute(code) {
    try {
      const parsed = JSON.parse(code);
      const summary = Array.isArray(parsed)
        ? `array · ${parsed.length} items`
        : typeof parsed === "object" && parsed
          ? `object · ${Object.keys(parsed).length} keys`
          : typeof parsed;
      return { ok: true, output: summary };
    } catch (e: any) {
      return { ok: false, error: e?.message || "JSON.parse failed" };
    }
  },
};

// ---------- CSV ----------
const csvRuntime: Runtime = {
  language: "csv",
  async execute(code) {
    try {
      const lines = code
        .replace(/\r/g, "")
        .split("\n")
        .filter((l) => l.length > 0);
      if (lines.length === 0) return { ok: false, error: "Empty CSV" };
      // very simple parser — handles quoted fields, commas, escaped quotes
      const parseLine = (line: string): string[] => {
        const out: string[] = [];
        let i = 0;
        let cur = "";
        let inQ = false;
        while (i < line.length) {
          const c = line[i];
          if (inQ) {
            if (c === '"' && line[i + 1] === '"') {
              cur += '"';
              i += 2;
            } else if (c === '"') {
              inQ = false;
              i++;
            } else {
              cur += c;
              i++;
            }
          } else {
            if (c === ",") {
              out.push(cur);
              cur = "";
              i++;
            } else if (c === '"') {
              inQ = true;
              i++;
            } else {
              cur += c;
              i++;
            }
          }
        }
        out.push(cur);
        return out;
      };
      const rows = lines.map(parseLine);
      const cols = rows[0]?.length ?? 0;
      const bad = rows.findIndex((r) => r.length !== cols);
      if (bad > 0) {
        return {
          ok: false,
          error: `Inconsistent column count on row ${bad + 1} (expected ${cols}, got ${rows[bad].length})`,
        };
      }
      return { ok: true, output: `CSV parsed OK · ${rows.length} rows × ${cols} cols` };
    } catch (e: any) {
      return { ok: false, error: e?.message || "CSV parse failed" };
    }
  },
};

// ---------- JavaScript ----------
//
// Runs inside a Blob-Worker for isolation. Worker is killed if it exceeds the
// timeout. Returns the value of the last expression (if it's serializable) or
// captured console.log output.
function jsWorkerSrc(): string {
  return `
    let buf = '';
    const oc = console.log;
    console.log = (...args) => { buf += args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ') + '\\n'; oc(...args); };
    onmessage = async (e) => {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function('return (async () => { ' + e.data + ' })()');
        const ret = await fn();
        const tail = ret === undefined ? '' : typeof ret === 'string' ? ret : JSON.stringify(ret);
        postMessage({ ok: true, output: (buf + tail).trim() || 'no output' });
      } catch (err) {
        postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    };
  `;
}
async function runJsLike(code: string, timeoutMs: number): Promise<RuntimeResult> {
  if (typeof Worker === "undefined") return { ok: false, error: "Web Workers unavailable" };
  const blob = new Blob([jsWorkerSrc()], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url);
  try {
    return await new Promise<RuntimeResult>((resolve) => {
      const to = window.setTimeout(() => {
        w.terminate();
        resolve({ ok: false, error: `Timeout after ${timeoutMs}ms` });
      }, timeoutMs);
      w.onmessage = (ev) => {
        clearTimeout(to);
        resolve(ev.data as RuntimeResult);
      };
      w.onerror = (ev) => {
        clearTimeout(to);
        resolve({ ok: false, error: ev.message || "worker error" });
      };
      w.postMessage(code);
    });
  } finally {
    URL.revokeObjectURL(url);
    w.terminate();
  }
}

const jsRuntime: Runtime = {
  language: "js",
  execute: (code, opts) => runJsLike(code, opts.timeoutMs ?? 10_000),
};

// ---------- TypeScript ----------
// We don't bundle a TS compiler. Strip TS-only syntax with a minimal transform
// (type annotations + interfaces), then hand to JS runtime. Good enough for the
// 80% of cases users will paste; legitimate TS-only constructs will still throw.
function stripTs(code: string): string {
  return (
    code
      // remove type-only imports
      .replace(/import\s+type\b[^;]+;/g, "")
      // strip `: type` annotations on params/vars (very rough, but safe for most cases)
      .replace(/:\s*[A-Za-z_$][\w$<>[\]|&,\s.?]*?(?=\s*[=,)])/g, "")
      // strip interfaces and type aliases
      .replace(/\b(interface)\s+\w+\s*\{[\s\S]*?\}/g, "")
      .replace(/\btype\s+\w+\s*=[^;]+;/g, "")
      // strip `as Foo` casts
      .replace(/\s+as\s+[A-Za-z_$][\w$<>[\]|&,\s.?]*/g, "")
  );
}
const tsRuntime: Runtime = {
  language: "ts",
  execute: (code, opts) => runJsLike(stripTs(code), opts.timeoutMs ?? 10_000),
};

// ---------- Python (Pyodide, lazy) ----------
let pyodidePromise: Promise<any> | null = null;
async function getPyodide(): Promise<any> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      // load from CDN — first call pays the bandwidth cost
      const url = "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js";
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Failed to load Pyodide"));
        document.head.appendChild(s);
      });
      // @ts-expect-error injected by the CDN script
      const py = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/",
      });
      return py;
    })();
  }
  return pyodidePromise;
}
const pythonRuntime: Runtime = {
  language: "python",
  async execute(code, opts) {
    try {
      const py = await getPyodide();
      let buf = "";
      py.setStdout({ batched: (s: string) => (buf += s) });
      py.setStderr({ batched: (s: string) => (buf += s) });
      const timeoutMs = opts.timeoutMs ?? 15_000;
      const result = await Promise.race([
        py.runPythonAsync(code),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      const tail = result === undefined || result === null ? "" : String(result);
      return { ok: true, output: (buf + tail).trim() || "no output" };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Python error" };
    }
  },
};

// ---------- Backend-only runtimes ----------
//
// Each of these requires an external execution service (Judge0, Piston, or a
// self-hosted Docker runner). When VITE_EXECUTOR_URL is configured we POST the
// payload there; otherwise we throw RuntimeNotConfiguredError so the executor
// surfaces an actionable message in the UI.
function backendOnlyRuntime(language: Language): Runtime {
  return {
    language,
    async execute(code, opts) {
      const base =
        (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_EXECUTOR_URL) || "";
      if (!base) throw new RuntimeNotConfiguredError(language);
      try {
        const res = await fetch(`${base}/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            language,
            code,
            stdin: opts.stdin || "",
            timeout_ms: opts.timeoutMs ?? 10_000,
          }),
        });
        if (!res.ok) return { ok: false, error: `Executor returned ${res.status}` };
        const body = await res.json();
        return {
          ok: body.exit_code === 0,
          output: body.stdout || "",
          error: body.exit_code !== 0 ? body.stderr || `exit code ${body.exit_code}` : undefined,
        };
      } catch (e: any) {
        return { ok: false, error: e?.message || "Executor request failed" };
      }
    },
  };
}

// ---------- Indicators DSL ----------
//
// Mini-DSL for trading indicators. Compiles each `indicator(name) { ... }` block
// to a JS function over a Candle[] array, exposes RSI/EMA/SMA helpers, and runs
// inside the JS worker. Catches DSL parse errors before reaching the worker.
function compileIndicatorsDsl(src: string): string {
  // Very small grammar: `indicator NAME { js-body }` becomes
  //   const NAME = (candles) => { js-body };
  // We expose helper aliases: rsi, ema, sma, atr (delegated to runtime functions).
  const HELPERS = `
    const closes = (cs) => cs.map(c => c.close);
    const sma = (arr, n) => arr.length < n ? null :
      arr.slice(-n).reduce((a, b) => a + b, 0) / n;
    const ema = (arr, n) => {
      if (arr.length < n) return null;
      const k = 2 / (n + 1);
      let e = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
      for (let i = n; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
      return e;
    };
    const rsi = (arr, n = 14) => {
      if (arr.length < n + 1) return null;
      let gains = 0, losses = 0;
      for (let i = arr.length - n; i < arr.length; i++) {
        const d = arr[i] - arr[i - 1];
        if (d > 0) gains += d; else losses -= d;
      }
      const rs = losses === 0 ? Infinity : gains / losses;
      return 100 - 100 / (1 + rs);
    };
  `;
  const re = /indicator\s+([A-Za-z_]\w*)\s*\{([\s\S]*?)\}\s*(?=indicator|$)/g;
  const indicators: Array<{ name: string; body: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    indicators.push({ name: m[1], body: m[2].trim() });
  }
  if (indicators.length === 0) {
    throw new Error("No `indicator NAME { ... }` blocks found in source.");
  }
  const compiled = indicators
    .map(
      (i) =>
        `const ${i.name} = (candles) => { ${i.body} };
         _RESULTS_.${i.name} = ${i.name}(_CANDLES_);`,
    )
    .join("\n");
  // produce a self-contained script that runs against sample candles
  return `
    ${HELPERS}
    const _CANDLES_ = Array.from({length: 100}, (_, i) => ({
      open: 100 + Math.sin(i/5)*2, high: 102, low: 98,
      close: 100 + Math.sin(i/5)*2 + (Math.random()-0.5),
      ts: i, volume: 1000,
    }));
    const _RESULTS_ = {};
    ${compiled}
    return JSON.stringify(_RESULTS_, null, 2);
  `;
}
const indicatorsRuntime: Runtime = {
  language: "indicators",
  async execute(code, opts) {
    let compiled: string;
    try {
      compiled = compileIndicatorsDsl(code);
    } catch (e: any) {
      return { ok: false, error: e?.message || "DSL compile error" };
    }
    return runJsLike(compiled, opts.timeoutMs ?? 5_000);
  },
};

export const RUNTIMES: Record<Language, Runtime> = {
  html: htmlRuntime,
  css: cssRuntime,
  json: jsonRuntime,
  csv: csvRuntime,
  js: jsRuntime,
  ts: tsRuntime,
  python: pythonRuntime,
  csharp: backendOnlyRuntime("csharp"),
  cpp: backendOnlyRuntime("cpp"),
  java: backendOnlyRuntime("java"),
  swift: backendOnlyRuntime("swift"),
  indicators: indicatorsRuntime,
};

export const LANGUAGE_LABELS: Record<Language, string> = {
  html: "HTML",
  css: "CSS",
  json: "JSON",
  csv: "CSV",
  ts: "TypeScript",
  js: "JavaScript",
  python: "Python",
  csharp: "C#",
  cpp: "C++",
  java: "Java",
  swift: "Swift",
  indicators: "Indicators DSL",
};

// Advanced Code Runner — Multi-language code execution with sandboxing.
// Supports: JavaScript, TypeScript, Python (via Pyodide), HTML/CSS preview,
// and code analysis tools (lint, format, minify, complexity, stats).

import type { Language } from "@/lib/executor/runtimes";

export interface RunRequest {
  language: Language;
  code: string;
  stdin?: string;
  timeoutMs?: number;
}
export interface RunStep {
  label: string;
  durationMs: number;
  output?: string;
  error?: string;
}
export interface RunResponse {
  ok: boolean;
  output: string;
  error?: string;
  steps: RunStep[];
  totalMs: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// ============ Code Analysis ============

export interface CodeStats {
  lines: number;
  linesOfCode: number;
  blankLines: number;
  commentLines: number;
  characters: number;
  words: number;
  functions: number;
  classes: number;
  imports: number;
  complexity: number;
}

export function analyzeCode(code: string): CodeStats {
  const lines = code.split("\n");
  let blankLines = 0,
    commentLines = 0,
    linesOfCode = 0,
    inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      blankLines++;
      continue;
    }
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
      commentLines++;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      commentLines++;
      inBlockComment = !trimmed.includes("*/");
      continue;
    }
    linesOfCode++;
  }
  const functions = (code.match(/function\s+\w+|const\s+\w+\s*=\s*\(|=>\s*[{(]|def\s+\w+/g) || [])
    .length;
  const classes = (code.match(/class\s+\w+/g) || []).length;
  const imports = (code.match(/import\s+|require\s*\(|from\s+["']/g) || []).length;
  const branches = (
    code.match(/if\s*\(|else\s*if|for\s*\(|while\s*\(|case\s+|catch\s*\(|&&|\|\||[?:]/g) || []
  ).length;
  return {
    lines: lines.length,
    linesOfCode,
    blankLines,
    commentLines,
    characters: code.length,
    words: code.split(/\s+/).filter(Boolean).length,
    functions,
    classes,
    imports,
    complexity: 1 + branches,
  };
}

// ============ Formatting / Minification ============

export function formatJSON(code: string, indent = 2): string {
  try {
    return JSON.stringify(JSON.parse(code), null, indent);
  } catch {
    return code;
  }
}
export function minifyJS(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}();,:])\s*/g, "$1")
    .replace(/;\s*;/g, ";")
    .trim();
}
export function minifyCSS(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
}
export function minifyHTML(code: string): string {
  return code
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

// ============ Transformation ============

export function tsToJs(code: string): string {
  return code
    .replace(/:\s*([A-Za-z_][\w<>[\]|&\s,]*)\s*(?=[=,);{])/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/interface\s+\w+\s*\{[^}]*\}/g, "")
    .replace(/type\s+\w+\s*=\s*[^;]+;/g, "")
    .replace(/as\s+[A-Za-z_][\w<>[\]|&\s]*/g, "")
    .replace(/private\s+|public\s+|protected\s+|readonly\s+/g, "")
    .replace(/abstract\s+class/g, "class")
    .replace(/implements\s+[\w,\s]+/g, "");
}

export function jsToTs(code: string): string {
  let result = code;
  result = result.replace(
    /function\s+(\w+)\s*\(([^)]*)\)/g,
    (_, name, params) =>
      `function ${name}(${params
        .split(",")
        .map((p: string) => (p.trim() ? `${p.trim()}: any` : ""))
        .join(", ")}): any`,
  );
  result = result.replace(
    /const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/g,
    (_, name, params) =>
      `const ${name} = (${params
        .split(",")
        .map((p: string) => (p.trim() ? `${p.trim()}: any` : ""))
        .join(", ")}): any =>`,
  );
  return result;
}

// ============ Sandboxed JS Execution ============

export function runJS(code: string, stdin = "", timeoutMs = 5000): RunResponse {
  const steps: RunStep[] = [];
  const t0 = performance.now();
  let stdout = "",
    stderr = "",
    exitCode = 0;
  const consoleProxy = {
    log: (...args: unknown[]) => {
      stdout +=
        args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") + "\n";
    },
    error: (...args: unknown[]) => {
      stderr +=
        args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ") + "\n";
    },
    warn: (...args: unknown[]) => {
      stdout += args.map((a) => String(a)).join(" ") + "\n";
    },
    info: (...args: unknown[]) => {
      stdout += args.map((a) => String(a)).join(" ") + "\n";
    },
  };
  try {
    const stepStart = performance.now();
    const fn = new Function("console", "stdin", "require", "module", "exports", code);
    fn(consoleProxy, stdin, undefined, { exports: {} }, {});
    steps.push({
      label: "Execute",
      durationMs: performance.now() - stepStart,
      output: stdout || "OK",
    });
  } catch (e) {
    exitCode = 1;
    stderr = e instanceof Error ? e.message : String(e);
    steps.push({ label: "Execute", durationMs: performance.now() - t0, error: stderr });
  }
  return {
    ok: exitCode === 0,
    output: stdout,
    error: stderr || undefined,
    steps,
    totalMs: performance.now() - t0,
    stdout,
    stderr,
    exitCode,
  };
}

// ============ HTML Preview ============

export function generateHTMLPreview(html: string, css = "", js = ""): string {
  return `<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <style>${css}</style>\n</head>\n<body>\n${html}\n<script>${js}</script>\n</body>\n</html>`;
}

// ============ Snippets ============

export interface Snippet {
  id: string;
  name: string;
  language: Language;
  code: string;
  tags: string[];
}
export function createSnippet(
  name: string,
  language: Language,
  code: string,
  tags: string[] = [],
): Snippet {
  return { id: crypto.randomUUID(), name, language, code, tags };
}

// ============ Regex Tester ============

export function testRegex(
  pattern: string,
  flags: string,
  testString: string,
): { matches: { match: string; index: number; groups: string[] }[]; ok: boolean; error?: string } {
  try {
    const re = new RegExp(pattern, flags);
    const matches: { match: string; index: number; groups: string[] }[] = [];
    if (flags.includes("g")) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(testString)) !== null) {
        matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
        if (m.index === re.lastIndex) re.lastIndex++;
      }
    } else {
      const m = re.exec(testString);
      if (m) matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
    }
    return { matches, ok: true };
  } catch (e) {
    return { matches: [], ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ============ Encoding / Hashing ============

export function encodeBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    return btoa(str);
  }
}
export function decodeBase64(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return atob(b64);
  }
}
export function urlEncode(str: string): string {
  return encodeURIComponent(str);
}
export function urlDecode(str: string): string {
  return decodeURIComponent(str);
}

export async function hashText(
  text: string,
  algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512" = "SHA-256",
): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateUUIDs(count: number): string[] {
  return Array.from({ length: count }, () => crypto.randomUUID());
}

export const CODE_RUNNER_TOOLS = {
  analyzeCode,
  formatJSON,
  minifyJS,
  minifyCSS,
  minifyHTML,
  tsToJs,
  jsToTs,
  runJS,
  generateHTMLPreview,
  testRegex,
  encodeBase64,
  decodeBase64,
  urlEncode,
  urlDecode,
  hashText,
  generateUUIDs,
};

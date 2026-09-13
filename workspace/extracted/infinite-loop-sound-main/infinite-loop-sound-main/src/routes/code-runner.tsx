import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState, useRef, useCallback } from "react";
import { ProCard, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Code,
  Play,
  Copy,
  Trash,
  Activity,
  Terminal,
  Zap,
  FileCode,
  Hash,
  Binary,
  Type,
  Wrench,
} from "lucide-react";
import {
  runJS,
  analyzeCode,
  formatJSON,
  minifyJS,
  minifyCSS,
  minifyHTML,
  tsToJs,
  jsToTs,
  testRegex,
  encodeBase64,
  decodeBase64,
  urlEncode,
  urlDecode,
  hashText,
  generateUUIDs,
  type RunResponse,
} from "@/lib/tools/code-runner";
import { runWithAutoCorrect } from "@/lib/executor";
import type { Language } from "@/lib/executor/runtimes";

export const Route = createFileRoute("/code-runner")({
  head: () => ({
    meta: [
      { title: "Code Runner — DivergenceIQ" },
      {
        name: "description",
        content:
          "Advanced multi-language code executor with analysis, formatting, minification, and transformation tools.",
      },
    ],
  }),
  component: CodeRunnerPage,
});

const LANGUAGES: Language[] = ["js", "ts", "html", "css", "json", "csv", "python"];

const EXAMPLES: Record<string, string> = {
  js: `// JavaScript Example
const fibonacci = (n) => {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
};

console.log("Fibonacci sequence:");
for (let i = 0; i < 10; i++) {
  console.log(\`f(\${i}) = \${fibonacci(i)}\`);
}`,
  ts: `// TypeScript Example
interface User {
  id: string;
  name: string;
  email: string;
}

function createUser(data: Omit<User, "id">): User {
  return { ...data, id: crypto.randomUUID() };
}

const user = createUser({ name: "Alice", email: "alice@example.com" });
console.log(user);`,
  python: `# Python Example
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print("Sorted:", quicksort([3, 6, 1, 8, 2, 9, 4]))`,
  html: `<!DOCTYPE html>
<html>
<body>
  <h1>Hello World</h1>
  <p>This is a test page.</p>
</body>
</html>`,
  css: `body {
  font-family: system-ui, sans-serif;
  margin: 0;
  padding: 20px;
}

.container {
  max-width: 800px;
  margin: 0 auto;
}`,
  json: `{
  "name": "DivergenceIQ",
  "version": "1.0.0",
  "features": ["code-runner", "artifacts", "backend-tools"]
}`,
  csv: `name,value,category
Alpha,100,A
Beta,200,B
Gamma,300,A`,
};

function CodeRunnerPage() {
  const [language, setLanguage] = useState<Language>("js");
  const [code, setCode] = useState(EXAMPLES["js"] || "");
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<RunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState(() => analyzeCode(EXAMPLES["js"] || ""));
  const [activeTab, setActiveTab] = useState<"output" | "stats" | "tools">("output");
  const [regexPattern, setRegexPattern] = useState("\\d+");
  const [regexFlags, setRegexFlags] = useState("g");
  const [regexTest, setRegexTest] = useState("Hello 123 World 456");
  const [encodeInput, setEncodeInput] = useState("Hello World");
  const [hashInput, setHashInput] = useState("Hello DivergenceIQ");
  const [hashResult, setHashResult] = useState("");
  const outputRef = useRef<HTMLPreElement>(null);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setCode(EXAMPLES[lang] || "");
    setResult(null);
    setStats(analyzeCode(EXAMPLES[lang] || ""));
  };

  const handleRun = useCallback(async () => {
    setBusy(true);
    try {
      if (language === "js") {
        const r = runJS(code, stdin);
        setResult(r);
      } else {
        const r = await runWithAutoCorrect({ language, code, stdin });
        setResult({
          ok: r.ok,
          output: r.output || r.error || "",
          error: r.error,
          steps: r.attempts.map((a, i) => ({
            label: `Attempt ${i + 1}`,
            durationMs: a.durationMs,
            output: a.output,
            error: a.error,
          })),
          totalMs: r.totalDurationMs,
          stdout: r.output || "",
          stderr: r.error || "",
          exitCode: r.ok ? 0 : 1,
        });
      }
      setStats(analyzeCode(code));
      setActiveTab("output");
    } catch (e) {
      setResult({
        ok: false,
        output: "",
        error: e instanceof Error ? e.message : String(e),
        steps: [],
        totalMs: 0,
        stdout: "",
        stderr: e instanceof Error ? e.message : String(e),
        exitCode: 1,
      });
    } finally {
      setBusy(false);
    }
  }, [code, language, stdin]);

  const handleAnalyze = () => {
    setStats(analyzeCode(code));
    setActiveTab("stats");
  };

  const handleFormat = () => {
    if (language === "json") {
      setCode(formatJSON(code));
    }
  };

  const handleMinify = () => {
    if (language === "js") setCode(minifyJS(code));
    else if (language === "css") setCode(minifyCSS(code));
    else if (language === "html") setCode(minifyHTML(code));
  };

  const handleTsToJs = () => {
    setLanguage("js");
    setCode(tsToJs(code));
  };

  const handleJsToTs = () => {
    setLanguage("ts");
    setCode(jsToTs(code));
  };

  const handleRegex = () => {
    const r = testRegex(regexPattern, regexFlags, regexTest);
    setActiveTab("tools");
    if (!r.ok) {
      setResult({
        ok: false,
        output: "",
        error: r.error,
        steps: [],
        totalMs: 0,
        stdout: "",
        stderr: r.error || "",
        exitCode: 1,
      });
    } else {
      setResult({
        ok: true,
        output: `Pattern: /${regexPattern}/${regexFlags}\nString: "${regexTest}"\nMatches: ${r.matches.length}\n${r.matches.map((m, i) => `  [${i}] "${m.match}" at ${m.index}`).join("\n")}`,
        steps: [],
        totalMs: 0,
        stdout: `${r.matches.length} matches found`,
        stderr: "",
        exitCode: 0,
      });
    }
  };

  const handleEncode = (op: string) => {
    const out =
      op === "b64-enc"
        ? encodeBase64(encodeInput)
        : op === "b64-dec"
          ? decodeBase64(encodeInput)
          : op === "url-enc"
            ? urlEncode(encodeInput)
            : urlDecode(encodeInput);
    setResult({
      ok: true,
      output: `${op}: "${encodeInput}" -> "${out}"`,
      steps: [],
      totalMs: 0,
      stdout: out,
      stderr: "",
      exitCode: 0,
    });
    setActiveTab("tools");
  };

  const handleHash = async () => {
    const h = await hashText(hashInput, "SHA-256");
    setHashResult(h);
    setActiveTab("tools");
  };

  const handleUUIDs = () => {
    const uuids = generateUUIDs(5);
    setResult({
      ok: true,
      output: uuids.map((u) => `  ${u}`).join("\n"),
      steps: [],
      totalMs: 0,
      stdout: uuids.join("\n"),
      stderr: "",
      exitCode: 0,
    });
    setActiveTab("tools");
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <SectionHeader
          title="Code Runner"
          subtitle="Multi-language code execution with analysis, formatting, minification, and transformation tools."
          icon={<Code className="w-5 h-5" />}
          action={
            <div className="flex gap-2">
              <Button onClick={handleRun} disabled={busy}>
                {busy ? (
                  <Activity className="w-4 h-4 animate-pulse" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                {busy ? "Running…" : "Run"}
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ProCard
            title="Editor"
            description="Write or paste code to execute."
            icon={<FileCode className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleLanguageChange(lang)}
                    className={`px-3 py-1 rounded text-xs font-mono transition-all ${
                      language === lang
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border border-border hover:bg-card/80"
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>

              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full h-80 bg-[#0d0d0d] border border-border rounded-lg p-3 text-sm font-mono text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                spellCheck={false}
                placeholder="Enter code here…"
              />

              {language === "python" || language === "ts" || language === "js" ? (
                <div>
                  <Label className="text-xs">stdin (optional)</Label>
                  <textarea
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    className="w-full h-16 bg-[#0d0d0d] border border-border rounded-lg p-2 text-xs font-mono text-gray-100 resize-none"
                    placeholder="Standard input…"
                  />
                </div>
              ) : null}

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleAnalyze}>
                  <Activity className="w-3 h-3" /> Analyze
                </Button>
                {language === "json" && (
                  <Button size="sm" variant="outline" onClick={handleFormat}>
                    <Type className="w-3 h-3" /> Format
                  </Button>
                )}
                {(language === "js" || language === "css" || language === "html") && (
                  <Button size="sm" variant="outline" onClick={handleMinify}>
                    <Zap className="w-3 h-3" /> Minify
                  </Button>
                )}
                {language === "ts" && (
                  <Button size="sm" variant="outline" onClick={handleTsToJs}>
                    TS → JS
                  </Button>
                )}
                {language === "js" && (
                  <Button size="sm" variant="outline" onClick={handleJsToTs}>
                    JS → TS
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(code)}
                >
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCode("")}>
                  <Trash className="w-3 h-3" /> Clear
                </Button>
              </div>
            </div>
          </ProCard>

          <ProCard
            title="Output"
            description="Execution results and analysis."
            icon={<Terminal className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("output")}
                  className={`px-3 py-1 rounded text-xs ${activeTab === "output" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}
                >
                  Output
                </button>
                <button
                  onClick={() => setActiveTab("stats")}
                  className={`px-3 py-1 rounded text-xs ${activeTab === "stats" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}
                >
                  Stats
                </button>
                <button
                  onClick={() => setActiveTab("tools")}
                  className={`px-3 py-1 rounded text-xs ${activeTab === "tools" ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}
                >
                  Tools
                </button>
              </div>

              {activeTab === "output" && (
                <div className="space-y-2">
                  {result ? (
                    <>
                      <div className="flex gap-2 items-center">
                        <Badge variant={result.ok ? "default" : "destructive"}>
                          {result.ok ? "SUCCESS" : "ERROR"}
                        </Badge>
                        <Badge variant="outline">{result.totalMs.toFixed(0)}ms</Badge>
                        <Badge variant="outline">exit {result.exitCode}</Badge>
                      </div>
                      {result.steps.length > 1 && (
                        <div className="text-xs text-muted-foreground">
                          {result.steps.length} steps:{" "}
                          {result.steps
                            .map((s) => `${s.label}(${s.durationMs.toFixed(0)}ms)`)
                            .join(" → ")}
                        </div>
                      )}
                      <pre
                        ref={outputRef}
                        className="bg-[#0d0d0d] border border-border rounded-lg p-3 text-xs font-mono text-gray-100 overflow-auto h-72 whitespace-pre-wrap"
                      >
                        {result.stdout || result.stderr || result.error || "No output"}
                      </pre>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-72 text-sm text-muted-foreground">
                      Run code to see output…
                    </div>
                  )}
                </div>
              )}

              {activeTab === "stats" && (
                <div className="space-y-3">
                  <KpiGrid
                    tiles={[
                      { label: "Total Lines", value: String(stats.lines) },
                      { label: "Lines of Code", value: String(stats.linesOfCode) },
                      { label: "Blank Lines", value: String(stats.blankLines) },
                      { label: "Comments", value: String(stats.commentLines) },
                      { label: "Characters", value: String(stats.characters) },
                      { label: "Words", value: String(stats.words) },
                      { label: "Functions", value: String(stats.functions) },
                      { label: "Classes", value: String(stats.classes) },
                      { label: "Imports", value: String(stats.imports) },
                      { label: "Complexity", value: String(stats.complexity) },
                    ]}
                  />
                </div>
              )}

              {activeTab === "tools" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Hash className="w-3 h-3" /> Regex Tester
                    </Label>
                    <div className="flex gap-2">
                      <input
                        value={regexPattern}
                        onChange={(e) => setRegexPattern(e.target.value)}
                        placeholder="Pattern"
                        className="flex-1 bg-card border border-border rounded px-2 py-1 text-xs font-mono"
                      />
                      <input
                        value={regexFlags}
                        onChange={(e) => setRegexFlags(e.target.value)}
                        placeholder="Flags"
                        className="w-16 bg-card border border-border rounded px-2 py-1 text-xs font-mono"
                      />
                      <Button size="sm" variant="outline" onClick={handleRegex}>
                        Test
                      </Button>
                    </div>
                    <input
                      value={regexTest}
                      onChange={(e) => setRegexTest(e.target.value)}
                      placeholder="Test string"
                      className="w-full bg-card border border-border rounded px-2 py-1 text-xs font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Binary className="w-3 h-3" /> Encode / Decode
                    </Label>
                    <input
                      value={encodeInput}
                      onChange={(e) => setEncodeInput(e.target.value)}
                      className="w-full bg-card border border-border rounded px-2 py-1 text-xs font-mono"
                    />
                    <div className="flex gap-1 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => handleEncode("b64-enc")}>
                        Base64 Enc
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEncode("b64-dec")}>
                        Base64 Dec
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEncode("url-enc")}>
                        URL Enc
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEncode("url-dec")}>
                        URL Dec
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Hash className="w-3 h-3" /> SHA-256 Hash
                    </Label>
                    <input
                      value={hashInput}
                      onChange={(e) => setHashInput(e.target.value)}
                      className="w-full bg-card border border-border rounded px-2 py-1 text-xs font-mono"
                    />
                    <Button size="sm" variant="outline" onClick={handleHash}>
                      Generate Hash
                    </Button>
                    {hashResult && (
                      <pre className="bg-[#0d0d0d] border border-border rounded p-2 text-xs font-mono text-gray-100 overflow-auto">
                        {hashResult}
                      </pre>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1">
                      <Wrench className="w-3 h-3" /> UUID Generator
                    </Label>
                    <Button size="sm" variant="outline" onClick={handleUUIDs}>
                      Generate 5 UUIDs
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </ProCard>
        </div>
      </div>
    </AppShell>
  );
}

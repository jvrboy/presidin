// Auto-correct loop: take failing code + error, ask the configured LLM provider
// to repair it. Used by src/lib/executor/index.ts after each failed attempt.
//
// We deliberately keep this surface tiny:
//   - one in / one out: { language, code, error } -> string
//   - never throws — degrades to returning the original code if no LLM available
//   - prompt is locked to "code only, no prose" to maximise compile/run rate

import { aiChat, loadKeys } from "@/lib/ai/client";
import { LANGUAGE_LABELS, type Language } from "./runtimes";

export interface CorrectInput {
  language: Language;
  code: string;
  error: string;
}

const CORRECTION_SYSTEM = `You are a code repair tool. You receive failing source code and the exact error or runtime message it produced. You return ONLY the corrected source code — no prose, no markdown fences, no comments explaining your changes.

Rules:
- Preserve the original intent. Only change what's needed to make the code run.
- Keep the same language. Do not switch frameworks.
- If the error indicates a type/syntax issue, fix it. If it's a runtime issue, change the offending logic minimally.
- If you cannot determine a fix, return the original code unchanged.`;

function buildPrompt(input: CorrectInput): string {
  const label = LANGUAGE_LABELS[input.language] || input.language;
  return [
    `Language: ${label}`,
    `Failing code:`,
    "```" + input.language,
    input.code,
    "```",
    `Error / output:`,
    "```",
    input.error,
    "```",
    `Return only the corrected code. No fences. No explanation.`,
  ].join("\n");
}

// Strip accidental ```lang ... ``` fences if the model added them anyway.
function stripFences(s: string): string {
  const m = s.match(/```[\w-]*\n([\s\S]*?)```/);
  if (m) return m[1];
  return s.trim();
}

export async function autoCorrect(input: CorrectInput): Promise<string> {
  // If there's no key, we can't auto-correct — just return the original code so
  // the executor's MAX_ATTEMPTS quickly exhausts and surfaces the real error.
  if (loadKeys().length === 0) return input.code;
  try {
    const res = await aiChat([
      { role: "system", content: CORRECTION_SYSTEM },
      { role: "user", content: buildPrompt(input) },
    ]);
    if (!res) return input.code;
    const cleaned = stripFences(res.text);
    if (!cleaned || cleaned.length < 4) return input.code;
    return cleaned;
  } catch {
    // network / provider error — fall back to the original
    return input.code;
  }
}

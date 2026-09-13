// Code generators per language. Each takes a natural-language prompt and
// returns a starter snippet the executor can run-and-correct. The generators
// call the configured LLM provider with a tightly scoped system prompt.

import { aiChat, loadKeys } from "@/lib/ai/client";
import { LANGUAGE_LABELS, type Language } from "./runtimes";

const GEN_SYSTEM = `You are a code generator. You produce a single, self-contained source file in the requested language that satisfies the user's request. Output ONLY the source code — no prose, no markdown fences, no preamble.`;

// Hand-written fallbacks for when no API key is configured. Tiny but valid in
// every supported language so the runtime/auto-correct can still demonstrate
// itself end-to-end without the LLM dependency.
const FALLBACK: Record<Language, string> = {
  html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Generated</title></head>
<body><h1>Hello from generator</h1></body>
</html>`,
  css: `.card {
  padding: 1rem;
  border-radius: 8px;
  background: #1a1a1f;
  color: #fff;
}`,
  json: `{
  "name": "example",
  "items": [1, 2, 3],
  "ok": true
}`,
  csv: `id,name,value
1,alpha,12.4
2,beta,9.8
3,gamma,17.2`,
  js: `const main = () => {
  const xs = [1, 2, 3, 4, 5];
  return xs.reduce((a, b) => a + b, 0);
};
console.log(main());`,
  ts: `const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
console.log(sum([1, 2, 3, 4, 5]));`,
  python: `def main():
    xs = [1, 2, 3, 4, 5]
    return sum(xs)

print(main())`,
  csharp: `using System;
class Program {
  static void Main() {
    Console.WriteLine("hello");
  }
}`,
  cpp: `#include <iostream>
int main(){ std::cout << "hello" << std::endl; return 0; }`,
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("hello");
  }
}`,
  swift: `print("hello")`,
  indicators: `indicator RSI14 {
  return rsi(closes(candles), 14);
}

indicator MOM10 {
  const c = closes(candles);
  return c[c.length - 1] - c[c.length - 11];
}`,
};

export async function generate(prompt: string, language: Language): Promise<string> {
  if (loadKeys().length === 0 || !prompt.trim()) return FALLBACK[language];
  const label = LANGUAGE_LABELS[language] || language;
  try {
    const res = await aiChat([
      { role: "system", content: GEN_SYSTEM },
      {
        role: "user",
        content: `Language: ${label}\n\nRequest:\n${prompt}\n\nReturn only the source code.`,
      },
    ]);
    if (!res) return FALLBACK[language];
    // strip fences if the model wrapped its output
    const fenceMatch = res.text.match(/```[\w-]*\n([\s\S]*?)```/);
    return (fenceMatch ? fenceMatch[1] : res.text).trim() || FALLBACK[language];
  } catch {
    return FALLBACK[language];
  }
}

export const FALLBACK_SNIPPETS = FALLBACK;

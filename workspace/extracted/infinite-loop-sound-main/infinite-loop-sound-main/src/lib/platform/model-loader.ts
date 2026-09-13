// Platform-Aware Model Loader — Resolves the GGUF loading issue across platforms.
//
// Problem: wllama (WebAssembly LLM) works in browser but has limitations on
// mobile/desktop builds. This module detects the runtime platform and uses
// the appropriate loading strategy:
//
// - Web browser: wllama (WASM) with IndexedDB caching
// - Electron (desktop .exe/.dmg): Node.js fs + native llama.cpp binding if available,
//   falls back to wllama in renderer
// - Capacitor (iOS/Android): File plugin to access local files, wllama for inference
// - React Native: not applicable (web-only build)

export type Platform = "web" | "electron" | "capacitor" | "unknown";

export function detectPlatform(): Platform {
  if (typeof window !== "undefined") {
    // Electron renderer
    if ((window as any).electronAPI || (window as any).require?.("electron")) {
      return "electron";
    }
    // Capacitor
    if ((window as any).Capacitor?.isNativePlatform?.()) {
      return "capacitor";
    }
    return "web";
  }
  if (typeof process !== "undefined" && process.versions?.electron) {
    return "electron";
  }
  return "unknown";
}

export interface ModelLoadResult {
  success: boolean;
  engine: "wllama" | "native" | "remote";
  modelPath?: string;
  error?: string;
}

export interface LoadOptions {
  url?: string;
  file?: File;
  filePath?: string;
  maxTokens?: number;
  temperature?: number;
  onProgress?: (pct: number) => void;
}

export async function loadModel(opts: LoadOptions): Promise<{
  generate: (prompt: string, maxTokens?: number) => Promise<string>;
  unload: () => Promise<void>;
  engine: string;
}> {
  const platform = detectPlatform();

  if (platform === "electron" && opts.filePath) {
    try {
      const electron = (window as any).electronAPI;
      if (electron?.loadModel) {
        await electron.loadModel(opts.filePath);
        return {
          generate: async (prompt: string, maxTokens?: number) => {
            return electron.generate(prompt, maxTokens || 256);
          },
          unload: async () => electron.unloadModel(),
          engine: "native",
        };
      }
    } catch (e) {
      console.warn("[ModelLoader] Electron native failed, falling back to wllama", e);
    }
  }

  if (platform === "capacitor") {
    try {
      const capacitor = (window as any).Capacitor;
      if (capacitor?.Plugins?.Filesystem) {
        const fs = capacitor.Plugins.Filesystem;
        if (opts.filePath) {
          const result = await fs.readFile({ path: opts.filePath });
          const blob = new Blob([result.data], { type: "application/octet-stream" });
          const file = new File([blob], opts.filePath.split("/").pop() || "model.gguf");
          return loadWllama({ ...opts, file });
        }
      }
    } catch (e) {
      console.warn("[ModelLoader] Capacitor file access failed, falling back", e);
    }
  }

  return loadWllama(opts);
}

async function loadWllama(opts: LoadOptions) {
  const { Wllama } = await import("@wllama/wllama");

  const wllamaSingleWasm = (await import("@wllama/wllama/src/wasm/wllama.wasm?url")).default;
  const WLLAMA_PATHS = {
    default: wllamaSingleWasm,
    "single-thread/wllama.wasm": wllamaSingleWasm,
    "multi-thread/wllama.wasm": wllamaSingleWasm,
  };

  const wllama = new Wllama(WLLAMA_PATHS as any);

  const loadOpts: any = {
    progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
      if (total > 0 && opts.onProgress) opts.onProgress(Math.round((loaded / total) * 100));
    },
  };

  if (opts.file) {
    await wllama.loadModel([opts.file], loadOpts);
  } else if (opts.url) {
    await (wllama as any).loadModelFromUrl(opts.url, loadOpts);
  } else {
    throw new Error("No model source provided");
  }

  return {
    generate: async (prompt: string, maxTokens?: number) => {
      const formatted = `<|im_start|>user\n${prompt}<|im_end|>\n<|im_start|>assistant\n`;
      const out = await (wllama as any).createCompletion(formatted, {
        nPredict: maxTokens || 256,
        sampling: { temp: 0.7, top_p: 0.9, top_k: 40 },
      });
      return typeof out === "string" ? out : "";
    },
    unload: async () => {
      try {
        await wllama.exit?.();
      } catch {
        /* noop */
      }
    },
    engine: "wllama",
  };
}

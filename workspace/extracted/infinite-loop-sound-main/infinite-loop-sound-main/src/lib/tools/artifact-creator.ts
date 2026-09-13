// Artifact Creator — Generate all types of files from chat.
// Supports: JSON, CSV, HTML, CSS, JS, TS, Python, Markdown, YAML, XML,
// SQL, SVG, PDF (text), TXT, environment files, config files, and more.
// Each generator produces a complete, downloadable artifact.

export type ArtifactKind =
  | "json"
  | "csv"
  | "html"
  | "css"
  | "js"
  | "ts"
  | "py"
  | "md"
  | "yaml"
  | "yml"
  | "xml"
  | "sql"
  | "svg"
  | "txt"
  | "env"
  | "toml"
  | "ini"
  | "sh"
  | "bat"
  | "graphql"
  | "proto"
  | "dockerfile"
  | "makefile"
  | "gitignore"
  | "editorconfig"
  | "pdf"
  | "rtf"
  | "xlsx"
  | "other";

export interface ArtifactSpec {
  name: string;
  kind: ArtifactKind;
  content: string;
  description?: string;
  language?: string;
}

export interface GeneratedArtifact extends ArtifactSpec {
  id: string;
  bytes: number;
  lines: number;
  createdAt: number;
  mimeType: string;
  extension: string;
}

const MIME_MAP: Record<ArtifactKind, string> = {
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  ts: "application/typescript",
  py: "text/x-python",
  md: "text/markdown",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  xml: "application/xml",
  sql: "application/sql",
  svg: "image/svg+xml",
  txt: "text/plain",
  env: "text/plain",
  toml: "application/toml",
  ini: "text/plain",
  sh: "application/x-sh",
  bat: "application/x-bat",
  graphql: "application/graphql",
  proto: "text/x-protobuf",
  dockerfile: "text/x-dockerfile",
  makefile: "text/x-makefile",
  gitignore: "text/plain",
  editorconfig: "text/plain",
  pdf: "application/pdf",
  rtf: "application/rtf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  other: "application/octet-stream",
};

const EXT_MAP: Record<ArtifactKind, string> = {
  json: "json",
  csv: "csv",
  html: "html",
  css: "css",
  js: "js",
  ts: "ts",
  py: "py",
  md: "md",
  yaml: "yaml",
  yml: "yml",
  xml: "xml",
  sql: "sql",
  svg: "svg",
  txt: "txt",
  env: "env",
  toml: "toml",
  ini: "ini",
  sh: "sh",
  bat: "bat",
  graphql: "graphql",
  proto: "proto",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  gitignore: ".gitignore",
  editorconfig: ".editorconfig",
  pdf: "pdf",
  rtf: "rtf",
  xlsx: "xlsx",
  other: "bin",
};

export function createArtifact(spec: ArtifactSpec): GeneratedArtifact {
  const content = spec.content || "";
  return {
    ...spec,
    id: crypto.randomUUID(),
    bytes: new Blob([content]).size,
    lines: content.split("\n").length,
    createdAt: Date.now(),
    mimeType: MIME_MAP[spec.kind] || "text/plain",
    extension: EXT_MAP[spec.kind] || "txt",
  };
}

export function downloadArtifact(artifact: GeneratedArtifact): void {
  const blob = new Blob([artifact.content], { type: artifact.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = artifact.name.endsWith(`.${artifact.extension}`)
    ? artifact.name
    : `${artifact.name}.${artifact.extension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============ Generators ============

export function generateJSON(data: unknown, name = "data"): ArtifactSpec {
  return {
    name,
    kind: "json",
    content: JSON.stringify(data, null, 2),
    description: `JSON file`,
    language: "json",
  };
}

export function generateCSV(rows: Record<string, unknown>[], name = "data"): ArtifactSpec {
  if (rows.length === 0) return { name, kind: "csv", content: "", language: "csv" };
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(","),
    ),
  ];
  return {
    name,
    kind: "csv",
    content: lines.join("\n"),
    description: `CSV with ${rows.length} rows`,
    language: "csv",
  };
}

export function generateHTML(title: string, body: string, name = "page"): ArtifactSpec {
  return {
    name,
    kind: "html",
    content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${title}</title>\n  <style>\n    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }\n    h1 { color: #1a1a1a; }\n    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 12px 0; }\n  </style>\n</head>\n<body>\n  <h1>${title}</h1>\n  ${body}\n</body>\n</html>`,
    description: `HTML page: ${title}`,
    language: "html",
  };
}

export function generateComponent(
  name: string,
  componentType: "react" | "vue" | "svelte" = "react",
): ArtifactSpec {
  const className = name.replace(/[^A-Za-z0-9]/g, "");
  if (componentType === "react") {
    return {
      name: className,
      kind: "ts" as ArtifactKind,
      content: `import { useState, useEffect } from "react";\n\nexport function ${className}() {\n  const [state, setState] = useState(null);\n\n  useEffect(() => {\n    // Initialize component\n  }, []);\n\n  return (\n    <div className="${className.toLowerCase()}">\n      <h2>${name}</h2>\n      <p>Component content goes here</p>\n    </div>\n  );\n}\n`,
      description: `React component: ${className}`,
      language: "tsx",
    };
  }
  return { name, kind: "js", content: `// ${name} component`, language: "javascript" };
}

export function generateAPI(
  endpoint: string,
  method: string,
  fields: { name: string; type: string }[],
): ArtifactSpec {
  const capName = endpoint.charAt(0).toUpperCase() + endpoint.slice(1);
  const fieldsStr = fields.map((f) => `  ${f.name}: ${f.type}`).join("\n");
  return {
    name: `${endpoint}-api`,
    kind: "ts",
    content: `// API Endpoint: ${method.toUpperCase()} /${endpoint}\nexport interface ${capName}Request {\n${fieldsStr}\n}\n\nexport interface ${capName}Response {\n  success: boolean;\n  data?: unknown;\n  error?: string;\n}\n\nexport async function ${endpoint}(req: ${capName}Request): Promise<${capName}Response> {\n  const res = await fetch("/api/${endpoint}", {\n    method: "${method.toUpperCase()}",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify(req),\n  });\n  return res.json();\n}\n`,
    description: `API endpoint: ${method.toUpperCase()} /${endpoint}`,
    language: "typescript",
  };
}

export function generateSQL(
  table: string,
  columns: { name: string; type: string; nullable?: boolean }[],
): ArtifactSpec {
  const cols = columns
    .map((c) => `  ${c.name} ${c.type}${c.nullable === false ? " NOT NULL" : ""}`)
    .join(",\n");
  return {
    name: `${table}-schema`,
    kind: "sql",
    content: `CREATE TABLE IF NOT EXISTS ${table} (\n  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n${cols},\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n);\n\nALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "select_own_${table}" ON ${table} FOR SELECT TO authenticated USING (auth.uid() = user_id);\nCREATE POLICY "insert_own_${table}" ON ${table} FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);\nCREATE POLICY "update_own_${table}" ON ${table} FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);\nCREATE POLICY "delete_own_${table}" ON ${table} FOR DELETE TO authenticated USING (auth.uid() = user_id);\n\nCREATE INDEX IF NOT EXISTS idx_${table}_user_id ON ${table}(user_id);\n`,
    description: `SQL schema for ${table} with RLS`,
    language: "sql",
  };
}

export function generateDockerfile(baseImage = "node:20-slim", appPort = 3000): ArtifactSpec {
  return {
    name: "Dockerfile",
    kind: "dockerfile",
    content: `FROM ${baseImage}\n\nWORKDIR /app\n\nCOPY package*.json ./\nRUN npm ci --only=production\n\nCOPY . .\nRUN npm run build\n\nEXPOSE ${appPort}\n\nCMD ["npm", "start"]\n`,
    description: `Dockerfile for ${baseImage}`,
    language: "dockerfile",
  };
}

export function generateDockerCompose(
  services: { name: string; image: string; ports?: number[]; env?: Record<string, string> }[],
): ArtifactSpec {
  const servicesStr = services
    .map((s) => {
      const ports = s.ports?.map((p) => `    - "${p}:${p}"`).join("\n") || "";
      const env = s.env
        ? Object.entries(s.env)
            .map(([k, v]) => `      ${k}: ${v}`)
            .join("\n")
        : "";
      return `  ${s.name}:\n    image: ${s.image}${ports ? `\n    ports:\n${ports}` : ""}${env ? `\n    environment:\n${env}` : ""}`;
    })
    .join("\n\n");
  return {
    name: "docker-compose",
    kind: "yaml",
    content: `version: "3.9"\n\nservices:\n${servicesStr}\n`,
    description: `Docker Compose with ${services.length} services`,
    language: "yaml",
  };
}

export function generateEnv(vars: Record<string, string>, name = ".env"): ArtifactSpec {
  return {
    name,
    kind: "env",
    content: Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    description: `Environment file`,
    language: "env",
  };
}

export function generateMarkdown(
  title: string,
  sections: { heading: string; body: string }[],
): ArtifactSpec {
  return {
    name: title.toLowerCase().replace(/\s+/g, "-"),
    kind: "md",
    content: `# ${title}\n\n${sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n")}\n`,
    description: `Markdown: ${title}`,
    language: "markdown",
  };
}

export function generateSVG(width: number, height: number, shapes: string[]): ArtifactSpec {
  return {
    name: "diagram",
    kind: "svg",
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${shapes.join("\n")}\n</svg>`,
    description: `SVG ${width}x${height}`,
    language: "svg",
  };
}

export function generateGraphQL(schema: string): ArtifactSpec {
  return {
    name: "schema",
    kind: "graphql",
    content: schema,
    description: "GraphQL schema",
    language: "graphql",
  };
}

export function generateGitignore(
  entries: string[] = ["node_modules", ".env", "dist", ".next"],
): ArtifactSpec {
  return {
    name: ".gitignore",
    kind: "gitignore",
    content: entries.join("\n"),
    description: "Git ignore file",
    language: "text",
  };
}

export function generateConfig(
  format: "toml" | "ini" | "yaml" | "json",
  data: Record<string, unknown>,
  name = "config",
): ArtifactSpec {
  const kind = format as ArtifactKind;
  let content = "";
  if (format === "json") content = JSON.stringify(data, null, 2);
  else if (format === "yaml") content = yamlStringify(data);
  else if (format === "toml") content = tomlStringify(data);
  else if (format === "ini") content = iniStringify(data);
  return { name, kind, content, description: `Config (${format})`, language: format };
}

function yamlStringify(data: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  return Object.entries(data)
    .map(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v))
        return `${pad}${k}:\n${yamlStringify(v as Record<string, unknown>, indent + 1)}`;
      if (Array.isArray(v))
        return `${pad}${k}:\n${v.map((item) => `${pad}  - ${item}`).join("\n")}`;
      return `${pad}${k}: ${v}`;
    })
    .join("\n");
}

function tomlStringify(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v))
        return `[${k}]\n${Object.entries(v as Record<string, unknown>)
          .map(([ik, iv]) => `${ik} = ${typeof iv === "string" ? `"${iv}"` : iv}`)
          .join("\n")}`;
      return `${k} = ${typeof v === "string" ? `"${v}"` : v}`;
    })
    .join("\n");
}

function iniStringify(data: Record<string, unknown>): string {
  return Object.entries(data)
    .map(([k, v]) => {
      if (v && typeof v === "object" && !Array.isArray(v))
        return `[${k}]\n${Object.entries(v as Record<string, unknown>)
          .map(([ik, iv]) => `${ik} = ${iv}`)
          .join("\n")}`;
      return `${k} = ${v}`;
    })
    .join("\n");
}

export function generateShellScript(commands: string[], name = "script"): ArtifactSpec {
  return {
    name,
    kind: "sh",
    content: `#!/bin/bash\nset -euo pipefail\n\n${commands.join("\n")}\n`,
    description: `Shell script`,
    language: "bash",
  };
}

export function generatePythonScript(code: string, name = "script"): ArtifactSpec {
  return {
    name,
    kind: "py",
    content: `#!/usr/bin/env python3\n"""Generated by DivergenceIQ Artifact Creator."""\n\n${code}\n`,
    description: "Python script",
    language: "python",
  };
}

export function generateTypeScriptModule(
  name: string,
  exports: { name: string; type: string; body: string }[],
): ArtifactSpec {
  return {
    name,
    kind: "ts",
    content: exports.map((e) => `${e.type} ${e.name} ${e.body}`).join("\n\n"),
    description: `TS module`,
    language: "typescript",
  };
}

export const ARTIFACT_GENERATORS = {
  generateJSON,
  generateCSV,
  generateHTML,
  generateComponent,
  generateAPI,
  generateSQL,
  generateDockerfile,
  generateDockerCompose,
  generateEnv,
  generateMarkdown,
  generateSVG,
  generateGraphQL,
  generateGitignore,
  generateConfig,
  generateShellScript,
  generatePythonScript,
  generateTypeScriptModule,
};

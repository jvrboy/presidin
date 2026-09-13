// Development Skills — Skills powering the chat agent's dev/backend/artifact capabilities.
// These skills let the chat agent generate files, run code, test APIs, generate schemas,
// create deployment configs, and perform advanced code operations.

import type { Skill, SkillCategory, SkillContext, SkillResult } from "@/lib/skills/list";
import {
  createArtifact,
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
  generateGitignore,
  generateConfig,
  generateShellScript,
  generatePythonScript,
  generateTypeScriptModule,
  type ArtifactKind,
} from "@/lib/tools/artifact-creator";
import {
  testAPI,
  generateSupabaseSchema,
  generatePrismaSchema,
  generateVercelConfig,
  generateNetlifyConfig,
  generateK8sManifest,
  generateOpenAPISpec,
  generatePostmanCollection,
  generateGitHubActions,
  generateEnvTemplate,
  compareEnvs,
  generateWebhookPayload,
  healthCheck,
} from "@/lib/tools/backend-tools";
import {
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
} from "@/lib/tools/code-runner";
import { runWithAutoCorrect } from "@/lib/executor";

export type DevSkillCategory =
  | "File Generation"
  | "Code Tooling"
  | "Backend & API"
  | "Database"
  | "DevOps"
  | "Documentation"
  | "Debugging"
  | "Automation";

export const DEV_SKILLS: Skill[] = [
  // ============ File Generation ============
  {
    id: "create-json-file",
    name: "Create JSON File",
    category: "File Generation" as SkillCategory,
    description: "Generate a structured JSON file from a description or data.",
    trigger: "keyword",
    keywords: ["create json", "generate json", "make json", "json file"],
    exec: async ({ args }) => {
      const data = args?.data || { example: "value", items: [1, 2, 3] };
      const spec = generateJSON(data, (args?.name as string) || "data");
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated JSON: ${artifact.name}.${artifact.extension} (${artifact.bytes} bytes)`,
        artifact: { name: artifact.name, kind: "json", content: artifact.content },
      };
    },
  },
  {
    id: "create-csv-file",
    name: "Create CSV File",
    category: "File Generation" as SkillCategory,
    description: "Generate a CSV file from rows of data.",
    trigger: "keyword",
    keywords: ["create csv", "generate csv", "make csv", "csv file", "spreadsheet"],
    exec: async ({ args }) => {
      const rows = (args?.rows as Record<string, unknown>[]) || [
        { id: 1, name: "Example", value: 100 },
      ];
      const spec = generateCSV(rows, (args?.name as string) || "data");
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated CSV: ${artifact.name}.${artifact.extension} (${rows.length} rows)`,
        artifact: { name: artifact.name, kind: "csv", content: artifact.content },
      };
    },
  },
  {
    id: "create-html-page",
    name: "Create HTML Page",
    category: "File Generation" as SkillCategory,
    description: "Generate a complete HTML page with styling.",
    trigger: "keyword",
    keywords: ["create html", "generate html", "make html", "html page", "web page"],
    exec: async ({ args }) => {
      const title = (args?.title as string) || "Generated Page";
      const body = (args?.body as string) || '<div class="card"><p>Content goes here</p></div>';
      const spec = generateHTML(title, body);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated HTML: ${artifact.name}.${artifact.extension}`,
        artifact: { name: artifact.name, kind: "html", content: artifact.content },
      };
    },
  },
  {
    id: "create-react-component",
    name: "Create React Component",
    category: "File Generation" as SkillCategory,
    description: "Generate a React component with hooks and TypeScript.",
    trigger: "keyword",
    keywords: ["create component", "react component", "make component", "generate component"],
    exec: async ({ args }) => {
      const name = (args?.name as string) || "MyComponent";
      const spec = generateComponent(name, "react");
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated React component: ${name}`,
        artifact: { name: artifact.name, kind: "tsx", content: artifact.content },
      };
    },
  },
  {
    id: "create-env-file",
    name: "Create Environment File",
    category: "File Generation" as SkillCategory,
    description: "Generate an .env file with specified variables.",
    trigger: "keyword",
    keywords: ["create env", "generate env", "env file", "environment file", "dotenv"],
    exec: async ({ args }) => {
      const vars = (args?.vars as Record<string, string>) || {
        DATABASE_URL: "",
        API_KEY: "",
        SECRET: "",
      };
      const spec = generateEnv(vars);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated .env file with ${Object.keys(vars).length} variables`,
        artifact: { name: artifact.name, kind: "env", content: artifact.content },
      };
    },
  },
  {
    id: "create-dockerfile",
    name: "Create Dockerfile",
    category: "File Generation" as SkillCategory,
    description: "Generate a Dockerfile for containerized deployment.",
    trigger: "keyword",
    keywords: ["create dockerfile", "generate dockerfile", "docker", "containerize"],
    exec: async ({ args }) => {
      const baseImage = (args?.baseImage as string) || "node:20-slim";
      const port = Number(args?.port) || 3000;
      const spec = generateDockerfile(baseImage, port);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated Dockerfile for ${baseImage} on port ${port}`,
        artifact: { name: artifact.name, kind: "dockerfile", content: artifact.content },
      };
    },
  },
  {
    id: "create-docker-compose",
    name: "Create Docker Compose",
    category: "File Generation" as SkillCategory,
    description: "Generate a docker-compose.yml with multiple services.",
    trigger: "keyword",
    keywords: ["docker compose", "docker-compose", "compose file", "multi container"],
    exec: async ({ args }) => {
      const services = (args?.services as { name: string; image: string; ports?: number[] }[]) || [
        { name: "app", image: "node:20-slim", ports: [3000] },
        { name: "db", image: "postgres:16", ports: [5432] },
      ];
      const spec = generateDockerCompose(services);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated docker-compose.yml with ${services.length} services`,
        artifact: { name: artifact.name, kind: "yaml", content: artifact.content },
      };
    },
  },
  {
    id: "create-markdown",
    name: "Create Markdown Document",
    category: "File Generation" as SkillCategory,
    description: "Generate a structured Markdown document with sections.",
    trigger: "keyword",
    keywords: ["create markdown", "generate markdown", "make md", "documentation", "readme"],
    exec: async ({ args }) => {
      const title = (args?.title as string) || "Document";
      const sections = (args?.sections as { heading: string; body: string }[]) || [
        { heading: "Overview", body: "This document was generated by DivergenceIQ." },
        { heading: "Usage", body: "See the instructions below." },
      ];
      const spec = generateMarkdown(title, sections);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated Markdown: ${title}`,
        artifact: { name: artifact.name, kind: "md", content: artifact.content },
      };
    },
  },
  {
    id: "create-gitignore",
    name: "Create .gitignore",
    category: "File Generation" as SkillCategory,
    description: "Generate a .gitignore file for common project types.",
    trigger: "keyword",
    keywords: ["gitignore", "git ignore", "ignore file"],
    exec: async ({ args }) => {
      const entries = (args?.entries as string[]) || [
        "node_modules",
        ".env",
        "dist",
        ".next",
        "*.log",
        ".DS_Store",
      ];
      const spec = generateGitignore(entries);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated .gitignore with ${entries.length} entries`,
        artifact: { name: artifact.name, kind: "gitignore", content: artifact.content },
      };
    },
  },
  {
    id: "create-shell-script",
    name: "Create Shell Script",
    category: "File Generation" as SkillCategory,
    description: "Generate a bash shell script with error handling.",
    trigger: "keyword",
    keywords: ["shell script", "bash script", "create script", "shell"],
    exec: async ({ args }) => {
      const commands = (args?.commands as string[]) || [
        "echo 'Hello World'",
        "npm install",
        "npm run build",
      ];
      const spec = generateShellScript(commands);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated shell script with ${commands.length} commands`,
        artifact: { name: artifact.name, kind: "sh", content: artifact.content },
      };
    },
  },
  {
    id: "create-python-script",
    name: "Create Python Script",
    category: "File Generation" as SkillCategory,
    description: "Generate a Python script with standard structure.",
    trigger: "keyword",
    keywords: ["python script", "create python", "generate python", "py file"],
    exec: async ({ args }) => {
      const code =
        (args?.code as string) ||
        "def main():\n    print('Hello from DivergenceIQ')\n\nif __name__ == '__main__':\n    main()";
      const spec = generatePythonScript(code);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated Python script`,
        artifact: { name: artifact.name, kind: "py", content: artifact.content },
      };
    },
  },
  {
    id: "create-svg",
    name: "Create SVG Diagram",
    category: "File Generation" as SkillCategory,
    description: "Generate an SVG diagram with shapes.",
    trigger: "keyword",
    keywords: ["create svg", "generate svg", "svg diagram", "vector graphic"],
    exec: async ({ args }) => {
      const width = Number(args?.width) || 400;
      const height = Number(args?.height) || 300;
      const shapes = (args?.shapes as string[]) || [
        `<rect x="50" y="50" width="100" height="80" fill="#3b82f6" rx="8" />`,
        `<circle cx="250" cy="100" r="50" fill="#10b981" />`,
        `<text x="200" y="250" text-anchor="middle" fill="#fff" font-size="16">DivergenceIQ</text>`,
      ];
      const spec = generateSVG(width, height, shapes);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated SVG ${width}x${height}`,
        artifact: { name: artifact.name, kind: "svg", content: artifact.content },
      };
    },
  },

  // ============ Code Tooling ============
  {
    id: "run-code",
    name: "Run Code",
    category: "Code Tooling" as SkillCategory,
    description:
      "Execute JavaScript, TypeScript, HTML, CSS, JSON, or Python code with auto-correction.",
    trigger: "keyword",
    keywords: [
      "run code",
      "execute code",
      "run javascript",
      "run python",
      "run typescript",
      "code runner",
    ],
    exec: async ({ args }) => {
      const language = (args?.language as string) || "js";
      const code = (args?.code as string) || "console.log('Hello from DivergenceIQ');";
      if (language === "js") {
        const result = runJS(code);
        return { ok: result.ok, output: result.stdout || result.stderr, error: result.error };
      }
      const result = await runWithAutoCorrect({ language: language as never, code });
      return { ok: result.ok, output: result.output || result.error, error: result.error };
    },
  },
  {
    id: "analyze-code",
    name: "Analyze Code",
    category: "Code Tooling" as SkillCategory,
    description: "Analyze code for stats, complexity, functions, classes, and imports.",
    trigger: "keyword",
    keywords: ["analyze code", "code stats", "code analysis", "code metrics", "complexity"],
    exec: async ({ args }) => {
      const code = (args?.code as string) || "function hello() { console.log('hi'); }";
      const stats = analyzeCode(code);
      return {
        ok: true,
        output: `Code Analysis:\n  Lines: ${stats.lines}\n  Lines of Code: ${stats.linesOfCode}\n  Blank: ${stats.blankLines}\n  Comments: ${stats.commentLines}\n  Characters: ${stats.characters}\n  Words: ${stats.words}\n  Functions: ${stats.functions}\n  Classes: ${stats.classes}\n  Imports: ${stats.imports}\n  Cyclomatic Complexity: ${stats.complexity}`,
      };
    },
  },
  {
    id: "minify-code",
    name: "Minify Code",
    category: "Code Tooling" as SkillCategory,
    description: "Minify JavaScript, CSS, or HTML code.",
    trigger: "keyword",
    keywords: ["minify", "compress code", "uglify", "minify js", "minify css", "minify html"],
    exec: async ({ args }) => {
      const type = (args?.type as string) || "js";
      const code = (args?.code as string) || "function  hello ( ) {  console.log( 'hi' ) ;  }";
      const minified =
        type === "css" ? minifyCSS(code) : type === "html" ? minifyHTML(code) : minifyJS(code);
      const saved = Math.round((1 - minified.length / code.length) * 100);
      return {
        ok: true,
        output: `Minified ${type.toUpperCase()}: ${code.length} -> ${minified.length} bytes (${saved}% reduction)\n\n${minified}`,
      };
    },
  },
  {
    id: "format-json",
    name: "Format JSON",
    category: "Code Tooling" as SkillCategory,
    description: "Pretty-print and validate JSON.",
    trigger: "keyword",
    keywords: ["format json", "pretty json", "beautify json", "validate json"],
    exec: async ({ args }) => {
      const code = (args?.code as string) || '{"name":"test","value":123}';
      const formatted = formatJSON(code);
      return { ok: true, output: `Formatted JSON:\n\n${formatted}` };
    },
  },
  {
    id: "convert-ts-to-js",
    name: "Convert TS to JS",
    category: "Code Tooling" as SkillCategory,
    description: "Strip TypeScript types and convert to JavaScript.",
    trigger: "keyword",
    keywords: ["ts to js", "typescript to javascript", "strip types", "convert ts"],
    exec: async ({ args }) => {
      const code =
        (args?.code as string) || "function add(a: number, b: number): number { return a + b; }";
      const js = tsToJs(code);
      return { ok: true, output: `Converted TS -> JS:\n\n${js}` };
    },
  },
  {
    id: "test-regex",
    name: "Test Regex",
    category: "Code Tooling" as SkillCategory,
    description: "Test a regular expression against a string and show matches.",
    trigger: "keyword",
    keywords: ["regex", "regexp", "test regex", "regular expression", "pattern match"],
    exec: async ({ args }) => {
      const pattern = (args?.pattern as string) || "\\d+";
      const flags = (args?.flags as string) || "g";
      const testStr = (args?.testString as string) || "Hello 123 World 456";
      const result = testRegex(pattern, flags, testStr);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        output: `Pattern: /${pattern}/${flags}\nString: "${testStr}"\nMatches: ${result.matches.length}\n${result.matches.map((m, i) => `  [${i}] "${m.match}" at index ${m.index}`).join("\n")}`,
      };
    },
  },
  {
    id: "encode-decode",
    name: "Encode/Decode",
    category: "Code Tooling" as SkillCategory,
    description: "Base64 encode/decode or URL encode/decode.",
    trigger: "keyword",
    keywords: ["base64", "encode", "decode", "url encode", "url decode"],
    exec: async ({ args }) => {
      const op = (args?.op as string) || "base64-encode";
      const input = (args?.input as string) || "Hello World";
      const output =
        op === "base64-encode"
          ? encodeBase64(input)
          : op === "base64-decode"
            ? decodeBase64(input)
            : op === "url-encode"
              ? urlEncode(input)
              : urlDecode(input);
      return { ok: true, output: `${op}: "${input}" -> "${output}"` };
    },
  },
  {
    id: "generate-hash",
    name: "Generate Hash",
    category: "Code Tooling" as SkillCategory,
    description: "Generate SHA-1, SHA-256, SHA-384, or SHA-512 hash of text.",
    trigger: "keyword",
    keywords: ["hash", "sha256", "sha1", "checksum", "generate hash"],
    exec: async ({ args }) => {
      const text = (args?.text as string) || "Hello DivergenceIQ";
      const algo = (args?.algorithm as "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512") || "SHA-256";
      const hash = await hashText(text, algo);
      return { ok: true, output: `${algo} hash of "${text}":\n${hash}` };
    },
  },
  {
    id: "generate-uuids",
    name: "Generate UUIDs",
    category: "Code Tooling" as SkillCategory,
    description: "Generate one or more UUID v4 values.",
    trigger: "keyword",
    keywords: ["uuid", "guid", "generate uuid", "unique id"],
    exec: async ({ args }) => {
      const count = Number(args?.count) || 5;
      const uuids = generateUUIDs(count);
      return {
        ok: true,
        output: `Generated ${count} UUIDs:\n${uuids.map((u) => `  ${u}`).join("\n")}`,
      };
    },
  },

  // ============ Backend & API ============
  {
    id: "test-api",
    name: "Test API",
    category: "Backend & API" as SkillCategory,
    description: "Send an HTTP request to an API endpoint and get the response.",
    trigger: "keyword",
    keywords: ["test api", "api test", "fetch url", "http request", "call api"],
    exec: async ({ args }) => {
      const url = (args?.url as string) || "https://jsonplaceholder.typicode.com/todos/1";
      const method = (args?.method as string) || "GET";
      const result = await testAPI(
        url,
        method,
        args?.body,
        args?.headers as Record<string, string>,
      );
      return {
        ok: result.ok,
        output: `API Test: ${method} ${url}\nStatus: ${result.status} ${result.statusText}\nDuration: ${result.durationMs.toFixed(0)}ms\nResponse: ${JSON.stringify(result.data, null, 2)?.slice(0, 500)}`,
      };
    },
  },
  {
    id: "health-check",
    name: "Health Check",
    category: "Backend & API" as SkillCategory,
    description: "Check if a URL is responding and measure response time.",
    trigger: "keyword",
    keywords: ["health check", "ping url", "is it up", "uptime check"],
    exec: async ({ args }) => {
      const url = (args?.url as string) || "https://api.github.com";
      const result = await healthCheck(url);
      return {
        ok: result.ok,
        output: `Health Check: ${url}\nStatus: ${result.status || "UNREACHABLE"}\nResponse Time: ${result.responseTime}ms\nTimestamp: ${new Date(result.timestamp).toISOString()}`,
      };
    },
  },
  {
    id: "generate-openapi",
    name: "Generate OpenAPI Spec",
    category: "Backend & API" as SkillCategory,
    description: "Generate an OpenAPI 3.0 specification from endpoint definitions.",
    trigger: "keyword",
    keywords: ["openapi", "swagger", "api spec", "api documentation", "openapi spec"],
    exec: async ({ args }) => {
      const title = (args?.title as string) || "My API";
      const version = (args?.version as string) || "1.0.0";
      const endpoints = (args?.endpoints as {
        method: string;
        path: string;
        description: string;
        auth: boolean;
      }[]) || [
        { method: "GET", path: "/users", description: "List all users", auth: true },
        { method: "POST", path: "/users", description: "Create a user", auth: true },
      ];
      const spec = generateOpenAPISpec(title, version, endpoints as never);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated OpenAPI spec with ${endpoints.length} endpoints`,
        artifact: { name: artifact.name, kind: "json", content: artifact.content },
      };
    },
  },
  {
    id: "generate-postman",
    name: "Generate Postman Collection",
    category: "Backend & API" as SkillCategory,
    description: "Generate a Postman collection JSON from endpoint definitions.",
    trigger: "keyword",
    keywords: ["postman", "postman collection", "api collection"],
    exec: async ({ args }) => {
      const name = (args?.name as string) || "My API";
      const endpoints = (args?.endpoints as {
        method: string;
        path: string;
        description: string;
        auth: boolean;
      }[]) || [{ method: "GET", path: "/health", description: "Health check", auth: false }];
      const spec = generatePostmanCollection(name, endpoints as never);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated Postman collection: ${name}`,
        artifact: { name: artifact.name, kind: "json", content: artifact.content },
      };
    },
  },
  {
    id: "generate-webhook-payload",
    name: "Generate Webhook Payload",
    category: "Backend & API" as SkillCategory,
    description: "Generate a sample webhook payload for testing.",
    trigger: "keyword",
    keywords: ["webhook", "webhook payload", "webhook test", "event payload"],
    exec: async ({ args }) => {
      const event = (args?.event as string) || "user.created";
      const data = args?.data || { id: "123", email: "user@example.com" };
      const spec = generateWebhookPayload(event, data);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated webhook payload for "${event}" event`,
        artifact: { name: artifact.name, kind: "json", content: artifact.content },
      };
    },
  },

  // ============ Database ============
  {
    id: "generate-sql-schema",
    name: "Generate SQL Schema",
    category: "Database" as SkillCategory,
    description: "Generate a SQL schema with CREATE TABLE and RLS policies.",
    trigger: "keyword",
    keywords: ["sql schema", "create table", "database schema", "sql", "ddl"],
    exec: async ({ args }) => {
      const table = (args?.table as string) || "users";
      const columns = (args?.columns as { name: string; type: string; nullable?: boolean }[]) || [
        { name: "email", type: "TEXT", nullable: false },
        { name: "name", type: "TEXT" },
        { name: "role", type: "TEXT", nullable: false },
      ];
      const spec = generateSQL(table, columns);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated SQL schema for table "${table}" with RLS policies`,
        artifact: { name: artifact.name, kind: "sql", content: artifact.content },
      };
    },
  },
  {
    id: "generate-supabase-schema",
    name: "Generate Supabase Schema",
    category: "Database" as SkillCategory,
    description: "Generate a complete Supabase schema with RLS for multiple tables.",
    trigger: "keyword",
    keywords: ["supabase schema", "supabase migration", "supabase rls", "supabase"],
    exec: async ({ args }) => {
      const tables = (args?.tables as {
        table: string;
        columns: { name: string; type: string; nullable?: boolean; primary?: boolean }[];
      }[]) || [
        {
          table: "profiles",
          columns: [
            { name: "user_id", type: "UUID", primary: true },
            { name: "username", type: "TEXT", nullable: false },
          ],
        },
        {
          table: "posts",
          columns: [
            { name: "user_id", type: "UUID", nullable: false },
            { name: "title", type: "TEXT", nullable: false },
            { name: "body", type: "TEXT" },
          ],
        },
      ];
      const spec = generateSupabaseSchema(tables as never);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated Supabase schema with ${tables.length} tables and RLS`,
        artifact: { name: artifact.name, kind: "sql", content: artifact.content },
      };
    },
  },
  {
    id: "generate-prisma-schema",
    name: "Generate Prisma Schema",
    category: "Database" as SkillCategory,
    description: "Generate a Prisma schema file from table definitions.",
    trigger: "keyword",
    keywords: ["prisma", "prisma schema", "orm schema", "prisma model"],
    exec: async ({ args }) => {
      const tables = (args?.tables as {
        table: string;
        columns: { name: string; type: string; primary?: boolean; unique?: boolean }[];
      }[]) || [
        {
          table: "User",
          columns: [
            { name: "id", type: "String", primary: true },
            { name: "email", type: "String", unique: true },
          ],
        },
      ];
      const spec = generatePrismaSchema(tables as never);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated Prisma schema with ${tables.length} models`,
        artifact: { name: artifact.name, kind: "txt", content: artifact.content },
      };
    },
  },

  // ============ DevOps ============
  {
    id: "generate-vercel-config",
    name: "Generate Vercel Config",
    category: "DevOps" as SkillCategory,
    description: "Generate a vercel.json deployment configuration.",
    trigger: "keyword",
    keywords: ["vercel config", "vercel.json", "deploy to vercel", "vercel deployment"],
    exec: async ({ args }) => {
      const config = {
        platform: "vercel" as const,
        env: (args?.env as Record<string, string>) || {
          NEXT_PUBLIC_API_URL: "https://api.example.com",
        },
        buildCommand: (args?.buildCommand as string) || "npm run build",
        outputDir: (args?.outputDir as string) || "dist",
      };
      const spec = generateVercelConfig(config);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated vercel.json config`,
        artifact: { name: artifact.name, kind: "json", content: artifact.content },
      };
    },
  },
  {
    id: "generate-netlify-config",
    name: "Generate Netlify Config",
    category: "DevOps" as SkillCategory,
    description: "Generate a netlify.toml deployment configuration.",
    trigger: "keyword",
    keywords: ["netlify config", "netlify.toml", "deploy to netlify", "netlify"],
    exec: async ({ args }) => {
      const config = {
        platform: "netlify" as const,
        env: {},
        buildCommand: (args?.buildCommand as string) || "npm run build",
        outputDir: (args?.outputDir as string) || "dist",
      };
      const spec = generateNetlifyConfig(config);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated netlify.toml config`,
        artifact: { name: artifact.name, kind: "toml", content: artifact.content },
      };
    },
  },
  {
    id: "generate-k8s-manifest",
    name: "Generate K8s Manifest",
    category: "DevOps" as SkillCategory,
    description: "Generate a Kubernetes manifest with Deployment, Service, and HPA.",
    trigger: "keyword",
    keywords: ["kubernetes", "k8s", "k8s manifest", "kubernetes deployment", "kubectl"],
    exec: async ({ args }) => {
      const appName = (args?.appName as string) || "my-app";
      const image = (args?.image as string) || "my-registry/my-app:latest";
      const port = Number(args?.port) || 3000;
      const replicas = Number(args?.replicas) || 3;
      const spec = generateK8sManifest(appName, image, port, replicas);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated K8s manifest for ${appName} (${replicas} replicas)`,
        artifact: { name: artifact.name, kind: "yaml", content: artifact.content },
      };
    },
  },
  {
    id: "generate-github-actions",
    name: "Generate GitHub Actions",
    category: "DevOps" as SkillCategory,
    description: "Generate a GitHub Actions CI/CD workflow YAML.",
    trigger: "keyword",
    keywords: ["github actions", "ci cd", "ci/cd pipeline", "github workflow", "actions"],
    exec: async ({ args }) => {
      const name = (args?.name as string) || "CI";
      const on = (args?.on as string) || "push:\n    branches: [main]";
      const steps = (args?.steps as { name: string; run: string; uses?: string }[]) || [
        { name: "Checkout", uses: "actions/checkout@v4" },
        { name: "Setup Node", uses: "actions/setup-node@v4" },
        { name: "Install", run: "npm ci" },
        { name: "Build", run: "npm run build" },
        { name: "Test", run: "npm test" },
      ];
      const spec = generateGitHubActions({ name, on, steps });
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated GitHub Actions workflow: ${name}`,
        artifact: { name: artifact.name, kind: "yaml", content: artifact.content },
      };
    },
  },
  {
    id: "generate-env-template",
    name: "Generate .env Template",
    category: "DevOps" as SkillCategory,
    description: "Generate an .env.example template with empty values.",
    trigger: "keyword",
    keywords: ["env template", "env example", "dotenv template", ".env.example"],
    exec: async ({ args }) => {
      const keys = (args?.keys as string[]) || [
        "DATABASE_URL",
        "API_KEY",
        "SECRET_KEY",
        "PORT",
        "NODE_ENV",
      ];
      const spec = generateEnvTemplate(keys);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated .env.example with ${keys.length} variables`,
        artifact: { name: artifact.name, kind: "env", content: artifact.content },
      };
    },
  },
  {
    id: "compare-envs",
    name: "Compare Environments",
    category: "DevOps" as SkillCategory,
    description: "Compare two .env files and find missing, extra, or different values.",
    trigger: "keyword",
    keywords: ["compare env", "env diff", "environment diff", "env comparison"],
    exec: async ({ args }) => {
      const env1 = (args?.env1 as string) || "API_KEY=abc\nPORT=3000";
      const env2 = (args?.env2 as string) || "API_KEY=xyz\nPORT=3000\nDB_URL=localhost";
      const result = compareEnvs(env1, env2);
      return {
        ok: true,
        output: `Env Comparison:\n  Missing in env1: ${result.missing.join(", ") || "none"}\n  Extra in env1: ${result.extra.join(", ") || "none"}\n  Different values: ${result.different.map((d) => `${d.key} (${d.val1} vs ${d.val2})`).join(", ") || "none"}`,
      };
    },
  },

  // ============ API & Module Generation ============
  {
    id: "generate-api-endpoint",
    name: "Generate API Endpoint",
    category: "File Generation" as SkillCategory,
    description: "Generate a TypeScript API endpoint function with types.",
    trigger: "keyword",
    keywords: ["api endpoint", "generate api", "create endpoint", "fetch wrapper"],
    exec: async ({ args }) => {
      const endpoint = (args?.endpoint as string) || "users";
      const method = (args?.method as string) || "POST";
      const fields = (args?.fields as { name: string; type: string }[]) || [
        { name: "email", type: "string" },
        { name: "password", type: "string" },
      ];
      const spec = generateAPI(endpoint, method, fields);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated API endpoint: ${method.toUpperCase()} /${endpoint}`,
        artifact: { name: artifact.name, kind: "ts", content: artifact.content },
      };
    },
  },
  {
    id: "generate-ts-module",
    name: "Generate TypeScript Module",
    category: "File Generation" as SkillCategory,
    description: "Generate a TypeScript module with exports.",
    trigger: "keyword",
    keywords: ["typescript module", "ts module", "generate module", "ts file"],
    exec: async ({ args }) => {
      const name = (args?.name as string) || "utils";
      const exports = (args?.exports as { name: string; type: string; body: string }[]) || [
        {
          name: "formatDate",
          type: "export function",
          body: "(date: Date): string { return date.toISOString(); }",
        },
        { name: "MAX_RETRIES", type: "export const", body: "= 3;" },
      ];
      const spec = generateTypeScriptModule(name, exports);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated TypeScript module: ${name} (${exports.length} exports)`,
        artifact: { name: artifact.name, kind: "ts", content: artifact.content },
      };
    },
  },
  {
    id: "generate-config-file",
    name: "Generate Config File",
    category: "File Generation" as SkillCategory,
    description: "Generate a config file in TOML, INI, YAML, or JSON format.",
    trigger: "keyword",
    keywords: ["config file", "generate config", "toml config", "yaml config", "ini config"],
    exec: async ({ args }) => {
      const format = (args?.format as "toml" | "ini" | "yaml" | "json") || "yaml";
      const data = (args?.data as Record<string, unknown>) || {
        server: { port: 3000, host: "0.0.0.0" },
        database: { url: "postgres://localhost/mydb" },
      };
      const spec = generateConfig(format, data);
      const artifact = createArtifact(spec);
      return {
        ok: true,
        output: `Generated ${format.toUpperCase()} config file`,
        artifact: { name: artifact.name, kind: format as ArtifactKind, content: artifact.content },
      };
    },
  },
];

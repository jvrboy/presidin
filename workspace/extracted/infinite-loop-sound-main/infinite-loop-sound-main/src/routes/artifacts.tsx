import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { useState } from "react";
import { ProCard, SectionHeader, KpiGrid } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Download,
  Copy,
  Trash,
  FileJson,
  FileCode,
  FileTerminal,
  Database,
  Container,
  Settings,
  FileSpreadsheet,
  Globe,
  Braces,
  Hash,
  FileType,
  Package,
} from "lucide-react";
import {
  createArtifact,
  downloadArtifact,
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
  type GeneratedArtifact,
  type ArtifactKind,
} from "@/lib/tools/artifact-creator";
import {
  generateSupabaseSchema,
  generatePrismaSchema,
  generateVercelConfig,
  generateNetlifyConfig,
  generateK8sManifest,
  generateOpenAPISpec,
  generatePostmanCollection,
  generateGitHubActions,
  generateEnvTemplate,
} from "@/lib/tools/backend-tools";

export const Route = createFileRoute("/artifacts")({
  head: () => ({
    meta: [
      { title: "Artifact Creator — DivergenceIQ" },
      {
        name: "description",
        content:
          "Create any type of file: JSON, CSV, HTML, SQL, Dockerfile, K8s manifests, OpenAPI specs, and more.",
      },
    ],
  }),
  component: ArtifactsPage,
});

interface ArtifactTemplate {
  id: string;
  name: string;
  kind: ArtifactKind;
  icon: React.ReactNode;
  description: string;
  generate: () => ReturnType<typeof createArtifact>;
}

function ArtifactsPage() {
  const [artifacts, setArtifacts] = useState<GeneratedArtifact[]>([]);
  const [selected, setSelected] = useState<GeneratedArtifact | null>(null);

  const templates: ArtifactTemplate[] = [
    {
      id: "json",
      name: "JSON File",
      kind: "json",
      icon: <FileJson className="w-4 h-4" />,
      description: "Generate a structured JSON file",
      generate: () =>
        createArtifact(
          generateJSON({
            name: "DivergenceIQ",
            version: "1.0.0",
            features: ["audio", "chat", "tools"],
          }),
        ),
    },
    {
      id: "csv",
      name: "CSV File",
      kind: "csv",
      icon: <FileSpreadsheet className="w-4 h-4" />,
      description: "Generate a CSV from sample data",
      generate: () =>
        createArtifact(
          generateCSV([
            { id: 1, name: "Alpha", value: 100, category: "A" },
            { id: 2, name: "Beta", value: 200, category: "B" },
            { id: 3, name: "Gamma", value: 300, category: "A" },
          ]),
        ),
    },
    {
      id: "html",
      name: "HTML Page",
      kind: "html",
      icon: <Globe className="w-4 h-4" />,
      description: "Generate a complete HTML page",
      generate: () =>
        createArtifact(
          generateHTML("Generated Page", '<div class="card"><p>Content goes here</p></div>'),
        ),
    },
    {
      id: "react",
      name: "React Component",
      kind: "ts",
      icon: <FileCode className="w-4 h-4" />,
      description: "Generate a React component",
      generate: () => createArtifact(generateComponent("MyComponent", "react")),
    },
    {
      id: "api",
      name: "API Endpoint",
      kind: "ts",
      icon: <Braces className="w-4 h-4" />,
      description: "Generate a typed API endpoint",
      generate: () =>
        createArtifact(
          generateAPI("users", "POST", [
            { name: "email", type: "string" },
            { name: "password", type: "string" },
          ]),
        ),
    },
    {
      id: "ts-module",
      name: "TS Module",
      kind: "ts",
      icon: <FileCode className="w-4 h-4" />,
      description: "Generate a TypeScript module",
      generate: () =>
        createArtifact(
          generateTypeScriptModule("utils", [
            {
              name: "formatDate",
              type: "export function",
              body: "(date: Date): string { return date.toISOString(); }",
            },
            { name: "MAX_RETRIES", type: "export const", body: "= 3;" },
          ]),
        ),
    },
    {
      id: "sql",
      name: "SQL Schema",
      kind: "sql",
      icon: <Database className="w-4 h-4" />,
      description: "Generate SQL with RLS policies",
      generate: () =>
        createArtifact(
          generateSQL("users", [
            { name: "email", type: "TEXT", nullable: false },
            { name: "name", type: "TEXT" },
            { name: "role", type: "TEXT", nullable: false },
          ]),
        ),
    },
    {
      id: "supabase",
      name: "Supabase Schema",
      kind: "sql",
      icon: <Database className="w-4 h-4" />,
      description: "Multi-table Supabase schema with RLS",
      generate: () =>
        createArtifact(
          generateSupabaseSchema([
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
          ] as never),
        ),
    },
    {
      id: "prisma",
      name: "Prisma Schema",
      kind: "txt",
      icon: <Database className="w-4 h-4" />,
      description: "Generate Prisma ORM schema",
      generate: () =>
        createArtifact(
          generatePrismaSchema([
            {
              table: "User",
              columns: [
                { name: "id", type: "String", primary: true },
                { name: "email", type: "String", unique: true },
              ],
            },
          ] as never),
        ),
    },
    {
      id: "dockerfile",
      name: "Dockerfile",
      kind: "dockerfile",
      icon: <Container className="w-4 h-4" />,
      description: "Generate a Dockerfile",
      generate: () => createArtifact(generateDockerfile("node:20-slim", 3000)),
    },
    {
      id: "docker-compose",
      name: "Docker Compose",
      kind: "yaml",
      icon: <Container className="w-4 h-4" />,
      description: "Multi-service docker-compose.yml",
      generate: () =>
        createArtifact(
          generateDockerCompose([
            { name: "app", image: "node:20-slim", ports: [3000] },
            { name: "db", image: "postgres:16", ports: [5432] },
          ]),
        ),
    },
    {
      id: "k8s",
      name: "K8s Manifest",
      kind: "yaml",
      icon: <Container className="w-4 h-4" />,
      description: "Kubernetes Deployment + Service + HPA",
      generate: () =>
        createArtifact(generateK8sManifest("my-app", "my-registry/my-app:latest", 3000, 3)),
    },
    {
      id: "vercel",
      name: "Vercel Config",
      kind: "json",
      icon: <Settings className="w-4 h-4" />,
      description: "Generate vercel.json",
      generate: () =>
        createArtifact(
          generateVercelConfig({
            platform: "vercel",
            env: { NEXT_PUBLIC_API_URL: "https://api.example.com" },
            buildCommand: "npm run build",
            outputDir: "dist",
          }),
        ),
    },
    {
      id: "netlify",
      name: "Netlify Config",
      kind: "toml",
      icon: <Settings className="w-4 h-4" />,
      description: "Generate netlify.toml",
      generate: () =>
        createArtifact(
          generateNetlifyConfig({
            platform: "netlify",
            env: {},
            buildCommand: "npm run build",
            outputDir: "dist",
          }),
        ),
    },
    {
      id: "openapi",
      name: "OpenAPI Spec",
      kind: "json",
      icon: <FileJson className="w-4 h-4" />,
      description: "OpenAPI 3.0 specification",
      generate: () =>
        createArtifact(
          generateOpenAPISpec("My API", "1.0.0", [
            { method: "GET", path: "/users", description: "List users", auth: true },
            { method: "POST", path: "/users", description: "Create user", auth: true },
            { method: "GET", path: "/health", description: "Health check", auth: false },
          ] as never),
        ),
    },
    {
      id: "postman",
      name: "Postman Collection",
      kind: "json",
      icon: <Package className="w-4 h-4" />,
      description: "Postman collection JSON",
      generate: () =>
        createArtifact(
          generatePostmanCollection("My API", [
            { method: "GET", path: "/health", description: "Health check", auth: false },
          ] as never),
        ),
    },
    {
      id: "github-actions",
      name: "GitHub Actions",
      kind: "yaml",
      icon: <FileTerminal className="w-4 h-4" />,
      description: "CI/CD workflow YAML",
      generate: () =>
        createArtifact(
          generateGitHubActions({
            name: "CI",
            on: "push:\n    branches: [main]",
            steps: [
              { name: "Checkout", uses: "actions/checkout@v4", run: "" },
              { name: "Setup Node", uses: "actions/setup-node@v4", run: "" },
              { name: "Install", run: "npm ci" },
              { name: "Build", run: "npm run build" },
              { name: "Test", run: "npm test" },
            ],
          }),
        ),
    },
    {
      id: "env",
      name: ".env File",
      kind: "env",
      icon: <Settings className="w-4 h-4" />,
      description: "Environment variables file",
      generate: () =>
        createArtifact(
          generateEnv({
            DATABASE_URL: "postgres://localhost/mydb",
            API_KEY: "your-key-here",
            SECRET: "your-secret",
            PORT: "3000",
          }),
        ),
    },
    {
      id: "env-template",
      name: ".env Template",
      kind: "env",
      icon: <Settings className="w-4 h-4" />,
      description: ".env.example with empty values",
      generate: () =>
        createArtifact(
          generateEnvTemplate(["DATABASE_URL", "API_KEY", "SECRET_KEY", "PORT", "NODE_ENV"]),
        ),
    },
    {
      id: "markdown",
      name: "Markdown Doc",
      kind: "md",
      icon: <FileText className="w-4 h-4" />,
      description: "Structured markdown document",
      generate: () =>
        createArtifact(
          generateMarkdown("README", [
            { heading: "Overview", body: "This project was generated by DivergenceIQ." },
            { heading: "Installation", body: "```bash\nnpm install\n```" },
            { heading: "Usage", body: "```bash\nnpm run dev\n```" },
          ]),
        ),
    },
    {
      id: "svg",
      name: "SVG Diagram",
      kind: "svg",
      icon: <FileType className="w-4 h-4" />,
      description: "SVG vector graphic",
      generate: () =>
        createArtifact(
          generateSVG(400, 300, [
            `<rect x="50" y="50" width="100" height="80" fill="#3b82f6" rx="8" />`,
            `<circle cx="250" cy="100" r="50" fill="#10b981" />`,
            `<text x="200" y="250" text-anchor="middle" fill="#fff" font-size="16">DivergenceIQ</text>`,
          ]),
        ),
    },
    {
      id: "gitignore",
      name: ".gitignore",
      kind: "gitignore",
      icon: <FileText className="w-4 h-4" />,
      description: "Git ignore file",
      generate: () =>
        createArtifact(
          generateGitignore(["node_modules", ".env", "dist", ".next", "*.log", ".DS_Store"]),
        ),
    },
    {
      id: "shell",
      name: "Shell Script",
      kind: "sh",
      icon: <FileTerminal className="w-4 h-4" />,
      description: "Bash script with error handling",
      generate: () =>
        createArtifact(
          generateShellScript([
            "echo 'Hello World'",
            "npm install",
            "npm run build",
            "echo 'Done!'",
          ]),
        ),
    },
    {
      id: "python",
      name: "Python Script",
      kind: "py",
      icon: <FileTerminal className="w-4 h-4" />,
      description: "Python script template",
      generate: () =>
        createArtifact(
          generatePythonScript(
            "def main():\n    print('Hello from DivergenceIQ')\n\nif __name__ == '__main__':\n    main()",
          ),
        ),
    },
    {
      id: "config-yaml",
      name: "YAML Config",
      kind: "yaml",
      icon: <Settings className="w-4 h-4" />,
      description: "YAML configuration file",
      generate: () =>
        createArtifact(
          generateConfig("yaml", {
            server: { port: 3000, host: "0.0.0.0" },
            database: { url: "postgres://localhost/mydb" },
          }),
        ),
    },
    {
      id: "config-toml",
      name: "TOML Config",
      kind: "toml",
      icon: <Settings className="w-4 h-4" />,
      description: "TOML configuration file",
      generate: () =>
        createArtifact(generateConfig("toml", { server: { port: 3000, host: "0.0.0.0" } })),
    },
  ];

  const handleGenerate = (template: ArtifactTemplate) => {
    const artifact = template.generate();
    setArtifacts((prev) => [artifact, ...prev]);
    setSelected(artifact);
  };

  const handleDownload = (artifact: GeneratedArtifact) => downloadArtifact(artifact);
  const handleDelete = (id: string) => {
    setArtifacts((prev) => prev.filter((a) => a.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
        <SectionHeader
          title="Artifact Creator"
          subtitle="Create any type of file: JSON, CSV, HTML, SQL, Dockerfile, K8s manifests, OpenAPI specs, and more."
          icon={<FileText className="w-5 h-5" />}
          action={<Badge variant="outline">{artifacts.length} artifacts</Badge>}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ProCard
              title="Templates"
              description="Click to generate a file artifact."
              icon={<Package className="w-4 h-4" />}
            >
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleGenerate(t)}
                    className="text-left rounded-lg border border-border bg-card p-3 hover:bg-card/80 hover:border-primary/50 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-primary group-hover:scale-110 transition-transform">
                        {t.icon}
                      </div>
                      <span className="text-xs font-semibold truncate">{t.name}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                      {t.description}
                    </p>
                  </button>
                ))}
              </div>
            </ProCard>
          </div>

          <ProCard
            title="Generated"
            description="Click to preview, download, or delete."
            icon={<FileText className="w-4 h-4" />}
          >
            {artifacts.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No artifacts yet. Generate one from the templates.
              </p>
            ) : (
              <div className="space-y-1 max-h-96 overflow-auto">
                {artifacts.map((a) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-2 p-2 rounded border transition-all cursor-pointer ${selected?.id === a.id ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-card/80"}`}
                    onClick={() => setSelected(a)}
                  >
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono truncate">
                        {a.name}.{a.extension}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {a.bytes}b · {a.lines} lines
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(a);
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(a.id);
                      }}
                    >
                      <Trash className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ProCard>
        </div>

        {selected && (
          <ProCard
            title={`Preview: ${selected.name}.${selected.extension}`}
            description={`${selected.bytes} bytes · ${selected.lines} lines · ${selected.mimeType}`}
            icon={<FileCode className="w-4 h-4" />}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDownload(selected)}>
                  <Download className="w-3 h-3" /> Download
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(selected.content)}
                >
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>
              <pre className="bg-[#0d0d0d] border border-border rounded-lg p-4 text-xs font-mono text-gray-100 overflow-auto max-h-96 whitespace-pre-wrap">
                {selected.content}
              </pre>
            </div>
          </ProCard>
        )}

        {artifacts.length > 0 && (
          <KpiGrid
            tiles={[
              { label: "Total Artifacts", value: String(artifacts.length) },
              {
                label: "Total Size",
                value: `${(artifacts.reduce((a, b) => a + b.bytes, 0) / 1024).toFixed(1)} KB`,
              },
              { label: "Total Lines", value: String(artifacts.reduce((a, b) => a + b.lines, 0)) },
              { label: "Types", value: String(new Set(artifacts.map((a) => a.kind)).size) },
            ]}
          />
        )}
      </div>
    </AppShell>
  );
}

// Backend Tools — Advanced backend, API, database, and DevOps tools.
// Provides: REST/GraphQL API testing, database schema generation,
// deployment config, environment management, and infrastructure-as-code.

import type { ArtifactSpec } from "./artifact-creator";

export interface APIEndpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  auth: boolean;
  rateLimit?: number;
}

export interface DBSchema {
  table: string;
  columns: {
    name: string;
    type: string;
    nullable?: boolean;
    primary?: boolean;
    unique?: boolean;
    references?: string;
  }[];
}

export interface DeployConfig {
  platform: "vercel" | "netlify" | "cloudflare" | "docker" | "k8s" | "railway" | "fly";
  env: Record<string, string>;
  buildCommand?: string;
  outputDir?: string;
  port?: number;
}

// ============ API Testing ============

export async function testAPI(
  url: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
  durationMs: number;
  headers: Record<string, string>;
}> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => res.text());
    const resHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      data,
      durationMs: performance.now() - t0,
      headers: resHeaders,
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      statusText: e instanceof Error ? e.message : "Network error",
      data: null,
      durationMs: performance.now() - t0,
      headers: {},
    };
  }
}

// ============ Database Schema Generation ============

export function generateSupabaseSchema(tables: DBSchema[]): ArtifactSpec {
  const schemas = tables
    .map((t) => {
      const cols = t.columns
        .map((c) => {
          let line = `  ${c.name} ${c.type}`;
          if (c.primary) line += " PRIMARY KEY DEFAULT gen_random_uuid()";
          if (c.nullable === false && !c.primary) line += " NOT NULL";
          if (c.unique) line += " UNIQUE";
          if (c.references) line += ` REFERENCES ${c.references}`;
          return line;
        })
        .join(",\n");
      return `CREATE TABLE IF NOT EXISTS ${t.table} (\n${cols},\n  created_at TIMESTAMPTZ DEFAULT now(),\n  updated_at TIMESTAMPTZ DEFAULT now()\n);\n\nALTER TABLE ${t.table} ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "select_own_${t.table}" ON ${t.table} FOR SELECT TO authenticated USING (auth.uid() = user_id);\nCREATE POLICY "insert_own_${t.table}" ON ${t.table} FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);\nCREATE POLICY "update_own_${t.table}" ON ${t.table} FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);\nCREATE POLICY "delete_own_${t.table}" ON ${t.table} FOR DELETE TO authenticated USING (auth.uid() = user_id);`;
    })
    .join("\n\n");
  return {
    name: "supabase-schema",
    kind: "sql",
    content: schemas,
    description: `Supabase schema with ${tables.length} tables`,
    language: "sql",
  };
}

export function generatePrismaSchema(tables: DBSchema[]): ArtifactSpec {
  const models = tables
    .map((t) => {
      const fields = t.columns
        .map((c) => {
          let line = `  ${c.name} ${c.type}`;
          if (c.primary) line += " @id @default(uuid())";
          if (c.unique) line += " @unique";
          if (c.references) line += ` @relation({ references: ["id"] })`;
          return line;
        })
        .join("\n");
      return `model ${t.table.charAt(0).toUpperCase() + t.table.slice(1)} {\n${fields}\n  createdAt DateTime @default(now())\n  updatedAt DateTime @updatedAt\n}`;
    })
    .join("\n\n");
  return {
    name: "schema",
    kind: "txt",
    content: `generator client {\n  provider = "prisma-client-js"\n}\n\ndatasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n${models}`,
    description: `Prisma schema with ${tables.length} models`,
    language: "text",
  };
}

// ============ Deployment Config Generation ============

export function generateVercelConfig(config: DeployConfig): ArtifactSpec {
  return {
    name: "vercel",
    kind: "json",
    content: JSON.stringify(
      {
        version: 2,
        builds: [{ src: config.outputDir || "dist", use: "@vercel/static-build" }],
        env: config.env,
        build: { command: config.buildCommand || "npm run build" },
      },
      null,
      2,
    ),
    description: "Vercel config",
    language: "json",
  };
}

export function generateNetlifyConfig(config: DeployConfig): ArtifactSpec {
  return {
    name: "netlify.toml",
    kind: "toml",
    content: `[build]\n  command = "${config.buildCommand || "npm run build"}"\n  publish = "${config.outputDir || "dist"}"\n\n[[redirects]]\n  from = "/*"\n  to = "/index.html"\n  status = 200\n`,
    description: "Netlify config",
    language: "toml",
  };
}

export function generateK8sManifest(
  appName: string,
  image: string,
  port = 3000,
  replicas = 3,
): ArtifactSpec {
  return {
    name: `${appName}-k8s`,
    kind: "yaml",
    content: `apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${appName}\n  labels:\n    app: ${appName}\nspec:\n  replicas: ${replicas}\n  selector:\n    matchLabels:\n      app: ${appName}\n  template:\n    metadata:\n      labels:\n        app: ${appName}\n    spec:\n      containers:\n      - name: ${appName}\n        image: ${image}\n        ports:\n        - containerPort: ${port}\n        resources:\n          requests:\n            memory: "128Mi"\n            cpu: "100m"\n          limits:\n            memory: "512Mi"\n            cpu: "500m"\n        livenessProbe:\n          httpGet:\n            path: /health\n            port: ${port}\n          initialDelaySeconds: 10\n          periodSeconds: 30\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: ${appName}-service\nspec:\n  selector:\n    app: ${appName}\n  ports:\n  - port: ${port}\n    targetPort: ${port}\n  type: LoadBalancer\n---\napiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: ${appName}-hpa\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: ${appName}\n  minReplicas: ${replicas}\n  maxReplicas: 10\n  metrics:\n  - type: Resource\n    resource:\n      name: cpu\n      target:\n        type: Utilization\n        averageUtilization: 70\n`,
    description: `K8s manifest for ${appName}`,
    language: "yaml",
  };
}

// ============ API Documentation ============

export function generateOpenAPISpec(
  title: string,
  version: string,
  endpoints: APIEndpoint[],
): ArtifactSpec {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of endpoints) {
    if (!paths[ep.path]) paths[ep.path] = {};
    paths[ep.path][ep.method.toLowerCase()] = {
      summary: ep.description,
      security: ep.auth ? [{ bearerAuth: [] }] : [],
      responses: {
        "200": { description: "OK" },
        "401": { description: "Unauthorized" },
        "429": { description: "Rate limited" },
      },
    };
  }
  return {
    name: "openapi",
    kind: "json",
    content: JSON.stringify(
      {
        openapi: "3.0.3",
        info: { title, version },
        components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
        paths,
      },
      null,
      2,
    ),
    description: `OpenAPI 3.0 with ${endpoints.length} endpoints`,
    language: "json",
  };
}

export function generatePostmanCollection(name: string, endpoints: APIEndpoint[]): ArtifactSpec {
  return {
    name: `${name}-postman`,
    kind: "json",
    content: JSON.stringify(
      {
        info: {
          name,
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: endpoints.map((ep) => ({
          name: ep.description,
          request: {
            method: ep.method,
            header: ep.auth ? [{ key: "Authorization", value: "Bearer {{token}}" }] : [],
            url: {
              raw: `{{baseUrl}}${ep.path}`,
              host: ["{{baseUrl}}"],
              path: ep.path.split("/").filter(Boolean),
            },
          },
        })),
      },
      null,
      2,
    ),
    description: `Postman collection with ${endpoints.length} requests`,
    language: "json",
  };
}

// ============ CI/CD ============

export function generateGitHubActions(workflow: {
  name: string;
  on: string;
  steps: { name: string; run: string; uses?: string }[];
}): ArtifactSpec {
  const stepsStr = workflow.steps
    .map((s) =>
      s.uses
        ? `    - name: ${s.name}\n      uses: ${s.uses}`
        : `    - name: ${s.name}\n      run: ${s.run}`,
    )
    .join("\n");
  return {
    name: workflow.name.toLowerCase().replace(/\s+/g, "-"),
    kind: "yaml",
    content: `name: ${workflow.name}\n\non:\n  ${workflow.on}\n\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n${stepsStr}\n`,
    description: `GitHub Actions: ${workflow.name}`,
    language: "yaml",
  };
}

// ============ Environment Management ============

export function generateEnvTemplate(keys: string[]): ArtifactSpec {
  return {
    name: ".env.example",
    kind: "env",
    content: keys.map((k) => `${k}=`).join("\n"),
    description: `Env template with ${keys.length} vars`,
    language: "env",
  };
}

export function compareEnvs(
  env1: string,
  env2: string,
): {
  missing: string[];
  extra: string[];
  different: { key: string; val1: string; val2: string }[];
} {
  const parse = (env: string): Record<string, string> => {
    const result: Record<string, string> = {};
    env.split("\n").forEach((line) => {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) result[match[1]] = match[2];
    });
    return result;
  };
  const e1 = parse(env1);
  const e2 = parse(env2);
  const keys1 = new Set(Object.keys(e1));
  const keys2 = new Set(Object.keys(e2));
  const missing = [...keys2].filter((k) => !keys1.has(k));
  const extra = [...keys1].filter((k) => !keys2.has(k));
  const different: { key: string; val1: string; val2: string }[] = [];
  for (const k of keys1) {
    if (keys2.has(k) && e1[k] !== e2[k]) different.push({ key: k, val1: e1[k], val2: e2[k] });
  }
  return { missing, extra, different };
}

// ============ Webhook & Health ============

export function generateWebhookPayload(event: string, data: unknown): ArtifactSpec {
  return {
    name: `${event}-payload`,
    kind: "json",
    content: JSON.stringify({ event, data, timestamp: Date.now() }, null, 2),
    description: `Webhook payload for ${event}`,
    language: "json",
  };
}

export async function healthCheck(
  url: string,
): Promise<{ ok: boolean; status: number; responseTime: number; timestamp: number }> {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { method: "GET" });
    return {
      ok: res.ok,
      status: res.status,
      responseTime: Math.round(performance.now() - t0),
      timestamp: Date.now(),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      responseTime: Math.round(performance.now() - t0),
      timestamp: Date.now(),
    };
  }
}

export const BACKEND_TOOLS = {
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
};

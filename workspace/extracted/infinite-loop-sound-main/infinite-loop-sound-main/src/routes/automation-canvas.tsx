import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ProCard, SectionHeader, KpiGrid, StatTile, MeterBar, DataPanel } from "@/components/pro";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Workflow,
  GitBranch,
  Clock,
  AlertTriangle,
  DollarSign,
  Cable as Api,
  Plus,
  Link2,
  Play,
} from "lucide-react";
import {
  createCanvas,
  addNode,
  connectNodes,
  conditionalBranch,
  scheduleTask,
  errorHandler,
  costEstimate,
  toApiEndpoint,
  AUTOMATION_CANVAS_TOOLS,
} from "@/lib/automation/canvas";

export const Route = createFileRoute("/automation-canvas")({
  head: () => ({ meta: [{ title: "Automation Canvas | Infinite Loop Sound" }] }),
  component: AutomationCanvasPage,
});

const NODE_TYPES = [
  "trigger",
  "action",
  "condition",
  "transform",
  "webhook",
  "scheduler",
  "error-handler",
  "sub-workflow",
  "env-manager",
  "approval",
  "rate-limiter",
  "queue",
  "batch",
  "event-bus",
  "data-transform",
  "idempotency",
] as const;

export default function AutomationCanvasPage() {
  const [canvas] = useState(() => createCanvas("Main Workflow"));
  const [nodes, setNodes] = useState<
    { id: string; type: string; config: Record<string, unknown> }[]
  >([]);
  const [edges, setEdges] = useState<{ from: string; to: string; label: string }[]>([]);
  const [nodeType, setNodeType] = useState("trigger");
  const [nodeConfig, setNodeConfig] = useState("{}");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("default");
  const [condition, setCondition] = useState("");
  const [trueNode, setTrueNode] = useState("");
  const [falseNode, setFalseNode] = useState("");
  const [cron, setCron] = useState("0 * * * *");
  const [cronDesc, setCronDesc] = useState("Every hour");
  const [retry, setRetry] = useState("3");
  const [fallback, setFallback] = useState("notify-admin");
  const [escalation, setEscalation] = useState("page-oncall");
  const [costNodes, setCostNodes] = useState("10");
  const [costRuns, setCostRuns] = useState("1000");
  const [apiMethod, setApiMethod] = useState("POST");

  const handleAddNode = () => {
    let cfg: Record<string, unknown> = {};
    try {
      cfg = JSON.parse(nodeConfig);
    } catch {
      cfg = {};
    }
    setNodes((p) => [...p, addNode(canvas.id, nodeType, cfg)]);
  };
  const handleConnect = () => {
    if (fromId && toId) setEdges((p) => [...p, connectNodes(fromId, toId, edgeLabel)]);
  };

  const branch =
    condition && trueNode && falseNode ? conditionalBranch(condition, trueNode, falseNode) : null;
  const schedule = scheduleTask(cron, cronDesc);
  const err = errorHandler(Number(retry) || 0, fallback, escalation);
  const cost = costEstimate(Number(costNodes) || 0, Number(costRuns) || 0);
  const endpoint = toApiEndpoint(canvas.id, apiMethod);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        <SectionHeader
          title="Automation Canvas"
          subtitle="Visual node-based workflow builder"
          icon={<Workflow className="h-5 w-5" />}
        />
        <KpiGrid>
          <StatTile label="Canvas ID" value={canvas.id} />
          <StatTile label="Canvas Name" value={canvas.name} />
          <StatTile label="Nodes" value={String(nodes.length)} />
          <StatTile label="Connections" value={String(edges.length)} />
        </KpiGrid>

        <ProCard
          title="Add Node"
          description="Add a typed node to the canvas"
          icon={<Plus className="h-4 w-4" />}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="node-type">Node Type</Label>
                <select
                  id="node-type"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={nodeType}
                  onChange={(e) => setNodeType(e.target.value)}
                >
                  {NODE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="node-config">Config (JSON)</Label>
                <Input
                  id="node-config"
                  value={nodeConfig}
                  onChange={(e) => setNodeConfig(e.target.value)}
                  placeholder='{"key":"value"}'
                />
              </div>
            </div>
            <Button onClick={handleAddNode}>
              <Plus className="h-4 w-4 mr-1" /> Add Node
            </Button>
          </div>
        </ProCard>

        <ProCard
          title="Node List"
          description={`${nodes.length} node(s) on canvas`}
          icon={<Workflow className="h-4 w-4" />}
        >
          {nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nodes yet.</p>
          ) : (
            <ul className="space-y-2">
              {nodes.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between rounded-md border border-border p-3"
                >
                  <div>
                    <Badge variant="secondary">{n.type}</Badge>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{n.id}</span>
                  </div>
                  <pre className="text-xs text-muted-foreground max-w-xs overflow-hidden">
                    {JSON.stringify(n.config)}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </ProCard>

        <ProCard
          title="Connection Builder"
          description="Connect two nodes with a labeled edge"
          icon={<Link2 className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from-id">From Node ID</Label>
              <Input
                id="from-id"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                placeholder="node_xxx"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to-id">To Node ID</Label>
              <Input
                id="to-id"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                placeholder="node_yyy"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edge-label">Label</Label>
              <Input
                id="edge-label"
                value={edgeLabel}
                onChange={(e) => setEdgeLabel(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleConnect}>
                <Link2 className="h-4 w-4 mr-1" /> Connect
              </Button>
            </div>
          </div>
          {edges.length > 0 && (
            <div className="mt-4 space-y-2">
              {edges.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-sm font-mono">
                  <Badge variant="outline">{e.label}</Badge>
                  <span>
                    {e.from} → {e.to}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ProCard>

        <ProCard
          title="Conditional Branch"
          description="Define a condition with true/false branches"
          icon={<GitBranch className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="condition">Condition</Label>
              <Input
                id="condition"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="status == 'ok'"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="true-node">True Node</Label>
              <Input
                id="true-node"
                value={trueNode}
                onChange={(e) => setTrueNode(e.target.value)}
                placeholder="node_a"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="false-node">False Node</Label>
              <Input
                id="false-node"
                value={falseNode}
                onChange={(e) => setFalseNode(e.target.value)}
                placeholder="node_b"
              />
            </div>
          </div>
          {branch && (
            <DataPanel className="mt-4">
              <pre className="text-xs">{JSON.stringify(branch, null, 2)}</pre>
            </DataPanel>
          )}
        </ProCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Scheduler"
            description="Schedule tasks with cron"
            icon={<Clock className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cron">Cron Expression</Label>
                <Input id="cron" value={cron} onChange={(e) => setCron(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cron-desc">Description</Label>
                <Input
                  id="cron-desc"
                  value={cronDesc}
                  onChange={(e) => setCronDesc(e.target.value)}
                />
              </div>
              <DataPanel>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Cron:</span> {schedule.cron}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Next run:</span>{" "}
                    {new Date(schedule.nextRun).toLocaleString()}
                  </p>
                </div>
              </DataPanel>
            </div>
          </ProCard>
          <ProCard
            title="Error Handler"
            description="Retry, fallback, escalation"
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retry">Retry Count</Label>
                <Input
                  id="retry"
                  type="number"
                  value={retry}
                  onChange={(e) => setRetry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fallback">Fallback</Label>
                <Input
                  id="fallback"
                  value={fallback}
                  onChange={(e) => setFallback(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="escalation">Escalation</Label>
                <Input
                  id="escalation"
                  value={escalation}
                  onChange={(e) => setEscalation(e.target.value)}
                />
              </div>
              <DataPanel>
                <div className="text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Retry:</span> {err.retry}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Fallback:</span> {err.fallback}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Escalation:</span> {err.escalation}
                  </p>
                </div>
              </DataPanel>
            </div>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ProCard
            title="Cost Estimator"
            description="Estimate workflow run cost"
            icon={<DollarSign className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cost-nodes">Nodes</Label>
                  <Input
                    id="cost-nodes"
                    type="number"
                    value={costNodes}
                    onChange={(e) => setCostNodes(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cost-runs">Runs</Label>
                  <Input
                    id="cost-runs"
                    type="number"
                    value={costRuns}
                    onChange={(e) => setCostRuns(e.target.value)}
                  />
                </div>
              </div>
              <MeterBar
                label="Estimated Cost"
                value={Math.min(cost.estimatedCost, 100)}
                max={100}
                format={(v) => `$${v.toFixed(4)}`}
              />
              <p className="text-sm text-muted-foreground">
                ${cost.estimatedCost.toFixed(4)} for {cost.nodes} nodes × {cost.runs} runs
              </p>
            </div>
          </ProCard>
          <ProCard
            title="Workflow → API Endpoint"
            description="Expose canvas as REST API"
            icon={<Api className="h-4 w-4" />}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="api-method">HTTP Method</Label>
                <select
                  id="api-method"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={apiMethod}
                  onChange={(e) => setApiMethod(e.target.value)}
                >
                  {["GET", "POST", "PUT", "DELETE"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <DataPanel>
                <div className="text-sm">
                  <Badge variant="secondary">{endpoint.method}</Badge>
                  <span className="ml-2 font-mono">{endpoint.endpoint}</span>
                </div>
              </DataPanel>
              <Button variant="outline">
                <Play className="h-4 w-4 mr-1" /> Test Endpoint
              </Button>
            </div>
          </ProCard>
        </div>

        <ProCard
          title="Available Tools"
          description={`${AUTOMATION_CANVAS_TOOLS.length} automation canvas tools`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {AUTOMATION_CANVAS_TOOLS.map((t) => (
              <div key={t.name} className="rounded-md border border-border p-3 space-y-1">
                <Badge variant="outline">{t.name}</Badge>
                <p className="text-xs text-muted-foreground">{t.description}</p>
                <p className="text-xs font-mono text-muted-foreground">
                  params: {t.parameters.join(", ")}
                </p>
              </div>
            ))}
          </div>
        </ProCard>
      </div>
    </AppShell>
  );
}

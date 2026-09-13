// Pure functions for visual node-based automation canvas.
// No side effects — every function returns a fresh value derived from its inputs.

export type NodeType =
  | "trigger"
  | "action"
  | "condition"
  | "transform"
  | "webhook"
  | "scheduler"
  | "error-handler"
  | "sub-workflow"
  | "env-manager"
  | "approval"
  | "rate-limiter"
  | "queue"
  | "batch"
  | "event-bus"
  | "data-transform"
  | "idempotency";

export type VersionAction = "save" | "rollback" | "diff";

export type EventBusAction = "publish" | "subscribe";

export interface Canvas {
  id: string;
  name: string;
  nodes: never[];
  edges: never[];
  createdAt: number;
}

export interface CanvasNode {
  id: string;
  type: string;
  config: Record<string, unknown>;
}

export interface CanvasEdge {
  from: string;
  to: string;
  label: string;
}

export interface ConditionalBranch {
  condition: string;
  branches: { true: string; false: string };
}

export interface MergedData {
  merged: Record<string, unknown>;
  fieldCount: number;
}

export interface WebhookListener {
  path: string;
  method: string;
  log: never[];
}

export interface ScheduledTask {
  cron: string;
  naturalLanguage: string;
  nextRun: number;
}

export interface ErrorHandlerConfig {
  retry: number;
  fallback: string;
  escalation: string;
}

export interface VersionControlEntry {
  action: string;
  versionId: string;
  timestamp: number;
}

export interface ApprovalStepConfig {
  approver: string;
  timeout: number;
  status: string;
}

export interface RateLimiterConfig {
  maxRps: number;
  window: number;
  current: number;
}

export interface QueueTaskConfig {
  priority: number;
  deadLetter: boolean;
  position: number;
}

export interface BatchProcessConfig {
  count: number;
  parallel: number;
  batches: number;
}

export interface EventBusConfig {
  topic: string;
  action: string;
  subscribers: number;
}

export interface CostEstimateConfig {
  nodes: number;
  runs: number;
  estimatedCost: number;
}

export interface ApiEndpointConfig {
  canvasId: string;
  method: string;
  endpoint: string;
}

const VALID_NODE_TYPES: NodeType[] = [
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
];

const VALID_VERSION_ACTIONS: VersionAction[] = ["save", "rollback", "diff"];

const VALID_EVENT_BUS_ACTIONS: EventBusAction[] = ["publish", "subscribe"];

function assertValid(value: string, allowed: readonly string[], label: string): void {
  if (!allowed.includes(value as never)) {
    throw new Error(`Invalid ${label}: "${value}". Allowed: ${allowed.join(", ")}`);
  }
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string`);
  }
}

export function createCanvas(name: string): Canvas {
  assertNonEmpty(name, "name");
  return {
    id: `canvas_${Math.random().toString(36).slice(2, 10)}`,
    name,
    nodes: [],
    edges: [],
    createdAt: Date.now(),
  };
}

export function addNode(
  canvasId: string,
  type: string,
  config: Record<string, unknown>,
): CanvasNode {
  assertNonEmpty(canvasId, "canvasId");
  assertValid(type, VALID_NODE_TYPES, "node type");
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("config must be a plain object");
  }
  return {
    id: `node_${Math.random().toString(36).slice(2, 10)}`,
    type,
    config: { ...config },
  };
}

export function connectNodes(from: string, to: string, label = "default"): CanvasEdge {
  assertNonEmpty(from, "from");
  assertNonEmpty(to, "to");
  if (from === to) {
    throw new Error("Cannot connect a node to itself");
  }
  return { from, to, label };
}

export function conditionalBranch(
  condition: string,
  trueNode: string,
  falseNode: string,
): ConditionalBranch {
  assertNonEmpty(condition, "condition");
  assertNonEmpty(trueNode, "trueNode");
  assertNonEmpty(falseNode, "falseNode");
  return {
    condition,
    branches: { true: trueNode, false: falseNode },
  };
}

export function mergeData(
  sources: Record<string, unknown>[],
  schema: Record<string, string>,
): MergedData {
  if (!Array.isArray(sources)) {
    throw new Error("sources must be an array");
  }
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("schema must be a plain object");
  }
  const merged: Record<string, unknown> = {};
  for (const [field, source] of Object.entries(schema)) {
    for (const src of sources) {
      if (src && typeof src === "object" && field in src) {
        merged[source] = src[field];
        break;
      }
    }
  }
  return { merged, fieldCount: Object.keys(merged).length };
}

export function webhookListener(path: string, method: string): WebhookListener {
  assertNonEmpty(path, "path");
  assertNonEmpty(method, "method");
  return { path, method: method.toUpperCase(), log: [] };
}

export function scheduleTask(cron: string, naturalLanguage: string): ScheduledTask {
  assertNonEmpty(cron, "cron");
  assertNonEmpty(naturalLanguage, "naturalLanguage");
  return {
    cron,
    naturalLanguage,
    nextRun: Date.now() + 60_000,
  };
}

export function errorHandler(
  retry: number,
  fallback: string,
  escalation: string,
): ErrorHandlerConfig {
  assertPositive(retry, "retry");
  assertNonEmpty(fallback, "fallback");
  assertNonEmpty(escalation, "escalation");
  return { retry, fallback, escalation };
}

export function versionControl(action: string, versionId: string): VersionControlEntry {
  assertValid(action, VALID_VERSION_ACTIONS, "version action");
  assertNonEmpty(versionId, "versionId");
  return { action, versionId, timestamp: Date.now() };
}

export function approvalStep(approver: string, timeout: number): ApprovalStepConfig {
  assertNonEmpty(approver, "approver");
  assertPositive(timeout, "timeout");
  return { approver, timeout, status: "pending" };
}

export function rateLimiter(maxRps: number, window: number): RateLimiterConfig {
  assertPositive(maxRps, "maxRps");
  assertPositive(window, "window");
  return { maxRps, window, current: 0 };
}

export function queueTask(priority: number, deadLetter: boolean): QueueTaskConfig {
  if (!Number.isInteger(priority) || priority < 1 || priority > 10) {
    throw new Error("priority must be an integer between 1 and 10");
  }
  return { priority, deadLetter, position: 0 };
}

export function batchProcess(count: number, parallel: number): BatchProcessConfig {
  assertPositive(count, "count");
  assertPositive(parallel, "parallel");
  if (parallel === 0) {
    throw new Error("parallel must be greater than 0");
  }
  return { count, parallel, batches: Math.ceil(count / parallel) };
}

export function eventBus(topic: string, action: string): EventBusConfig {
  assertNonEmpty(topic, "topic");
  assertValid(action, VALID_EVENT_BUS_ACTIONS, "event bus action");
  return { topic, action, subscribers: action === "subscribe" ? 1 : 0 };
}

export function costEstimate(nodes: number, runs: number): CostEstimateConfig {
  assertPositive(nodes, "nodes");
  assertPositive(runs, "runs");
  return { nodes, runs, estimatedCost: Number((nodes * runs * 0.001).toFixed(4)) };
}

export function toApiEndpoint(canvasId: string, method: string): ApiEndpointConfig {
  assertNonEmpty(canvasId, "canvasId");
  assertNonEmpty(method, "method");
  return {
    canvasId,
    method: method.toUpperCase(),
    endpoint: `/api/automation/${canvasId}`,
  };
}

export interface AutomationTool {
  name: string;
  description: string;
  parameters: string[];
}

export const AUTOMATION_CANVAS_TOOLS: AutomationTool[] = [
  {
    name: "createCanvas",
    description: "Create a new blank automation canvas with a unique id.",
    parameters: ["name"],
  },
  {
    name: "addNode",
    description: "Add a typed node (trigger, action, condition, etc.) to the canvas.",
    parameters: ["canvasId", "type", "config"],
  },
  {
    name: "connectNodes",
    description: "Connect two nodes with an optional labeled edge.",
    parameters: ["from", "to", "label?"],
  },
  {
    name: "conditionalBranch",
    description: "Define a condition with true/false branch targets.",
    parameters: ["condition", "trueNode", "falseNode"],
  },
  {
    name: "mergeData",
    description: "Merge multiple data sources into a single object following a schema.",
    parameters: ["sources", "schema"],
  },
  {
    name: "webhookListener",
    description: "Register a webhook listener at a path and HTTP method.",
    parameters: ["path", "method"],
  },
  {
    name: "scheduleTask",
    description: "Schedule a task using a cron expression with a natural-language label.",
    parameters: ["cron", "naturalLanguage"],
  },
  {
    name: "errorHandler",
    description: "Configure retry, fallback, and escalation for error handling.",
    parameters: ["retry", "fallback", "escalation"],
  },
  {
    name: "versionControl",
    description: "Save, rollback, or diff a canvas version.",
    parameters: ["action", "versionId"],
  },
  {
    name: "approvalStep",
    description: "Create a human approval step with an approver and timeout.",
    parameters: ["approver", "timeout"],
  },
  {
    name: "rateLimiter",
    description: "Configure a rate limiter with max requests per second and window.",
    parameters: ["maxRps", "window"],
  },
  {
    name: "queueTask",
    description: "Queue a task with a priority and optional dead-letter routing.",
    parameters: ["priority", "deadLetter"],
  },
  {
    name: "batchProcess",
    description: "Split a count of items into parallel batches.",
    parameters: ["count", "parallel"],
  },
  {
    name: "eventBus",
    description: "Publish or subscribe to an event bus topic.",
    parameters: ["topic", "action"],
  },
  {
    name: "costEstimate",
    description: "Estimate the cost of running a canvas with N nodes M times.",
    parameters: ["nodes", "runs"],
  },
  {
    name: "toApiEndpoint",
    description: "Expose a canvas as a REST API endpoint with a given method.",
    parameters: ["canvasId", "method"],
  },
];

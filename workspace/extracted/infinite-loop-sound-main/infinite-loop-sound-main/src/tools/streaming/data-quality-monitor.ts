/**
 * Data Quality Monitor - Stream data quality validation and cleansing
 * Extends streaming tools with schema validation, gap detection, outlier filtering, and deduplication
 */

export interface QualityRule {
  field: string;
  type: "required" | "range" | "type" | "regex" | "custom";
  params: {
    min?: number;
    max?: number;
    expectedType?: string;
    pattern?: string;
    validator?: (value: any) => boolean;
  };
}

export interface QualityIssue {
  id: string;
  streamId: string;
  type:
    | "missing_field"
    | "out_of_range"
    | "type_mismatch"
    | "duplicate"
    | "gap"
    | "outlier"
    | "schema_violation";
  field?: string;
  value?: any;
  message: string;
  severity: "low" | "medium" | "high";
  timestamp: number;
}

export interface QualityReport {
  streamId: string;
  totalEvents: number;
  validEvents: number;
  invalidEvents: number;
  duplicateCount: number;
  gapCount: number;
  outlierCount: number;
  qualityScore: number;
  issues: QualityIssue[];
  fieldStats: Record<
    string,
    { min: number; max: number; mean: number; nullCount: number; uniqueCount: number }
  >;
}

export class DataQualityMonitor {
  private rules: Map<string, QualityRule[]> = new Map();
  private seenIds: Set<string> = new Set();
  private lastTimestamp: Map<string, number> = new Map();
  private gapThresholdMs: number;
  private outlierThreshold: number;
  private fieldValues: Map<string, Map<string, number[]>> = new Map();

  constructor(config: { gapThresholdMs: number; outlierThreshold: number }) {
    this.gapThresholdMs = config.gapThresholdMs;
    this.outlierThreshold = config.outlierThreshold;
  }

  setRules(streamId: string, rules: QualityRule[]): void {
    this.rules.set(streamId, rules);
  }

  validate(
    streamId: string,
    event: { id: string; timestamp: number; data: Record<string, any> },
  ): { valid: boolean; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    if (this.seenIds.has(event.id)) {
      issues.push(
        this.createIssue(
          streamId,
          "duplicate",
          event.id,
          undefined,
          "Duplicate event detected",
          "medium",
        ),
      );
    } else {
      this.seenIds.add(event.id);
      if (this.seenIds.size > 100000) {
        const toRemove = Array.from(this.seenIds).slice(0, 50000);
        toRemove.forEach((id) => this.seenIds.delete(id));
      }
    }

    const lastTs = this.lastTimestamp.get(streamId);
    if (lastTs && event.timestamp - lastTs > this.gapThresholdMs) {
      issues.push(
        this.createIssue(
          streamId,
          "gap",
          undefined,
          undefined,
          `Data gap of ${event.timestamp - lastTs}ms detected`,
          "medium",
        ),
      );
    }
    this.lastTimestamp.set(streamId, event.timestamp);

    const rules = this.rules.get(streamId) ?? [];
    for (const rule of rules) {
      const value = event.data[rule.field];
      switch (rule.type) {
        case "required":
          if (value === undefined || value === null) {
            issues.push(
              this.createIssue(
                streamId,
                "missing_field",
                rule.field,
                value,
                `Required field '${rule.field}' is missing`,
                "high",
              ),
            );
          }
          break;
        case "range":
          if (value !== undefined && value !== null) {
            if (rule.params.min !== undefined && value < rule.params.min) {
              issues.push(
                this.createIssue(
                  streamId,
                  "out_of_range",
                  rule.field,
                  value,
                  `Field '${rule.field}' value ${value} below minimum ${rule.params.min}`,
                  "medium",
                ),
              );
            }
            if (rule.params.max !== undefined && value > rule.params.max) {
              issues.push(
                this.createIssue(
                  streamId,
                  "out_of_range",
                  rule.field,
                  value,
                  `Field '${rule.field}' value ${value} above maximum ${rule.params.max}`,
                  "medium",
                ),
              );
            }
          }
          break;
        case "type":
          if (value !== undefined && value !== null && typeof value !== rule.params.expectedType) {
            issues.push(
              this.createIssue(
                streamId,
                "type_mismatch",
                rule.field,
                value,
                `Field '${rule.field}' expected type ${rule.params.expectedType}, got ${typeof value}`,
                "medium",
              ),
            );
          }
          break;
        case "custom":
          if (rule.params.validator && !rule.params.validator(value)) {
            issues.push(
              this.createIssue(
                streamId,
                "schema_violation",
                rule.field,
                value,
                `Field '${rule.field}' failed custom validation`,
                "high",
              ),
            );
          }
          break;
      }
    }

    this.checkOutlier(streamId, event.data, issues);

    return { valid: issues.filter((i) => i.severity === "high").length === 0, issues };
  }

  private checkOutlier(streamId: string, data: Record<string, any>, issues: QualityIssue[]): void {
    for (const [field, value] of Object.entries(data)) {
      if (typeof value !== "number") continue;
      if (!this.fieldValues.has(streamId)) this.fieldValues.set(streamId, new Map());
      if (!this.fieldValues.get(streamId)!.has(field))
        this.fieldValues.get(streamId)!.set(field, []);
      const values = this.fieldValues.get(streamId)!.get(field)!;
      values.push(value);
      if (values.length > 100) values.shift();

      if (values.length >= 10) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        if (stdDev > 0 && Math.abs(value - mean) > this.outlierThreshold * stdDev) {
          issues.push(
            this.createIssue(
              streamId,
              "outlier",
              field,
              value,
              `Outlier detected: ${field}=${value} (${this.outlierThreshold}σ from mean)`,
              "low",
            ),
          );
        }
      }
    }
  }

  private createIssue(
    streamId: string,
    type: QualityIssue["type"],
    field: string | undefined,
    value: any,
    message: string,
    severity: QualityIssue["severity"],
  ): QualityIssue {
    return {
      id: `issue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      streamId,
      type,
      field,
      value,
      message,
      severity,
      timestamp: Date.now(),
    };
  }

  generateReport(
    streamId: string,
    events: { id: string; timestamp: number; data: Record<string, any> }[],
  ): QualityReport {
    let valid = 0,
      invalid = 0,
      duplicates = 0,
      gaps = 0,
      outliers = 0;
    const allIssues: QualityIssue[] = [];
    const fieldStats: Record<
      string,
      { min: number; max: number; mean: number; nullCount: number; uniqueCount: number }
    > = {};
    const fieldUniqueValues: Record<string, Set<any>> = {};

    for (const event of events) {
      const result = this.validate(streamId, event);
      if (result.valid) valid++;
      else invalid++;
      for (const issue of result.issues) {
        allIssues.push(issue);
        if (issue.type === "duplicate") duplicates++;
        else if (issue.type === "gap") gaps++;
        else if (issue.type === "outlier") outliers++;
      }
      for (const [field, value] of Object.entries(event.data)) {
        if (!fieldStats[field]) {
          fieldStats[field] = {
            min: Infinity,
            max: -Infinity,
            mean: 0,
            nullCount: 0,
            uniqueCount: 0,
          };
          fieldUniqueValues[field] = new Set();
        }
        if (typeof value === "number") {
          fieldStats[field].min = Math.min(fieldStats[field].min, value);
          fieldStats[field].max = Math.max(fieldStats[field].max, value);
        }
        if (value === null || value === undefined) fieldStats[field].nullCount++;
        fieldUniqueValues[field].add(value);
      }
    }

    for (const field of Object.keys(fieldStats)) {
      fieldStats[field].uniqueCount = fieldUniqueValues[field].size;
      const values = events
        .map((e) => e.data[field])
        .filter((v): v is number => typeof v === "number");
      fieldStats[field].mean =
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    }

    const qualityScore = events.length > 0 ? (valid / events.length) * 100 : 0;

    return {
      streamId,
      totalEvents: events.length,
      validEvents: valid,
      invalidEvents: invalid,
      duplicateCount: duplicates,
      gapCount: gaps,
      outlierCount: outliers,
      qualityScore,
      issues: allIssues.slice(-100),
      fieldStats,
    };
  }
}

export default DataQualityMonitor;

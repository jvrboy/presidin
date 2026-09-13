/**
 * Health Check Manager - Service health monitoring with circuit breaker pattern
 * Extends monitoring with uptime tracking, dependency health, and automated recovery
 */

export interface ServiceHealth {
  name: string;
  url: string;
  status: "healthy" | "degraded" | "unhealthy" | "down";
  responseTime: number;
  uptime: number;
  lastCheck: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  circuitState: "closed" | "open" | "half-open";
  history: { timestamp: number; status: string; responseTime: number }[];
}

export interface HealthCheckConfig {
  intervalMs: number;
  timeoutMs: number;
  failureThreshold: number;
  successThreshold: number;
  circuitOpenDurationMs: number;
}

export class HealthCheckManager {
  private services: Map<string, ServiceHealth> = new Map();
  private checkFns: Map<string, () => Promise<boolean>> = new Map();
  private recoveryFns: Map<string, () => Promise<void>> = new Map();

  constructor(private config: HealthCheckConfig) {}

  registerService(
    name: string,
    checkFn: () => Promise<boolean>,
    recoveryFn?: () => Promise<void>,
  ): void {
    this.services.set(name, {
      name,
      url: "",
      status: "healthy",
      responseTime: 0,
      uptime: 100,
      lastCheck: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      circuitState: "closed",
      history: [],
    });
    this.checkFns.set(name, checkFn);
    if (recoveryFn) this.recoveryFns.set(name, recoveryFn);
  }

  async checkService(name: string): Promise<ServiceHealth> {
    const service = this.services.get(name);
    const checkFn = this.checkFns.get(name);
    if (!service || !checkFn) return this.emptyHealth(name);

    if (service.circuitState === "open") {
      const elapsed = Date.now() - service.lastCheck;
      if (elapsed > this.config.circuitOpenDurationMs) {
        service.circuitState = "half-open";
      } else {
        service.status = "down";
        return service;
      }
    }

    const startTime = performance.now();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const success = await Promise.race([
      checkFn(),
      new Promise<boolean>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error("timeout")), this.config.timeoutMs);
      }),
    ]).catch(() => false);
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    const responseTime = performance.now() - startTime;

    service.lastCheck = Date.now();
    service.responseTime = responseTime;
    service.history.push({
      timestamp: Date.now(),
      status: success ? "healthy" : "unhealthy",
      responseTime,
    });
    if (service.history.length > 100) service.history.shift();

    if (success) {
      service.consecutiveSuccesses++;
      service.consecutiveFailures = 0;
      if (service.circuitState === "half-open") {
        service.circuitState = "closed";
      }
      service.status = responseTime > 1000 ? "degraded" : "healthy";
    } else {
      service.consecutiveFailures++;
      service.consecutiveSuccesses = 0;
      if (service.consecutiveFailures >= this.config.failureThreshold) {
        service.circuitState = "open";
        service.status = "down";
        const recoveryFn = this.recoveryFns.get(name);
        if (recoveryFn) {
          try {
            await recoveryFn();
          } catch {
            /* ignore */
          }
        }
      } else {
        service.status = "unhealthy";
      }
    }

    service.uptime = this.calculateUptime(service.history);
    return service;
  }

  async checkAll(): Promise<ServiceHealth[]> {
    const results: ServiceHealth[] = [];
    for (const name of this.services.keys()) {
      results.push(await this.checkService(name));
    }
    return results;
  }

  private calculateUptime(history: ServiceHealth["history"]): number {
    if (history.length === 0) return 100;
    const healthy = history.filter((h) => h.status === "healthy" || h.status === "degraded").length;
    return (healthy / history.length) * 100;
  }

  private emptyHealth(name: string): ServiceHealth {
    return {
      name,
      url: "",
      status: "down",
      responseTime: 0,
      uptime: 0,
      lastCheck: 0,
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      circuitState: "open",
      history: [],
    };
  }

  getServiceHealth(name: string): ServiceHealth | undefined {
    return this.services.get(name);
  }

  getAllServices(): ServiceHealth[] {
    return Array.from(this.services.values());
  }
}

export default HealthCheckManager;

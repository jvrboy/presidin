export type AlertChannel = "telegram" | "discord" | "email" | "push";
export type AlertSeverity = "info" | "warning" | "error";

export interface AlertConfig {
  enabled: boolean;
  channel: AlertChannel;
  webhook?: string;
  apiKey?: string;
  userId?: string;
}

export interface Alert {
  id: string;
  timestamp: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  channels: AlertChannel[];
}

const alertConfigs = new Map<AlertChannel, AlertConfig>();
const alertHistory: Alert[] = [];

export function configureAlert(channel: AlertChannel, config: AlertConfig): void {
  alertConfigs.set(channel, config);
}

export async function sendAlert(
  title: string,
  message: string,
  severity: AlertSeverity = "info",
  channels?: AlertChannel[],
): Promise<void> {
  const alert: Alert = {
    id: Date.now().toString(),
    timestamp: Date.now(),
    severity,
    title,
    message,
    channels:
      channels || Array.from(alertConfigs.keys()).filter((c) => alertConfigs.get(c)?.enabled),
  };

  alertHistory.push(alert);
  if (alertHistory.length > 1000) alertHistory.shift();

  for (const channel of alert.channels) {
    const config = alertConfigs.get(channel);
    if (config?.enabled && config.webhook) {
      await deliverAlert(channel, config, alert).catch((e) =>
        console.error(`Failed to send ${channel} alert:`, e),
      );
    }
  }
}

async function deliverAlert(
  channel: AlertChannel,
  config: AlertConfig,
  alert: Alert,
): Promise<void> {
  const payload = { title: alert.title, message: alert.message, severity: alert.severity };
  await fetch(config.webhook || "", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getAlertHistory(limit = 100): Alert[] {
  return alertHistory.slice(-limit);
}

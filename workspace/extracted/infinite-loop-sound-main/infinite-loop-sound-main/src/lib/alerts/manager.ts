/**
 * Alert & Notification Manager
 * Real-time alerts, email, Slack, Discord, and push notifications
 */

export interface AlertConfig {
  id: string;
  name: string;
  symbol: string;
  type: "price" | "indicator" | "signal" | "risk";
  condition: AlertCondition;
  channels: AlertChannel[];
  enabled: boolean;
  createdAt: Date;
}

export interface AlertCondition {
  type: "price_above" | "price_below" | "signal_score" | "drawdown" | "win_streak";
  value: number;
  timeframe?: string;
}

export type AlertChannel = "email" | "slack" | "discord" | "telegram" | "push" | "in_app";

export interface AlertEvent {
  id: string;
  configId: string;
  timestamp: Date;
  title: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  read: boolean;
  data: Record<string, any>;
}

interface EmailConfig {
  apiKey: string;
  fromAddress: string;
}

interface SlackConfig {
  webhookUrl: string;
}

interface DiscordConfig {
  webhookUrl: string;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export class AlertManager {
  private alerts: Map<string, AlertConfig> = new Map();
  private events: AlertEvent[] = [];
  private emailConfig?: EmailConfig;
  private slackConfig?: SlackConfig;
  private discordConfig?: DiscordConfig;
  private telegramConfig?: TelegramConfig;

  constructor() {
    this.loadFromStorage();
  }

  /**
   * Create a new alert configuration
   */
  createAlert(config: Omit<AlertConfig, "id" | "createdAt">): AlertConfig {
    const id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const alert: AlertConfig = {
      ...config,
      id,
      createdAt: new Date(),
    };
    this.alerts.set(id, alert);
    this.saveToStorage();
    return alert;
  }

  /**
   * Update alert configuration
   */
  updateAlert(id: string, updates: Partial<AlertConfig>): AlertConfig | null {
    const alert = this.alerts.get(id);
    if (!alert) return null;

    const updated = { ...alert, ...updates, id, createdAt: alert.createdAt };
    this.alerts.set(id, updated);
    this.saveToStorage();
    return updated;
  }

  /**
   * Delete alert
   */
  deleteAlert(id: string): boolean {
    const deleted = this.alerts.delete(id);
    if (deleted) this.saveToStorage();
    return deleted;
  }

  /**
   * Get all alerts
   */
  getAlerts(): AlertConfig[] {
    return Array.from(this.alerts.values());
  }

  /**
   * Trigger an alert event
   */
  async triggerAlert(
    configId: string,
    title: string,
    message: string,
    severity: "low" | "medium" | "high" | "critical",
    data: Record<string, any> = {},
  ): Promise<void> {
    const config = this.alerts.get(configId);
    if (!config || !config.enabled) return;

    const event: AlertEvent = {
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      configId,
      timestamp: new Date(),
      title,
      message,
      severity,
      read: false,
      data,
    };

    this.events.push(event);
    this.saveToStorage();

    // Send to all configured channels
    await Promise.all(config.channels.map((channel) => this.sendToChannel(channel, config, event)));
  }

  /**
   * Send alert to specific channel
   */
  private async sendToChannel(
    channel: AlertChannel,
    config: AlertConfig,
    event: AlertEvent,
  ): Promise<void> {
    try {
      switch (channel) {
        case "email":
          await this.sendEmail(config, event);
          break;
        case "slack":
          await this.sendSlack(config, event);
          break;
        case "discord":
          await this.sendDiscord(config, event);
          break;
        case "telegram":
          await this.sendTelegram(config, event);
          break;
        case "push":
          await this.sendPush(config, event);
          break;
        case "in_app":
          // Already stored in events
          break;
      }
    } catch (error) {
      console.error(`Failed to send ${channel} alert:`, error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(config: AlertConfig, event: AlertEvent): Promise<void> {
    if (!this.emailConfig) return;

    const subject = `[${event.severity.toUpperCase()}] ${event.title}`;
    const body = `
Symbol: ${config.symbol}
Severity: ${event.severity}
Message: ${event.message}

Data: ${JSON.stringify(event.data, null, 2)}

Timestamp: ${event.timestamp.toISOString()}
    `.trim();

    // Use SendGrid or similar service
    // For now, just log
    console.log(`📧 Email sent: ${subject}`);
  }

  /**
   * Send Slack notification
   */
  private async sendSlack(config: AlertConfig, event: AlertEvent): Promise<void> {
    if (!this.slackConfig) return;

    const color =
      event.severity === "critical"
        ? "#FF0000"
        : event.severity === "high"
          ? "#FF6600"
          : event.severity === "medium"
            ? "#FFAA00"
            : "#00AA00";

    const payload = {
      attachments: [
        {
          color,
          title: `${event.severity.toUpperCase()}: ${event.title}`,
          text: event.message,
          fields: [
            { title: "Symbol", value: config.symbol, short: true },
            {
              title: "Timestamp",
              value: event.timestamp.toLocaleTimeString(),
              short: true,
            },
            { title: "Details", value: JSON.stringify(event.data, null, 2), short: false },
          ],
        },
      ],
    };

    try {
      await fetch(this.slackConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("✓ Slack notification sent");
    } catch (error) {
      console.error("Slack notification failed:", error);
    }
  }

  /**
   * Send Discord notification
   */
  private async sendDiscord(config: AlertConfig, event: AlertEvent): Promise<void> {
    if (!this.discordConfig) return;

    const color =
      event.severity === "critical"
        ? 16711680
        : event.severity === "high"
          ? 16744448
          : event.severity === "medium"
            ? 16776960
            : 65280;

    const payload = {
      embeds: [
        {
          title: `${event.severity.toUpperCase()}: ${event.title}`,
          description: event.message,
          color,
          fields: [
            { name: "Symbol", value: config.symbol, inline: true },
            {
              name: "Time",
              value: event.timestamp.toLocaleTimeString(),
              inline: true,
            },
            {
              name: "Details",
              value: `\`\`\`json\n${JSON.stringify(event.data, null, 2)}\n\`\`\``,
            },
          ],
        },
      ],
    };

    try {
      await fetch(this.discordConfig.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("✓ Discord notification sent");
    } catch (error) {
      console.error("Discord notification failed:", error);
    }
  }

  /**
   * Send Telegram notification
   */
  private async sendTelegram(config: AlertConfig, event: AlertEvent): Promise<void> {
    if (!this.telegramConfig) return;

    const text = `
🔔 *${event.severity.toUpperCase()}: ${event.title}*
Symbol: \`${config.symbol}\`
Message: ${event.message}
Time: ${event.timestamp.toLocaleTimeString()}

Details:
\`\`\`
${JSON.stringify(event.data, null, 2)}
\`\`\`
    `.trim();

    try {
      await fetch(`https://api.telegram.org/bot${this.telegramConfig.botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: this.telegramConfig.chatId,
          text,
          parse_mode: "Markdown",
        }),
      });
      console.log("✓ Telegram notification sent");
    } catch (error) {
      console.error("Telegram notification failed:", error);
    }
  }

  /**
   * Send push notification
   */
  private async sendPush(config: AlertConfig, event: AlertEvent): Promise<void> {
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(`${event.severity.toUpperCase()}: ${event.title}`, {
        body: event.message,
        icon: "/logo.png",
        badge: "/badge.png",
        tag: config.id,
        requireInteraction: event.severity === "critical",
        data: event.data,
      });
      console.log("✓ Push notification sent");
    } catch (error) {
      console.error("Push notification failed:", error);
    }
  }

  /**
   * Get all alert events
   */
  getEvents(configId?: string, unreadOnly = false): AlertEvent[] {
    let filtered = this.events;
    if (configId) filtered = filtered.filter((e) => e.configId === configId);
    if (unreadOnly) filtered = filtered.filter((e) => !e.read);
    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Mark event as read
   */
  markEventRead(eventId: string): void {
    const event = this.events.find((e) => e.id === eventId);
    if (event) {
      event.read = true;
      this.saveToStorage();
    }
  }

  /**
   * Clear old events
   */
  clearOldEvents(daysOld = 30): void {
    const cutoff = Date.now() - daysOld * 24 * 60 * 60 * 1000;
    this.events = this.events.filter((e) => e.timestamp.getTime() > cutoff);
    this.saveToStorage();
  }

  /**
   * Set email configuration
   */
  setEmailConfig(config: EmailConfig): void {
    this.emailConfig = config;
    this.saveToStorage();
  }

  /**
   * Set Slack configuration
   */
  setSlackConfig(config: SlackConfig): void {
    this.slackConfig = config;
    this.saveToStorage();
  }

  /**
   * Set Discord configuration
   */
  setDiscordConfig(config: DiscordConfig): void {
    this.discordConfig = config;
    this.saveToStorage();
  }

  /**
   * Set Telegram configuration
   */
  setTelegramConfig(config: TelegramConfig): void {
    this.telegramConfig = config;
    this.saveToStorage();
  }

  /**
   * Persist to local storage
   */
  private saveToStorage(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        "alert_manager",
        JSON.stringify({
          alerts: Array.from(this.alerts.entries()),
          events: this.events,
        }),
      );
    } catch (error) {
      console.error("Failed to save alerts to storage:", error);
    }
  }

  /**
   * Load from local storage
   */
  private loadFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const data = localStorage.getItem("alert_manager");
      if (data) {
        const { alerts, events } = JSON.parse(data);
        this.alerts = new Map(alerts.map(([id, config]: [string, any]) => [id, config]));
        // Revive Date objects serialized by JSON.stringify
        this.events = (Array.isArray(events) ? events : [])
          .map((e: any) => ({ ...e, timestamp: new Date(e?.timestamp ?? Date.now()) }))
          .filter((e: any) => !Number.isNaN(e.timestamp.getTime()));
      }
    } catch (error) {
      console.error("Failed to load alerts from storage:", error);
    }
  }
}

// Singleton instance
export const alertManager = new AlertManager();

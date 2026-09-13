/**
 * Data Stream Manager - Handles real-time data streaming and aggregation
 */

export interface DataStream {
  id: string;
  source: string;
  symbol: string;
  type: "price" | "order" | "trade" | "depth" | "ticker";
  active: boolean;
  subscriptionTime: number;
}

export interface StreamData {
  streamId: string;
  timestamp: number;
  data: Record<string, any>;
  sequence: number;
}

export interface StreamBuffer {
  data: StreamData[];
  lastUpdate: number;
  messageCount: number;
}

export interface StreamHealth {
  streamId: string;
  active: boolean;
  uptime: number;
  messagesReceived: number;
  errors: number;
  latency: number;
  status: "healthy" | "degraded" | "failed";
}

export class DataStreamManager {
  private streams: Map<string, DataStream> = new Map();
  private buffers: Map<string, StreamBuffer> = new Map();
  private listeners: Map<string, Set<(data: StreamData) => void>> = new Map();
  private health: Map<string, StreamHealth> = new Map();
  private sequences: Map<string, number> = new Map();

  constructor(private config: { maxBufferSize: number; flushInterval: number }) {}

  /**
   * Subscribe to a data stream
   */
  subscribe(
    source: string,
    symbol: string,
    type: "price" | "order" | "trade" | "depth" | "ticker",
  ): string {
    const streamId = `${source}-${symbol}-${type}-${Date.now()}`;

    const stream: DataStream = {
      id: streamId,
      source,
      symbol,
      type,
      active: true,
      subscriptionTime: Date.now(),
    };

    this.streams.set(streamId, stream);
    this.buffers.set(streamId, {
      data: [],
      lastUpdate: Date.now(),
      messageCount: 0,
    });
    this.listeners.set(streamId, new Set());
    this.sequences.set(streamId, 0);

    // Initialize health tracking
    this.health.set(streamId, {
      streamId,
      active: true,
      uptime: 0,
      messagesReceived: 0,
      errors: 0,
      latency: 0,
      status: "healthy",
    });

    return streamId;
  }

  /**
   * Unsubscribe from a stream
   */
  unsubscribe(streamId: string): boolean {
    if (this.streams.has(streamId)) {
      const stream = this.streams.get(streamId)!;
      stream.active = false;

      // Flush remaining data
      this.flushBuffer(streamId);

      // Clean up all per-stream state
      this.buffers.delete(streamId);
      this.listeners.delete(streamId);
      this.health.delete(streamId);
      this.sequences.delete(streamId);

      return true;
    }

    return false;
  }

  /**
   * Add data to stream
   */
  pushData(streamId: string, data: Record<string, any>): void {
    if (!this.streams.has(streamId)) {
      return;
    }

    const buffer = this.buffers.get(streamId)!;
    const sequence = (this.sequences.get(streamId) ?? 0) + 1;
    this.sequences.set(streamId, sequence);

    const streamData: StreamData = {
      streamId,
      timestamp: Date.now(),
      data,
      sequence,
    };

    buffer.data.push(streamData);
    buffer.lastUpdate = Date.now();
    buffer.messageCount++;

    // Update health
    const health = this.health.get(streamId);
    if (health) {
      health.messagesReceived++;
    }

    // Auto-flush if buffer is full
    if (buffer.data.length >= this.config.maxBufferSize) {
      this.flushBuffer(streamId);
    }

    // Emit to listeners immediately for critical types
    this.notifyListeners(streamId, streamData);
  }

  /**
   * Flush buffer and notify listeners
   */
  flushBuffer(streamId: string): StreamData[] {
    const buffer = this.buffers.get(streamId);
    if (!buffer || buffer.data.length === 0) {
      return [];
    }

    const data = buffer.data.splice(0);
    buffer.lastUpdate = Date.now();

    return data;
  }

  /**
   * Get buffered data without flushing
   */
  getBufferedData(streamId: string): StreamData[] {
    const buffer = this.buffers.get(streamId);
    return buffer ? [...buffer.data] : [];
  }

  /**
   * Listen to stream events
   */
  listen(streamId: string, callback: (data: StreamData) => void): () => void {
    if (!this.listeners.has(streamId)) {
      this.listeners.set(streamId, new Set());
    }

    this.listeners.get(streamId)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(streamId)?.delete(callback);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(streamId: string, data: StreamData): void {
    const listeners = this.listeners.get(streamId);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (error) {
          const health = this.health.get(streamId);
          if (health) {
            health.errors++;
          }
        }
      }
    }
  }

  /**
   * Record error for stream
   */
  recordError(streamId: string): void {
    const health = this.health.get(streamId);
    if (health) {
      health.errors++;

      if (health.errors > 10) {
        health.status = "failed";
        health.active = false;
      } else if (health.errors > 5) {
        health.status = "degraded";
      }
    }
  }

  /**
   * Update stream latency
   */
  updateLatency(streamId: string, latency: number): void {
    const health = this.health.get(streamId);
    if (health) {
      health.latency = latency;

      if (latency > 5000) {
        health.status = "degraded";
      } else if (latency <= 1000) {
        health.status = "healthy";
      }
    }
  }

  /**
   * Get stream health
   */
  getHealth(streamId: string): StreamHealth | undefined {
    return this.health.get(streamId);
  }

  /**
   * Get all active streams
   */
  getActiveStreams(): DataStream[] {
    return Array.from(this.streams.values()).filter((s) => s.active);
  }

  /**
   * Get streams by symbol
   */
  getStreamsBySymbol(symbol: string): DataStream[] {
    return Array.from(this.streams.values()).filter((s) => s.symbol === symbol && s.active);
  }

  /**
   * Aggregate data from multiple streams
   */
  aggregateData(streamIds: string[]): Record<string, any> {
    const aggregated: Record<string, any> = {
      timestamp: Date.now(),
      streams: streamIds.length,
      data: [],
    };

    for (const streamId of streamIds) {
      const buffer = this.buffers.get(streamId);
      if (buffer && buffer.data.length > 0) {
        const latest = buffer.data[buffer.data.length - 1];
        aggregated.data.push({
          streamId,
          data: latest.data,
        });
      }
    }

    return aggregated;
  }

  /**
   * Get statistics for stream
   */
  getStreamStats(streamId: string): {
    totalMessages: number;
    bufferSize: number;
    uptime: number;
    messagesPerSecond: number;
  } {
    const stream = this.streams.get(streamId);
    const buffer = this.buffers.get(streamId);
    const health = this.health.get(streamId);

    if (!stream || !buffer || !health) {
      return { totalMessages: 0, bufferSize: 0, uptime: 0, messagesPerSecond: 0 };
    }

    const uptime = Date.now() - stream.subscriptionTime;
    const messagesPerSecond = uptime > 0 ? health.messagesReceived / (uptime / 1000) : 0;

    return {
      totalMessages: health.messagesReceived,
      bufferSize: buffer.data.length,
      uptime,
      messagesPerSecond,
    };
  }

  /**
   * Cleanup inactive streams
   */
  cleanup(maxInactiveTime: number = 3600000): void {
    const now = Date.now();

    for (const [streamId, stream] of this.streams.entries()) {
      if (!stream.active) {
        const buffer = this.buffers.get(streamId);
        if (buffer && now - buffer.lastUpdate > maxInactiveTime) {
          this.streams.delete(streamId);
          this.buffers.delete(streamId);
          this.listeners.delete(streamId);
          this.health.delete(streamId);
          this.sequences.delete(streamId);
        }
      }
    }
  }
}

export default DataStreamManager;

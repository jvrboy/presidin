// Execution Engine — Multi-broker order execution with smart routing, fill simulation, and order lifecycle management.
// Supports market, limit, stop, and OCO orders with partial fills and slippage modeling.

export type OrderSide = "BUY" | "SELL";
export type OrderType = "market" | "limit" | "stop" | "stop_limit" | "oco";
export type OrderStatus =
  | "pending"
  | "open"
  | "partially_filled"
  | "filled"
  | "cancelled"
  | "expired"
  | "rejected";

export type TimeInForce = "GTC" | "IOC" | "FOK" | "DAY";

export interface OrderRequest {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  reduceOnly?: boolean;
  postOnly?: boolean;
  clientOrderId?: string;
  ocoLimitPrice?: number; // for OCO orders: the limit leg
  ocoStopPrice?: number; // for OCO orders: the stop leg
}

export interface OrderFill {
  price: number;
  quantity: number;
  timestamp: number;
  fee: number;
  feeAsset: string;
}

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  price?: number;
  stopPrice?: number;
  avgFillPrice?: number;
  fills: OrderFill[];
  timeInForce: TimeInForce;
  reduceOnly: boolean;
  postOnly: boolean;
  clientOrderId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  rejectReason?: string;
}

export interface ExecutionReport {
  order: Order;
  slippage: number; // basis points from requested price
  latencyMs: number;
  route: string;
  error?: string;
}

export interface ExecutionConfig {
  maxSlippageBps: number;
  defaultTimeInForce: TimeInForce;
  partialFillEnabled: boolean;
  smartRoutingEnabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface RoutingRule {
  venue: string;
  priority: number;
  maxQuantity: number;
  allowedTypes: OrderType[];
  enabled: boolean;
  latencyBps: number; // estimated latency cost in bps
  feeBps: number; // venue fee in bps
}

const DEFAULT_CONFIG: ExecutionConfig = {
  maxSlippageBps: 50,
  defaultTimeInForce: "GTC",
  partialFillEnabled: true,
  smartRoutingEnabled: true,
  maxRetries: 3,
  retryDelayMs: 100,
};

const DEFAULT_ROUTING_RULES: RoutingRule[] = [
  {
    venue: "primary",
    priority: 1,
    maxQuantity: 1000,
    allowedTypes: ["market", "limit", "stop", "stop_limit"],
    enabled: true,
    latencyBps: 1,
    feeBps: 2,
  },
  {
    venue: "secondary",
    priority: 2,
    maxQuantity: 500,
    allowedTypes: ["market", "limit"],
    enabled: true,
    latencyBps: 3,
    feeBps: 1,
  },
  {
    venue: "darkpool",
    priority: 3,
    maxQuantity: 200,
    allowedTypes: ["limit"],
    enabled: true,
    latencyBps: 5,
    feeBps: 0.5,
  },
];

export class ExecutionEngine {
  private orders: Map<string, Order> = new Map();
  private ocoSiblings: Map<string, string> = new Map();
  private config: ExecutionConfig;
  private routingRules: RoutingRule[];
  private marketPrice: number;
  private spread: number;

  constructor(
    config: Partial<ExecutionConfig> = {},
    routingRules: RoutingRule[] = DEFAULT_ROUTING_RULES,
    marketPrice = 50000,
    spread = 0.001,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.routingRules = routingRules;
    this.marketPrice = marketPrice;
    this.spread = spread;
  }

  updateMarketState(price: number, spread: number): void {
    this.marketPrice = price;
    this.spread = spread;
  }

  async submitOrder(request: OrderRequest): Promise<ExecutionReport> {
    const startTime = Date.now();
    const validationError = this.validateOrder(request);
    if (validationError) {
      return this.rejectOrder(request, validationError, startTime);
    }

    if (request.type === "oco") {
      return this.submitOCO(request, startTime);
    }

    const route = this.selectRoute(request);
    const simulatedPrice = this.simulateFillPrice(request);
    const slippage = this.calculateSlippage(request, simulatedPrice);

    if (slippage > this.config.maxSlippageBps) {
      if (request.type === "market") {
        // Market orders still execute but with warning
        console.warn(
          `[ExecutionEngine] High slippage: ${slippage.toFixed(1)} bps (max: ${this.config.maxSlippageBps} bps)`,
        );
      } else {
        // Limit/stop orders get rejected when slippage exceeds max
        return this.rejectOrder(
          request,
          `Slippage ${slippage.toFixed(1)} bps exceeds max ${this.config.maxSlippageBps} bps`,
          startTime,
        );
      }
    }

    const order = this.createOrder(request, simulatedPrice, startTime);
    this.orders.set(order.id, order);

    // Simulate partial fill logic
    if (request.type === "market") {
      this.simulateMarketFill(order, startTime);
    } else {
      this.simulateLimitFill(order, startTime);
    }

    return {
      order,
      slippage,
      latencyMs: Date.now() - startTime,
      route: route.venue,
    };
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.orders.get(orderId);
    if (!order) return false;
    if (order.status === "filled" || order.status === "cancelled") return false;
    order.status = "cancelled";
    order.updatedAt = Date.now();
    return true;
  }

  async amendOrder(
    orderId: string,
    updates: Partial<Pick<OrderRequest, "price" | "stopPrice" | "quantity">>,
  ): Promise<Order | null> {
    const order = this.orders.get(orderId);
    if (!order || order.status !== "open") return null;
    if (updates.price !== undefined) order.price = updates.price;
    if (updates.stopPrice !== undefined) order.stopPrice = updates.stopPrice;
    if (updates.quantity !== undefined) {
      // Quantity can never drop below what has already been filled
      const newQty = Math.max(order.filledQuantity, updates.quantity);
      order.quantity = newQty;
      order.remainingQuantity = Math.max(0, newQty - order.filledQuantity);
    }
    order.updatedAt = Date.now();
    return order;
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  getOpenOrders(symbol?: string): Order[] {
    const open: Order[] = [];
    for (const order of this.orders.values()) {
      if (["open", "pending", "partially_filled"].includes(order.status)) {
        if (!symbol || order.symbol === symbol) open.push(order);
      }
    }
    return open;
  }

  getAllOrders(): Order[] {
    return Array.from(this.orders.values());
  }

  private validateOrder(request: OrderRequest): string | null {
    if (!request.symbol) return "Symbol is required";
    if (request.quantity <= 0) return "Quantity must be positive";
    if (request.type === "limit" && (!request.price || request.price <= 0)) {
      return "Limit price required and must be positive";
    }
    if (request.type === "stop" && (!request.stopPrice || request.stopPrice <= 0)) {
      return "Stop price required and must be positive";
    }
    if (request.type === "stop_limit" && (!request.price || !request.stopPrice)) {
      return "Both price and stop price required for stop-limit orders";
    }
    if (request.type === "oco" && (!request.ocoLimitPrice || !request.ocoStopPrice)) {
      return "Both OCO limit and stop prices required";
    }
    if (request.quantity > 100000) return "Quantity exceeds maximum allowed";
    return null;
  }

  private selectRoute(request: OrderRequest): RoutingRule {
    if (!this.config.smartRoutingEnabled) {
      return this.routingRules[0];
    }
    const valid = this.routingRules.filter(
      (r) =>
        r.enabled && r.allowedTypes.includes(request.type) && r.maxQuantity >= request.quantity,
    );
    return valid.sort((a, b) => a.priority - b.priority)[0] || this.routingRules[0];
  }

  private simulateFillPrice(request: OrderRequest): number {
    const basePrice = request.price || this.marketPrice;
    const randomWalk = (Math.random() - 0.5) * this.spread * basePrice;
    if (request.type === "market") {
      const direction = request.side === "BUY" ? 1 : -1;
      return basePrice + direction * (this.spread / 2) * basePrice + randomWalk;
    }
    return basePrice;
  }

  private calculateSlippage(request: OrderRequest, fillPrice: number): number {
    const refPrice = request.price || this.marketPrice;
    if (refPrice === 0) return 0;
    const diff = Math.abs(fillPrice - refPrice) / refPrice;
    return diff * 10000; // convert to bps
  }

  private createOrder(request: OrderRequest, fillPrice: number, timestamp: number): Order {
    return {
      id: request.id || `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      status: "pending",
      quantity: request.quantity,
      filledQuantity: 0,
      remainingQuantity: request.quantity,
      price: request.price,
      stopPrice: request.stopPrice,
      avgFillPrice: undefined,
      fills: [],
      timeInForce: request.timeInForce || this.config.defaultTimeInForce,
      reduceOnly: request.reduceOnly || false,
      postOnly: request.postOnly || false,
      clientOrderId: request.clientOrderId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private simulateMarketFill(order: Order, timestamp: number): void {
    const fillPrice = this.simulateFillPrice({
      id: order.id,
      symbol: order.symbol,
      side: order.side,
      type: "market",
      quantity: order.quantity,
      timeInForce: "IOC",
    });
    order.status = "filled";
    order.filledQuantity = order.quantity;
    order.remainingQuantity = 0;
    order.avgFillPrice = fillPrice;
    order.fills.push({
      price: fillPrice,
      quantity: order.quantity,
      timestamp,
      fee: fillPrice * order.quantity * 0.001, // 0.1% fee
      feeAsset: "USD",
    });
    order.updatedAt = timestamp;
    this.handleOcoFill(order);
  }

  private simulateLimitFill(order: Order, timestamp: number): void {
    // For backtesting: assume limit orders fill at 70% probability within the bar
    const fillProbability = 0.7;
    if (Math.random() < fillProbability) {
      order.status = "filled";
      order.filledQuantity = order.quantity;
      order.remainingQuantity = 0;
      order.avgFillPrice = order.price || this.marketPrice;
      order.fills.push({
        price: order.price || this.marketPrice,
        quantity: order.quantity,
        timestamp,
        fee: (order.price || this.marketPrice) * order.quantity * 0.0005,
        feeAsset: "USD",
      });
      this.handleOcoFill(order);
    } else {
      order.status = "open";
    }
    order.updatedAt = timestamp;
  }

  private async submitOCO(request: OrderRequest, startTime: number): Promise<ExecutionReport> {
    const limitRequest: OrderRequest = {
      ...request,
      type: "limit",
      price: request.ocoLimitPrice,
      id: `${request.id}-limit`,
      ocoLimitPrice: undefined,
      ocoStopPrice: undefined,
    };
    const stopRequest: OrderRequest = {
      ...request,
      type: "stop",
      stopPrice: request.ocoStopPrice,
      id: `${request.id}-stop`,
      ocoLimitPrice: undefined,
      ocoStopPrice: undefined,
    };

    const limitReport = await this.submitOrder(limitRequest);
    const stopReport = await this.submitOrder(stopRequest);

    const limitOrder = this.orders.get(limitRequest.id!);
    const stopOrder = this.orders.get(stopRequest.id!);
    if (limitOrder && stopOrder) {
      // Link the pair so filling one cancels the other
      this.ocoSiblings.set(limitOrder.id, stopOrder.id);
      this.ocoSiblings.set(stopOrder.id, limitOrder.id);
    }

    const combinedOrder = limitReport.order;
    combinedOrder.id = request.id;
    combinedOrder.type = "oco";

    const limitDone =
      !!limitOrder && ["filled", "rejected", "cancelled"].includes(limitOrder.status);
    const stopDone = !!stopOrder && ["filled", "rejected", "cancelled"].includes(stopOrder.status);

    if (limitDone && !stopDone && stopOrder) {
      await this.cancelOrder(stopOrder.id);
      combinedOrder.status = limitOrder!.status === "filled" ? "filled" : "cancelled";
    } else if (stopDone && !limitDone && limitOrder) {
      await this.cancelOrder(limitOrder.id);
      combinedOrder.status = "cancelled";
    } else if (limitDone && stopDone) {
      combinedOrder.status = limitOrder!.status === "filled" ? "filled" : stopOrder!.status;
    } else {
      combinedOrder.status = "open";
    }

    if (!combinedOrder.fills.length && limitOrder?.fills.length) {
      combinedOrder.fills = limitOrder.fills;
      combinedOrder.avgFillPrice = limitOrder.avgFillPrice;
      combinedOrder.filledQuantity = limitOrder.filledQuantity;
      combinedOrder.remainingQuantity = limitOrder.remainingQuantity;
    }

    this.orders.set(combinedOrder.id, combinedOrder);

    return {
      order: combinedOrder,
      slippage: Math.max(limitReport.slippage, stopReport.slippage),
      latencyMs: Date.now() - startTime,
      route: "oco_combined",
    };
  }

  /**
   * When one leg of an OCO fills, the sibling leg must be cancelled.
   */
  private handleOcoFill(order: Order): void {
    const siblingId = this.ocoSiblings.get(order.id);
    if (!siblingId) return;
    this.ocoSiblings.delete(order.id);
    const sibling = this.orders.get(siblingId);
    if (sibling && !["filled", "rejected", "cancelled"].includes(sibling.status)) {
      sibling.status = "cancelled";
      sibling.updatedAt = Date.now();
    }
  }

  private rejectOrder(request: OrderRequest, reason: string, timestamp: number): ExecutionReport {
    const order: Order = {
      id: request.id,
      symbol: request.symbol,
      side: request.side,
      type: request.type,
      status: "rejected",
      quantity: request.quantity,
      filledQuantity: 0,
      remainingQuantity: request.quantity,
      price: request.price,
      stopPrice: request.stopPrice,
      fills: [],
      timeInForce: request.timeInForce || this.config.defaultTimeInForce,
      reduceOnly: request.reduceOnly || false,
      postOnly: request.postOnly || false,
      clientOrderId: request.clientOrderId,
      createdAt: timestamp,
      updatedAt: timestamp,
      rejectReason: reason,
    };
    this.orders.set(order.id, order);
    return {
      order,
      slippage: 0,
      latencyMs: Date.now() - timestamp,
      route: "none",
      error: reason,
    };
  }
}

export function createExecutionEngine(
  config?: Partial<ExecutionConfig>,
  routingRules?: RoutingRule[],
): ExecutionEngine {
  return new ExecutionEngine(config, routingRules);
}

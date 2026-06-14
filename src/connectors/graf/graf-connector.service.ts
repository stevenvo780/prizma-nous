import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { serviceUrl, type ServiceSource } from "@olympo/contracts";
import {
  DestinationConnectorBase,
  ConnectorResult,
} from "../destination-connector.base";

/**
 * Graf (e-commerce, SSOT online order) destination connector.
 * Reacts to DELIVERY_STATUS_UPDATE / DELIVERY_COMPLETED → update the order's
 * delivery state in Graf (Flow 7).
 */
@Injectable()
export class GrafConnectorService extends DestinationConnectorBase {
  protected readonly service: ServiceSource = "graf";

  constructor(http: HttpService) {
    super(http, GrafConnectorService.name);
  }

  protected baseUrl(): string {
    return process.env.GRAF_API_URL || serviceUrl("graf");
  }

  /** delivery.status_update / delivery.completed → patch the order in Graf. */
  async updateOrderDelivery(
    data: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<ConnectorResult> {
    const orderId = data?.orderId ?? data?.order_id ?? "";
    const path = orderId
      ? `/api/orders/${encodeURIComponent(String(orderId))}/delivery`
      : "/api/orders/delivery";
    return this.post(path, data, idempotencyKey);
  }
}

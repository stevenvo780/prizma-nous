import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { serviceUrl, type ServiceSource } from "@olympo/contracts";
import {
  DestinationConnectorBase,
  ConnectorResult,
} from "../destination-connector.base";

/**
 * MeraVuelta (delivery / logistics) destination connector.
 * Reacts to ORDER_PAID / POS_SALE_CREATED → DELIVERY_CREATE (Flow 1 & 3).
 */
@Injectable()
export class MeraVueltaConnectorService extends DestinationConnectorBase {
  protected readonly service: ServiceSource = "meravuelta";

  constructor(http: HttpService) {
    super(http, MeraVueltaConnectorService.name);
  }

  protected baseUrl(): string {
    return process.env.MERAVUELTA_API_URL || serviceUrl("meravuelta");
  }

  /** delivery.create — create a delivery for an order/sale. */
  async deliveryCreate(
    data: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<ConnectorResult> {
    return this.post("/api/deliveries", data, idempotencyKey);
  }
}

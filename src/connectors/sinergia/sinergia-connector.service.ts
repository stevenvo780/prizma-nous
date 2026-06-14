import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { serviceUrl, type ServiceSource } from "@olympo/contracts";
import {
  DestinationConnectorBase,
  ConnectorResult,
} from "../destination-connector.base";

/**
 * Sinergia POS destination connector.
 * Reacts to ORDER_PENDING_APPROVAL → notify Sinergia for in-store approval
 * (Flow 2). Sinergia later emits ORDER_APPROVED which resumes Flow 1.
 */
@Injectable()
export class SinergiaConnectorService extends DestinationConnectorBase {
  protected readonly service: ServiceSource = "sinergia";

  constructor(http: HttpService) {
    super(http, SinergiaConnectorService.name);
  }

  protected baseUrl(): string {
    return process.env.SINERGIA_API_URL || serviceUrl("sinergia");
  }

  /** pedido.pendiente_aprobacion — enqueue an order awaiting POS approval. */
  async notifyPendingApproval(
    data: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<ConnectorResult> {
    return this.post("/api/orders/pending-approval", data, idempotencyKey);
  }
}

import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { serviceUrl, type ServiceSource } from "@olympo/contracts";
import {
  DestinationConnectorBase,
  ConnectorResult,
} from "../destination-connector.base";

/**
 * ApiSigo (e-invoicing) event-driven destination connector.
 *
 * NOTE: the existing {@link ApiSigoConnectorService} handles the rich, per-store
 * credentialed Graf→Sigo invoice flow (legacy Graf webhook path). This connector
 * is the thin, canonical-event entrypoint used by the @olympo/contracts router
 * for INVOICE_CREATE coming from ORDER_PAID / POS_SALE_CREATED (Flow 1 & 3).
 */
@Injectable()
export class ApiSigoEventConnectorService extends DestinationConnectorBase {
  protected readonly service: ServiceSource = "apisigo";

  constructor(http: HttpService) {
    super(http, ApiSigoEventConnectorService.name);
  }

  protected baseUrl(): string {
    return process.env.APISIGO_API_URL || serviceUrl("apisigo");
  }

  /** invoice.create — request an e-invoice for an order/sale. */
  async invoiceCreate(
    data: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<ConnectorResult> {
    return this.post("/api/invoices/from-event", data, idempotencyKey);
  }
}

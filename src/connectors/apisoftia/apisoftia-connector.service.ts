import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { serviceUrl, type ServiceSource } from "@olympo/contracts";
import {
  DestinationConnectorBase,
  ConnectorResult,
} from "../destination-connector.base";

/**
 * ApiSoftia (CRM, Soft-ia) destination connector.
 * Reacts to ORDER_PAID / CUSTOMER_CREATED → CUSTOMER_UPDATE (Flow 1 & 5).
 */
@Injectable()
export class ApiSoftiaConnectorService extends DestinationConnectorBase {
  protected readonly service: ServiceSource = "apisoftia";

  constructor(http: HttpService) {
    super(http, ApiSoftiaConnectorService.name);
  }

  protected baseUrl(): string {
    return process.env.APISOFTIA_API_URL || serviceUrl("apisoftia");
  }

  /** customer.update — upsert the customer in the CRM. */
  async customerUpdate(
    data: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<ConnectorResult> {
    return this.post("/api/customers/upsert", data, idempotencyKey);
  }
}

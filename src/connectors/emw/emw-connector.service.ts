import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { serviceUrl, type ServiceSource } from "@olympo/contracts";
import {
  DestinationConnectorBase,
  ConnectorResult,
} from "../destination-connector.base";

/**
 * EMW (WhatsApp notifications / campaigns) destination connector.
 * Reacts to ORDER_PAID / POS_SALE_CREATED / DELIVERY_* → NOTIFICATION_WHATSAPP.
 */
@Injectable()
export class EmwConnectorService extends DestinationConnectorBase {
  protected readonly service: ServiceSource = "emw";

  constructor(http: HttpService) {
    super(http, EmwConnectorService.name);
  }

  protected baseUrl(): string {
    return process.env.EMW_API_URL || serviceUrl("emw");
  }

  /** notification.whatsapp — send a WhatsApp notification. */
  async notificationWhatsapp(
    data: Record<string, any>,
    idempotencyKey?: string,
  ): Promise<ConnectorResult> {
    return this.post("/api/notifications/whatsapp", data, idempotencyKey);
  }
}

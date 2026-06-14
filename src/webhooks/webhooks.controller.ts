import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  HttpCode,
  Logger,
  Req,
} from "@nestjs/common";
import { Request } from "express";
import { WebhooksService } from "./webhooks.service";
import { EventProcessorService } from "../queue/event-processor.service";

@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly eventProcessor: EventProcessorService,
  ) {}

  /**
   * 🌊 Canonical HubCentral event ingress (@olympo/contracts).
   *
   * Receives a signed {@link EventEnvelope} from any service in the ecosystem
   * (this is the exact path the contracts `HubClient` publishes to). It:
   *   1. parses + validates the envelope (Zod),
   *   2. verifies the HMAC signature (header `x-cauce-signature`) when a hub
   *      secret is configured,
   *   3. validates the event-specific payload (`validateEvent`),
   *   4. dedupes by idempotencyKey and enqueues by priority for fan-out.
   *
   * Returns 202 Accepted on success; 400 on a malformed/invalid/unsigned event.
   */
  @Post("/hubcentral")
  @HttpCode(202)
  async handleHubCentralEvent(
    @Body() envelope: any,
    @Headers("x-cauce-signature") signature?: string,
  ): Promise<any> {
    try {
      const result = await this.eventProcessor.ingest(envelope, signature);
      this.logger.log(
        `📥 hubcentral: ${result.eventType} (id=${result.eventId})${result.duplicate ? " [duplicate]" : ""}`,
      );
      return { success: true, ...result };
    } catch (error) {
      // BadRequestException → 400 (malformed/invalid/bad signature).
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`❌ Error procesando evento hubcentral: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  @Post("/graf")
  async handleGrafWebhook(
    @Body() payload: any,
    @Headers() headers: Record<string, string>,
    @Req() _req: Request,
  ): Promise<any> {
    this.logger.log("📥 Webhook recibido de Graf", {
      eventType: payload.event_type,
      source: headers["x-source"],
    });

    try {
      const apiKey = headers["x-api-key"];
      if (!apiKey) {
        throw new BadRequestException(
          "❌ API Key requerida en header x-api-key",
        );
      }

      await this.webhooksService.validateSimpleApiKey(apiKey);

      const context = {
        tenantId: headers["x-tenant-id"] || "default",
        source: "graf",
      };

      const result = await this.webhooksService.processGrafEvent(
        payload,
        context,
      );

      this.logger.log("✅ Evento procesado exitosamente", {
        eventType: payload.event_type,
        tenantId: context.tenantId,
        result,
      });

      return {
        success: true,
        message: "Evento procesado correctamente",
        result,
      };
    } catch (error) {
      this.logger.error("❌ Error procesando webhook de Graf", {
        error: error.message,
        eventType: payload.event_type,
        tenantId: headers["x-tenant-id"],
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 🏥 Health check endpoint
   */
  @Post("/health")
  async healthCheck(): Promise<any> {
    return {
      status: "ok",
      service: "HubCentral Webhooks",
      timestamp: new Date().toISOString(),
    };
  }
}

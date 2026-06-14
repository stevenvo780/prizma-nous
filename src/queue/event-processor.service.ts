import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import {
  EventEnvelopeSchema,
  validateEvent,
  verifySignature,
  type EventEnvelope,
} from "@olympo/contracts";
import { QueueService } from "./queue.service";

export interface IngestResult {
  accepted: boolean;
  duplicate?: boolean;
  eventId: string;
  eventType: string;
  priority: EventEnvelope["priority"];
  idempotencyKey: string;
}

/**
 * EventProcessorService — inbound pipeline for canonical events arriving at
 * `POST /webhooks/hubcentral`.
 *
 * Steps (ARCHITECTURE.md §4 envelope contract):
 *   1. Parse + structurally validate the EventEnvelope (Zod).
 *   2. Verify the HMAC-SHA256 signature with `verifySignature` IF a hub secret is
 *      configured (header `x-cauce-signature`, falling back to envelope.signature).
 *   3. Validate the event-specific payload with `validateEvent`.
 *   4. Idempotency: dedupe by idempotencyKey (Redis), so a re-delivered event is
 *      accepted but not re-enqueued.
 *   5. Enqueue by priority for the worker to fan-out to destination connectors.
 */
@Injectable()
export class EventProcessorService {
  private readonly logger = new Logger(EventProcessorService.name);
  private readonly secret =
    process.env.CAUCE_HUB_SECRET || process.env.HUB_CENTRAL_SECRET || undefined;

  constructor(private readonly queueService: QueueService) {}

  /**
   * Ingest a raw envelope from the hubcentral webhook. Returns an IngestResult.
   * Throws BadRequestException on malformed envelope / bad signature / invalid
   * payload (the controller maps that to a 400).
   */
  async ingest(
    rawBody: unknown,
    signatureHeader?: string,
  ): Promise<IngestResult> {
    // 1) Parse + structural validation.
    const parsed = EventEnvelopeSchema.safeParse(rawBody);
    if (!parsed.success) {
      this.logger.warn(`Envelope inválido: ${parsed.error.message}`);
      throw new BadRequestException(`Invalid event envelope: ${parsed.error.message}`);
    }
    const env: EventEnvelope = parsed.data;

    // 2) HMAC verification (only when a secret is configured).
    if (this.secret) {
      const signature = signatureHeader || env.signature;
      // The publisher (HubClient) signs `env.data`, not the whole envelope.
      const ok = verifySignature(env.data, signature, this.secret);
      if (!ok) {
        this.logger.warn(
          `Firma HMAC inválida para evento ${env.eventId} (${env.eventType})`,
        );
        throw new BadRequestException("Invalid HMAC signature");
      }
    } else {
      this.logger.debug(
        "Sin secreto de hub configurado: se omite verificación de firma (modo abierto).",
      );
    }

    // 3) Payload contract validation.
    const check = validateEvent(env);
    if (!check.ok) {
      const reason = "error" in check ? check.error : "unknown";
      this.logger.warn(
        `Payload de "${env.eventType}" no pasó validación de contrato: ${reason}`,
      );
      throw new BadRequestException(`Invalid event payload: ${reason}`);
    }

    // 4) Idempotency dedupe.
    const idempotencyKey = env.idempotencyKey || env.eventId;
    const dedupeKey = `idem:${idempotencyKey}`;
    const already = await this.queueService.isEventProcessed(dedupeKey);
    if (already) {
      this.logger.log(
        `↩️ Evento duplicado (idem=${idempotencyKey}) — aceptado sin reencolar.`,
      );
      return {
        accepted: true,
        duplicate: true,
        eventId: env.eventId,
        eventType: env.eventType,
        priority: env.priority,
        idempotencyKey,
      };
    }
    // Reserve the idempotency key up-front so concurrent re-deliveries collapse.
    await this.queueService.markAsProcessed(dedupeKey);

    // 5) Enqueue by priority.
    await this.queueService.addToPriorityQueue(
      {
        id: env.eventId,
        type: env.eventType,
        source: env.source,
        // carry the full canonical envelope so the worker can route it as-is.
        data: { envelope: env, idempotencyKey },
      },
      env.priority,
    );

    this.logger.log(
      `✅ Evento canónico aceptado: ${env.eventType} (id=${env.eventId}, prio=${env.priority}, idem=${idempotencyKey})`,
    );

    return {
      accepted: true,
      eventId: env.eventId,
      eventType: env.eventType,
      priority: env.priority,
      idempotencyKey,
    };
  }
}

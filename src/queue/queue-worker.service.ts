import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { EventEnvelope } from "@olympo/contracts";
import { QueueService } from "./queue.service";
import { ConnectorOrchestratorService } from "../connectors/connector-orchestrator.service";
import { EventRouterService } from "../connectors/event-router.service";
import { GrafOrder } from "../connectors/apisigo/apisigo-connector.service";
import { OlympoService } from "../cauce/cauce.service";

@Injectable()
export class QueueWorkerService implements OnModuleInit {
  private readonly logger = new Logger(QueueWorkerService.name);
  private isProcessing = false;

  constructor(
    private queueService: QueueService,
    private orchestrator: ConnectorOrchestratorService,
    private eventRouter: EventRouterService,
    private cauce: OlympoService,
  ) {}

  async onModuleInit() {
    this.startProcessing();
  }

  /**
   * Inicia el procesamiento continuo de eventos de la cola
   */
  private async startProcessing() {
    this.logger.log("🚀 Worker iniciado, procesando eventos de cola");

    while (true) {
      try {
        if (!this.isProcessing) {
          this.isProcessing = true;

          // Drain priority lanes first (critical→high→normal→low→legacy).
          const events = await this.queueService.getNextByPriority(5);

          for (const event of events) {
            await this.dispatch(event);
          }

          this.isProcessing = false;
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        this.logger.error("Error en worker:", error);
        this.isProcessing = false;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Decides whether a dequeued item is a canonical @olympo/contracts envelope
   * (route via EventRouterService → destination connectors) or a legacy Graf
   * webhook payload (route via the existing ApiSigo orchestrator).
   */
  private async dispatch(event: any) {
    const envelope: EventEnvelope | undefined = event?.data?.envelope;
    if (envelope && envelope.eventType) {
      await this.processCanonicalEvent(event, envelope);
    } else {
      await this.processEvent(event);
    }
  }

  /**
   * Canonical fan-out: route the envelope to every destination connector per
   * ARCHITECTURE.md §4. Fault-tolerant — EventRouterService never throws and
   * each connector swallows transport errors, so a dead destination does not
   * fail the whole event.
   */
  private async processCanonicalEvent(event: any, envelope: EventEnvelope) {
    try {
      this.logger.log(
        `🎯 Routing canonical event ${envelope.eventType} (id=${envelope.eventId}, prio=${event.priority})`,
      );
      const results = await this.eventRouter.route(envelope);
      await this.queueService.markAsProcessed(event.id);
      const failed = results.filter((r) => !r.ok && !r.skipped).length;
      if (failed > 0) {
        this.logger.warn(
          `⚠️ ${envelope.eventType}: ${failed} destino(s) fallaron (no se reintenta el evento completo; cada destino es idempotente).`,
        );
      }
    } catch (error) {
      // Defensive: route() is already non-throwing, but guard the loop anyway.
      this.logger.error(
        `❌ Error ruteando evento canónico ${envelope.eventType}:`,
        error,
      );
      if ((event.retryCount || 0) < 3) {
        await this.queueService.requeuePriorityEvent(event);
      } else {
        this.logger.error(
          `💀 Evento canónico ${envelope.eventType} descartado tras 3 intentos`,
        );
      }
    }
  }

  /**
   * Procesa un evento individual - Interfaz simple
   */
  private async processEvent(event: any) {
    try {
      this.logger.log(
        `🎯 Procesando evento: ${event.type} desde ${event.source}`,
      );

      const grafWebhookPayload = event.data;
      const order: GrafOrder = grafWebhookPayload.data as GrafOrder;
      const eventType = event.type;
      const userEmail =
        grafWebhookPayload.userCredentials?.userEmail ||
        "admin@graf-system.com";
      const storeId = order.store.id;

      this.logger.debug(
        `[QueueWorker] Procesando orden ${order.id} de tienda ${storeId} para usuario ${userEmail}`,
      );

      await this.orchestrator.processEvent(
        order,
        eventType,
        userEmail,
        storeId,
      );

      await this.queueService.markAsProcessed(event.id);
      this.logger.log(`✅ Evento ${event.type} procesado exitosamente`);

      // --- Olympo: re-emit the canonical event so the rest of the ecosystem
      // (ApiSoftia CRM, ApiSigo invoicing, MeraVuelta delivery, EMW WhatsApp —
      // Flow 1/2/5) can react. HubCentral owns this re-emission (source="hub").
      // Non-blocking & fault-tolerant: HubClient swallows transport errors, so
      // this never affects the already-completed local processing.
      void this.publishCanonical(eventType, order, event.id);
    } catch (error) {
      this.logger.error(`❌ Error procesando evento ${event.type}:`, error);

      if (event.retryCount < 3) {
        await this.queueService.requeueEvent(event);
        this.logger.log(
          `🔄 Evento ${event.type} reencolado (intento ${event.retryCount + 1})`,
        );
      } else {
        this.logger.error(
          `💀 Evento ${event.type} descartado después de 3 intentos`,
        );
      }
    }
  }

  /**
   * Maps the hub-normalized order event to its canonical @olympo/contracts event
   * and re-publishes it. Fault-tolerant: never throws into the worker loop.
   */
  private async publishCanonical(
    eventType: string,
    order: GrafOrder,
    sourceEventId: string,
  ): Promise<void> {
    try {
      const customer = {
        id: order.customer?.id?.toString() ?? order.user?.id?.toString(),
        name: order.customer?.name ?? order.user?.name,
        phone: order.customer?.phone,
        email: order.customer?.email ?? order.user?.email,
      };
      const items = (order.items || []).map((it: any) => ({
        sku: String(it?.product?.code ?? it?.product?.id ?? it?.id ?? ""),
        name: it?.product?.title,
        qty: Number(it?.quantity ?? it?.qty ?? 1),
        unitPrice: Number(it?.unitPrice ?? it?.price ?? 0),
      }));
      const total = Number(order.amount?.total ?? 0);
      const orderId = String(order.id);
      const store = order.store?.id;
      const idempotencyKey = `hub:${sourceEventId}`;

      switch (eventType) {
        case "order.paid":
          await this.cauce.publishOrderPaid(
            { orderId, customer, items, total, store },
            { idempotencyKey },
          );
          break;
        case "order.pending":
          await this.cauce.publishOrderPendingApproval(
            { orderId, customer, total, store },
            { idempotencyKey },
          );
          break;
        // Other normalized order states (shipped/delivered/canceled/updated)
        // are not part of a canonical Olympo event yet — intentionally skipped.
        default:
          this.logger.debug(
            `[Olympo] No canonical event mapped for "${eventType}" (order ${orderId}); skip.`,
          );
      }
    } catch (err: any) {
      // Defensive only: HubClient is already non-throwing, but the payload
      // mapping above must never break the worker.
      this.logger.warn(
        `[Olympo] publishCanonical failed (non-fatal): ${err?.message}`,
      );
    }
  }
}

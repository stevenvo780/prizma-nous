import { Injectable, Logger } from "@nestjs/common";
import { EVENTS, type EventEnvelope } from "@olympo/contracts";
import { ApiSoftiaConnectorService } from "./apisoftia/apisoftia-connector.service";
import { ApiSigoEventConnectorService } from "./apisigo/apisigo-event-connector.service";
import { MeraVueltaConnectorService } from "./meravuelta/meravuelta-connector.service";
import { EmwConnectorService } from "./emw/emw-connector.service";
import { SinergiaConnectorService } from "./sinergia/sinergia-connector.service";
import { GrafConnectorService } from "./graf/graf-connector.service";
import { ConnectorResult } from "./destination-connector.base";

/**
 * EventRouterService — the fan-out core of HubCentral orchestration.
 *
 * Given a canonical {@link EventEnvelope} (already parsed, signature-verified and
 * schema-validated upstream), it routes the event to every destination connector
 * required by the business flows in ARCHITECTURE.md §4:
 *
 *   ORDER_PAID              → ApiSoftia(CUSTOMER_UPDATE) + ApiSigo(INVOICE_CREATE)
 *                             + MeraVuelta(DELIVERY_CREATE) + EMW(NOTIFICATION_WHATSAPP)
 *   ORDER_PENDING_APPROVAL  → Sinergia (pending approval)
 *   ORDER_APPROVED          → resumes ORDER_PAID fan-out
 *   POS_SALE_CREATED        → MeraVuelta + EMW + ApiSigo
 *   DELIVERY_STATUS_UPDATE  → Graf (update order) + EMW
 *   DELIVERY_COMPLETED      → Graf (update order) + EMW
 *
 * Fault tolerance (§2.2): every connector call is awaited via Promise.allSettled
 * and each connector itself never throws, so one dead destination does not break
 * the rest of the fan-out. Idempotency: the envelope's idempotencyKey is threaded
 * down to every destination call (forwarded as x-idempotency-key); central dedup
 * by idempotencyKey happens in the inbound queue (see EventProcessorService).
 */
@Injectable()
export class EventRouterService {
  private readonly logger = new Logger(EventRouterService.name);

  constructor(
    private readonly apisoftia: ApiSoftiaConnectorService,
    private readonly apisigo: ApiSigoEventConnectorService,
    private readonly meravuelta: MeraVueltaConnectorService,
    private readonly emw: EmwConnectorService,
    private readonly sinergia: SinergiaConnectorService,
    private readonly graf: GrafConnectorService,
  ) {}

  /** Route a canonical envelope to its destination connectors. */
  async route(env: EventEnvelope): Promise<ConnectorResult[]> {
    const idem = env.idempotencyKey || env.eventId;
    const data = env.data || {};
    this.logger.log(
      `🧭 Routing "${env.eventType}" (id=${env.eventId}, source=${env.source}, idem=${idem})`,
    );

    let tasks: Promise<ConnectorResult>[] = [];

    switch (env.eventType) {
      // Flow 1 (online) & Flow 2 resume (offline approved): full fan-out.
      case EVENTS.ORDER_PAID: // "pedido.pagado"
      case EVENTS.ORDER_APPROVED: // "pedido.aprobado" → resumes Flow 1
        tasks = [
          this.apisoftia.customerUpdate(this.toCustomerUpdate(data), idem),
          this.apisigo.invoiceCreate(this.toInvoiceCreate(data), idem),
          this.meravuelta.deliveryCreate(this.toDeliveryCreate(data), idem),
          this.emw.notificationWhatsapp(this.toOrderNotification(data), idem),
        ];
        break;

      // Flow 2 (offline): wait for Sinergia approval.
      case EVENTS.ORDER_PENDING_APPROVAL: // "pedido.pendiente_aprobacion"
        tasks = [this.sinergia.notifyPendingApproval(data, idem)];
        break;

      // Flow 3 (in-store sale).
      case EVENTS.POS_SALE_CREATED: // "venta_pos.creada"
        tasks = [
          this.meravuelta.deliveryCreate(this.toDeliveryCreate(data), idem),
          this.emw.notificationWhatsapp(this.toSaleNotification(data), idem),
          this.apisigo.invoiceCreate(this.toInvoiceCreate(data), idem),
        ];
        break;

      // Flow 7 (delivery lifecycle): keep Graf order in sync + notify customer.
      case EVENTS.DELIVERY_STATUS_UPDATE: // "delivery.status_update"
      case EVENTS.DELIVERY_COMPLETED: // "delivery.completed"
      case EVENTS.DELIVERY_CREATED: // "delivery.created"
        tasks = [
          this.graf.updateOrderDelivery(data, idem),
          this.emw.notificationWhatsapp(this.toDeliveryNotification(env.eventType, data), idem),
        ];
        break;

      // Flow 5: standalone CRM sync.
      case EVENTS.CUSTOMER_CREATED: // "cliente.creado"
        tasks = [this.apisoftia.customerUpdate(this.toCustomerUpdate(data), idem)];
        break;

      default:
        this.logger.debug(
          `No destination route for "${env.eventType}"; ignoring (open ecosystem).`,
        );
        return [];
    }

    const settled = await Promise.allSettled(tasks);
    const results: ConnectorResult[] = settled.map((s) =>
      s.status === "fulfilled"
        ? s.value
        : { service: "hub", ok: false, reason: (s.reason as Error)?.message },
    );

    const okCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok && !r.skipped).map((r) => r.service);
    const skipped = results.filter((r) => r.skipped).map((r) => r.service);
    this.logger.log(
      `🧭 Routed "${env.eventType}": ${okCount}/${results.length} ok` +
        (failed.length ? ` · failed=[${failed.join(",")}]` : "") +
        (skipped.length ? ` · skipped=[${skipped.join(",")}]` : ""),
    );
    return results;
  }

  // --- payload adapters: canonical event data → per-destination request body ---

  private toCustomerUpdate(data: any): Record<string, any> {
    return {
      customer: data.customer || {},
      source: data.source || "graf",
      orderId: data.orderId,
    };
  }

  private toInvoiceCreate(data: any): Record<string, any> {
    return {
      orderId: data.orderId ?? data.saleId,
      customer: data.customer || {},
      items: data.items || [],
      total: data.total,
      currency: data.currency || "COP",
      store: data.store,
    };
  }

  private toDeliveryCreate(data: any): Record<string, any> {
    return {
      orderId: data.orderId ?? data.saleId,
      address:
        data.address ||
        data.shippingAddress?.address ||
        data.customer?.address ||
        "",
      customer: data.customer || {},
      items: data.items || [],
      store: data.store,
    };
  }

  private toOrderNotification(data: any): Record<string, any> {
    return {
      to: data.customer?.phone || data.to || "",
      template: "order_paid",
      variables: {
        orderId: String(data.orderId ?? ""),
        total: String(data.total ?? ""),
        name: data.customer?.name || "",
      },
    };
  }

  private toSaleNotification(data: any): Record<string, any> {
    return {
      to: data.customer?.phone || data.to || "",
      template: "pos_sale_created",
      variables: {
        saleId: String(data.saleId ?? ""),
        total: String(data.total ?? ""),
        name: data.customer?.name || "",
      },
    };
  }

  private toDeliveryNotification(eventType: string, data: any): Record<string, any> {
    return {
      to: data.customer?.phone || data.to || "",
      template:
        eventType === EVENTS.DELIVERY_COMPLETED
          ? "delivery_completed"
          : "delivery_status_update",
      variables: {
        deliveryId: String(data.deliveryId ?? ""),
        orderId: String(data.orderId ?? ""),
        status: String(data.status ?? ""),
      },
    };
  }
}

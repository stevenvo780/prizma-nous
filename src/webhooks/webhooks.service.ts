import { Injectable, Logger } from "@nestjs/common";
import { PluginsService } from "../plugins/plugins.service";
import { QueueService } from "../queue/queue.service";

interface WebhookContext {
  userId?: string;
  tenantId?: string;
  source: string;
  userCredentials?: any;
}

interface ProcessingResult {
  success: boolean;
  pluginsTriggered: string[];
  events: any[];
  skippedPlugins?: string[];
  errors?: any[];
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private pluginsService: PluginsService,
    private queueService: QueueService,
  ) {}

  async validateSimpleApiKey(providedApiKey: string): Promise<void> {
    const expectedApiKey = process.env.HUB_CENTRAL_SECRET;

    if (!providedApiKey) {
      this.logger.error("❌ Missing API key in request");
      throw new Error("Missing API key");
    }

    if (providedApiKey !== expectedApiKey) {
      this.logger.error("❌ Invalid API key provided");
      throw new Error("Invalid API key");
    }

    this.logger.log("✅ API key validated successfully");
  }

  async processGrafEvent(
    payload: any,
    context?: WebhookContext,
  ): Promise<ProcessingResult> {
    const rawEventType = payload.event_type || payload.eventType;
    const eventType = this.normalizeEventType(rawEventType);
    this.logger.log(`🎯 Processing Graf event: ${rawEventType} → ${eventType}`);

    const result: ProcessingResult = {
      success: true,
      pluginsTriggered: [],
      events: [],
      skippedPlugins: [],
      errors: [],
    };

    try {
      let userCredentials = context?.userCredentials;

      if (!userCredentials && payload.data?.store?.owner?.email) {
        const storeOwnerEmail = payload.data.store.owner.email;
        this.logger.debug(
          `🔍 Resolviendo credenciales para store owner: ${storeOwnerEmail}`,
        );

        try {
          const user =
            await this.pluginsService.findUserByEmail(storeOwnerEmail);
          if (user) {
            const credentials = await this.pluginsService.getUserCredentials(
              user.id,
            );
            userCredentials = {
              userId: user.id,
              userEmail: user.email,
              userCredentials: credentials,
            };
            this.logger.debug(
              `✅ Credenciales resueltas para: ${user.email} (${user.id})`,
            );
          } else {
            this.logger.warn(
              `❌ Usuario no encontrado para email: ${storeOwnerEmail}`,
            );
          }
        } catch (error) {
          this.logger.warn(`Error resolviendo credenciales: ${error.message}`);
        }
      }

      // Normaliza status de orden si viene en payload
      try {
        if (payload?.data && typeof payload.data === "object") {
          const st = payload.data.status;
          if (typeof st === "string" && st.trim()) {
            const normStatus = this.normalizeStatus(st);
            if (normStatus !== st) {
              payload.data.status = normStatus;
            }
          }
        }
      } catch {}

      await this.queueService.addToQueue({
        id: `${Date.now()}-${Math.random()}`,
        type: eventType,
        data: { ...payload, userCredentials },
        source: "graf",
      });

      result.pluginsTriggered.push("queued");

      this.logger.log(
        `✅ Graf event processed: ${result.pluginsTriggered.length} plugins triggered`,
      );
      return result;
    } catch (error) {
      this.logger.error(`❌ Error processing Graf event: ${error.message}`);
      result.success = false;
      result.errors.push(error.message);
      return result;
    }
  }

  private normalizeEventType(evt?: string): string {
    if (!evt) return "";
    const e = String(evt).toLowerCase().trim();
    const map: Record<string, string> = {
      // EN canonicals
      "order.paid": "order.paid",
      "order.pending": "order.pending",
      "order.shipped": "order.shipped",
      "order.sent": "order.shipped",
      "order.delivered": "order.delivered",
      "order.canceled": "order.canceled",
      "order.cancelled": "order.canceled",
      "order.updated": "order.updated",
      "customer.created": "customer.created",
      "customer.updated": "customer.updated",
      // ES → EN
      "pedido.pagado": "order.paid",
      "pedido.pendiente": "order.pending",
      "pedido.enviado": "order.shipped",
      "pedido.despachado": "order.shipped",
      "pedido.entregado": "order.delivered",
      "pedido.cancelado": "order.canceled",
      "pedido.actualizado": "order.updated",
      "orden.pagado": "order.paid",
      "orden.pendiente": "order.pending",
      "orden.enviado": "order.shipped",
      "orden.despachado": "order.shipped",
      "orden.entregado": "order.delivered",
      "orden.cancelado": "order.canceled",
      "orden.actualizado": "order.updated",
      "cliente.creado": "customer.created",
      "cliente.actualizado": "customer.updated",
      // POS / otros
      "pos.sale.created": "pos.sale.created",
      "venta_pos.creada": "pos.sale.created",
    };
    return map[e] || e;
  }

  private normalizeStatus(st?: string): string {
    const s = String(st || "").toLowerCase().trim();
    const map: Record<string, string> = {
      pending: "pending",
      pendiente: "pending",
      paid: "paid",
      pagado: "paid",
      shipped: "shipped",
      enviado: "shipped",
      despachado: "shipped",
      delivered: "delivered",
      entregado: "delivered",
      canceled: "canceled",
      cancelled: "canceled",
      cancelado: "canceled",
    };
    return map[s] || s;
  }
}

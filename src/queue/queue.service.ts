import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import Redis from "ioredis";
type Priority = "critical" | "high" | "normal" | "low";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private redis: Redis;
  private readonly queueName = "hub:events";

  /**
   * Priority queues (highest → lowest). Workers drain them in this order, so a
   * `critical` event is always processed before a `normal`/`low` one. The legacy
   * single queue (`hub:events`) is kept as the lowest-priority lane so the
   * existing Graf webhook path keeps working unchanged.
   */
  private readonly priorityQueues: Record<Priority, string> = {
    critical: "hub:events:critical",
    high: "hub:events:high",
    normal: "hub:events:normal",
    low: "hub:events:low",
  };

  constructor() {}

  async onModuleInit() {
    const redisConfig = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || "6379"),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    };

    this.redis = new Redis(redisConfig);

    this.redis.on("connect", () => {
      this.logger.log("Conectado a Redis para colas");
    });

    this.redis.on("error", (err) => {
      this.logger.error("Error de Redis:", err);
    });
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  /**
   * Agrega un evento a la cola de Redis
   */
  async addToQueue(eventData: {
    id: string;
    type: string;
    source: string;
    data: any;
  }): Promise<void> {
    const payload = {
      ...eventData,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };

    await this.redis.lpush(this.queueName, JSON.stringify(payload));
    this.logger.debug(`Evento agregado a cola: ${eventData.type}`);
  }

  /**
   * Obtiene el próximo evento de la cola Redis
   */
  async getNextEvent(): Promise<any | null> {
    const eventData = await this.redis.rpop(this.queueName);
    if (eventData) {
      try {
        const event = JSON.parse(eventData);
        this.logger.debug(`Evento obtenido de cola: ${event.type}`);
        return event;
      } catch (error) {
        this.logger.error("Error parseando evento de cola:", error);
      }
    }
    return null;
  }

  /**
   * Obtiene eventos con bloqueo
   */
  async getEventsBlocking(timeout: number = 10): Promise<any[]> {
    try {
      const result = await this.redis.brpop(this.queueName, timeout);
      if (result) {
        const [, eventData] = result;
        return [JSON.parse(eventData)];
      }
    } catch (error) {
      this.logger.error("Error en getEventsBlocking:", error);
    }
    return [];
  }

  /**
   * Encola un evento canónico priorizado (orquestación @olympo/contracts).
   * `critical`/`high`/`normal`/`low` se atienden en ese orden por el worker.
   */
  async addToPriorityQueue(
    eventData: { id: string; type: string; source: string; data: any },
    priority: Priority = "normal",
  ): Promise<void> {
    const queue = this.priorityQueues[priority] || this.priorityQueues.normal;
    const payload = {
      ...eventData,
      priority,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    };
    await this.redis.lpush(queue, JSON.stringify(payload));
    this.logger.debug(`Evento priorizado [${priority}] encolado: ${eventData.type}`);
  }

  /**
   * Obtiene el próximo evento respetando prioridad: critical → high → normal →
   * low → legacy(hub:events). Bloquea hasta `timeout` segundos.
   */
  async getNextByPriority(timeout: number = 5): Promise<any[]> {
    try {
      // BRPOP atiende las claves en orden: la primera con datos gana.
      const lanes = [
        this.priorityQueues.critical,
        this.priorityQueues.high,
        this.priorityQueues.normal,
        this.priorityQueues.low,
        this.queueName, // legacy lane (Graf webhook path)
      ];
      const result = await this.redis.brpop(...(lanes as [string]), timeout);
      if (result) {
        const [, eventData] = result;
        return [JSON.parse(eventData)];
      }
    } catch (error) {
      this.logger.error("Error en getNextByPriority:", error);
    }
    return [];
  }

  /** Reencola un evento priorizado en su misma lane (reintentos). */
  async requeuePriorityEvent(eventData: any): Promise<void> {
    const priority: Priority = eventData?.priority || "normal";
    const queue = this.priorityQueues[priority] || this.priorityQueues.normal;
    const payload = {
      ...eventData,
      retryCount: (eventData.retryCount || 0) + 1,
      timestamp: new Date().toISOString(),
    };
    await this.redis.lpush(queue, JSON.stringify(payload));
    this.logger.debug(`Evento priorizado ${eventData.id} reencolado [${priority}]`);
  }

  /**
   * Obtiene estadísticas de la cola
   */
  async getQueueStats(): Promise<{ name: string; length: number }> {
    const length = await this.redis.llen(this.queueName);
    return {
      name: this.queueName,
      length,
    };
  }

  /**
   * Limpia la cola
   */
  async clearQueue(): Promise<void> {
    await this.redis.del(this.queueName);
    this.logger.log("Cola limpiada");
  }

  /**
   * Reencola un evento (para reintentos)
   */
  async requeueEvent(eventData: any): Promise<void> {
    const payload = {
      ...eventData,
      retryCount: (eventData.retryCount || 0) + 1,
      timestamp: new Date().toISOString(),
    };

    await this.redis.lpush(this.queueName, JSON.stringify(payload));
    this.logger.debug(`Evento ${eventData.id} reencolado`);
  }

  /**
   * Marca un evento como procesado
   */
  async markAsProcessed(eventId: string): Promise<void> {
    const processedKey = `hub:processed:${eventId}`;
    await this.redis.set(processedKey, "1", "EX", 86400);

    this.logger.debug(`Evento ${eventId} marcado como procesado`);
  }

  /**
   * Verifica si un evento ya fue procesado
   */
  async isEventProcessed(eventId: string): Promise<boolean> {
    const processedKey = `hub:processed:${eventId}`;
    const exists = await this.redis.exists(processedKey);
    return exists === 1;
  }
}

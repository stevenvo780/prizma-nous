import { Module } from "@nestjs/common";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { ConnectorsModule } from "../connectors/connectors.module";
import { PluginsModule } from "../plugins/plugins.module";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [ConnectorsModule, PluginsModule, QueueModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}

import { Module, forwardRef } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConnectorOrchestratorService } from "./connector-orchestrator.service";
import { EventRouterService } from "./event-router.service";
import { QueueModule } from "../queue/queue.module";
import { PluginsModule } from "../plugins/plugins.module";
import { ApiSigoModule } from "./apisigo/apisigo.module";
import { ApiSoftiaConnectorService } from "./apisoftia/apisoftia-connector.service";
import { ApiSigoEventConnectorService } from "./apisigo/apisigo-event-connector.service";
import { MeraVueltaConnectorService } from "./meravuelta/meravuelta-connector.service";
import { EmwConnectorService } from "./emw/emw-connector.service";
import { SinergiaConnectorService } from "./sinergia/sinergia-connector.service";
import { GrafConnectorService } from "./graf/graf-connector.service";

@Module({
  imports: [
    HttpModule,
    EventEmitterModule.forRoot(),
    forwardRef(() => QueueModule),
    PluginsModule,
    ApiSigoModule,
  ],
  providers: [
    ConnectorOrchestratorService,
    EventRouterService,
    // One connector per destination service (ARCHITECTURE.md §4 fan-out).
    ApiSoftiaConnectorService,
    ApiSigoEventConnectorService,
    MeraVueltaConnectorService,
    EmwConnectorService,
    SinergiaConnectorService,
    GrafConnectorService,
  ],
  exports: [
    ConnectorOrchestratorService,
    EventRouterService,
    ApiSoftiaConnectorService,
    ApiSigoEventConnectorService,
    MeraVueltaConnectorService,
    EmwConnectorService,
    SinergiaConnectorService,
    GrafConnectorService,
  ],
})
export class ConnectorsModule {}

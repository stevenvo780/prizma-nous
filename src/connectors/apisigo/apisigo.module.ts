import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ApiSigoConnectorService } from "./apisigo-connector.service";
import { PluginsModule } from "../../plugins/plugins.module";

@Module({
  imports: [HttpModule, PluginsModule],
  providers: [ApiSigoConnectorService],
  exports: [ApiSigoConnectorService],
})
export class ApiSigoModule {}

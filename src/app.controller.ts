import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AppService } from "./app.service";

@ApiTags("app")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: "Información básica del Hub Central" })
  @ApiResponse({ status: 200, description: "Información del servicio" })
  getInfo() {
    return this.appService.getInfo();
  }

  @Get("version")
  @ApiOperation({ summary: "Versión del Hub Central" })
  @ApiResponse({ status: 200, description: "Versión del servicio" })
  getVersion() {
    return this.appService.getVersion();
  }
}

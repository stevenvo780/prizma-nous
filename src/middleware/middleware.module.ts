import { Module } from "@nestjs/common";
import { UserResolverMiddleware } from "./user-resolver.middleware";
import { PluginsModule } from "../plugins/plugins.module";

@Module({
  imports: [PluginsModule],
  providers: [UserResolverMiddleware],
  exports: [UserResolverMiddleware],
})
export class MiddlewareModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { HttpModule } from "@nestjs/axios";
import { PluginSetting } from "./entities/plugin-setting.entity";
import { UserEntity } from "../users/entities/user.entity";
import { PluginsService } from "./plugins.service";
import { PluginsController } from "./plugins.controller";
import { EncryptionService } from "../utils/encryption.service";

@Module({
  imports: [TypeOrmModule.forFeature([PluginSetting, UserEntity]), HttpModule],
  controllers: [PluginsController],
  providers: [PluginsService, EncryptionService],
  exports: [PluginsService, EncryptionService],
})
export class PluginsModule {}

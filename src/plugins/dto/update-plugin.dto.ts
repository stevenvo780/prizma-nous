import { IsBoolean, IsObject, IsOptional } from "class-validator";

export class UpdatePluginDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

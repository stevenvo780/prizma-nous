import {
  IsString,
  IsOptional,
  IsUrl,
  IsObject,
  IsNotEmpty,
  Length,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ApiSigoCredentialsDto {
  @ApiProperty({ description: "API Key para SIGO" })
  @IsString()
  @IsNotEmpty()
  @Length(10, 100)
  apiKey: string;

  @ApiPropertyOptional({ description: "URL base del servicio SIGO" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;

  @ApiPropertyOptional({ description: "Timeout en milisegundos" })
  @IsOptional()
  timeout?: number;
}

export class EmwCredentialsDto {
  @ApiProperty({ description: "API Key para EMW" })
  @IsString()
  @IsNotEmpty()
  @Length(10, 100)
  apiKey: string;

  @ApiPropertyOptional({ description: "Secret para webhooks EMW" })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({ description: "URL base del servicio EMW" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}

export class MeraVueltaCredentialsDto {
  @ApiProperty({ description: "API Key para MeraVuelta" })
  @IsString()
  @IsNotEmpty()
  @Length(10, 100)
  apiKey: string;

  @ApiPropertyOptional({ description: "Usuario para autenticación" })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: "URL base del servicio MeraVuelta" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}

export class GrafCredentialsDto {
  @ApiProperty({ description: "API Key para Graf" })
  @IsString()
  @IsNotEmpty()
  @Length(10, 100)
  apiKey: string;

  @ApiProperty({ description: "Store ID" })
  @IsString()
  @IsNotEmpty()
  storeId: string;

  @ApiPropertyOptional({ description: "Secret para webhooks Graf" })
  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @ApiPropertyOptional({ description: "URL base del servicio Graf" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}

export class SinergiaCredentialsDto {
  @ApiProperty({ description: "API Key para Sinergia POS" })
  @IsString()
  @IsNotEmpty()
  @Length(10, 100)
  apiKey: string;

  @ApiProperty({ description: "Terminal ID" })
  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @ApiPropertyOptional({ description: "URL base del servicio Sinergia" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}

export class FiarCredentialsDto {
  @ApiProperty({ description: "API Key para FIAR" })
  @IsString()
  @IsNotEmpty()
  @Length(10, 100)
  apiKey: string;

  @ApiProperty({ description: "Merchant ID" })
  @IsString()
  @IsNotEmpty()
  merchantId: string;

  @ApiPropertyOptional({ description: "URL base del servicio FIAR" })
  @IsOptional()
  @IsUrl()
  baseUrl?: string;
}

export class ValidatedUpdatePluginDto {
  @ApiPropertyOptional({ description: "Habilitar/deshabilitar plugin" })
  @IsOptional()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: "Configuración específica según el tipo de plugin",
    oneOf: [
      { $ref: "#/components/schemas/ApiSigoCredentialsDto" },
      { $ref: "#/components/schemas/EmwCredentialsDto" },
      { $ref: "#/components/schemas/MeraVueltaCredentialsDto" },
      { $ref: "#/components/schemas/GrafCredentialsDto" },
      { $ref: "#/components/schemas/SinergiaCredentialsDto" },
      { $ref: "#/components/schemas/FiarCredentialsDto" },
    ],
  })
  @IsOptional()
  @IsObject()
  config?:
    | ApiSigoCredentialsDto
    | EmwCredentialsDto
    | MeraVueltaCredentialsDto
    | GrafCredentialsDto
    | SinergiaCredentialsDto
    | FiarCredentialsDto
    | Record<string, any>;
}

export const PLUGIN_VALIDATION_MAP = {
  apisigo: ApiSigoCredentialsDto,
  emw: EmwCredentialsDto,
  meravuelta: MeraVueltaCredentialsDto,
  graf: GrafCredentialsDto,
  sinergia: SinergiaCredentialsDto,
  fiar: FiarCredentialsDto,
};

export class SecurityValidation {
  static validateSensitiveField(value: string, fieldName: string): boolean {
    const patterns = {
      apiKey: /^[A-Za-z0-9_\-+=\/:]{10,100}$/,
      password: /^.{8,}$/,
      secret: /^[A-Za-z0-9_\-+=\/:]{16,}$/,
      token: /^[A-Za-z0-9_.\-+=\/:]{20,}$/,
    };

    const pattern = patterns[fieldName] || patterns.secret;
    return pattern.test(value);
  }

  static sanitizeConfig(config: Record<string, any>): Record<string, any> {
    const sanitized = { ...config };

    const dangerousFields = ["__proto__", "constructor", "prototype"];
    dangerousFields.forEach((field) => delete sanitized[field]);

    const sensitiveFields = [
      "apiKey",
      "password",
      "secret",
      "token",
      "webhookSecret",
    ];
    sensitiveFields.forEach((field) => {
      if (
        sanitized[field] &&
        !this.validateSensitiveField(sanitized[field], field)
      ) {
        throw new Error(`Invalid format for field: ${field}`);
      }
    });

    return sanitized;
  }
}

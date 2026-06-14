import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = "aes-256-gcm";
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  private readonly encryptionKey: Buffer;

  constructor() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error("ENCRYPTION_KEY environment variable is required");
    }
    this.encryptionKey = crypto.scryptSync(
      key,
      "hubcentral-salt",
      this.keyLength,
    );
  }

  /**
   * Encrypt sensitive credential data
   */
  encryptCredentials(data: Record<string, any>): string {
    try {
      const sensitiveFields = [
        "apiKey",
        "password",
        "secret",
        "token",
        "webhookSecret",
      ];
      const encryptedData = { ...data };

      for (const field of sensitiveFields) {
        if (encryptedData[field] && typeof encryptedData[field] === "string") {
          encryptedData[field] = this.encryptField(encryptedData[field]);
        }
      }

      return JSON.stringify(encryptedData);
    } catch (error) {
      this.logger.error(`Error encrypting credentials: ${error.message}`);
      throw new Error("Credential encryption failed");
    }
  }

  /**
   * Decrypt sensitive credential data
   */
  decryptCredentials(encryptedData: string): Record<string, any> {
    try {
      const data = JSON.parse(encryptedData);
      const sensitiveFields = [
        "apiKey",
        "password",
        "secret",
        "token",
        "webhookSecret",
      ];
      const decryptedData = { ...data };

      for (const field of sensitiveFields) {
        if (decryptedData[field] && typeof decryptedData[field] === "string") {
          try {
            decryptedData[field] = this.decryptField(decryptedData[field]);
          } catch {
            this.logger.debug(`Field ${field} appears to be unencrypted`);
          }
        }
      }

      return decryptedData;
    } catch (error) {
      this.logger.error(`Error decrypting credentials: ${error.message}`);
      throw new Error("Credential decryption failed");
    }
  }

  /**
   * Encrypt individual field using AES-256-GCM
   */
  private encryptField(text: string): string {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(
      this.algorithm,
      this.encryptionKey,
      iv,
    );

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt individual field using AES-256-GCM
   */
  private decryptField(encryptedText: string): string {
    const parts = encryptedText.split(":");
    if (parts.length < 3) {
      return this.decryptLegacyField(encryptedText);
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      iv,
    );
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Decrypt legacy format for backward compatibility
   */
  private decryptLegacyField(encryptedText: string): string {
    const parts = encryptedText.split(":");
    if (parts.length < 2) {
      throw new Error("Invalid encrypted field format");
    }

    const [, encrypted] = parts;
    try {
      const decipher = crypto.createDecipher(
        this.algorithm,
        this.encryptionKey,
      );
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      this.logger.warn(`Failed to decrypt legacy format: ${error.message}`);
      throw new Error("Unable to decrypt legacy format");
    }
  }

  /**
   * Check if data appears to be encrypted
   */
  isEncrypted(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      const sensitiveFields = [
        "apiKey",
        "password",
        "secret",
        "token",
        "webhookSecret",
      ];

      for (const field of sensitiveFields) {
        if (parsed[field] && typeof parsed[field] === "string") {
          const parts = parsed[field].split(":");
          if (
            parts.length >= 2 &&
            parts.every((part) => /^[0-9a-f]+$/i.test(part))
          ) {
            return true;
          }
        }
      }
      return false;
    } catch {
      return false;
    }
  }
}

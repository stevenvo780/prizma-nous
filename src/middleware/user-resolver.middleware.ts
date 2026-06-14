import {
  Injectable,
  NestMiddleware,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Request as ExpressRequest, Response, NextFunction } from "express";
import { PluginsService } from "../plugins/plugins.service";

export interface ResolvedUserContext {
  userId: string;
  userEmail: string;
  userCredentials?: any;
}

declare module "express-serve-static-core" {
  interface Request {
    userContext?: ResolvedUserContext;
  }
}

@Injectable()
export class UserResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(UserResolverMiddleware.name);

  constructor(private pluginsService: PluginsService) {}

  async use(req: ExpressRequest, res: Response, next: NextFunction) {
    try {
      const isApiKeyAuth = req.headers["x-api-key"] && req.headers["x-source"];

      if (isApiKeyAuth) {
        this.logger.debug(
          "🔑 Usando autenticación por API Key - omitiendo resolución de usuario",
        );
        next();
        return;
      }

      const userContext = await this.resolveUserFromRequest(req);
      if (userContext) {
        req.userContext = userContext;
        this.logger.debug(
          `🔍 Usuario resuelto: ${userContext.userEmail} (${userContext.userId})`,
        );
      }
    } catch (error) {
      this.logger.warn(`Error resolviendo usuario: ${error.message}`);
      if (error instanceof UnauthorizedException) {
        res.status(401).json({ message: "Unauthorized: Invalid API Key" });
        return;
      }
    }

    next();
  }

  private async resolveUserFromRequest(
    req: ExpressRequest,
  ): Promise<ResolvedUserContext | null> {
    const headers = req.headers || {};
    const email = headers["x-user-email"] as string;

    if (!email) {
      this.logger.warn("🚫 Header x-user-email es requerido");
      return null;
    }

    let user = await this.pluginsService.findUserByEmail(email);
    if (!user) {
      this.logger.log(`🆕 Usuario no encontrado, creando nuevo usuario: ${email}`);
      user = await this.pluginsService.createOrUpdateUser({ email });
    }

    const credentials = await this.pluginsService.getUserCredentials(user.id);
    return {
      userId: user.id,
      userEmail: user.email,
      userCredentials: credentials,
    };
  }
}

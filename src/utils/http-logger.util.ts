import { Logger } from "@nestjs/common";

export function logHttpError(
  logger: Logger,
  service: string,
  error: any,
  url?: string,
): void {
  if (error.response) {
    const { status, statusText, data } = error.response;

    logger.error(
      `❌ ${service} HTTP ${status} ${statusText}${url ? ` -> ${url}` : ""}`,
    );

    const responseData = typeof data === "string" ? data : JSON.stringify(data);
    logger.error(
      `❌ ${service} Response: ${responseData.substring(0, 200)}${responseData.length > 200 ? "..." : ""}`,
    );

    if (status === 401 || status === 403) {
      const sentHeaders = error.config?.headers || {};
      const authHeaders = {};

      Object.keys(sentHeaders).forEach((key) => {
        if (
          key.toLowerCase().includes("signature") ||
          key.toLowerCase().includes("auth") ||
          key.toLowerCase().includes("key") ||
          key.toLowerCase().includes("tenant")
        ) {
          authHeaders[key] =
            typeof sentHeaders[key] === "string" && sentHeaders[key].length > 20
              ? sentHeaders[key].substring(0, 15) + "..."
              : sentHeaders[key];
        }
      });

      if (Object.keys(authHeaders).length > 0) {
        logger.error(
          `❌ ${service} Auth headers: ${JSON.stringify(authHeaders)}`,
        );
      }
    }
  } else if (error.request) {
    logger.error(
      `❌ ${service} No response received${url ? ` -> ${url}` : ""}`,
    );
    logger.error(
      `❌ ${service} Timeout or connection error: ${error.code || "UNKNOWN"}`,
    );
  } else {
    logger.error(`❌ ${service} Request setup error: ${error.message}`);
  }
}

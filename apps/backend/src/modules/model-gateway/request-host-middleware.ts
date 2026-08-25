/**
 * 请求域名中间件
 * 自动捕获请求来源域名，用于worker隔离
 */

import type { Request } from 'express';

/**
 * 从请求中提取域名信息
 */
export function extractRequestHost(req: Request): string {
  // 优先使用 X-Forwarded-Host (反向代理场景)
  const forwardedHost = req.headers['x-forwarded-host'] as string | undefined;
  if (forwardedHost) {
    return Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  }

  // 使用 Host header
  const host = req.headers['host'];
  if (host) {
    return host;
  }

  // 回退到 req.hostname
  if (req.hostname) {
    return req.hostname;
  }

  // 最后尝试从 Origin header 提取
  const origin = req.headers['origin'] as string | undefined;
  if (origin) {
    try {
      const url = new URL(origin);
      return url.host;
    } catch {
      // 忽略解析错误
    }
  }

  return 'unknown';
}

/**
 * 为任务快照添加请求来源信息
 */
export function enrichTaskSnapshotWithRequestHost(
  taskSnapshot: Record<string, unknown>,
  req: Request,
): Record<string, unknown> {
  const requestHost = extractRequestHost(req);

  return {
    ...taskSnapshot,
    requestHost, // 记录请求域名
    requestedAt: taskSnapshot.requestedAt || new Date().toISOString(),
    userAgent: req.headers['user-agent'] || undefined,
  };
}

/**
 * Express中间件：将请求域名附加到 req 对象
 */
export function requestHostMiddleware(
  req: Request & { requestHost?: string },
  _res: unknown,
  next: () => void,
): void {
  req.requestHost = extractRequestHost(req);
  next();
}

/**
 * Structured application logger (pino).
 *
 * JSON lines whenever stdout isn't a real terminal — i.e. inside Docker/K8s,
 * dev containers included, so Promtail -> Loki -> Grafana always gets
 * parseable structured fields. Pretty colorized output only kicks in when a
 * developer runs the service directly (`npm run dev`) in an actual terminal.
 * Level is configurable via LOG_LEVEL so verbosity can be raised without a redeploy.
 */
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'api-gateway' },
  transport: process.stdout.isTTY
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      }
    : undefined,
});

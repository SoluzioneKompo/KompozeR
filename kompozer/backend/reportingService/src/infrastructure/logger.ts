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
  base: { service: 'reporting-service' },
  transport: process.stdout.isTTY
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' },
      }
    : undefined,
});

/**
 * Strips the `token` query param value before a URL reaches the request log.
 * Defense in depth: a JWT must never sit in plain text in a Grafana/Loki entry
 * (some routes elsewhere in the system accept ?token=<jwt> as a fallback for
 * clients that can't set an Authorization header).
 */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]+/i, '$1[REDACTED]');
}

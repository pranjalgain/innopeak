import { EnvConfig } from '@config/env.config';
import { Injectable, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

const logFormat = format.printf(({ timestamp, level, message, context, trace }) => {
  const ts = typeof timestamp === 'string' ? timestamp : JSON.stringify(timestamp);
  const ctx = typeof context === 'string' ? context : 'App';
  const msg = typeof message === 'string' ? message : JSON.stringify(message);
  // `error(message, trace)` accepted a stack and the format dropped it, so a logged failure had no call site.
  const stack = typeof trace === 'string' && trace !== '' ? `\n${trace}` : '';
  return `${ts} [${level}] [${ctx}]: ${msg}${stack}`;
});

/**
 * Console-only logging: the platform collects stdout. `warn` and above in production, everything in development. Nothing is shipped
 * to a log backend by the app itself.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private readonly logger: WinstonLogger;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    this.logger = createLogger({
      level: isProduction ? 'warn' : 'debug',
      format: format.combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
      transports: [
        new transports.Console({
          format: format.combine(format.colorize(), logFormat),
        }),
      ],
    });
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({ message, trace, context });
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ message, context });
  }

  log(message: string, context?: string): void {
    this.logger.info({ message, context });
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ message, context });
  }

  http(message: string, context?: string): void {
    this.logger.info({ message, context: context ?? 'HTTP' });
  }
}

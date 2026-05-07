import pino from 'pino';
import pinoHttp from 'pino-http';
import { createHash } from 'crypto';

// PII redaction paths for Pino
const redactPaths = [
  'password',
  'passwordHash',
  'emiratesIdNumber',
  'phone',
  'dob',
  'otp',
  'refreshToken',
  'jwtToken',
  'req.body.password',
  'req.body.phone',
  'req.body.otp',
  'res.headers.authorization',
];

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: redactPaths,
    remove: true,
  },
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: false,
            translateTime: 'SYS:standard',
          },
        }
      : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export { pinoLogger as logger };

/**
 * Hash PII for logging (never log original values)
 */
export function hashPII(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('hex')
    .substring(0, 12);
}

/**
 * Mask phone number for logging (show last 4 digits)
 */
export function maskPhone(phone: string): string {
  return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
}

/**
 * Create HTTP logger middleware for Fastify
 */
export function createHttpLogger() {
  return pinoHttp({
    logger: pinoLogger,
    autoLogging: true,
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.ip,
        remotePort: req.socket?.remotePort,
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
  });
}

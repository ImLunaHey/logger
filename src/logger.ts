import z from 'zod';
import { format, type Logger as WinstonLogger, createLogger, transports } from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/winston';
import chalk from 'chalk';
import pkg from '../package.json';
import { getCommitHash } from './get-commit-hash';
import cj from 'color-json';

export { z } from 'zod';

const logLevelColours = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  verbose: 'blue',
  debug: 'magenta',
} as const;

const colourLevel = (level: keyof typeof logLevelColours) => {
  const colour = logLevelColours[level];
  return chalk[colour](level);
};

declare const splatSymbol: unique symbol;

type Meta = {
  [splatSymbol]: unknown[];
};

const inATerminal = process.stdout.isTTY;

const metaToSplat = (meta: Meta): Record<string, unknown> => {
  const splats = meta[Symbol.for('splat') as typeof splatSymbol];
  const splat = splats && splats.length > 0 ? (splats.length === 1 ? splats[0] : splats) : undefined;
  if (!splat) return {} as Record<string, unknown>;
  return Object.keys(splat).length >= 1 ? (splat as Record<string, unknown>) : ({} as Record<string, unknown>);
};

const formatMeta = (meta: Meta) => {
  const splat = metaToSplat(meta);
  if (!splat) return '';
  if (!inATerminal) return Object.keys(splat).length >= 1 ? JSON.stringify(splat) : '';
  return Object.keys(splat).length >= 1 ? cj(JSON.stringify(splat)) : '';
};

type SerialisedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerialisedError;
};

const serialiseError = (error: Error): SerialisedError => ({
  name: error.name,
  message: error.message,
  stack: error.stack,
  cause: error.cause ? serialiseError(error.cause as Error) : undefined,
});

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type BaseSchema = {
  [level in LogLevel]?: Record<string, z.ZodObject<any, any, any>>;
};

type Options<Schema extends BaseSchema> = {
  service: string;
  schema?: Schema;
  defaultMeta?: Record<string, unknown>;
};

type MetaForSchema<Schema extends BaseSchema, Level extends keyof Schema, Message> = Message extends keyof Schema[Level]
  ? Schema[Level][Message] extends z.ZodType<any, any, any>
    ? z.input<Schema[Level][Message]>
    : undefined
  : never;

type DebugMeta<Schema extends BaseSchema, Message extends keyof Schema['debug']> = MetaForSchema<Schema, 'debug', Message>;
type InfoMeta<Schema extends BaseSchema, Message extends keyof Schema['info']> = MetaForSchema<Schema, 'info', Message>;
type WarnMeta<Schema extends BaseSchema, Message extends keyof Schema['warn']> = MetaForSchema<Schema, 'warn', Message>;
type ErrorMeta<Schema extends BaseSchema, Message extends keyof Schema['error']> = {
  error: Error;
} & MetaForSchema<Schema, 'error', Message>;

export class Logger<Schema extends BaseSchema> {
  private logger: WinstonLogger;
  private schema?: Schema;

  constructor(options: Options<Schema>) {
    const logLevel = process.env.LOG_LEVEL
      ? ['silly', 'info', 'debug', 'warn', 'error'].includes(process.env.LOG_LEVEL)
        ? process.env.LOG_LEVEL
        : 'silly'
      : 'silly';
    this.logger = createLogger({
      level: logLevel,
      format: format.combine(format.errors({ stack: true }), format.json()),
      defaultMeta: {
        ...(options.defaultMeta ?? {}),
        name: pkg.name,
        pid: process.pid,
        commitHash: getCommitHash(),
        service: options.service,
      },
      transports: [],
    });

    // Don't log while running tests
    // This allows the methods to still be hooked
    // while not messing up the test output
    if (process.env.NODE_ENV === 'test') {
      this.logger.silent = true;
    }

    // Use Axiom for logging if all the needed envs are provided
    if (process.env.AXIOM_ORG_ID && process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN) {
      this.logger.add(
        new AxiomTransport({
          // Exception and rejection handling is not optional
          // Allowing this to be optional is a mistake waiting to happen
          handleExceptions: true,
          handleRejections: true,
          token: process.env.AXIOM_TOKEN,
        }),
      );
    }

    // Add the console logger if we're not running tests, there are no transports or the user has added it to the `TRANSPORTS` env
    if (
      process.env.NODE_ENV !== 'test' &&
      (this.logger.transports.length === 0 ||
        process.env.TRANSPORTS?.split(',')
          .map((_) => _.toLowerCase())
          .includes('console'))
    ) {
      this.logger.add(
        new transports.Console({
          format: format.combine(
            format.timestamp(),
            format.printf(({ service, level, message, timestamp, ...meta }) => {
              const serviceName = (service as string) ?? 'app';
              const formattedLevel = colourLevel(level as keyof typeof logLevelColours);
              const formattedMeta = formatMeta(meta as Meta);

              // If this isnt a user's actual terminal return the data as JSON
              // This allows things like railway's logger to work
              if (!inATerminal)
                return JSON.stringify(
                  {
                    _time: new Date(timestamp).toISOString(),
                    service: serviceName,
                    level: formattedLevel,
                    message: message as string,
                    meta: metaToSplat(meta as Meta),
                  },
                  null,
                  0,
                );

              const formattedDate = new Date(timestamp as string).toLocaleTimeString('en');
              return `${formattedDate} [${serviceName}] [${formattedLevel}]: ${message as string} ${formattedMeta}`.trim();
            }),
          ),
          // Exception and rejection handling is not optional
          // Allowing this to be optional is a mistake waiting to happen
          handleExceptions: true,
          handleRejections: true,
        }),
      );
    }

    // Save the schema if we have one
    this.schema = options.schema;
  }

  private log<Message extends keyof Schema[LogLevel]>(
    level: LogLevel,
    message: Message,
    data: Schema[LogLevel][Message] extends z.ZodType ? z.input<Schema[LogLevel][Message]> : undefined,
  ) {
    // Ensure meta is valid before logging
    const parser = this.schema?.[level]?.[message as string];
    const parsedData = parser?.safeParse(data);
    // This ensures that we never go over the limit of keys in axiom
    // NOTE: We can always use `json_parse` in axiom to manage the data later.
    const meta = parsedData?.success
      ? parsedData.data
      : {
          data: JSON.stringify(data),
          error: parsedData?.error,
        };

    // Call the actual logger
    this.logger[level](message as string, meta);
  }

  debug<Message extends keyof Schema['debug']>(message: Message, meta: DebugMeta<Schema, Message>) {
    this.log('debug', message, meta);
  }

  info<Message extends keyof Schema['info']>(message: Message, meta: InfoMeta<Schema, Message>) {
    this.log('info', message, meta);
  }

  warn<Message extends keyof Schema['warn']>(message: Message, meta: WarnMeta<Schema, Message>) {
    this.log('warn', message, meta);
  }

  error<Message extends keyof Schema['error']>(message: Message, meta: ErrorMeta<Schema, Message>) {
    // If the error isn't an error object make it so
    // This is to prevent issues where something other than an Error is thrown
    // When passing this to transports like Axiom it really needs to be a real Error class
    if (meta?.error && !(meta?.error instanceof Error)) meta.error = new Error(`Unknown Error: ${String(meta.error)}`);
    this.log('error', message, {
      ...meta,
      error: serialiseError(meta?.error as Error),
    });
  }
}

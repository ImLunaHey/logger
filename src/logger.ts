import z from 'zod';
import { format, type Logger as WinstonLogger, createLogger, transports } from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/axiom-node';
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

const formatMeta = (meta: Meta) => {
    const splats = meta[Symbol.for('splat') as typeof splatSymbol];
    const splat = (splats && splats.length > 0) ? splats.length === 1 ? splats[0] : splats : undefined;
    if (!splat) return '';
    return Object.keys(splat).length >= 1 ? cj(JSON.stringify(splat)) : '';
};

type SerialisedError = {
    name: string;
    message: string;
    stack?: string;
    cause?: SerialisedError;
}

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
}

type MetaForSchema<Schema extends BaseSchema, Level extends keyof Schema, Message> =
    Message extends keyof Schema[Level]
    ? Schema[Level][Message] extends z.ZodType<any, any, any>
    ? z.input<Schema[Level][Message]>
    : undefined
    : never;

type DebugMeta<Schema extends BaseSchema> = MetaForSchema<Schema, 'debug', keyof Schema['debug']>;
type InfoMeta<Schema extends BaseSchema> = MetaForSchema<Schema, 'info', keyof Schema['info']>;
type WarnMeta<Schema extends BaseSchema> = MetaForSchema<Schema, 'warn', keyof Schema['warn']>;
type ErrorMeta<Schema extends BaseSchema> = {
    error: Error;
} & MetaForSchema<Schema, 'error', keyof Schema['error']>;

export class Logger<Schema extends BaseSchema> {
    private logger: WinstonLogger;
    private schema?: Schema;

    constructor(options: Options<Schema>) {
        this.logger = createLogger({
            level: 'silly',
            format: format.combine(
                format.errors({ stack: true }),
                format.json()
            ),
            defaultMeta: {
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

        // Use Axiom for logging if a token is provided
        if (process.env.AXIOM_TOKEN) {
            this.logger.add(new AxiomTransport({
                // Exception and rejection handling is not optional
                // Allowing this to be optional is a mistake waiting to happen
                handleExceptions: true,
                handleRejections: true,
            }));
        }

        // Add the console logger if we're not running tests, there are no transports or the user has added it to the `TRANSPORTS` env
        if (process.env.NODE_ENV !== 'test' || this.logger.transports.length === 0 || process.env.TRANSPORTS?.split(',').map(_ => _.toLowerCase()).includes('console')) {
            this.logger.add(
                new transports.Console({
                    format: format.combine(
                        format.timestamp(),
                        format.printf(({ service, level, message, timestamp, ...meta }) => {
                            const formattedDate = new Date(timestamp as string).toLocaleTimeString('en');
                            const serviceName = (service as string) ?? 'app';
                            const formattedLevel = colourLevel(level as keyof typeof logLevelColours);
                            const formattedMeta = formatMeta(meta as Meta);
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

    private log<Message extends keyof Schema[LogLevel]>(level: LogLevel, message: Message, data: (Schema[LogLevel][Message] extends z.ZodType ? z.input<Schema[LogLevel][Message]> : undefined)) {
        // Ensure meta is valid before logging
        const parser = this.schema?.[level]?.[message as string];
        const parsedData = parser?.safeParse(data);
        // This ensures that we never go over the limit of keys in axiom
        // NOTE: We can always use `json_parse` in axiom to manage the data later.
        const meta = parsedData?.success ? parsedData.data : {
            data: JSON.stringify(data),
            error: parsedData?.error
        };

        // Call the actual logger
        this.logger[level](message as string, meta);
    }

    debug<Message extends keyof Schema['debug']>(message: Message, meta: DebugMeta<Schema>) {
        this.log('debug', message, meta);
    }

    info<Message extends keyof Schema['info']>(message: Message, meta: InfoMeta<Schema>) {
        this.log('info', message, meta);
    }

    warn<Message extends keyof Schema['warn']>(message: Message, meta: WarnMeta<Schema>) {
        this.log('warn', message, meta);
    }

    error<Message extends keyof Schema['error']>(message: Message, meta: ErrorMeta<Schema>) {
        // If the error isn't an error object make it so
        // This is to prevent issues where something other than an Error is thrown
        // When passing this to transports like Axiom it really needs to be a real Error class
        if (meta?.error && !(meta?.error instanceof Error)) meta.error = new Error(`Unknown Error: ${String(meta.error)}`);
        this.log('error', message, {
            ...meta,
            error: serialiseError(meta?.error as Error)
        });
    }
}

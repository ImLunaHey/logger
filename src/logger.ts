import z from 'zod';
import winston, { format, type Logger as WinstonLogger, createLogger } from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/axiom-node';
import chalk from 'chalk';
import { name } from '@lib/../package.json';
import { getCommitHash } from '@lib/get-commit-hash';

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
    const splat = meta[Symbol.for('splat') as typeof splatSymbol];
    if (splat && splat.length > 0) return splat.length === 1 ? JSON.stringify(splat[0]) : JSON.stringify(splat);
    return '';
};

const BaseSchema = z.object({
    name: z.string(),
    pid: z.number(),
    commitHash: z.string(),
    service: z.string(),
}).partial();
type BaseSchema = typeof BaseSchema;

type Options<Schema extends BaseSchema> = {
    service: string;
    schema?: Schema;
}

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
                name,
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

        // Add the console logger if we're not running tests and there are no transports
        if (process.env.NODE_ENV !== 'test' && this.logger.transports.length === 0) {
            this.logger.add(
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.printf(({ service, level, message, timestamp, ...meta }) => {
                            const formattedDate = new Date(timestamp as string).toLocaleTimeString('en');
                            const serviceName = (service as string) ?? 'app';
                            const formattedLevel = colourLevel(level as keyof typeof logLevelColours);
                            const formattedMeta = formatMeta(meta as Meta);
                            return `${formattedDate} [${serviceName}] [${formattedLevel}]: ${message as string} ${formattedMeta}`;
                        }),
                    ),
                }),
            );
        }

        // Save the schema if we have one
        this.schema = options.schema;
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Schema) {
        // Ensure data has no extra keys
        this.schema?.parse(meta);

        // Call the actual logger
        this.logger[level](message, meta);
    }

    debug(message: string, meta?: Schema) {
        this.log('debug', message, meta);
    }

    info(message: string, meta?: Schema) {
        this.log('info', message, meta);
    }

    warn(message: string, meta?: Schema) {
        this.log('warn', message, meta);
    }

    error(message: string, meta?: { error: unknown, cause?: unknown } & Schema) {
        // If the error isn't an error object make it so
        // This is to prevent issues where something other than an Error is thrown
        // When passing this to transports like Axiom it really needs to be a real Error class
        if (meta?.error && !(meta?.error instanceof Error)) meta.error = new Error(`Unknown Error: ${String(meta.error)}`);
        this.log('error', message, meta);

        // TODO: Remove this once winston can properly serialise errors
        console.error(message, meta);
    }
}

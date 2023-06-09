import z from 'zod';
import winston, { format, type Logger as WinstonLogger, createLogger } from 'winston';
import { WinstonTransport as AxiomTransport } from '@axiomhq/axiom-node';
import chalk from 'chalk';
import { name } from '@lib/../package.json';
import { getCommitHash } from './get-commit-hash';
import cj from 'color-json';

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
    const splat = (splats && splats.length > 0) ? splats.length === 1 ? JSON.stringify(splats[0]) : JSON.stringify(splats) : undefined;
    return splat ? cj(splat) : '';
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type BaseSchema = Record<LogLevel, Record<string, z.input<z.ZodSchema>>>;

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

        // Add the console logger if we're not running tests, there are no transports or the user has added it to the `TRANSPORTS` env
        if (process.env.NODE_ENV !== 'test' || this.logger.transports.length === 0 || process.env.TRANSPORTS?.split(',').map(_ => _.toLowerCase()).includes('console')) {
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

    private log<Message extends keyof Schema[LogLevel]>(level: LogLevel, message: Message, data?: z.input<Schema[LogLevel][Message]>) {
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

    debug<Message extends keyof Schema['debug']>(message: Message, meta?: z.input<Schema['debug'][Message]>) {
        this.log('debug', message, meta);
    }

    info<Message extends keyof Schema['info']>(message: Message, meta?: z.input<Schema['info'][Message]>) {
        this.log('info', message, meta);
    }

    warn<Message extends keyof Schema['warn']>(message: Message, meta?: z.input<Schema['warn'][Message]>) {
        this.log('warn', message, meta);
    }

    error<Message extends keyof Schema['error']>(message: Message, meta?: { error: unknown, cause?: unknown } & z.input<Schema['error'][Message]>) {
        // If the error isn't an error object make it so
        // This is to prevent issues where something other than an Error is thrown
        // When passing this to transports like Axiom it really needs to be a real Error class
        if (meta?.error && !(meta?.error instanceof Error)) meta.error = new Error(`Unknown Error: ${String(meta.error)}`);
        this.log('error', message, meta);

        // TODO: Remove this once winston can properly serialise errors
        console.error(message, meta);
    }
}

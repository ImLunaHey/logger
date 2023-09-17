import z from 'zod';
import { BaseSchema, Logger } from '../src/logger';

const schema = {
    debug: {
        'stats': z.object({
            a: z.number(),
        }),
    },
    error: {
        'error': z.object({}),
    },
    info: {},
    warn: {},
} satisfies BaseSchema;

const logger = new Logger({
    service: 'my-service',
    schema,
});

logger.debug('stats', {
    a: 123,
});

// This will only log the "a" field
logger.debug('stats', {
    a: 123,
    /**
     * This will show the following typescript error
     * 
     * Argument of type '{ a: number; b: number; }' is not assignable to parameter of type '{ a: number; }'.
     * Object literal may only specify known properties, and 'b' does not exist in type '{ a: number; }'.
     */
    b: 123123,
});

logger.debug('stats', {
    a: 1
});

// `error` is required when using `.error` method
// `cause` is optional
logger.error('error', {
    error: new Error('A thing happened', {
        cause: new Error('This thing caused it'),
    })
});

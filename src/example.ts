import z from 'zod';
import { BaseSchema, Logger } from '@lib/logger';

const schema = {
    debug: {
        'stats': z.object({
            a: z.number(),
            b: z.number().optional(),
        }),
    },
    error: {},
    info: {},
    warn: {},
} satisfies BaseSchema;

const logger = new Logger({
    service: 'my-service',
    schema,
});

// This should work but throws since it says the first is a string when it should be "never"
// I want the first arg to be the key of the schema above
// Then the second arg to be the field in the schema that matches
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

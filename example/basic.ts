import z from 'zod';
import { Logger } from '../src/logger';

const logger = new Logger({
    service: 'my-service',
    schema: {
        debug: {
            'hello': z.object({
                world: z.string(),
            }),
        },
        info: {
            'User logged in': z.object({}),
        },
        error: {
            'hi': z.object({})
        },
    }
});

logger.debug('hello', { world: '123' });

// This should work
logger.info('User logged in'); // Expected 2 arguments, but got 1.

// This should error
logger.info('User logged in', {});

logger.error('hi', {
    error: new Error('test'),
});

// logger.info('does not exist');

// logger.info('User logged in', {
//     action: 'abc',
//     userId: '1234',
// });

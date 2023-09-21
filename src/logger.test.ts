import '@total-typescript/ts-reset';
import { expect, test } from 'bun:test';
import { Logger } from 'src/logger';

test('creates a logger', async () => {
    const logger = new Logger({ service: 'test' });
    expect(logger.info).toBeFunction();
    expect(logger.error).toBeFunction();
    expect(logger.warn).toBeFunction();
    expect(logger.debug).toBeFunction();
});

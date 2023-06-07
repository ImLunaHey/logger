# @ImLunaHey/logger

`@ImLunaHey/logger` is a TypeScript package that provides a logger utility based on the `winston` library.

## Installation

You can install `@ImLunaHey/logger` using npm:

```shell
npm install github:@ImLunaHey/logger
```

## Usage

To use the logger, you need to import the `Logger` class from the package:

```typescript
import { Logger } from '@ImLunaHey/logger';
```

Then, you can create an instance of the logger by providing the necessary options:

```typescript
const logger = new Logger({
  service: 'my-service',
  schema: MySchema, // Optional: Define a schema for the log data
});
```

### Log Levels

The logger supports the following log levels:

- `debug`
- `info`
- `warn`
- `error`

You can use the logger's methods to log messages at the desired level:

```typescript
logger.debug('This is a debug message');
logger.info('This is an info message');
logger.warn('This is a warning message');
logger.error('This is an error message', { error: new Error('Something went wrong') });
```

### Log Data Schema

If you have defined a schema for your log data, you can pass it as an option when creating the logger instance. The schema is used to validate the log data and ensure that it conforms to the expected structure. For example:

```typescript
import z from 'zod';
import { Logger } from '@ImLunaHey/logger';

const schema = {
  info: {
    'User logged in': {
      userId: z.string(),
      action: z.string(),
    },
  },
};

const logger = new Logger({
  service: 'my-service',
  schema,
});

logger.info('User logged in', { userId: '123', action: 'login' });
```

If the `meta` object does not match the `schema`, an error will be thrown.
If extra keys are included in the `meta` object they will be stripped.

### Test Environment

When running tests, the logger will not output any logs to prevent interference with the test output. This behaviour can be controlled by setting the `NODE_ENV` environment variable to `'test'`.

## License

This package is provided under the [MIT License](https://opensource.org/licenses/MIT).

import { defineConfig } from 'tsup';

export default defineConfig({
    dts: true,
    format: [
        'esm'
    ],
    clean: true,
    minify: true,
    treeshake: true,
    entry: ['./src/logger.ts'],
});

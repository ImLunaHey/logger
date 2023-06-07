import { defineConfig } from 'tsup';

export default defineConfig({
    dts: true,
    format: [
        'cjs',
        'esm'
    ],
    clean: true,
    minify: true,
    treeshake: true,
    entry: ['./src/logger.ts'],
});

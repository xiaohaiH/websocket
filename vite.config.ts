import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import pkgJson from './package.json';

// const external = ['@xiaohaih/mitt'];
const pkg = pkgJson.publishConfig || pkgJson;

/**
 * 添加或删除名称中的 min
 * @param {string} name
 * @param {boolean} flag
 */
function retainMinSuffix(name: string, flag: boolean) {
    const _name = name.replace(/^dist\//, '').replace(/min/, '');
    return flag ? _name.replace(/(.*)(\..*)$/, '$1.min$2') : _name;
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        tsconfigPaths(),
        dts({
            // rollupTypes: true,
        }),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, './src/index.ts'),
            name: 'HSocket',
            fileName: 'index',
        },
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
            output: [
                { entryFileNames: retainMinSuffix(pkg.module, false), format: 'es' },
                { entryFileNames: retainMinSuffix(pkg.module, true), format: 'es', },
                { entryFileNames: retainMinSuffix(pkg.main, false), format: 'cjs', exports: 'named', },
                { entryFileNames: retainMinSuffix(pkg.main, true), format: 'cjs', exports: 'named', },
                { entryFileNames: retainMinSuffix(pkg.unpkg, false), format: 'umd', name: 'HSocket', },
                { entryFileNames: retainMinSuffix(pkg.unpkg, true), format: 'umd', name: 'HSocket', },
            ],
        },
    }
});
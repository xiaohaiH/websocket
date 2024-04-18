import antfu from '@antfu/eslint-config';

export default antfu({
    // unocss: true,
    typescript: true,
    // typescript: {
    //     tsconfigPath: 'tsconfig.json',
    // },
    // vue: {},
    stylistic: {
        indent: 4,
        semi: true,
    },
    ignores: [],
    rules: {
        'unused-imports/no-unused-vars': 'warn',
        'no-console': 'warn',
        'curly': ['error', 'all'],
        'no-empty': ['warn'],
        'vue/block-order': ['error', {
            order: ['template', 'script', 'style'],
        }],
        'no-constant-condition': ['error', { checkLoops: false }],
        'no-constant-binary-expression': ['error'],
        'arrow-parens': ['warn', 'always'],
    },
});

export default [
    {
        input: 'content.js',
        output: {
            file: 'content-bundle.js',
            format: 'iife',
            name: 'content',
            globals: {
                chrome: 'chrome'
            }
        },
        external: ['chrome']
    },
    {
        input: 'popup.js',
        output: {
            file: 'popup-bundle.js',
            format: 'iife',
            name: 'popup',
            globals: {
                chrome: 'chrome'
            }
        },
        external: ['chrome']
    }
];
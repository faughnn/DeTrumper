export default [
    {
        input: 'content.js',
        output: {
            file: 'content-bundle.js',
            format: 'iife',
            name: 'content'
        },
        onwarn(warning, warn) {
            // Suppress circular dependency warnings
            if (warning.code === 'CIRCULAR_DEPENDENCY') return;
            warn(warning);
        }
    },
    {
        input: 'popup.js',
        output: {
            file: 'popup-bundle.js',
            format: 'iife',
            name: 'popup'
        },
        onwarn(warning, warn) {
            // Suppress circular dependency warnings
            if (warning.code === 'CIRCULAR_DEPENDENCY') return;
            warn(warning);
        }
    }
];
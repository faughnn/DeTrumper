export default [
  {
    input: './content.js',
    output: {
      file: 'content-bundle.js',
      format: 'iife',
      name: 'app'
    }
  },
  {
    input: './popup.js',
    output: {
      file: 'popup-bundle.js',
      format: 'iife',
      name: 'popup'
    }
  }
];
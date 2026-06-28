import path from 'path';
import { fileURLToPath } from 'url';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/*
 * Build pipeline for AI Safety Guard (MV3).
 *
 * Entry points are emitted into dist/ mirroring the source tree, so that the
 * relative url() references inside fonts.css (../../assets/fonts/...) and the
 * <link> tags in popup.html / onboarding.html keep resolving after copy.
 *
 *   dist/
 *     manifest.json
 *     src/background/service-worker.js   (bundled)
 *     src/content/content.js             (bundled)
 *     src/popup/popup.js                 (bundled)  + popup.html + popup.css (copied)
 *     src/onboarding/onboarding.js       (bundled)  + onboarding.html (copied)
 *     src/shared/*.css                   (copied — tokens.css, fonts.css)
 *     assets/fonts/*.woff2               (copied)
 *     assets/icons/*.png                 (copied)
 */
export default (env, argv) => {
  const isProd = argv.mode === 'production';

  return {
    devtool: isProd ? false : 'inline-source-map',
    entry: {
      'src/background/service-worker': './src/background/service-worker.js',
      'src/content/content': './src/content/content.js',
      'src/popup/popup': './src/popup/popup.js',
      'src/onboarding/onboarding': './src/onboarding/onboarding.js',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      // Lazy chunks (e.g. the pdf.js parser, loaded only when a PDF is attached)
      // get a predictable path so they can be web_accessible_resources. The
      // runtime publicPath is set in content.js via __webpack_public_path__.
      chunkFilename: 'src/content/chunks/[name].js',
      clean: true,
    },
    resolve: {
      extensions: ['.js'],
    },
    // pdf.js (lazy chunk) is intentionally large; don't warn on asset size.
    performance: { hints: false },
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          { from: 'manifest.json', to: 'manifest.json' },
          { from: 'src/popup/popup.html', to: 'src/popup/popup.html' },
          { from: 'src/popup/popup.css', to: 'src/popup/popup.css' },
          { from: 'src/onboarding/onboarding.html', to: 'src/onboarding/onboarding.html' },
          { from: 'src/shared/*.css', to: 'src/shared/[name][ext]' },
          { from: 'assets/fonts', to: 'assets/fonts' },
          { from: 'assets/icons', to: 'assets/icons' },
          // pdf.js worker, referenced via chrome.runtime.getURL at runtime.
          {
            from: 'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
            to: 'assets/pdf.worker.min.mjs',
          },
        ],
      }),
    ],
  };
};

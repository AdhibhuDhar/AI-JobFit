const app = require('../server');

/**
 * Vercel serverless entry point.
 *
 * `req.url` is passed through untouched. The Express app mounts everything at
 * `/api/*`, so `/api/health` must reach Express as `/api/health` — an earlier
 * version of this file stripped the prefix to "fix" the mount, which turned
 * every request into a 404.
 *
 * The one adjustment worth making is removing Vercel's own function mount path
 * when it is present in the URL. That only happens with filesystem routing
 * (a request to `/api/index.js/...`), which this project does not use, so it is
 * handled narrowly rather than guessed at.
 */
function normalizePath(url) {
  let p = url || '/';
  // Strip only the handler's own filename if it leaked into the path.
  p = p.replace(/^\/(?:api\/)?index\.js(?=\/|$)/, '');
  return p === '' ? '/' : p;
}

module.exports = (req, res) => {
  req.url = normalizePath(req.url);
  return app(req, res);
};

module.exports.normalizePath = normalizePath;

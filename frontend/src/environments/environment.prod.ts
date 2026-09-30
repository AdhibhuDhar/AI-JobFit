/**
 * Production configuration, swapped in by `fileReplacements` in angular.json.
 *
 * The deployed app and its API share an origin (Vercel serves `/api/*` from the
 * serverless function), so this is a *relative* base and every call becomes a
 * same-origin `/api/...` request. Hardcoding `localhost` here is the classic way
 * a deployed SPA silently fails: the bundle loads fine and then every XHR is
 * refused by the user's own browser.
 */
export const environment = {
  production: true,
  apiBase: '/api',
};

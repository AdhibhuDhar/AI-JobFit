/**
 * Runtime configuration.
 *
 * The API origin is resolved at runtime (see `resolveApiBase` in `app/job.ts`)
 * rather than baked in at build time, so one bundle works against a backend on
 * any host without a rebuild.
 */
export const environment = {
  /**
   * Backend base URL, used only when nothing overrides it at runtime.
   *
   * Precedence at runtime, highest first:
   *   1. `window.__API_BASE__`
   *   2. `localStorage['apiBase']`
   *   3. this value
   *
   * Deploys (Vercel) serve the API from the same origin as the app, and
   * `production.ts` sets this to `''` so requests go to `/api/...` relatively.
   * Local development defaults to port 5000.
   */
  production: false,
  apiBase: 'http://localhost:5000/api',
};

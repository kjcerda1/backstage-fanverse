// Configured singleton API client — extracted from src/App.jsx's inline `api`
// object. Behavior-preserving move only; see docs/API_CLIENT_BOUNDARY_AUDIT.md
// for the full audit and rationale. App.jsx calls configureApiClient(...) once
// with its API base URL and a Supabase-client getter (a getter, not a static
// value, because _supabase is created asynchronously relative to module load).

let _apiUrl = "";
let _getSupabase = () => null;

export function configureApiClient({ apiUrl, getSupabase } = {}) {
  _apiUrl = apiUrl || "";
  if (typeof getSupabase === "function") _getSupabase = getSupabase;
}

// Normalize a fetch Response into a plain data object WITHOUT ever throwing.
// A dev/preview server — or a static deploy with no /api proxy — can answer an
// /api/* call with HTTP 200 and the Vite HTML shell. Calling r.json() on that
// body REJECTS, and because `return r.json()` unwraps its promise OUTSIDE the
// caller's try/catch, that rejection escapes the api layer and throws in the
// caller (a create handler with no .catch would hang mid-save). So read the body
// as text and JSON.parse it defensively: a non-OK status OR an unparseable/HTML
// body both resolve to a structured { error } object instead of rejecting.
// `mockOnError` preserves post()'s prior behavior of tagging failures mock:true.
async function parseApiResponse(r, { mockOnError = false } = {}) {
  const errBase = mockOnError ? { mock: true } : {};
  if (!r.ok) return { ...errBase, error: `${r.status}` };
  let text;
  try { text = await r.text(); }
  catch { return { ...errBase, error: 'non_json_response' }; }
  if (!text) return {};                    // 204 / empty 200 — success, no payload
  try { return JSON.parse(text); }
  catch { return { ...errBase, error: 'non_json_response' }; }
}

export const api = {
  _token: null,
  _refreshing: null,
  _setToken(t) { this._token = t; },
  _headers() {
    const h = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = `Bearer ${this._token}`;
    return h;
  },
  // A held access_token can go stale (JWT expired) while still being non-null —
  // e.g. a backgrounded PWA left open past the token TTL. Supabase's own
  // autoRefreshToken timer doesn't reliably fire while the tab is suspended, so
  // a 401 here doesn't mean "not authenticated", it can mean "needs a refresh".
  // Force one via the stored refresh token and retry the request exactly once.
  async _refreshToken() {
    const supabase = _getSupabase();
    if (!supabase) return false;
    if (this._refreshing) return this._refreshing;
    this._refreshing = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data?.session?.access_token) return false;
        this._setToken(data.session.access_token);
        return true;
      } catch { return false; }
      finally { this._refreshing = null; }
    })();
    return this._refreshing;
  },
  async post(path, body) {
    try {
      let r = await fetch(`${_apiUrl}${path}`, { method:'POST', headers:this._headers(), body:JSON.stringify(body) });
      if (r.status === 401 && await this._refreshToken()) {
        r = await fetch(`${_apiUrl}${path}`, { method:'POST', headers:this._headers(), body:JSON.stringify(body) });
      }
      return await parseApiResponse(r, { mockOnError: true });
    } catch { return { error:'Network error', mock: true }; }
  },
  async get(path) {
    try {
      let r = await fetch(`${_apiUrl}${path}`, { headers:this._headers() });
      if (r.status === 401 && await this._refreshToken()) {
        r = await fetch(`${_apiUrl}${path}`, { headers:this._headers() });
      }
      return await parseApiResponse(r);
    } catch { return { error:'Network error' }; }
  },
  async patch(path, body) {
    try {
      let r = await fetch(`${_apiUrl}${path}`, { method:'PATCH', headers:this._headers(), body:JSON.stringify(body) });
      if (r.status === 401 && await this._refreshToken()) {
        r = await fetch(`${_apiUrl}${path}`, { method:'PATCH', headers:this._headers(), body:JSON.stringify(body) });
      }
      return await parseApiResponse(r);
    } catch { return { error:'Network error' }; }
  },
  async del(path, body) {
    const opts = () => body === undefined
      ? { method:'DELETE', headers:this._headers() }
      : { method:'DELETE', headers:this._headers(), body:JSON.stringify(body) };
    try {
      let r = await fetch(`${_apiUrl}${path}`, opts());
      if (r.status === 401 && await this._refreshToken()) {
        r = await fetch(`${_apiUrl}${path}`, opts());
      }
      return await parseApiResponse(r);
    } catch { return { error:'Network error' }; }
  },
};

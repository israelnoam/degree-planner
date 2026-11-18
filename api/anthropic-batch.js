// Vercel server function: a relay for Anthropic's Message Batches API (the "economy" queue).
// Anthropic lets a browser call /v1/messages directly, but not /v1/messages/batches (no CORS), so
// the app sends those calls here and this passes them on as they are. The API key comes with each
// request from the app (it is the user's own key) and is never logged or stored.
// Only the batch paths are relayed, and only for this app's own pages.
const { Readable } = require('stream');

const PATH_OK = /^\/v1\/messages\/batches(\/msgbatch_[A-Za-z0-9]+(\/(results|cancel))?)?$/;
const PASS_UP = ['x-api-key', 'anthropic-version', 'anthropic-beta', 'content-type'];
const PASS_DOWN = ['content-type', 'request-id', 'retry-after', 'anthropic-ratelimit-requests-remaining'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const fail = (code, message) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify({ type: 'error', error: { type: 'relay_error', message } })); };
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return fail(403, 'same-origin only');
  if (!['GET', 'POST'].includes(req.method)) return fail(405, 'GET or POST only');
  const raw = String(req.query?.p || '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q), search = q < 0 ? '' : raw.slice(q);
  if (!PATH_OK.test(path)) return fail(400, 'not a batch path');
  if (!req.headers['x-api-key']) return fail(401, 'missing API key');

  const headers = {};
  for (const h of PASS_UP) if (req.headers[h]) headers[h] = req.headers[h];
  let body;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }
  let up;
  try {
    up = await fetch(`https://api.anthropic.com${path}${search}`, { method: req.method, headers, body, signal: AbortSignal.timeout(240000) });
  } catch (e) {
    return fail(502, `could not reach Anthropic: ${e.message}`);
  }
  res.statusCode = up.status;
  for (const h of PASS_DOWN) { const v = up.headers.get(h); if (v) res.setHeader(h, v); }
  if (!up.body) return res.end();
  Readable.fromWeb(up.body).pipe(res); // results come as a stream of lines
};

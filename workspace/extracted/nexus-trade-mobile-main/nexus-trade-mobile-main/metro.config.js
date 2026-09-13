const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// ---------------------------------------------------------------------------
// Dev-server CORS proxy for web builds.
// ---------------------------------------------------------------------------
// When the app runs in a browser (web target / Expo web dev), every fetch
// to a different-origin backend is blocked by the browser's same-origin
// policy UNLESS the backend sends the right CORS headers. The self-hosted
// Nexus Trade FastAPI backend does send Access-Control-Allow-Origin: *
// (see backend/python_app/backend/app.py's CORSMiddleware), BUT only for
// "simple" requests. Preflight (OPTIONS) requests and requests with
// non-CORS-safelisted headers (like the JSON Content-Type our app sends)
// still hit a CORS preflight, and any backend hiccup there shows up to
// the user as a silent "Network request failed" with no actionable
// detail.
//
// To eliminate that entire class of bug in development, we register a
// tiny reverse-proxy at /__proxy/* on Metro's dev server. The app
// rewrites backend URLs to this prefix ONLY when running on web in dev
// (see lib/forex-api.ts), so production builds (which don't run on
// Metro) are completely unaffected — they hit the backend directly.
//
// This is dev-only and never affects production web builds. Production
// deployments are expected to be served from the same origin as the
// backend (or run behind a reverse proxy that adds the CORS headers).
// ---------------------------------------------------------------------------
if (config.server) {
  const userEnhanceMiddleware = config.server.enhanceMiddleware;
  config.server.enhanceMiddleware = (middleware, server) => {
    const enhanced = userEnhanceMiddleware ? userEnhanceMiddleware(middleware, server) : middleware;
    return (req, res, next) => {
      const url = req.url ?? "";
      // Match /__proxy/<host>/<port>/<path> — the prefix is removed and
      // the request is forwarded to http://<host>:<port>/<path> with
      // permissive CORS headers attached.
      const m = url.match(/^\/__proxy\/([^/]+)\/(\d+)(\/.*)?$/);
      if (!m) return enhanced(req, res, next);
      const [, host, portStr, rest = "/"] = m;
      const port = parseInt(portStr, 10);
      if (!Number.isFinite(port) || port <= 0 || port > 65535) {
        res.statusCode = 400;
        res.end("Invalid proxy port");
        return;
      }
      const targetUrl = new URL(rest, `http://${host}:${port}/`);
      const http = require("http");
      const proxyReq = http.request(
        targetUrl,
        {
          method: req.method,
          headers: {
            ...req.headers,
            host: targetUrl.host,
          },
        },
        (proxyRes) => {
          // Echo back CORS headers so the browser accepts the response.
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");
          res.setHeader("Access-Control-Max-Age", "86400");
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
          res.statusCode = proxyRes.statusCode ?? 200;
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            // Skip CORS headers we've already set — the upstream backend
            // may also send its own (it has CORSMiddleware), and having
            // duplicates would confuse the browser.
            if (k.toLowerCase().startsWith("access-control-")) continue;
            if (Array.isArray(v)) v.forEach((val) => res.appendHeader(k, val));
            else res.setHeader(k, v);
          }
          proxyRes.pipe(res);
        },
      );
      proxyReq.on("error", (err) => {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ error: "proxy_error", detail: err.message, target: targetUrl.toString() }));
      });
      if (req.method !== "GET" && req.method !== "HEAD") {
        req.pipe(proxyReq);
      } else {
        proxyReq.end();
      }
    };
  };
}

module.exports = withNativeWind(config, {
  input: "./global.css",
  // Force write CSS to file system instead of virtual modules
  // This fixes iOS styling issues in development mode
  forceWriteFileSystem: true,
});

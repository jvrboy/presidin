// Minimal preload script. The bundled web app talks directly to the
// user-configured FastAPI backend over HTTPS/HTTP from the renderer
// (same as it does on mobile/web), so no privileged IPC bridge is
// required here. This file exists as the sanctioned place to add one
// later (e.g. native notifications, secure token storage) without
// having to touch main.js's window security settings.

window.addEventListener("DOMContentLoaded", () => {
  // no-op — reserved for future native bridging
});

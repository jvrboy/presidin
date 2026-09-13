# Privacy Policy

**Effective date:** 2026-09-14
**App:** Nexus Trade Mobile
**Developer:** jvrboy (personal-use app)

## TL;DR

This is a personal-use app. It does **not** collect analytics, does **not** send crash reports to a third party, and does **not** have a backend telemetry service. The only data that leaves your device is what you explicitly send to your own self-hosted backend.

## Data stored on your device

The app stores the following in device-local storage (AsyncStorage on native, localStorage on web):

- **Backend URL** — the FastAPI base URL you enter in Settings (e.g. `http://192.168.1.20:8000`).
- **Theme preferences** — color scheme, surface mode, glass intensity, density, custom accent, animation speed, etc.
- **Provider preferences** — which AI / market-data providers you've enabled and their priority order (the API keys themselves are pushed to the backend's server-side key pool — see "Data sent to your backend" below).
- **Cached backend status** — the last successful `/api/status` response, used to hydrate the dashboard on cold-start when the backend is offline.
- **Failed-write queue** — bot-control / rescan / kill-switch operations that failed due to a network error, persisted for later replay (auto-cleared once replayed).

## Data sent to your backend

When you configure a backend URL, the app sends the following to **your** backend over the network you configure:

- **API keys** — when you add AI provider (Gemini, OpenAI, etc.) or market-data provider (Deriv, Finnhub, etc.) API keys in Settings, they are POSTed to your backend's `/api/providers/keys/add` endpoint. The backend stores them in `settings.json` (optionally encrypted at rest — see backend security docs).
- **Bot control actions** — start / stop / pause / resume / kill switch commands you trigger in the Dashboard.
- **Signal rescan requests** — manual rescan requests from the Signals tab.
- **Settings updates** — when you save Learning System or backend settings, the full `SystemSettings` object is POSTed to your backend.
- **OAuth push token (mobile only)** — if you grant notification permission, an Expo push token is registered with your backend so it can send you provider-alert notifications. (Web target does not use push notifications.)
- **Read polls** — every `refreshIntervalSeconds` (default 30s), the app polls `/api/status`, `/api/signals`, `/api/dashboard/metrics`, etc.

**None of this data passes through any third-party server.** It goes directly from your device to the backend URL you configured. If your backend is on your LAN, the data never leaves your local network.

## Data NOT collected

The app explicitly does **not**:

- Use analytics SDKs (no Amplitude, PostHog, Mixpanel, Firebase Analytics).
- Use crash reporters (no Sentry, Bugsnag). Uncaught render errors are caught by an in-app `<AppErrorBoundary>` and displayed on-device; they are not transmitted anywhere.
- Use advertising SDKs.
- Use third-party login / OAuth providers.
- Track your location.
- Read your contacts, photos, or files.
- Inject third-party JavaScript into web views.

## Permissions requested

- **Android:** `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, `POST_NOTIFICATIONS`.
- **iOS:** Local Network Usage (to reach your LAN-hosted backend), Notifications (for signal alerts, if enabled).

Each permission is requested at the moment it is first needed, not at app launch.

## Data retention

- Device-local data persists until you uninstall the app or explicitly clear it (Settings → Reset).
- Backend-side data (provider API keys, trade history, signal history, decision audit logs) is retained on your own backend until you delete it. See the backend's own documentation for retention.
- The cached backend status and failed-write queue auto-clear once they're no longer needed (successful replay, or app uninstall).

## Your rights

Since this is a personal-use app with no external data collection:
- **Access / portability:** All your data is in your device's local storage and on your own backend — you already have full access.
- **Erasure:** Uninstall the app to wipe all device-local data. Delete `settings.json` and the SQLite database on your backend to wipe backend-side data.
- **Rectification:** Edit any value in Settings; changes save instantly.

## Changes to this policy

Any changes will be committed to this file in the public GitHub repository at <https://github.com/jvrboy/nexus-trade-mobile>. The "Effective date" at the top will be updated accordingly.

## Contact

Open an issue at <https://github.com/jvrboy/nexus-trade-mobile/issues> for any privacy-related questions.

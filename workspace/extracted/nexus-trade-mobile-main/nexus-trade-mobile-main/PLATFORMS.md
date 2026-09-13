# Platform support

## Android

The app is an Expo native Android application with an Android package identifier configured in `app.config.ts`. Run `pnpm android` for a local development client or `npx eas build -p android` for a distributable build.

## iOS

The same source runs as an Expo native iOS application with tablet support enabled. Run `pnpm ios` for a local simulator/device session or `npx eas build -p ios` for a distributable build. The app uses safe-area containers, automatic status-bar contrast, and platform-safe haptics.

## Windows

Windows support is delivered as the responsive Expo web build/PWA. It works in Edge, Chrome, and other modern desktop browsers, and can be installed from the browser as a standalone app using `public/manifest.json`. Build it with:

```bash
npx expo export --platform web
```

The UI constrains content to a comfortable desktop width while remaining phone-responsive. The Windows web client uses the same REST backend URL configured in Settings; it does not require Windows-specific native APIs.

## Shared behavior

All platforms share the same dashboard, signal feed, settings, backend polling, safety-state display, and disconnected-state behavior. Real trading permissions remain controlled by the backend, and credentials are never bundled into the client.

# Nexus Trade — Native Windows Desktop App

A true desktop application — like FL Studio or Photoshop. You get a real
**installation wizard**, it installs to Program Files, puts an icon on your
desktop, and launches as a **native window**. No cmd, no browser, no Python,
no .NET runtime to install.

## What you get

```
NexusTrade-Setup.exe        ← the installer wizard (this is what you run)
        │
        ├─ Welcome → License → Choose folder → Desktop icon → Install → Finish
        │
        └─ Installs:
             NexusTrade.exe          native C# desktop shell (the window you see)
             engine\NexusTradeEngine.exe   Python trading engine (runs hidden)
```

## How it works (no console, no browser)

- The **C# shell** (`NexusTrade.exe`) is the real window. It renders the
  trading terminal inside a **WebView2** control — the same native Chromium
  engine Microsoft Teams and Office use. It is a genuine Windows app with a
  taskbar/desktop icon, not a browser tab.
- The **Python engine** (`NexusTradeEngine.exe`) runs **hidden** in the
  background — spawned by the shell with no console window, and killed cleanly
  when you close the app. You never see it or touch it.
- Both are fully self-contained: the shell bundles the .NET runtime, the
  engine bundles Python. A brand-new PC with nothing installed just works.

## Install & use

1. Download **`NexusTrade-Setup.exe`** (repo → Actions → latest "Build Windows
   App" run → the `NexusTrade-Setup` artifact).
2. Run it → the wizard walks you through (Welcome → folder → desktop icon →
   Install → Finish). Leave "Launch Nexus Trade" ticked.
3. The app opens as a native window — the terminal is ready.
4. **Connect MT5:** Settings → Connection → **⬇ Download NexusBridge.mq5**,
   drop it in MT5's `MQL5/Experts`, compile in MetaEditor, attach to any chart
   (host `127.0.0.1`, port `5555`). The **MT5 Online** pill lights up.

## Your data

Settings, learning memory and trained models live in
`%APPDATA%\NexusTrade` — outside the install folder, so **updating or
reinstalling never wipes your bot's learning**. The uninstaller optionally
offers to remove it.

## First launch

Windows may show a SmartScreen prompt ("Windows protected your PC") because
the app is self-signed — click **More info → Run anyway**. Normal for
self-built software.

## For developers — build it yourself

```bat
git clone https://github.com/jvrboy/forex_bot.git
cd forex_bot

rem 1. Engine
cd python_app
pip install -r requirements.txt pyinstaller
pyinstaller nexus_engine.spec --clean --noconfirm

rem 2. Native shell (needs .NET 8 SDK)
cd ..\desktop_shell
dotnet publish NexusTrade.Desktop.csproj -c Release -r win-x64 --self-contained true -o publish

rem 3. Installer wizard (needs Inno Setup 6)
cd installer
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" NexusTrade.iss

rem → dist_installer\NexusTrade-Setup.exe
```

The GitHub Actions workflow (`.github/workflows/build-windows.yml`) does all
three steps automatically on every push to `main`.

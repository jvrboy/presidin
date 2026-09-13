# GitHub Actions Workflow Fix

## Issue
The build workflow fails at the "Install Inno Setup" step because the download URL `https://jrsoftware.org/download.php/is.exe` is unreliable from GitHub Actions runners.

## Current Status
- ✓ Python engine builds successfully (PyInstaller)
- ✓ C# desktop shell builds successfully (.NET 8)
- ✗ Inno Setup installer fails (download issue)

## Solution
Replace the Inno Setup installation method with Chocolatey, which is more reliable on GitHub Actions Windows runners.

### Manual Fix Required
Due to GitHub App permissions, the workflow file cannot be automatically updated. Please manually edit `.github/workflows/build-windows.yml`:

**Find this section (around line 157):**
```yaml
      - name: Install Inno Setup
        shell: pwsh
        run: |
          Invoke-WebRequest -Uri "https://jrsoftware.org/download.php/is.exe" -OutFile "$env:TEMP\innosetup.exe"
          Start-Process -FilePath "$env:TEMP\innosetup.exe" -ArgumentList "/VERYSILENT /SUPPRESSMSGBOXES /NORESTART" -Wait
```

**Replace with:**
```yaml
      - name: Install Inno Setup
        shell: pwsh
        run: |
          choco install innosetup --no-progress -y
```

### Alternative: Use Fixed Workflow
A corrected version of the workflow file is available at `.github/workflows/build-windows-fixed.yml`. You can:
1. Delete the current `.github/workflows/build-windows.yml`
2. Rename `.github/workflows/build-windows-fixed.yml` to `build-windows.yml`
3. Commit and push to trigger a new build

## Build Artifacts
Even without the installer, the build produces:
- `python_app/dist_engine/NexusTradeEngine/NexusTradeEngine.exe` - Python trading engine
- `desktop_shell/publish/NexusTrade.exe` - C# desktop shell
- All supporting DLLs and resources

These can be manually packaged or used as-is for development/testing.

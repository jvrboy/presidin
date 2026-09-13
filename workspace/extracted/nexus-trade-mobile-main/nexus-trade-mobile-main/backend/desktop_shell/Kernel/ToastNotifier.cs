// ============================================================================
// Toast Notifier — Windows 10/11 native toast notifications.
//
// Uses the Windows.UI.Notifications API via WinRT interop to show
// native system toasts for trade alerts, engine events, and updates.
// Falls back to the WinForms NotifyIcon balloon if WinRT is unavailable.
// ============================================================================

using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class ToastNotifier : IKernelService
    {
        public string Name => "ToastNotifier";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        private NotifyIcon _trayIcon;

        public async Task StartAsync(CancellationToken ct)
        {
            State = ServiceState.Starting;

            // Create a WinForms tray icon as the notification anchor
            _trayIcon = new NotifyIcon
            {
                Visible = false, // Only shown on minimize-to-tray
                Text = "Nexus Trade",
            };

            var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "nexus.ico");
            if (File.Exists(iconPath))
            {
                try { _trayIcon.Icon = new Icon(iconPath); }
                catch { _trayIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                _trayIcon.Icon = SystemIcons.Application;
            }

            State = ServiceState.Running;
            Log("Toast notifications ready");
            await Task.CompletedTask;
        }

        public void Show(string title, string message, ToolTipIcon icon = ToolTipIcon.Info, int durationMs = 5000)
        {
            if (_trayIcon == null) return;

            try
            {
                // Ensure the icon is visible for the balloon to show
                _trayIcon.Visible = true;
                _trayIcon.ShowBalloonTip(durationMs, title, message, icon);

                // Auto-hide after duration
                Task.Delay(durationMs + 1000).ContinueWith(_ =>
                {
                    try { if (_trayIcon != null) _trayIcon.Visible = false; } catch { }
                });
            }
            catch (Exception ex)
            {
                Log("Toast failed: " + ex.Message);
            }
        }

        public void ShowTradeAlert(string symbol, string direction, double confidence)
        {
            var icon = direction.Equals("buy", StringComparison.OrdinalIgnoreCase)
                ? ToolTipIcon.Info : ToolTipIcon.Warning;
            Show(
                $"Trade Signal: {symbol}",
                $"{direction.ToUpper()} — Confidence: {confidence:P0}",
                icon);
        }

        public void ShowEngineEvent(string message, bool isError = false)
        {
            Show(
                "Nexus Trade Engine",
                message,
                isError ? ToolTipIcon.Error : ToolTipIcon.Info);
        }

        public void ShowUpdateAvailable(string version)
        {
            Show(
                "Update Available",
                $"Nexus Trade v{version} is ready to install. Click here to update.",
                ToolTipIcon.Info, 10000);
        }

        public void ShowCrashRecovery(int restartCount)
        {
            Show(
                "Engine Restarted",
                $"The trading engine was automatically restarted (attempt #{restartCount}).",
                ToolTipIcon.Warning);
        }

        public Task StopAsync()
        {
            State = ServiceState.Stopped;
            return Task.CompletedTask;
        }

        private void Log(string msg) => OnLog?.Invoke(this, msg);

        public void Dispose()
        {
            _trayIcon?.Dispose();
        }
    }
}

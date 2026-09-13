using System;
using System.Threading;
using System.Windows.Forms;
using NexusTrade.Desktop.Kernel;

namespace NexusTrade.Desktop
{
    internal static class Program
    {
        /// <summary>
        /// The global micro-kernel instance. Owns all native services.
        /// </summary>
        public static KernelHost Kernel { get; private set; }
        public static NativeSettings Settings { get; private set; }

        [STAThread]
        static void Main()
        {
            // Global unhandled exception handlers — never let the app crash silently
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, e) =>
            {
                Kernel?.GetService<TelemetryClient>()?.TrackException(e.Exception, "UI thread");
                MessageBox.Show(
                    $"An unexpected error occurred:\n\n{e.Exception.Message}\n\n" +
                    "The application will attempt to continue. Please report this issue.",
                    "Nexus Trade — Error",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            };
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                if (e.ExceptionObject is Exception ex)
                {
                    Kernel?.GetService<TelemetryClient>()?.TrackException(ex, "AppDomain");
                }
            };

            ApplicationConfiguration.Initialize();
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);

            // Load native settings
            Settings = NativeSettings.Load();
            Settings.TotalSessions++;
            Settings.Save();

            // Build the micro-kernel
            Kernel = new KernelHost();

            var engine = new EngineProcess { Port = Settings.EnginePort };
            var health = new HealthMonitor(engine);
            var recovery = new CrashRecovery(engine, health) { MaxRestarts = Settings.MaxAutoRestarts };
            var toasts = new ToastNotifier();
            var tray = new SystemTray(engine);
            var updater = new AutoUpdater();
            var telemetry = new TelemetryClient { Enabled = Settings.TelemetryEnabled };

            Kernel.Register(telemetry);
            Kernel.Register(engine);
            Kernel.Register(health);
            Kernel.Register(recovery);
            Kernel.Register(toasts);
            Kernel.Register(tray);
            Kernel.Register(updater);

            // Wire up crash recovery → toast notifications
            recovery.OnMaxRestartsReached += (s, e) =>
                toasts.ShowEngineEvent("Engine failed to restart after multiple attempts. Please restart Nexus Trade.", true);

            // Wire up update notifications
            updater.OnUpdateAvailable += (s, info) =>
                toasts.ShowUpdateAvailable(info.Version);

            Application.Run(new MainForm());

            // Clean shutdown
            Kernel.StopAllAsync().GetAwaiter().GetResult();
            Kernel.Dispose();
        }
    }
}

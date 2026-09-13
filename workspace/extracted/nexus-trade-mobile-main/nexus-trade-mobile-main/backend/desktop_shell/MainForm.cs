using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using NexusTrade.Desktop.Kernel;

namespace NexusTrade.Desktop
{
    /// <summary>
    /// Native desktop shell for Nexus Trade — micro-kernel edition.
    ///
    /// The kernel manages all services (engine process, health monitor,
    /// crash recovery, tray, toasts, updater, telemetry). This form
    /// hosts the WebView2 terminal and wires up the kernel events.
    /// </summary>
    public sealed class MainForm : Form
    {
        private WebView2 _web;
        private Panel _splash;
        private Label _splashStatus;
        private Label _splashDetail;
        private ProgressBar _splashProgress;

        private EngineProcess Engine => Program.Kernel.GetService<EngineProcess>();
        private ToastNotifier Toasts => Program.Kernel.GetService<ToastNotifier>();
        private SystemTray Tray => Program.Kernel.GetService<SystemTray>();
        private AutoUpdater Updater => Program.Kernel.GetService<AutoUpdater>();

        private static readonly string DataDir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NexusTrade");

        public MainForm()
        {
            Text = "Nexus Trade — Agentic Trading Terminal";
            Width = Program.Settings.WindowWidth;
            Height = Program.Settings.WindowHeight;
            MinimumSize = new Size(1100, 700);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(7, 10, 18);

            if (Program.Settings.WindowX >= 0 && Program.Settings.WindowY >= 0)
            {
                StartPosition = FormStartPosition.Manual;
                Location = new Point(Program.Settings.WindowX, Program.Settings.WindowY);
            }
            if (Program.Settings.WindowMaximized)
                WindowState = FormWindowState.Maximized;

            var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "nexus.ico");
            if (File.Exists(iconPath))
                Icon = new Icon(iconPath);

            BuildSplash();
            WireKernelEvents();
            Shown += async (_, __) => await StartupAsync();
            FormClosing += OnFormClosing;
            Resize += OnResize;
        }

        // ------------------------------------------------------------------
        // Splash screen
        // ------------------------------------------------------------------
        private void BuildSplash()
        {
            _splash = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(7, 10, 18) };

            var logo = new Label
            {
                Text = "⬡  NEXUS TRADE",
                ForeColor = Color.FromArgb(238, 242, 250),
                Font = new Font("Segoe UI", 28f, FontStyle.Bold),
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Padding = new Padding(0, 200, 0, 6),
            };
            var sub = new Label
            {
                Text = "A G E N T I C   T R A D I N G   T E R M I N A L",
                ForeColor = Color.FromArgb(139, 149, 168),
                Font = new Font("Segoe UI", 9f, FontStyle.Regular),
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Padding = new Padding(0, 0, 0, 20),
            };
            var version = new Label
            {
                Text = $"v2.0.0  ·  Micro-Kernel Edition",
                ForeColor = Color.FromArgb(90, 100, 120),
                Font = new Font("Segoe UI", 8f),
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
            };

            _splashStatus = new Label
            {
                Text = "Initializing kernel…",
                ForeColor = Color.FromArgb(91, 140, 255),
                Font = new Font("Consolas", 10f),
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Padding = new Padding(0, 40, 0, 8),
            };
            _splashDetail = new Label
            {
                Text = "",
                ForeColor = Color.FromArgb(100, 110, 130),
                Font = new Font("Consolas", 8f),
                AutoSize = true,
                TextAlign = ContentAlignment.MiddleCenter,
                Dock = DockStyle.Top,
                Padding = new Padding(0, 0, 0, 12),
            };
            _splashProgress = new ProgressBar
            {
                Style = ProgressBarStyle.Continuous,
                Width = 400,
                Height = 4,
                Dock = DockStyle.Top,
                Minimum = 0,
                Maximum = 100,
            };

            _splash.Controls.Add(_splashProgress);
            _splash.Controls.Add(_splashDetail);
            _splash.Controls.Add(_splashStatus);
            _splash.Controls.Add(version);
            _splash.Controls.Add(sub);
            _splash.Controls.Add(logo);
            Controls.Add(_splash);
        }

        // ------------------------------------------------------------------
        // Kernel event wiring
        // ------------------------------------------------------------------
        private void WireKernelEvents()
        {
            // Show kernel logs on splash
            Program.Kernel.OnKernelLog += (s, msg) =>
            {
                if (InvokeRequired)
                {
                    BeginInvoke(() => SetSplashDetail(msg));
                }
                else
                {
                    SetSplashDetail(msg);
                }
            };

            // Tray: show/hide/exit
            if (Tray != null)
            {
                Tray.OnShowRequested += (s, e) => BeginInvoke(() => { Show(); WindowState = FormWindowState.Normal; Activate(); });
                Tray.OnHideRequested += (s, e) => BeginInvoke(() => Hide());
                Tray.OnExitRequested += (s, e) => BeginInvoke(() => Close());
                Tray.OnBotAction += async (s, action) =>
                {
                    try
                    {
                        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
                        await http.PostAsJsonAsync(Engine.BaseUrl + "/api/bot", new { action });
                    }
                    catch { }
                };
                Tray.OnKillSwitch += async (s, e) =>
                {
                    try
                    {
                        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
                        await http.PostAsync(Engine.BaseUrl + "/api/kill?reason=tray_kill_switch", null);
                        Toasts?.ShowEngineEvent("🚨 Kill switch activated — all positions closed");
                    }
                    catch { }
                };
                Tray.OnCheckUpdates += async (s, e) =>
                {
                    try
                    {
                        var info = await Updater.CheckForUpdateAsync();
                        if (info.IsNewer)
                        {
                            var result = MessageBox.Show(
                                $"Nexus Trade v{info.Version} is available!\n\n{info.Notes}\n\nOpen the release page?",
                                "Update Available",
                                MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                            if (result == DialogResult.Yes)
                                Process.Start(new ProcessStartInfo(info.ReleaseUrl) { UseShellExecute = true });
                        }
                        else
                        {
                            MessageBox.Show("You are running the latest version.", "Nexus Trade", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        }
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Update check failed: {ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    }
                };
            }
        }

        // ------------------------------------------------------------------
        // Startup sequence
        // ------------------------------------------------------------------
        private async Task StartupAsync()
        {
            SetSplash("Starting micro-kernel…", "Initializing native services", 10);

            // Start all kernel services
            await Program.Kernel.StartAllAsync();

            SetSplash("Kernel ready", "All services initialized", 60);

            // Wait for engine to be ready
            if (Engine.State == ServiceState.Running)
            {
                SetSplash("Loading trading terminal…", "Connecting to engine", 80);
            }
            else if (Engine.State == ServiceState.Degraded)
            {
                SetSplash("Engine starting slowly…", "Waiting for health check", 70);
                // Give it more time
                var deadline = DateTime.UtcNow.AddSeconds(30);
                while (DateTime.UtcNow < deadline && Engine.State != ServiceState.Running)
                {
                    await Task.Delay(1000);
                }
            }

            if (Engine.State != ServiceState.Running)
            {
                SetSplash("Engine unavailable", "Check engine.log in %APPDATA%\\NexusTrade", 100);
                _splashStatus.ForeColor = Color.FromArgb(248, 113, 113);
                return;
            }

            SetSplash("Loading terminal…", "Rendering WebView2", 90);

            // Initialize WebView2
            _web = new WebView2 { Dock = DockStyle.Fill };
            Controls.Add(_web);
            _web.BringToFront();

            var wvData = Path.Combine(DataDir, "webview2");
            Directory.CreateDirectory(wvData);
            var env = await CoreWebView2Environment.CreateAsync(null, wvData);
            await _web.EnsureCoreWebView2Async(env);

            _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _web.CoreWebView2.NewWindowRequested += (s, e) =>
            {
                if (e.Uri.StartsWith(Engine.BaseUrl))
                {
                    e.NewWindow = _web.CoreWebView2;
                }
                else
                {
                    e.Handled = true;
                    try { Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true }); } catch { }
                }
            };

            _web.Source = new Uri(Engine.BaseUrl);
            SetSplash("Welcome to Nexus Trade", "", 100);

            _web.NavigationCompleted += (_, __) =>
            {
                if (_splash != null)
                {
                    Controls.Remove(_splash);
                    _splash.Dispose();
                    _splash = null;
                }
                Toasts?.Show("Nexus Trade", "Trading terminal is ready.");
            };
        }

        // ------------------------------------------------------------------
        // Form lifecycle
        // ------------------------------------------------------------------
        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            // Save window position
            if (WindowState == FormWindowState.Normal)
            {
                Program.Settings.WindowX = Location.X;
                Program.Settings.WindowY = Location.Y;
                Program.Settings.WindowWidth = Width;
                Program.Settings.WindowHeight = Height;
            }
            Program.Settings.WindowMaximized = WindowState == FormWindowState.Maximized;
            Program.Settings.Save();

            // Minimize to tray instead of closing?
            if (e.CloseReason == CloseReason.UserClosing && Program.Settings.MinimizeToTray)
            {
                e.Cancel = true;
                Hide();
                Tray?.ShowBalloon("Nexus Trade", "Running in the background. Double-click the tray icon to restore.");
                return;
            }
        }

        private void OnResize(object sender, EventArgs e)
        {
            if (WindowState == FormWindowState.Minimized && Program.Settings.MinimizeToTray)
            {
                Hide();
            }
        }

        // ------------------------------------------------------------------
        // Splash helpers
        // ------------------------------------------------------------------
        private void SetSplash(string text, string detail = "", int progress = -1)
        {
            if (_splashStatus == null || _splashStatus.IsDisposed) return;
            if (InvokeRequired) { BeginInvoke(() => SetSplash(text, detail, progress)); return; }
            _splashStatus.Text = text;
            if (_splashDetail != null && !string.IsNullOrEmpty(detail))
                _splashDetail.Text = detail;
            if (progress >= 0 && _splashProgress != null)
                _splashProgress.Value = Math.Min(100, Math.Max(0, progress));
        }

        private void SetSplashDetail(string detail)
        {
            if (_splashDetail == null || _splashDetail.IsDisposed) return;
            _splashDetail.Text = detail;
        }
    }
}

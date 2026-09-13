// ============================================================================
// System Tray Service — minimize-to-tray, context menu, quick actions.
//
// Provides a persistent system tray icon with a right-click menu:
//   • Show / Hide window
//   • Bot: Start / Stop / Pause
//   • Engine status
//   • Kill Switch (emergency close-all)
//   • Check for Updates
//   • Exit
// ============================================================================

using System;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Windows.Forms;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class SystemTray : IKernelService
    {
        public string Name => "SystemTray";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        public event EventHandler OnShowRequested;
        public event EventHandler OnHideRequested;
        public event EventHandler OnExitRequested;
        public event EventHandler<string> OnBotAction;
        public event EventHandler OnKillSwitch;
        public event EventHandler OnCheckUpdates;

        private NotifyIcon _icon;
        private ContextMenuStrip _menu;
        private readonly EngineProcess _engine;

        public bool MinimizeToTray { get; set; } = true;

        public SystemTray(EngineProcess engine)
        {
            _engine = engine;
        }

        public async Task StartAsync(CancellationToken ct)
        {
            State = ServiceState.Starting;

            _menu = new ContextMenuStrip();
            _menu.Items.Add("Show Nexus Trade", null, (s, e) => OnShowRequested?.Invoke(this, EventArgs.Empty));
            _menu.Items.Add(new ToolStripSeparator());

            var botMenu = new ToolStripMenuItem("Bot Control");
            botMenu.DropDownItems.Add("▶ Start", null, (s, e) => OnBotAction?.Invoke(this, "start"));
            botMenu.DropDownItems.Add("⏸ Pause", null, (s, e) => OnBotAction?.Invoke(this, "pause"));
            botMenu.DropDownItems.Add("⏹ Stop", null, (s, e) => OnBotAction?.Invoke(this, "stop"));
            _menu.Items.Add(botMenu);

            _menu.Items.Add("🚨 Kill Switch", null, (s, e) =>
            {
                var result = MessageBox.Show(
                    "EMERGENCY: Close ALL open positions immediately?\n\nThis cannot be undone.",
                    "Kill Switch Confirmation",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
                if (result == DialogResult.Yes)
                    OnKillSwitch?.Invoke(this, EventArgs.Empty);
            });

            _menu.Items.Add(new ToolStripSeparator());

            var engineStatus = new ToolStripMenuItem("Engine: checking…");
            engineStatus.Enabled = false;
            _menu.Items.Add(engineStatus);

            // Periodic status refresh
            var timer = new System.Windows.Forms.Timer { Interval = 5000 };
            timer.Tick += (s, e) =>
            {
                var running = _engine.IsAlive;
                engineStatus.Text = running ? $"✓ Engine running (PID {_engine.Process?.Id})" : "✗ Engine stopped";
                engineStatus.ForeColor = running ? Color.Green : Color.Red;
            };
            timer.Start();

            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add("Check for Updates…", null, (s, e) => OnCheckUpdates?.Invoke(this, EventArgs.Empty));
            _menu.Items.Add("Minimize to Tray", null, (s, e) => OnHideRequested?.Invoke(this, EventArgs.Empty));
            _menu.Items.Add(new ToolStripSeparator());
            _menu.Items.Add("Exit Nexus Trade", null, (s, e) => OnExitRequested?.Invoke(this, EventArgs.Empty));

            _icon = new NotifyIcon
            {
                Text = "Nexus Trade — Agentic Trading Terminal",
                ContextMenuStrip = _menu,
                Visible = true,
            };

            var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "nexus.ico");
            if (File.Exists(iconPath))
            {
                try { _icon.Icon = new Icon(iconPath); }
                catch { _icon.Icon = SystemIcons.Application; }
            }
            else
            {
                _icon.Icon = SystemIcons.Application;
            }

            _icon.DoubleClick += (s, e) => OnShowRequested?.Invoke(this, EventArgs.Empty);

            State = ServiceState.Running;
            Log("System tray active");
            await Task.CompletedTask;
        }

        public void ShowBalloon(string title, string text, ToolTipIcon icon = ToolTipIcon.Info)
        {
            _icon?.ShowBalloonTip(5000, title, text, icon);
        }

        public Task StopAsync()
        {
            State = ServiceState.Stopped;
            return Task.CompletedTask;
        }

        private void Log(string msg) => OnLog?.Invoke(this, msg);

        public void Dispose()
        {
            if (_icon != null)
            {
                _icon.Visible = false;
                _icon.Dispose();
            }
            _menu?.Dispose();
        }
    }
}

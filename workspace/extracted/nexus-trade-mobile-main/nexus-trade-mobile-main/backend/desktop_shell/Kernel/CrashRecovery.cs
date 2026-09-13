// ============================================================================
// Crash Recovery — automatic engine restart with exponential backoff.
//
// Listens for:
//   1. EngineProcess.Exited events (unexpected death)
//   2. HealthMonitor.OnEngineUnhealthy (consecutive health failures)
//
// Restarts with backoff: 2s → 4s → 8s → 16s → max 60s.
// After MaxRestarts consecutive failures, enters Failed state and alerts
// the user via ToastNotifier instead of endlessly retrying.
// ============================================================================

using System;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class CrashRecovery : IKernelService
    {
        public string Name => "CrashRecovery";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        public event EventHandler OnMaxRestartsReached;

        public int MaxRestarts { get; set; } = 5;
        public int BaseDelayMs { get; set; } = 2000;
        public int MaxDelayMs { get; set; } = 60000;

        public int RestartCount { get; private set; }
        public DateTime LastRestart { get; private set; }

        private readonly EngineProcess _engine;
        private readonly HealthMonitor _health;
        private bool _manualStop;
        private CancellationTokenSource _cts;

        public CrashRecovery(EngineProcess engine, HealthMonitor health)
        {
            _engine = engine;
            _health = health;
        }

        public Task StartAsync(CancellationToken ct)
        {
            _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _manualStop = false;

            // Watch for unexpected engine exit
            if (_engine.Process != null)
            {
                _engine.Process.Exited += OnEngineExited;
            }

            // Watch for health monitor declaring engine unhealthy
            _health.OnEngineUnhealthy += OnEngineUnhealthy;

            State = ServiceState.Running;
            Log("Watching for engine crashes (max " + MaxRestarts + " auto-restarts)");
            return Task.CompletedTask;
        }

        private void OnEngineExited(object sender, EventArgs e)
        {
            if (_manualStop || _cts.IsCancellationRequested) return;
            Log("Engine process exited unexpectedly — scheduling restart");
            _ = ScheduleRestartAsync("process_exit");
        }

        private void OnEngineUnhealthy(object sender, int failures)
        {
            if (_manualStop || _cts.IsCancellationRequested) return;
            Log($"Engine unhealthy ({failures} failures) — forcing restart");
            _ = ScheduleRestartAsync("health_failure");
        }

        private async Task ScheduleRestartAsync(string reason)
        {
            if (RestartCount >= MaxRestarts)
            {
                Log($"⚠ Max auto-restarts ({MaxRestarts}) reached — manual intervention needed");
                OnMaxRestartsReached?.Invoke(this, EventArgs.Empty);
                return;
            }

            RestartCount++;
            int delay = Math.Min(BaseDelayMs * (1 << (RestartCount - 1)), MaxDelayMs);
            Log($"Restart #{RestartCount} in {delay / 1000}s (reason: {reason})");

            try
            {
                await Task.Delay(delay, _cts.Token);
            }
            catch (OperationCanceledException) { return; }

            try
            {
                // Kill the old process if still hanging
                _engine.Kill();
                await Task.Delay(500);

                Log("Restarting engine…");
                await _engine.StartAsync(_cts.Token);
                LastRestart = DateTime.UtcNow;

                if (_engine.State == ServiceState.Running)
                {
                    Log("✓ Engine restarted successfully");
                    // Reset counter on successful restart + stable period
                    _ = Task.Run(async () =>
                    {
                        await Task.Delay(30_000, _cts.Token);
                        if (_engine.State == ServiceState.Running)
                        {
                            RestartCount = 0;
                            Log("Engine stable for 30s — restart counter reset");
                        }
                    });
                }
                else
                {
                    Log("✗ Engine restart failed — will retry");
                }
            }
            catch (Exception ex)
            {
                Log($"Restart failed: {ex.Message}");
            }
        }

        public Task StopAsync()
        {
            _manualStop = true;
            _cts?.Cancel();
            if (_engine.Process != null)
                _engine.Process.Exited -= OnEngineExited;
            _health.OnEngineUnhealthy -= OnEngineUnhealthy;
            State = ServiceState.Stopped;
            return Task.CompletedTask;
        }

        private void Log(string msg) => OnLog?.Invoke(this, msg);
        public void Dispose() { _cts?.Cancel(); _cts?.Dispose(); }
    }
}

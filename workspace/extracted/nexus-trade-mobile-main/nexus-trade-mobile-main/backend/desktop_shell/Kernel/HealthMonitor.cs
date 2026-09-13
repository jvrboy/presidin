// ============================================================================
// Health Monitor — continuously polls the engine /api/health endpoint.
//
// If the engine stops responding, the monitor signals CrashRecovery to
// restart it. Also tracks uptime and response-time metrics.
// ============================================================================

using System;
using System.Diagnostics;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class HealthMonitor : IKernelService
    {
        public string Name => "HealthMonitor";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        /// <summary>Raised when the engine health check fails N times in a row.</summary>
        public event EventHandler<int> OnEngineUnhealthy;

        public int CheckIntervalMs { get; set; } = 10_000;
        public int FailureThreshold { get; set; } = 3;
        public long TotalChecks { get; private set; }
        public long FailedChecks { get; private set; }
        public double AvgResponseMs { get; private set; }
        public DateTime LastHealthy { get; private set; }

        private readonly EngineProcess _engine;
        private CancellationTokenSource _cts;
        private Task _loop;

        public HealthMonitor(EngineProcess engine)
        {
            _engine = engine;
        }

        public async Task StartAsync(CancellationToken ct)
        {
            State = ServiceState.Starting;
            _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _loop = Task.Run(() => MonitorLoop(_cts.Token));
            State = ServiceState.Running;
            Log("Monitoring engine health every " + (CheckIntervalMs / 1000) + "s");
            await Task.CompletedTask;
        }

        private async Task MonitorLoop(CancellationToken ct)
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
            int consecutiveFailures = 0;
            double emaMs = 0;

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(CheckIntervalMs, ct);
                }
                catch (OperationCanceledException) { break; }

                if (_engine.State == ServiceState.Stopping || _engine.State == ServiceState.Stopped)
                    continue;

                TotalChecks++;
                var sw = Stopwatch.StartNew();
                try
                {
                    var r = await http.GetAsync(_engine.BaseUrl + "/api/health");
                    sw.Stop();

                    if (r.IsSuccessStatusCode)
                    {
                        consecutiveFailures = 0;
                        FailedChecks = Math.Max(0, FailedChecks); // keep count
                        LastHealthy = DateTime.UtcNow;
                        emaMs = emaMs == 0 ? sw.ElapsedMilliseconds : emaMs * 0.8 + sw.ElapsedMilliseconds * 0.2;
                        AvgResponseMs = Math.Round(emaMs, 1);
                    }
                    else
                    {
                        consecutiveFailures++;
                        FailedChecks++;
                        Log($"Health check returned {(int)r.StatusCode} (fail #{consecutiveFailures})");
                    }
                }
                catch
                {
                    sw.Stop();
                    consecutiveFailures++;
                    FailedChecks++;
                }

                if (consecutiveFailures >= FailureThreshold)
                {
                    Log($"⚠ Engine unhealthy ({consecutiveFailures} failures) — triggering recovery");
                    OnEngineUnhealthy?.Invoke(this, consecutiveFailures);
                    consecutiveFailures = 0; // Reset; CrashRecovery handles it
                }
            }

            State = ServiceState.Stopped;
        }

        public Task StopAsync()
        {
            _cts?.Cancel();
            State = ServiceState.Stopped;
            return Task.CompletedTask;
        }

        private void Log(string msg) => OnLog?.Invoke(this, msg);
        public void Dispose() { _cts?.Cancel(); _cts?.Dispose(); }
    }
}

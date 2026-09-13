// ============================================================================
// Native Telemetry Client — anonymous usage analytics and crash reporting.
//
// Collects non-identifying metrics (session duration, feature usage,
// engine restarts) and crash stack traces. Data is stored locally and
// optionally uploaded to aid development.
// ============================================================================

using System;
using System.Collections.Concurrent;
using System.IO;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class TelemetryClient : IKernelService
    {
        public string Name => "TelemetryClient";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        public bool Enabled { get; set; } = true;

        private readonly ConcurrentQueue<TelemetryEvent> _queue = new();
        private readonly string _logPath;
        private CancellationTokenSource _cts;

        public TelemetryClient()
        {
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "NexusTrade");
            Directory.CreateDirectory(dataDir);
            _logPath = Path.Combine(dataDir, "telemetry.jsonl");
        }

        public async Task StartAsync(CancellationToken ct)
        {
            _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            State = ServiceState.Running;

            Track("session_start", new { version = "2.0.0", os = Environment.OSVersion.ToString() });

            // Background flush
            _ = Task.Run(() => FlushLoop(_cts.Token));
            Log("Telemetry active (local JSONL)");
            await Task.CompletedTask;
        }

        public void Track(string eventName, object properties = null)
        {
            if (!Enabled) return;

            var evt = new TelemetryEvent
            {
                Timestamp = DateTime.UtcNow,
                Event = eventName,
                Properties = properties != null
                    ? JsonSerializer.Serialize(properties)
                    : "{}"
            };
            _queue.Enqueue(evt);
        }

        public void TrackException(Exception ex, string context = null)
        {
            Track("exception", new
            {
                type = ex.GetType().Name,
                message = ex.Message,
                stack = ex.StackTrace?.Substring(0, Math.Min(500, ex.StackTrace?.Length ?? 0)),
                context
            });
        }

        private async Task FlushLoop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(10_000, ct);
                    Flush();
                }
                catch (OperationCanceledException) { break; }
                catch { }
            }
            Flush(); // Final flush
        }

        private void Flush()
        {
            if (_queue.IsEmpty) return;

            try
            {
                var sb = new StringBuilder();
                while (_queue.TryDequeue(out var evt))
                {
                    sb.AppendLine(JsonSerializer.Serialize(evt));
                }
                if (sb.Length > 0)
                    File.AppendAllText(_logPath, sb.ToString());
            }
            catch { }
        }

        public Task StopAsync()
        {
            Track("session_end", null);
            Flush();
            _cts?.Cancel();
            State = ServiceState.Stopped;
            return Task.CompletedTask;
        }

        private void Log(string msg) => OnLog?.Invoke(this, msg);
        public void Dispose() { Flush(); _cts?.Dispose(); }
    }

    public class TelemetryEvent
    {
        public DateTime Timestamp { get; set; }
        public string Event { get; set; }
        public string Properties { get; set; }
    }
}

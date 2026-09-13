// ============================================================================
// Engine Process Service — spawns and manages the Python trading engine.
//
// The engine runs as a hidden child process. The kernel watches it and
// the health monitor triggers restarts via CrashRecovery if it dies.
// ============================================================================

using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class EngineProcess : IKernelService
    {
        public string Name => "EngineProcess";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        public int Port { get; set; } = 8000;
        public Process Process => _process;
        public string DataDir { get; private set; }
        public bool IsAlive => _process != null && !_process.HasExited;
        public string BaseUrl => $"http://127.0.0.1:{Port}";

        private Process _process;
        private static readonly string DefaultDataDir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NexusTrade");

        public async Task StartAsync(CancellationToken ct)
        {
            State = ServiceState.Starting;
            DataDir = DefaultDataDir;
            Directory.CreateDirectory(DataDir);

            var exe = FindEngine();
            if (exe == null)
            {
                State = ServiceState.Failed;
                Log("Engine executable not found");
                return;
            }

            Log($"Launching: {exe}");

            _process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = exe,
                    WorkingDirectory = Path.GetDirectoryName(exe),
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    RedirectStandardOutput = false,
                    RedirectStandardError = false,
                },
                EnableRaisingEvents = true,
            };
            _process.StartInfo.Environment["NEXUS_HEADLESS"] = "1";
            _process.StartInfo.Environment["NEXUS_PORT"] = Port.ToString();
            _process.StartInfo.Environment["NEXUS_DATA_DIR"] = DataDir;

            _process.Exited += (s, e) =>
            {
                State = ServiceState.Stopped;
                Log($"Engine exited (code: {_process.ExitCode})");
            };

            try
            {
                _process.Start();
                Log($"Engine PID: {_process.Id}");

                // Wait for health endpoint
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(3) };
                var deadline = DateTime.UtcNow.AddSeconds(90);
                while (DateTime.UtcNow < deadline)
                {
                    ct.ThrowIfCancellationRequested();
                    if (_process.HasExited)
                    {
                        State = ServiceState.Failed;
                        Log("Engine died during startup");
                        return;
                    }
                    try
                    {
                        var r = await http.GetAsync(BaseUrl + "/api/health");
                        if (r.IsSuccessStatusCode)
                        {
                            State = ServiceState.Running;
                            Log("Engine is healthy and ready");
                            return;
                        }
                    }
                    catch { /* not up yet */ }
                    await Task.Delay(500, ct);
                }

                State = ServiceState.Degraded;
                Log("Engine started but health check timed out");
            }
            catch (OperationCanceledException)
            {
                State = ServiceState.Stopped;
            }
            catch (Exception ex)
            {
                State = ServiceState.Failed;
                Log($"Failed to start engine: {ex.Message}");
            }
        }

        public Task StopAsync()
        {
            State = ServiceState.Stopping;
            try
            {
                if (_process != null && !_process.HasExited)
                {
                    _process.Kill(entireProcessTree: true);
                    _process.WaitForExit(8000);
                    Log("Engine stopped");
                }
            }
            catch (Exception ex)
            {
                Log($"Error stopping engine: {ex.Message}");
            }
            State = ServiceState.Stopped;
            return Task.CompletedTask;
        }

        public void Kill()
        {
            try
            {
                if (_process != null && !_process.HasExited)
                    _process.Kill(true);
            }
            catch { }
        }

        private static string FindEngine()
        {
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "engine", "NexusTradeEngine.exe"),
                Path.Combine(AppContext.BaseDirectory, "engine", "NexusTrade.exe"),
                Path.Combine(AppContext.BaseDirectory, "NexusTradeEngine.exe"),
                Path.Combine(AppContext.BaseDirectory, "NexusTrade.exe"),
            };
            foreach (var c in candidates)
                if (File.Exists(c)) return c;
            return null;
        }

        private void Log(string msg) => OnLog?.Invoke(this, msg);

        public void Dispose()
        {
            Kill();
            _process?.Dispose();
        }
    }
}

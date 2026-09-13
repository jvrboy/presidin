// ============================================================================
// Nexus Trade — Micro-Kernel Host
//
// The kernel is the central orchestrator for all native Windows services.
// It manages the lifecycle of the Python engine and native subsystems:
//
//   [KernelHost]
//     ├── EngineProcess    — spawns & watches the Python trading engine
//     ├── HealthMonitor    — polls /api/health, restarts on failure
//     ├── CrashRecovery    — auto-restart with backoff on engine death
//     ├── SystemTray       — tray icon, context menu, minimize-to-tray
//     ├── AutoUpdater      — checks GitHub releases for new versions
//     ├── ToastNotifier    — Windows 10/11 native toast notifications
//     └── TelemetryClient  — anonymous usage & crash telemetry
//
// Each service implements IKernelService and is started/stopped independently.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    /// <summary>
    /// Contract for all kernel-managed micro-services.
    /// </summary>
    public interface IKernelService : IDisposable
    {
        string Name { get; }
        ServiceState State { get; }
        Task StartAsync(CancellationToken ct);
        Task StopAsync();
        event EventHandler<string> OnLog;
    }

    public enum ServiceState
    {
        Stopped, Starting, Running, Degraded, Stopping, Failed
    }

    /// <summary>
    /// The micro-kernel host. Manages the ordered startup/shutdown of all
    /// native services and the Python engine process.
    /// </summary>
    public sealed class KernelHost : IDisposable
    {
        private readonly List<IKernelService> _services = new();
        private readonly CancellationTokenSource _cts = new();
        private readonly object _lock = new();
        private bool _disposed;

        public event EventHandler<string> OnKernelLog;
        public IReadOnlyList<IKernelService> Services => _services.AsReadOnly();

        public void Register(IKernelService service)
        {
            lock (_lock)
            {
                _services.Add(service);
                service.OnLog += (s, msg) => Log($"[{service.Name}] {msg}");
            }
        }

        public async Task StartAllAsync()
        {
            Log("Kernel starting — initializing services…");
            foreach (var svc in _services)
            {
                try
                {
                    Log($"  → Starting {svc.Name}…");
                    await svc.StartAsync(_cts.Token);
                    Log($"  ✓ {svc.Name} is {svc.State}");
                }
                catch (Exception ex)
                {
                    Log($"  ✗ {svc.Name} failed: {ex.Message}");
                }
            }
            Log($"Kernel ready — {_services.Count(s => s.State == ServiceState.Running)}/{_services.Count} services running");
        }

        public async Task StopAllAsync()
        {
            Log("Kernel shutting down…");
            _cts.Cancel();
            // Stop in reverse order
            for (int i = _services.Count - 1; i >= 0; i--)
            {
                try
                {
                    await _services[i].StopAsync();
                }
                catch (Exception ex)
                {
                    Log($"Error stopping {_services[i].Name}: {ex.Message}");
                }
            }
            Log("Kernel stopped.");
        }

        public T GetService<T>() where T : class, IKernelService
        {
            return _services.OfType<T>().FirstOrDefault();
        }

        private void Log(string msg)
        {
            OnKernelLog?.Invoke(this, msg);
            System.Diagnostics.Debug.WriteLine($"[Kernel] {msg}");
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _cts.Cancel();
            foreach (var svc in _services)
            {
                try { svc.Dispose(); } catch { }
            }
            _cts.Dispose();
        }
    }
}

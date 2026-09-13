// ============================================================================
// Auto Updater — checks GitHub releases for new versions of Nexus Trade.
//
// On startup and every 4 hours, queries the GitHub API for the latest
// release. If a newer version is found, notifies the user via toast and
// optionally downloads the installer silently for one-click update.
// ============================================================================

using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace NexusTrade.Desktop.Kernel
{
    public sealed class AutoUpdater : IKernelService
    {
        public string Name => "AutoUpdater";
        public ServiceState State { get; private set; } = ServiceState.Stopped;
        public event EventHandler<string> OnLog;

        public event EventHandler<UpdateInfo> OnUpdateAvailable;

        public string GitHubRepo { get; set; } = "jvrboy/forex_bot";
        public string CurrentVersion { get; set; } = "2.0.0";
        public int CheckIntervalHours { get; set; } = 4;

        public UpdateInfo LatestUpdate { get; private set; }

        private CancellationTokenSource _cts;

        public async Task StartAsync(CancellationToken ct)
        {
            State = ServiceState.Starting;
            _cts = CancellationTokenSource.CreateLinkedTokenSource(ct);

            // Initial check (non-blocking)
            _ = Task.Run(() => CheckLoopAsync(_cts.Token));
            State = ServiceState.Running;
            Log("Auto-updater active (checking every " + CheckIntervalHours + "h)");
            await Task.CompletedTask;
        }

        private async Task CheckLoopAsync(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                try
                {
                    await CheckForUpdateAsync();
                }
                catch (Exception ex)
                {
                    Log("Update check failed: " + ex.Message);
                }

                try
                {
                    await Task.Delay(TimeSpan.FromHours(CheckIntervalHours), ct);
                }
                catch (OperationCanceledException) { break; }
            }
        }

        public async Task<UpdateInfo> CheckForUpdateAsync()
        {
            using var http = new HttpClient();
            http.DefaultRequestHeaders.UserAgent.Add(
                new ProductInfoHeaderValue("NexusTrade", CurrentVersion));
            http.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/vnd.github.v3+json"));
            http.Timeout = TimeSpan.FromSeconds(15);

            var url = $"https://api.github.com/repos/{GitHubRepo}/releases/latest";
            var json = await http.GetStringAsync(url);
            var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            var tagName = root.GetProperty("tag_name").GetString();
            var version = tagName.TrimStart('v', 'V');
            var name = root.TryGetProperty("name", out var n) ? n.GetString() : tagName;
            var body = root.TryGetProperty("body", out var b) ? b.GetString() : "";
            var htmlUrl = root.TryGetProperty("html_url", out var u) ? u.GetString() : "";

            string installerUrl = null;
            if (root.TryGetProperty("assets", out var assets))
            {
                foreach (var asset in assets.EnumerateArray())
                {
                    var assetName = asset.GetProperty("name").GetString();
                    if (assetName.EndsWith("Setup.exe", StringComparison.OrdinalIgnoreCase))
                    {
                        installerUrl = asset.GetProperty("browser_download_url").GetString();
                        break;
                    }
                }
            }

            var info = new UpdateInfo
            {
                Version = version,
                Title = name,
                Notes = body,
                ReleaseUrl = htmlUrl,
                InstallerUrl = installerUrl,
                IsNewer = IsNewer(version, CurrentVersion),
            };

            LatestUpdate = info;

            if (info.IsNewer)
            {
                Log($"New version available: v{version} (current: v{CurrentVersion})");
                OnUpdateAvailable?.Invoke(this, info);
            }
            else
            {
                Log($"Up to date (v{CurrentVersion})");
            }

            return info;
        }

        private static bool IsNewer(string remote, string local)
        {
            if (Version.TryParse(remote, out var r) && Version.TryParse(local, out var l))
                return r > l;
            return string.Compare(remote, local, StringComparison.Ordinal) > 0;
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

    public class UpdateInfo
    {
        public string Version { get; set; }
        public string Title { get; set; }
        public string Notes { get; set; }
        public string ReleaseUrl { get; set; }
        public string InstallerUrl { get; set; }
        public bool IsNewer { get; set; }
    }
}

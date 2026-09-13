// ============================================================================
// Settings Manager — persistent native settings (complementary to the
// Python engine's settings.json). Stores window geometry, preferences,
// tray behaviour, and last-known-good engine config.
// ============================================================================

using System;
using System.IO;
using System.Text.Json;

namespace NexusTrade.Desktop.Kernel
{
    public class NativeSettings
    {
        // Window
        public int WindowX { get; set; } = -1;
        public int WindowY { get; set; } = -1;
        public int WindowWidth { get; set; } = 1440;
        public int WindowHeight { get; set; } = 900;
        public bool WindowMaximized { get; set; } = false;

        // Behaviour
        public bool MinimizeToTray { get; set; } = true;
        public bool StartMinimized { get; set; } = false;
        public bool StartWithWindows { get; set; } = false;
        public bool CheckUpdatesOnStart { get; set; } = true;
        public bool TelemetryEnabled { get; set; } = true;
        public bool DarkMode { get; set; } = true;

        // Engine
        public int EnginePort { get; set; } = 8000;
        public int EngineStartTimeoutSec { get; set; } = 90;
        public int MaxAutoRestarts { get; set; } = 5;
        public int HealthCheckIntervalMs { get; set; } = 10_000;

        // Version tracking
        public string LastRunVersion { get; set; } = "2.0.0";
        public DateTime FirstRunUtc { get; set; } = DateTime.UtcNow;
        public int TotalSessions { get; set; } = 0;

        private static readonly string SettingsPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "NexusTrade", "native_settings.json");

        public static NativeSettings Load()
        {
            try
            {
                if (File.Exists(SettingsPath))
                {
                    var json = File.ReadAllText(SettingsPath);
                    return JsonSerializer.Deserialize<NativeSettings>(json) ?? new NativeSettings();
                }
            }
            catch { }
            return new NativeSettings();
        }

        public void Save()
        {
            try
            {
                var dir = Path.GetDirectoryName(SettingsPath);
                if (!string.IsNullOrEmpty(dir))
                    Directory.CreateDirectory(dir);
                var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(SettingsPath, json);
            }
            catch { }
        }
    }
}

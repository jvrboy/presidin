; ============================================================================
; Nexus Trade — Installation Wizard
;
; A clean, professional Inno Setup wizard:
;   Welcome -> License -> Install folder -> Desktop icon -> Install -> Finish
; Installs the native C# desktop shell + the hidden Python trading engine.
; No cmd, no browser, no Python, no .NET runtime needed on the user's PC.
;
; Built by CI on windows-latest (see .github/workflows/build-windows.yml).
; ============================================================================

#define AppName      "Nexus Trade"
#define AppVersion   "2.0.0"
#define AppPublisher "Nexus Trade"
#define AppExeName   "NexusTrade.exe"
#define AppURL       "https://github.com/jvrboy/forex_bot"

[Setup]
; Valid GUID (hex only) — do NOT change to a non-hex token.
AppId={{7F3A9C2E-4B1D-4E8F-9A2C-1E5D8B3F0A42}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppVerName={#AppName} {#AppVersion}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
DefaultDirName={autopf}\Nexus Trade
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist_installer
OutputBaseFilename=NexusTrade-Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
SetupIconFile=..\Assets\nexus.ico
UninstallDisplayIcon={app}\{#AppExeName}
CloseApplications=yes
RestartApplications=no
MinVersion=10.0
VersionInfoVersion={#AppVersion}
VersionInfoCompany={#AppPublisher}
VersionInfoDescription=Nexus Trade Installation Wizard
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#AppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "startmenu";    Description: "Create a &Start Menu shortcut"; GroupDescription: "Shortcuts:"; Flags: checkedonce

[Files]
; Native C# desktop shell (self-contained .NET — no runtime needed)
Source: "..\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Python trading engine (frozen — no Python needed)
Source: "..\..\python_app\dist_engine\NexusTradeEngine\*"; DestDir: "{app}\engine"; Flags: ignoreversion recursesubdirs createallsubdirs
; MT5 Expert Advisor
Source: "..\..\mt5_ea\NexusBridge.mq5"; DestDir: "{app}\mt5_ea"; Flags: ignoreversion
; Documentation
Source: "..\..\docs\*"; DestDir: "{app}\docs"; Flags: ignoreversion recursesubdirs
Source: "..\..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\..\BUILD_WINDOWS.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: startmenu
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
; "Launch Nexus Trade" checkbox on the final wizard page
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Make sure no engine/shell process survives uninstall
Filename: "taskkill"; Parameters: "/F /IM NexusTradeEngine.exe /T"; Flags: runhidden; RunOnceId: "KillEngine"
Filename: "taskkill"; Parameters: "/F /IM {#AppExeName} /T"; Flags: runhidden; RunOnceId: "KillShell"

[Code]
{ On uninstall, offer to remove the per-user data folder (%APPDATA%\NexusTrade).
  RegDeleteKeyIncludingSubkeys is the correct Inno call (RegDeleteTree does not exist). }
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: string;
begin
  if CurUninstallStep = usPostUninstall then
  begin
    DataDir := ExpandConstant('{userappdata}\NexusTrade');
    if DirExists(DataDir) then
    begin
      if MsgBox('Remove saved settings, learning memory and trained models?'
                + #13#10 + DataDir, mbConfirmation, MB_YESNO) = IDYES then
        DelTree(DataDir, True, True, True);
    end;
    RegDeleteKeyIncludingSubkeys(HKLM, 'SOFTWARE\NexusTrade');
  end;
end;

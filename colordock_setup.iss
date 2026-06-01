#define MyAppName      "ColorDock RGB"
#define MyAppVersion   "1.3.1"
#define MyAppPublisher "Changsik Noh"
#define MyAppURL       "https://github.com/impressionistfisherman/color-dock"
#define MyAppExeName   "ColorDock.exe"
#define MySourceDir    "dist\ColorDock"

[Setup]
AppId={{A7B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\ColorDock RGB
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=
OutputDir=installer_output
OutputBaseFilename=ColorDock_Setup_v{#MyAppVersion}

Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=ColorDock RGB Control Dashboard
; 이전 버전 자동 제거 후 재설치
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";    Description: "바탕화면 아이콘 생성"; GroupDescription: "추가 작업:"; Flags: unchecked
Name: "startupicon";    Description: "Windows 시작 시 자동 실행"; GroupDescription: "추가 작업:"; Flags: unchecked

[Files]
; 전체 ColorDock 폴더 복사
Source: "{#MySourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
; 시작 메뉴
Name: "{group}\{#MyAppName}";          Filename: "{app}\{#MyAppExeName}"
Name: "{group}\제거";                   Filename: "{uninstallexe}"
; 바탕화면 (선택)
Name: "{autodesktop}\{#MyAppName}";    Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
; 시작프로그램 (선택)
Name: "{userstartup}\{#MyAppName}";    Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
; 설치 후 바로 실행
Filename: "{app}\{#MyAppExeName}"; Description: "ColorDock RGB 실행"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; 제거 전 프로세스 종료
Filename: "taskkill"; Parameters: "/F /IM ColorDock.exe /IM OpenRGB.exe"; Flags: runhidden; RunOnceId: "KillColorDock"

[Registry]
; 시작 시 자동 실행 레지스트리 (startupicon 선택 시)
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "ColorDock RGB"; ValueData: """{app}\{#MyAppExeName}"""; Tasks: startupicon; Flags: uninsdeletevalue

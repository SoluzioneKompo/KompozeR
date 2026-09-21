; installer.iss — Inno Setup script per kompozer-setup.exe
; Buildato da CI (.github/workflows/release.yml) con `iscc installer.iss`.
; Contenuto di ".\dist\" e' preparato dal workflow prima della build:
;   docker-compose.prod.yml, .env, start.bat, stop.bat, autostart.bat
; (HTTPS locale usa il cert self-signed gia' baked nell'immagine frontend,
;  nessun cert esterno da distribuire con l'installer)

#define MyAppName "KompozeR"
#define MyAppVersion GetEnv("KOMPOZER_VERSION")
#if MyAppVersion == ""
  #define MyAppVersion "1.0.0"
#endif
#define MyAppPublisher "SoluzioneKompo"
#define MyAppURL "https://github.com/SoluzioneKompo/KompozeR"

[Setup]
AppId={{8F2B6E1A-9C3D-4E7F-A1B2-KOMPOZER0001}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\KompozeR
DefaultGroupName=KompozeR
DisableProgramGroupPage=yes
OutputBaseFilename=kompozer-setup
OutputDir=.\output
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
SetupIconFile=kompozer.ico
UninstallDisplayIcon={app}\kompozer.ico

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "autostart"; Description: "Avvia KompozeR automaticamente all'accesso a Windows"; GroupDescription: "Opzioni di avvio:"; Flags: checkedonce
Name: "desktopicon"; Description: "Crea icona sul Desktop"; GroupDescription: "Icone aggiuntive:"; Flags: unchecked

[Files]
Source: "kompozer.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\docker-compose.prod.yml"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\.env"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\stop.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "dist\autostart.bat"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\KompozeR"; Filename: "{app}\start.bat"; WorkingDir: "{app}"; IconFilename: "{app}\kompozer.ico"
Name: "{group}\Stop KompozeR"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"; IconFilename: "{sys}\shell32.dll"; IconIndex: 28
Name: "{group}\Disinstalla KompozeR"; Filename: "{uninstallexe}"
Name: "{autodesktop}\KompozeR"; Filename: "{app}\start.bat"; WorkingDir: "{app}"; IconFilename: "{app}\kompozer.ico"; Tasks: desktopicon
Name: "{userstartup}\KompozeR (autostart)"; Filename: "{app}\autostart.bat"; WorkingDir: "{app}"; Tasks: autostart

[Code]
function IsDockerInstalled(): Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf}\Docker\Docker\Docker Desktop.exe'));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and (not IsDockerInstalled()) then
  begin
    MsgBox('Docker Desktop non risulta installato. KompozeR ne ha bisogno per funzionare.' + #13#10 +
           'Installa Docker Desktop da https://www.docker.com/products/docker-desktop/, poi avvia KompozeR dal menu Start.',
           mbInformation, MB_OK);
  end;
end;

[Run]
Filename: "{app}\start.bat"; Description: "Avvia KompozeR ora"; Flags: postinstall shellexec skipifsilent nowait

[UninstallRun]
Filename: "{app}\stop.bat"; Flags: runhidden waituntilterminated skipifdoesntexist

[UninstallDelete]
Type: filesandordirs; Name: "{userstartup}\KompozeR (autostart).lnk"

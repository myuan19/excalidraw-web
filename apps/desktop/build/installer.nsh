; EditorHub NSIS hooks (electron-builder: nsis.include = build/installer.nsh)
;
; Problems addressed (templates: node_modules/app-builder-lib/templates/nsis):
; 1. installSection.nsh runs uninstallOldVersion inside MUI_PAGE_INSTFILES, so
;    the install progress bar runs partway, resets, and the
;    "$(appCannotBeClosed)" retry dialog from extractAppPackage.nsh pops
;    mid-install when EditorHub.exe is still running. We give the uninstall its
;    own wizard page (marquee bar) before MUI_PAGE_INSTFILES via
;    customPageAfterChangeDir; afterwards the stock uninstallOldVersion sees no
;    registration and becomes a no-op, so the InstFiles bar covers installation
;    only.
; 2. The stock CHECK_APP_RUNNING (embedded in installers AND uninstallers)
;    probes processes with PowerShell Get-CimInstance / tasklist. Full process
;    enumeration intermittently hangs on this machine, freezing the installer
;    (~30%) or the silently-run old uninstaller. We never wait on process
;    enumeration: "is this exe running" = "is its image file write-locked"
;    (FileOpen probe), kills are fire-and-forget taskkill via ExecShell (a hung
;    taskkill cannot block the UI), and the old uninstaller runs asynchronously
;    with a hard timeout.
; 3. customInit drops orphaned registry entries from earlier partial installs
;    (keys present but uninstaller exe missing) which made uninstallOldVersion
;    retry-loop and reset the progress bar.
;
; electron-builder includes this file in the shared script header, before
; common.nsh / MUI2.nsh / multiUser.nsh (see installer.nsi), and compiles the
; script twice (installer pass and BUILD_UNINSTALLER pass). MUI macros are not
; available here, and common.nsh defines APP_EXECUTABLE_FILENAME without
; /ifndef - hence the EH_-prefixed mirrors and raw SendMessage for header text.

!include "LogicLib.nsh"
!include "WinMessages.nsh"

; same values as multiUser.nsh (its own /ifndef keeps this consistent)
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

; common.nsh later defines APP_EXECUTABLE_FILENAME / UNINSTALL_FILENAME
; without /ifndef, so mirror the values under our own names
!define EH_APP_EXE "${PRODUCT_FILENAME}.exe"
!define EH_UNINSTALL_EXE "Uninstall ${PRODUCT_FILENAME}.exe"

; ----------------------------------------------------------------------------
; Lock-based process handling, compiled into the installer ("") and the
; uninstaller ("un.") so freshly built uninstallers stop embedding the hanging
; PowerShell probe as well.

!macro EH_PROCESS_FUNCS UN

; in: path on stack; out: "1" on stack when the file exists and is write-locked
; (a running exe keeps its image file locked on Windows)
Function ${UN}EHIsExeLocked
  Exch $R1
  Push $R2
  Push $R3
  StrCpy $R2 0
  ${if} ${FileExists} "$R1"
    ClearErrors
    FileOpen $R3 "$R1" a
    ${if} ${errors}
      StrCpy $R2 1
    ${else}
      FileClose $R3
    ${endif}
  ${endif}
  ClearErrors
  StrCpy $R1 $R2
  Pop $R3
  Pop $R2
  Exch $R1
FunctionEnd

; in: app exe path on stack. Fire-and-forget taskkill, then wait for the file
; lock to clear (~6s per attempt); on failure offers retry. Cancel falls
; through - the stock extraction/removal retry logic remains the last resort.
Function ${UN}EHForceCloseByPath
  Exch $R1
  Push $R2
  Push $R3
  eh_fc_start:
  Push "$R1"
  Call ${UN}EHIsExeLocked
  Pop $R2
  ${if} $R2 != 1
    Goto eh_fc_done
  ${endif}
  ExecShell "" "$SYSDIR\taskkill.exe" '/F /T /IM "${EH_APP_EXE}"' SW_HIDE
  StrCpy $R3 0
  eh_fc_wait:
  Sleep 500
  IntOp $R3 $R3 + 1
  Push "$R1"
  Call ${UN}EHIsExeLocked
  Pop $R2
  ${if} $R2 == 1
    ${if} $R3 < 12
      Goto eh_fc_wait
    ${endif}
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDCANCEL IDRETRY eh_fc_start
  ${endif}
  eh_fc_done:
  Pop $R3
  Pop $R2
  Pop $R1
FunctionEnd

!macroend

!ifdef BUILD_UNINSTALLER
  !insertmacro EH_PROCESS_FUNCS "un."
!else
  !insertmacro EH_PROCESS_FUNCS ""
!endif

; Replaces the stock CHECK_APP_RUNNING (PowerShell/tasklist enumeration).
; Installer: top of the install section (also covers silent installs where the
; uninstall page is skipped). Uninstaller: un.onInit when running silently.
!macro customCheckAppRunning
  Push "$INSTDIR\${EH_APP_EXE}"
  !ifdef BUILD_UNINSTALLER
    Call un.EHForceCloseByPath
  !else
    Call EHForceCloseByPath
  !endif
!macroend

!ifndef BUILD_UNINSTALLER

!include "nsDialogs.nsh"

!define EH_UNINSTALLER_COPY_NAME "eh-old-uninstaller.exe"
!define EH_UNINSTALLER_COPY "$PLUGINSDIR\${EH_UNINSTALLER_COPY_NAME}"

!define /ifndef PBS_MARQUEE 0x08
!define /ifndef PBM_SETMARQUEE 0x040A

; ~2min budget for the old uninstaller (ticks of 400ms). Old builds embed the
; hanging process probe; on timeout the uninstaller is killed and its
; registration scrubbed so the install section does not rerun it synchronously.
!define EH_UNINSTALL_MAX_TICKS 300

Var EH_UninstallDialog
Var EH_UninstallLabel
Var EH_UninstallProgress
Var EH_UninstallState     ; 0 = not started, 1 = uninstaller running, 2 = finished
Var EH_UninstallPollPath  ; uninstaller exe being watched for exit (write-lock)
Var EH_UninstallTicks

; ----------------------------------------------------------------------------
; .onInit: drop orphaned registry entries so neither our uninstall page nor
; uninstallOldVersion trips over a registered-but-missing uninstaller.
; (GetInQuotes/GetFileParent live in installUtil.nsh, part of the same final
; script; NSIS resolves forward function references at the end of compilation.)

!macro customInit
  Push $R0
  Push $R1
  ReadRegStr $R0 SHCTX "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R0 != ""
    ${ifNot} ${FileExists} "$R0\${EH_UNINSTALL_EXE}"
      DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
      DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"
    ${endif}
  ${else}
    ReadRegStr $R1 SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${if} $R1 != ""
      Push $R1
      Call GetInQuotes
      Pop $R1
      ${ifNot} ${FileExists} "$R1"
        DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
      ${endif}
    ${endif}
  ${endif}
  Pop $R1
  Pop $R0
!macroend

; ----------------------------------------------------------------------------
; Dedicated uninstall page between the directory page and MUI_PAGE_INSTFILES.
; Skipped when there is no usable previous install (and in silent installs,
; where NSIS never shows pages). The old uninstaller is copied to $PLUGINSDIR
; and started asynchronously (in-place _?= mode with the same flags
; uninstallOldVersion passes); a timer keeps the marquee animated and polls the
; launched exe's write-lock to detect exit.

; out: "1" on stack when the registry points at an existing uninstaller
Function EHHasUsablePriorInstall
  Push $R0
  Push $R1
  Push $R2
  StrCpy $R0 0
  ReadRegStr $R1 SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${if} $R1 != ""
    Push $R1
    Call GetInQuotes
    Pop $R2
    ${if} ${FileExists} "$R2"
      StrCpy $R0 1
    ${endif}
  ${endif}
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; Remove the old install's registration. Called when the old uninstaller hung
; or failed: the install section must not rerun it synchronously (ExecWait
; would freeze the InstFiles page); extraction then overwrites files in place.
Function EHScrubOldRegistration
  DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY}"
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegKey SHCTX "${UNINSTALL_REGISTRY_KEY_2}"
  !endif
  DeleteRegKey SHCTX "${INSTALL_REGISTRY_KEY}"
FunctionEnd

Function EHUninstallPageTick
  ${if} $EH_UninstallState == 0
    ; stop the timer during launch: MessageBox/Exec pump messages and a queued
    ; WM_TIMER would re-enter this function mid-launch
    ${NSD_KillTimer} EHUninstallPageTick
    StrCpy $EH_UninstallState 1

    ; resolve the old uninstaller + install location from the registry
    ReadRegStr $R1 SHCTX "${UNINSTALL_REGISTRY_KEY}" UninstallString
    Push $R1
    Call GetInQuotes
    Pop $R1
    ReadRegStr $R2 SHCTX "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${if} $R2 == ""
      Push $R1
      Call GetFileParent
      Pop $R2
    ${endif}

    ; the old app must not be running or file removal fails
    Push "$R2\${EH_APP_EXE}"
    Call EHForceCloseByPath

    ; install-mode flag mirroring uninstallOldVersion's choice ($installMode is
    ; declared later in multiUser.nsh and cannot be referenced from this file)
    ReadRegStr $R3 HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${if} $R3 != ""
      StrCpy $R3 "/currentuser"
    ${else}
      StrCpy $R3 "/allusers"
    ${endif}

    ; same invocation as uninstallOldVersion (installUtil.nsh): copy the
    ; uninstaller out of the install dir, run silently in-place (_?= keeps the
    ; process pollable instead of respawning from temp)
    ClearErrors
    CopyFiles /SILENT "$R1" "${EH_UNINSTALLER_COPY}"
    StrCpy $EH_UninstallPollPath "${EH_UNINSTALLER_COPY}"
    Exec '"${EH_UNINSTALLER_COPY}" /S /KEEP_APP_DATA $R3 --updated _?=$R2'
    ${if} ${errors}
      ; could not launch the copy - try the original in place
      ClearErrors
      StrCpy $EH_UninstallPollPath "$R1"
      Exec '"$R1" /S /KEEP_APP_DATA $R3 --updated _?=$R2'
      ${if} ${errors}
        ClearErrors
        StrCpy $EH_UninstallState 2
        Goto eh_page_finish
      ${endif}
    ${endif}
    ${NSD_CreateTimer} EHUninstallPageTick 400
    Return
  ${elseif} $EH_UninstallState == 1
    IntOp $EH_UninstallTicks $EH_UninstallTicks + 1
    Push "$EH_UninstallPollPath"
    Call EHIsExeLocked
    Pop $R0
    ${if} $R0 == 1
      ${if} $EH_UninstallTicks < ${EH_UNINSTALL_MAX_TICKS}
        Return
      ${endif}
      ; timeout: the old uninstaller is likely hung in its stock process probe
      ; (see top comment) - kill it
      ${NSD_KillTimer} EHUninstallPageTick
      ExecShell "" "$SYSDIR\taskkill.exe" '/F /IM "${EH_UNINSTALLER_COPY_NAME}"' SW_HIDE
      Sleep 1500
    ${endif}
    StrCpy $EH_UninstallState 2
  ${endif}

  eh_page_finish:
  ${NSD_KillTimer} EHUninstallPageTick
  ClearErrors

  ; a successful uninstall removes its registry keys; if they still point at an
  ; existing uninstaller the run hung/failed - never let the install section
  ; rerun it synchronously
  Call EHHasUsablePriorInstall
  Pop $R0
  ${if} $R0 == 1
    Call EHScrubOldRegistration
  ${endif}

  ; unlock the wizard and advance to the install page
  GetDlgItem $R0 $HWNDPARENT 1
  EnableWindow $R0 1
  GetDlgItem $R0 $HWNDPARENT 2
  EnableWindow $R0 1
  GetDlgItem $R0 $HWNDPARENT 3
  EnableWindow $R0 1
  SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
FunctionEnd

Function EHUninstallPageCreate
  Call EHHasUsablePriorInstall
  Pop $R0
  ${if} $R0 != 1
    Abort ; nothing to uninstall -> skip the page entirely
  ${endif}

  ; MUI header text (1037 = title, 1038 = subtitle); the MUI_HEADER_TEXT macro
  ; is not available in this include (processed before MUI2.nsh)
  GetDlgItem $R0 $HWNDPARENT 1037
  SendMessage $R0 ${WM_SETTEXT} 0 "STR:卸载旧版本"
  GetDlgItem $R0 $HWNDPARENT 1038
  SendMessage $R0 ${WM_SETTEXT} 0 "STR:正在移除已安装的 ${PRODUCT_NAME}，请稍候..."

  nsDialogs::Create 1018
  Pop $EH_UninstallDialog
  ${if} $EH_UninstallDialog == error
    Abort
  ${endif}

  ${NSD_CreateLabel} 0 20u 100% 12u "正在卸载旧版本的 ${PRODUCT_NAME}..."
  Pop $EH_UninstallLabel

  ${NSD_CreateProgressBar} 0 40u 100% 12u ""
  Pop $EH_UninstallProgress
  ${NSD_AddStyle} $EH_UninstallProgress ${PBS_MARQUEE}
  SendMessage $EH_UninstallProgress ${PBM_SETMARQUEE} 1 50

  ; lock the wizard while the uninstall runs (1 = next, 2 = cancel, 3 = back)
  GetDlgItem $R0 $HWNDPARENT 1
  EnableWindow $R0 0
  GetDlgItem $R0 $HWNDPARENT 2
  EnableWindow $R0 0
  GetDlgItem $R0 $HWNDPARENT 3
  EnableWindow $R0 0

  StrCpy $EH_UninstallState 0
  StrCpy $EH_UninstallTicks 0
  ${NSD_CreateTimer} EHUninstallPageTick 400

  nsDialogs::Show
FunctionEnd

!macro customPageAfterChangeDir
  Page custom EHUninstallPageCreate
!macroend

!endif

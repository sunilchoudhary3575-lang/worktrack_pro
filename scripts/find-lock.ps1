Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class FileLockFinder {
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Auto)]
    public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint pSessionHandle);

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Auto)]
    public static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames,
        uint nApplications, [In] RmProcess[] rgApplications, uint nServices, string[] rgsServiceNames);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmGetList(uint pSessionHandle, out uint pnProcInfoNeeded,
        ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

    [StructLayout(LayoutKind.Sequential)]
    public struct RmProcess {
        public uint dwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct RM_PROCESS_INFO {
        public RmProcess Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 64)]
        public string strServiceShortName;
        public int ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)]
        public bool bRestartable;
    }
}
'@

$filePath = "D:\Bawra Projects\worktrack_pro\apps\employee-app\dist-pack\win-unpacked\resources\app.asar"
[uint32]$sessionHandle = 0
$sessionKey = [Guid]::NewGuid().ToString()

$res = [FileLockFinder]::RmStartSession([ref]$sessionHandle, 0, $sessionKey)
if ($res -ne 0) {
    Write-Host "RmStartSession failed with code $res"
    exit
}

$files = @($filePath)
$res = [FileLockFinder]::RmRegisterResources($sessionHandle, 1, $files, 0, $null, 0, $null)
if ($res -ne 0) {
    Write-Host "RmRegisterResources failed with code $res"
    [FileLockFinder]::RmEndSession($sessionHandle)
    exit
}

[uint32]$procInfoNeeded = 0
[uint32]$procInfo = 0
[uint32]$rebootReasons = 0

$res = [FileLockFinder]::RmGetList($sessionHandle, [ref]$procInfoNeeded, [ref]$procInfo, $null, [ref]$rebootReasons)
if ($procInfoNeeded -gt 0) {
    $processInfo = New-Object FileLockFinder+RM_PROCESS_INFO[] $procInfoNeeded
    $procInfo = $procInfoNeeded
    $res = [FileLockFinder]::RmGetList($sessionHandle, [ref]$procInfoNeeded, [ref]$procInfo, $processInfo, [ref]$rebootReasons)
    foreach ($app in $processInfo) {
        $p = Get-Process -Id $app.Process.dwProcessId -ErrorAction SilentlyContinue
        Write-Host "Locking Process: PID=$($app.Process.dwProcessId) AppName=$($app.strAppName) ProcessName=$($p.ProcessName) Path=$($p.Path)"
    }
} else {
    Write-Host "No process locking the file."
}

[FileLockFinder]::RmEndSession($sessionHandle)

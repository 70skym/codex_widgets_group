param(
  [ValidateSet("get", "set")]
  [string]$Action = "get",
  [int]$Width = 0,
  [int]$Height = 0,
  [int]$Frequency = 0
)

$ErrorActionPreference = "Stop"

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class DisplayApi {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)]
    public string DeviceKey;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string dmDeviceName;
    public short dmSpecVersion;
    public short dmDriverVersion;
    public short dmSize;
    public short dmDriverExtra;
    public int dmFields;
    public int dmPositionX;
    public int dmPositionY;
    public int dmDisplayOrientation;
    public int dmDisplayFixedOutput;
    public short dmColor;
    public short dmDuplex;
    public short dmYResolution;
    public short dmTTOption;
    public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
    public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel;
    public int dmPelsWidth;
    public int dmPelsHeight;
    public int dmDisplayFlags;
    public int dmDisplayFrequency;
    public int dmICMMethod;
    public int dmICMIntent;
    public int dmMediaType;
    public int dmDitherType;
    public int dmReserved1;
    public int dmReserved2;
    public int dmPanningWidth;
    public int dmPanningHeight;
  }

  [DllImport("user32.dll", CharSet = CharSet.Ansi)]
  public static extern bool EnumDisplayDevices(string lpDevice, int iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, int dwFlags);

  [DllImport("user32.dll")]
  public static extern bool EnumDisplaySettings(string deviceName, int modeNum, ref DEVMODE devMode);

  [DllImport("user32.dll")]
  public static extern int ChangeDisplaySettings(ref DEVMODE devMode, int flags);

  [DllImport("user32.dll")]
  public static extern int ChangeDisplaySettingsEx(string deviceName, ref DEVMODE devMode, IntPtr hwnd, int flags, IntPtr lParam);
}
"@

$ENUM_CURRENT_SETTINGS = -1
$CDS_UPDATEREGISTRY = 0x01
$DISP_CHANGE_SUCCESSFUL = 0
$DM_PELSWIDTH = 0x80000
$DM_PELSHEIGHT = 0x100000
$DM_DISPLAYFREQUENCY = 0x400000
$DISPLAY_DEVICE_ACTIVE = 0x1
$DISPLAY_DEVICE_PRIMARY_DEVICE = 0x4

function New-DevMode {
  $mode = New-Object DisplayApi+DEVMODE
  $mode.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($mode)
  return $mode
}

function New-DisplayDevice {
  $device = New-Object DisplayApi+DISPLAY_DEVICE
  $device.cb = [Runtime.InteropServices.Marshal]::SizeOf($device)
  return $device
}

function Get-DisplayDeviceName {
  $fallback = $null
  for ($i = 0; $i -lt 16; $i++) {
    $device = New-DisplayDevice
    if (-not [DisplayApi]::EnumDisplayDevices($null, $i, [ref]$device, 0)) { break }
    if (($device.StateFlags -band $DISPLAY_DEVICE_ACTIVE) -eq 0) { continue }
    if (-not $fallback) { $fallback = $device.DeviceName }
    if (($device.StateFlags -band $DISPLAY_DEVICE_PRIMARY_DEVICE) -ne 0) { return $device.DeviceName }
  }
  return $fallback
}

function Get-CurrentMode {
  param([string]$DeviceName)
  $mode = New-DevMode
  [void][DisplayApi]::EnumDisplaySettings($DeviceName, $ENUM_CURRENT_SETTINGS, [ref]$mode)
  return $mode
}

function Get-Modes {
  param([string]$DeviceName)
  $modes = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  for ($i = 0; $i -lt 512; $i++) {
    $mode = New-DevMode
    if (-not [DisplayApi]::EnumDisplaySettings($DeviceName, $i, [ref]$mode)) { break }
    if ($mode.dmPelsWidth -lt 800 -or $mode.dmPelsHeight -lt 600) { continue }
    $key = "$($mode.dmPelsWidth)x$($mode.dmPelsHeight)@$($mode.dmDisplayFrequency)"
    if ($seen.ContainsKey($key)) { continue }
    $seen[$key] = $true
    $modes.Add([pscustomobject]@{
      width = $mode.dmPelsWidth
      height = $mode.dmPelsHeight
      frequency = $mode.dmDisplayFrequency
      label = $key
    })
  }
  return $modes | Sort-Object width, height, frequency -Descending
}

$deviceName = Get-DisplayDeviceName

if ($Action -eq "get") {
  $current = Get-CurrentMode $deviceName
  [pscustomobject]@{
    device = $deviceName
    current = [pscustomobject]@{
      width = $current.dmPelsWidth
      height = $current.dmPelsHeight
      frequency = $current.dmDisplayFrequency
      label = "$($current.dmPelsWidth)x$($current.dmPelsHeight)@$($current.dmDisplayFrequency)"
    }
    modes = @(Get-Modes $deviceName)
  } | ConvertTo-Json -Depth 4
  exit 0
}

if ($Width -le 0 -or $Height -le 0) {
  throw "Width and Height are required for set."
}

if ($deviceName) {
  $target = Get-CurrentMode $deviceName
} else {
  $target = Get-CurrentMode $null
}
$target.dmPelsWidth = $Width
$target.dmPelsHeight = $Height
if ($Frequency -gt 0) {
  $target.dmDisplayFrequency = $Frequency
  $target.dmFields = $DM_PELSWIDTH -bor $DM_PELSHEIGHT -bor $DM_DISPLAYFREQUENCY
} else {
  $target.dmFields = $DM_PELSWIDTH -bor $DM_PELSHEIGHT
}

$result = $null
if ($deviceName) {
  $result = [DisplayApi]::ChangeDisplaySettingsEx($deviceName, [ref]$target, [IntPtr]::Zero, $CDS_UPDATEREGISTRY, [IntPtr]::Zero)
} else {
  $result = [DisplayApi]::ChangeDisplaySettings([ref]$target, $CDS_UPDATEREGISTRY)
}
if ($result -ne $DISP_CHANGE_SUCCESSFUL) {
  throw "ChangeDisplaySettings failed: $result device=$deviceName target=${Width}x${Height}@${Frequency}"
}

if ($deviceName) {
  $current = Get-CurrentMode $deviceName
} else {
  $current = Get-CurrentMode $null
}
[pscustomobject]@{
  ok = $true
  device = $deviceName
  current = [pscustomobject]@{
    width = $current.dmPelsWidth
    height = $current.dmPelsHeight
    frequency = $current.dmDisplayFrequency
    label = "$($current.dmPelsWidth)x$($current.dmPelsHeight)@$($current.dmDisplayFrequency)"
  }
} | ConvertTo-Json -Depth 4

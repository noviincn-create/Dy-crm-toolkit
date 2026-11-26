<#
  Registers the novinvn:// URL scheme for the current Windows user (no admin rights needed).
  Typing / clicking  novinvn://report  anywhere (Chrome address bar, Win+R, Telegram, a document, ...) opens Chrome on the CRM
  with #novinvn=report; the DY CRM Toolkit extension then shows the sales dashboard.

  Usage:   powershell -ExecutionPolicy Bypass -File install-novinvn.ps1 [-CrmUrl https://novincn.crm.systan.com]
  Remove:  powershell -ExecutionPolicy Bypass -File install-novinvn.ps1 -Uninstall
#>
param(
  [string]$CrmUrl = "https://novincn.crm.systan.com",
  [switch]$Uninstall
)
$ErrorActionPreference = "Stop"
$key = "HKCU:\Software\Classes\novinvn"
$dir = Join-Path $env:LOCALAPPDATA "NovinVN"

if ($Uninstall) {
  if (Test-Path $key) { Remove-Item $key -Recurse -Force }
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
  Write-Host "novinvn:// removed."
  exit 0
}

$CrmUrl = $CrmUrl.Trim().TrimEnd("/")
if ($CrmUrl -notmatch '^https://[A-Za-z0-9.-]+(:\d+)?(/[A-Za-z0-9._-]+)?$') { throw "CrmUrl must look like https://host (got '$CrmUrl')" }

# The handler: parses novinvn://<route> and opens the matching CRM URL in Chrome (default browser as a fallback).
$handler = @'
Option Explicit
Const CRM = "__CRM__"

Dim args, raw, route, i, ch, sh, target, chrome, paths, p

Set args = WScript.Arguments
If args.Count = 0 Then WScript.Quit 1
raw = LCase(Trim(args(0)))

If Left(raw, 8) = "novinvn:" Then raw = Mid(raw, 9)
Do While Left(raw, 1) = "/"
  raw = Mid(raw, 2)
Loop

route = ""
For i = 1 To Len(raw)
  ch = Mid(raw, i, 1)
  If ch = "/" Or ch = "?" Or ch = "#" Then Exit For
  route = route & ch
Next

Select Case route
  Case "report"
    target = CRM & "/#novinvn=report"
  Case Else
    MsgBox "Unknown novinvn address: " & route, 48, "Novin"
    WScript.Quit 2
End Select

Set sh = CreateObject("WScript.Shell")
chrome = ""
paths = Array("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe")
On Error Resume Next
For Each p In paths
  If chrome = "" Then chrome = sh.RegRead(p)
  Err.Clear
Next
On Error GoTo 0

If chrome <> "" Then
  sh.Run """" & chrome & """ """ & target & """", 1, False
Else
  CreateObject("Shell.Application").ShellExecute target
End If
'@

New-Item -ItemType Directory -Force $dir | Out-Null
$vbs = Join-Path $dir "handler.vbs"
Set-Content -Path $vbs -Value $handler.Replace("__CRM__", $CrmUrl) -Encoding ASCII

New-Item -Path $key -Force | Out-Null
Set-ItemProperty -Path $key -Name "(default)" -Value "URL:Novin VN Protocol"
New-ItemProperty -Path $key -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "$key\shell\open\command" -Name "(default)" -Value ("wscript.exe `"{0}`" `"%1`"" -f $vbs)

Write-Host "Done. novinvn://report now opens $CrmUrl/#novinvn=report"
Write-Host "Chrome asks once whether to allow the link: tick 'Always allow'."

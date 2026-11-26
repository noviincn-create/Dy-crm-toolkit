@echo off
rem Double-click to register novinvn:// for this Windows user. Edit the address below if your CRM host is different.
set CRM=https://novincn.crm.systan.com
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-novinvn.ps1" -CrmUrl %CRM%
pause

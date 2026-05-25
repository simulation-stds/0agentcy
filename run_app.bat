@echo off
setlocal
cd /d "%~dp0app"
npm.cmd run tauri dev

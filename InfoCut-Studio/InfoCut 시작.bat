@echo off
chcp 65001 >nul
cd /d "%~dp0"
title InfoCut Studio - 이 창을 닫으면 꺼져요
if not exist "node_modules\.bin\tsx.cmd" (
  echo  먼저 설치.bat 을 실행해 주세요.
  pause
  exit /b 1
)
if not exist "ui\dist\index.html" call npm run build:ui
call "node_modules\.bin\tsx.cmd" server\index.ts --open
pause

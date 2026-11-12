@echo off
chcp 65001 >nul
cd /d "%~dp0"
title InfoCut Studio - setup
echo.
echo  InfoCut Studio 설치
echo  ------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js 가 없어요. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)
echo  [1/3] 부품 설치 중 (npm install, 처음엔 2~5분)
call npm install --no-audit --no-fund
if errorlevel 1 goto fail
echo  [2/3] 화면 파일 만드는 중
call npm run build:ui
if errorlevel 1 goto fail
echo  [3/3] 무료 목소리(edge-tts) 설치 중
set PY=
where python >nul 2>nul && set PY=python
if not defined PY ( where py >nul 2>nul && set PY=py )
if defined PY (
  %PY% -m pip install --user --upgrade edge-tts
) else (
  echo  [!] 파이썬이 없어서 무료 목소리를 건너뛰어요. 나중에 Microsoft Store 에서 Python 을 설치하고 이 파일을 다시 실행하세요.
)
echo.
echo  설치 완료. "InfoCut 시작.bat" 을 실행하세요.
pause
exit /b 0
:fail
echo.
echo  [!] 설치 중 오류가 났어요. 위 메시지를 확인하세요.
pause
exit /b 1

@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title InfoCut - APK 빌드
echo.
echo  InfoCut 안드로이드 APK 빌드
echo  ---------------------------

if not exist "node_modules\.bin\vite.cmd" (
  echo  먼저 설치.bat 을 실행해 주세요.
  pause
  exit /b 1
)

set "TOOLS=%~dp0data\android-tools"
if not exist "%TOOLS%" mkdir "%TOOLS%"

rem ----- JDK 21 -----
set "JAVA_HOME=%TOOLS%\jdk"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo  [1/4] JDK 21 내려받는 중 (약 200MB)
  powershell -NoProfile -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile '%TOOLS%\jdk.zip'; Expand-Archive -Force '%TOOLS%\jdk.zip' '%TOOLS%\jdk_tmp'; $d = Get-ChildItem '%TOOLS%\jdk_tmp' | Select-Object -First 1; Move-Item $d.FullName '%TOOLS%\jdk'; Remove-Item -Recurse -Force '%TOOLS%\jdk_tmp','%TOOLS%\jdk.zip'"
  if errorlevel 1 goto fail
) else (
  echo  [1/4] JDK 있음
)
set "PATH=%JAVA_HOME%\bin;%PATH%"

rem ----- Android SDK -----
set "ANDROID_HOME=%TOOLS%\sdk"
set "ANDROID_SDK_ROOT=%ANDROID_HOME%"
set "SDKMGR=%ANDROID_HOME%\cmdline-tools\latest\bin\sdkmanager.bat"
if not exist "%SDKMGR%" (
  echo  [2/4] Android 도구 내려받는 중 (약 150MB)
  powershell -NoProfile -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-13114758_latest.zip' -OutFile '%TOOLS%\cmd.zip'; Expand-Archive -Force '%TOOLS%\cmd.zip' '%TOOLS%\cmd_tmp'; New-Item -ItemType Directory -Force '%ANDROID_HOME%\cmdline-tools' | Out-Null; Move-Item '%TOOLS%\cmd_tmp\cmdline-tools' '%ANDROID_HOME%\cmdline-tools\latest'; Remove-Item -Recurse -Force '%TOOLS%\cmd_tmp','%TOOLS%\cmd.zip'"
  if errorlevel 1 goto fail
) else (
  echo  [2/4] Android 도구 있음
)
if not exist "%ANDROID_HOME%\platforms\android-36" (
  echo        Android SDK 설치 중 (처음 한 번, 몇 분 걸려요)
  powershell -NoProfile -Command "1..40 | ForEach-Object { 'y' } | & '%SDKMGR%' --licenses" >nul
  call "%SDKMGR%" "platform-tools" "platforms;android-36" "build-tools;36.0.0"
  if errorlevel 1 goto fail
)

echo  [3/4] 휴대폰 화면 만드는 중
call npm run build:mobile
if errorlevel 1 goto fail
call "node_modules\.bin\cap.cmd" sync android
if errorlevel 1 goto fail

echo  [4/4] APK 만드는 중 (처음엔 5~10분)
pushd android
call gradlew.bat assembleDebug
if errorlevel 1 ( popd & goto fail )
popd
copy /Y "android\app\build\outputs\apk\debug\app-debug.apk" "InfoCut.apk" >nul
echo.
echo  완료: %~dp0InfoCut.apk
echo  이 파일을 휴대폰으로 보내서 설치하세요.
pause
exit /b 0

:fail
echo.
echo  [!] 빌드 중 오류가 났어요. 위 메시지를 확인하세요.
pause
exit /b 1

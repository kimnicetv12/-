@echo off
chcp 65001 >nul
cd /d "%~dp0"
title InfoCut Bridge - Premiere panel setup
set "DEST=%APPDATA%\Adobe\CEP\extensions\InfoCutBridge"
echo  프리미어 패널을 설치해요: %DEST%
xcopy /E /I /Y /Q "%~dp0cep\InfoCutBridge" "%DEST%" >nul
if errorlevel 1 (
  echo  [!] 복사하지 못했어요.
  pause
  exit /b 1
)
rem 서명 안 된 패널을 프리미어가 열 수 있게 하는 설정 (Adobe 공식 개발자 설정)
for %%v in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
echo.
echo  완료. 프리미어 프로를 다시 켜고 [창 ^> 확장 ^> InfoCut Bridge] 를 여세요.
pause

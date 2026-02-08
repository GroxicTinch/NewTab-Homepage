@echo off
setlocal

:: Ensure builds directory exists
if not exist "builds" mkdir builds

:: Output file
set OUTPUT=builds/FirefoxNewTab.xpi

:: Exclude list (space-separated patterns)
set EXCLUDES=-xr!.git -x!.gitignore -x!README.md -x!builds -x!build-xpi.bat

:: Remove old output if it exists
if exist %OUTPUT% del /f /q %OUTPUT%

:: Create the .xpi (zip) using 7-Zip or NanaZip
7z a -tzip %OUTPUT% * %EXCLUDES%

echo.
echo Created %OUTPUT% with folder structure preserved and exclusions applied.
endlocal
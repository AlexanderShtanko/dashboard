@echo off
setlocal
title Cabinet - local server

pushd "%~dp0"
if errorlevel 1 (
    echo Cannot open the project folder.
    pause
    exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Install Node.js and run this file again.
    echo https://nodejs.org/
    popd
    pause
    exit /b 1
)

echo Starting Cabinet at http://127.0.0.1:4173
echo Keep this window open while using Cabinet.
echo Press Ctrl+C or close this window to stop the server.
echo.

node dev.mjs --open
if errorlevel 1 (
    echo.
    echo The server could not start. See the message above.
    pause
    popd
    exit /b 1
)

popd
endlocal

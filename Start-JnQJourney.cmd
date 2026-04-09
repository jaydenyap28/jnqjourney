@echo off
setlocal

cd /d "%~dp0"

echo Starting JnQ Journey local site...
start "JnQ Journey Dev Server" cmd /k "cd /d ""%~dp0"" && npm run dev"

timeout /t 5 /nobreak >nul
start "" http://localhost:3000/admin/add

echo.
echo Dev server is starting in a new window.
echo If the page does not load immediately, wait a few seconds and refresh.
echo.
pause

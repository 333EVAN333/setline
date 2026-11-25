@echo off
rem Double-click this file to run Setline on your computer.
rem It starts the local server and opens the app in your browser.
rem Close this window (or press Ctrl+C) to stop it.

cd /d "%~dp0"
start "" http://localhost:5173

rem Use whichever Python command this computer has.
where py >nul 2>nul && (py tools\serve.py & goto :eof)
where python >nul 2>nul && (python tools\serve.py & goto :eof)
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" tools\serve.py
  goto :eof
)
echo Python was not found. Install it from https://www.python.org/downloads/
pause

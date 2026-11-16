@echo off
setlocal
set GIT_CMD="C:\Users\nasra\AppData\Local\Programs\MinGit\cmd\git.exe"

echo ========================================================
echo   Pushing RetentionFlow to GitHub
echo   https://github.com/dynabytedigital/tds-followup-app
echo ========================================================
echo.

%GIT_CMD% init
%GIT_CMD% add .
%GIT_CMD% commit -m "feat: RetentionFlow - Shopify Polaris native UI and 4 clinical campaign silos"
%GIT_CMD% remote remove origin 2>nul
%GIT_CMD% remote add origin https://github.com/dynabytedigital/tds-followup-app.git
%GIT_CMD% branch -M main

echo Executing git push...
%GIT_CMD% push -u origin main

if %ERRORLEVEL% EQU 0 (
  echo.
  echo ========================================================
  echo   SUCCESS! RetentionFlow is now live on GitHub.
  echo   Next Step: Connect to Render (tds-followup-app)
  echo ========================================================
) else (
  echo.
  echo ========================================================
  echo   Push failed or pending authentication:
  echo   1. Ensure repository 'tds-followup-app' exists on GitHub:
  echo      https://github.com/new
  echo   2. Sign in to dynabytedigital if GitHub browser prompt appears
  echo ========================================================
)

echo.
pause

@echo off
title RetentionFlow - The Dental Shaman
echo ========================================================
echo    RetentionFlow &middot; The Dental Shaman Conversion Engine
echo    Running locally on http://localhost:3070
echo ========================================================
cd /d "%~dp0"
node server.js
pause

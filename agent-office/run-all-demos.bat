@echo off
echo ==== DEMO ====
call npm run demo
if %errorlevel% neq 0 exit /b %errorlevel%

echo ==== DEMO FAILURE ====
call npm run demo-failure
if %errorlevel% neq 0 exit /b %errorlevel%

echo ==== DEMO MULTI-ISSUE ====
call npm run demo-multi-issue
if %errorlevel% neq 0 exit /b %errorlevel%

echo ==== DEMO REVIEW-FAILURE ====
call npm run demo-review-failure
if %errorlevel% neq 0 exit /b %errorlevel%

echo ==== DEMO TESTING-FAILURE ====
call npm run demo-testing-failure
if %errorlevel% neq 0 exit /b %errorlevel%

echo ==== DEMO RESUME ====
call npm run demo-resume
if %errorlevel% neq 0 exit /b %errorlevel%

echo ALL DEMOS PASSED

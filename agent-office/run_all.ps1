$ErrorActionPreference = "Continue"

Write-Host "--- npx tsc --noEmit ---"
npx tsc --noEmit
Write-Host ""

Write-Host "--- npm test ---"
npm test
Write-Host ""

Write-Host "--- npm run demo ---"
npm run demo
Write-Host ""

Write-Host "--- npm run demo-failure ---"
npm run demo-failure
Write-Host ""

Write-Host "--- npm run demo-multi-issue ---"
npm run demo-multi-issue
Write-Host ""

Write-Host "--- npm run demo-review-failure ---"
npm run demo-review-failure
Write-Host ""

Write-Host "--- npm run demo-testing-failure ---"
npm run demo-testing-failure
Write-Host ""

Write-Host "--- npm run demo-resume ---"
npm run demo-resume
Write-Host ""

Write-Host "--- npm run demo-real-ollama ---"
npm run demo-real-ollama
Write-Host ""

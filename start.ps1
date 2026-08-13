#!/usr/bin/env pwsh
# One command to start the whole stack (backend on :4000, frontend on :5173).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path 'server/.env')) {
  Write-Host "server/.env not found - copying server/.env.example (add your GEMINI_API_KEY before running real pipeline steps)"
  Copy-Item 'server/.env.example' 'server/.env'
}

npm install
npm run dev

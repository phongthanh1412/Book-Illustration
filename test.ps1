#!/usr/bin/env pwsh
# One command to run every test (backend + frontend).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
npm install
npm test

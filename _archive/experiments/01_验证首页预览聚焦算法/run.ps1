#Requires -Version 5.1
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = "utf-8"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
New-Item -ItemType Directory -Force -Path "output" | Out-Null

& {
Write-Host "=== Experiment: preview focus algorithm ==="
Write-Host ""

node experiment.mjs

Write-Host ""
Write-Host "=== Experiment end ==="
} *>&1 | Tee-Object -FilePath "output\run.log"

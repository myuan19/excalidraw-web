#Requires -Version 5.1
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

Write-Host "=== 实验: MindMap 预览文字规范化 ==="
node experiment.mjs
Write-Host ""
Write-Host "输出: before.svg / after.svg / preview.html / result.json"
Write-Host "=== 实验结束 ==="

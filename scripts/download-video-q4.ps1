param([string]$ModelsDirectory)
$ErrorActionPreference = 'Stop'
if (-not $ModelsDirectory) {
    $link = Get-Content (Join-Path $env:APPDATA 'studio.qamba.desktop/comfy_link.json') -Raw | ConvertFrom-Json
    $ModelsDirectory = Join-Path $link.dir 'models'
}
$manifest = Get-Content (Join-Path $PSScriptRoot 'video-q4-downloads.json') -Raw | ConvertFrom-Json
$missingGated = @()
foreach ($file in $manifest) {
    $directory = Join-Path $ModelsDirectory $file.dir
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $destination = Join-Path $directory $file.filename
    $present = @($file.filename) + @($file.alternatives) | Where-Object {
        $_ -and (Test-Path -LiteralPath (Join-Path $directory $_)) -and
        (Get-Item -LiteralPath (Join-Path $directory $_)).Length -gt 0
    }
    if ($present) { Write-Host "Already present: $($file.filename)"; continue }
    if ($file.gated) {
        $missingGated += $file.filename
        Write-Warning "Missing licensed dependency: $($file.filename). Install through Qamba or obtain access from its publisher."
        continue
    }
    $partial = "$destination.part"
    while ($true) {
        & curl.exe --location --fail --http1.1 --ssl-revoke-best-effort `
            --continue-at - --connect-timeout 30 --speed-limit 1024 --speed-time 120 `
            --output $partial $file.url
        $downloadExit = $LASTEXITCODE
        if ($downloadExit -eq 0) {
            if ((Get-Item -LiteralPath $partial).Length -eq 0) { throw "Empty download: $partial" }
            Move-Item -LiteralPath $partial -Destination $destination
            Write-Host "Completed: $($file.filename)"
            break
        }
        if ($downloadExit -in @(22,23,33,36)) {
            throw "Download rejected or local file error ($downloadExit). Partial preserved: $partial"
        }
        Write-Host "Connection interrupted ($downloadExit). Resuming $($file.filename) in 15 seconds..."
        Start-Sleep -Seconds 15
    }
}
if ($missingGated.Count) { Write-Warning "Q4 downloads finished, but these dependencies remain missing: $($missingGated -join ', ')" }
else { Write-Host 'All catalog Q4 video weights and required shared files are present. Restart ComfyUI after installing its GGUF loader.' }

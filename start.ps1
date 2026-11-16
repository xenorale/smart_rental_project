param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$local = New-Item -Force -ItemType Directory -Path '.local'
$url = 'http://127.0.0.1:8787'

function Test-Api($address) {
    try {
        Invoke-RestMethod -Uri $address -TimeoutSec 2
    } catch {
        $null
    }
}

if ((Test-Api "$url/api/config").places) {
    if (-not $NoBrowser) { Start-Process $url }
    return
}

if (-not (Test-Path 'node_modules\vite')) {
    npm.cmd ci --cache .local/npm
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$python = '.venv\Scripts\python.exe'
if (-not (Test-Path $python)) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& $python -c 'import fastapi, uvicorn, shapely, httpx'
if ($LASTEXITCODE -ne 0) {
    & $python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if (Get-Command ollama -ErrorAction SilentlyContinue) {
    $env:OLLAMA_HOST = '127.0.0.1:11435'
    $env:OLLAMA_MODELS = Join-Path $local.FullName 'ollama'
    $env:OLLAMA_VULKAN = 'false'
    $env:CUDA_VISIBLE_DEVICES = '-1'
    $env:OLLAMA_MAX_LOADED_MODELS = '1'
    $env:RENTAL_OLLAMA_URL = 'http://127.0.0.1:11435'
    $tags = "$env:RENTAL_OLLAMA_URL/api/tags"
    $models = Test-Api $tags
    if (-not $models) {
        Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden -RedirectStandardOutput '.local/ollama.out.log' -RedirectStandardError '.local/ollama.err.log'
        for ($attempt = 0; $attempt -lt 30 -and -not $models; $attempt++) {
            Start-Sleep -Milliseconds 350
            $models = Test-Api $tags
        }
    }
    if ($models -and $models.models.name -notcontains 'qwen2.5:1.5b') {
        ollama pull qwen2.5:1.5b
        if ($LASTEXITCODE -ne 0) { Write-Warning 'Model download failed; search is still available' }
    }
} else {
    Write-Warning 'Ollama is missing; search works without review summaries'
}

$web = Start-Process -FilePath $python -ArgumentList '-m','uvicorn','server.main:app','--host','127.0.0.1','--port','8787' -WindowStyle Hidden -PassThru -RedirectStandardOutput '.local/web.out.log' -RedirectStandardError '.local/web.err.log'
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ((Test-Api "$url/api/config").places) {
        Write-Host $url
        if (-not $NoBrowser) { Start-Process $url }
        return
    }
    if ($web.HasExited) { break }
    Start-Sleep -Milliseconds 300
}
Get-Content '.local/web.err.log' -Tail 20
exit 1

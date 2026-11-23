param(
  [Parameter(Position=0)][ValidateSet('check','refresh','build','query','path','explain','affected')][string]$Command = 'check',
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$GraphifyArgs
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Split-Path $PSScriptRoot -Parent)).Path
$toolDir = if ($env:UV_TOOL_DIR) { $env:UV_TOOL_DIR } else { Join-Path $env:APPDATA 'uv\tools' }
$python = Join-Path $toolDir 'graphifyy\Scripts\python.exe'
if ($env:GRAPHIFY_PYTHON) { $python = $env:GRAPHIFY_PYTHON }
if (-not (Test-Path -LiteralPath $python)) {
  $python = (Get-Command python -ErrorAction SilentlyContinue).Source
}
if (-not (Test-Path -LiteralPath $python)) { throw 'Set GRAPHIFY_PYTHON to the Python interpreter containing graphifyy.' }
& $python -B -c 'import graphify.detect'
if ($LASTEXITCODE -ne 0) { throw 'Set GRAPHIFY_PYTHON to the Python interpreter containing graphifyy.' }

function Invoke-Graphify {
  param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
  & $python -u -B -m graphify @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Graphify failed with exit code $LASTEXITCODE." }
}

function Assert-CacheWritable {
  & $python -B (Join-Path $PSScriptRoot 'graphify_cache_probe.py')
  if ($LASTEXITCODE -ne 0) { throw 'Graphify extraction cache is not writable; graph was not refreshed.' }
}

$oldHash = $env:PYTHONHASHSEED
$oldUtf8 = $env:PYTHONUTF8
$oldOut = $env:GRAPHIFY_OUT
Push-Location $root
try {
  $env:PYTHONHASHSEED = '0'
  $env:PYTHONUTF8 = '1'
  $env:GRAPHIFY_OUT = 'graphify-out'
  switch ($Command) {
    check {
      & $python -B (Join-Path $PSScriptRoot 'graphify_status.py') @GraphifyArgs
      if ($LASTEXITCODE -ne 0) { throw "Graphify check returned $LASTEXITCODE." }
    }
    refresh {
      Assert-CacheWritable
      Invoke-Graphify extract . --code-only --force --no-cluster --max-workers 1
      Invoke-Graphify cluster-only . --no-label --no-viz
    }
    build {
      Assert-CacheWritable
      Invoke-Graphify extract . --code-only --force --no-cluster --max-workers 1
      Invoke-Graphify cluster-only . --no-label --no-viz
      Invoke-Graphify export html --graph (Join-Path $root 'graphify-out/graph.json')
      Invoke-Graphify tree --graph (Join-Path $root 'graphify-out/graph.json') --root $root --label Videomaxxxing
    }
    default {
      Invoke-Graphify $Command @GraphifyArgs --graph (Join-Path $root 'graphify-out/graph.json')
    }
  }
} finally {
  $env:PYTHONHASHSEED = $oldHash
  $env:PYTHONUTF8 = $oldUtf8
  $env:GRAPHIFY_OUT = $oldOut
  Pop-Location
}

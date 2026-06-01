param(
  [string]$EnvFile = ".env.local"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
  throw "Missing $EnvFile. Copy .env.example to .env.local and fill the backend values you need."
}

Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }

  $separatorIndex = $line.IndexOf("=")
  if ($separatorIndex -lt 1) {
    return
  }

  $name = $line.Substring(0, $separatorIndex).Trim()
  $value = $line.Substring($separatorIndex + 1).Trim()

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  $value = [Environment]::ExpandEnvironmentVariables($value)

  [Environment]::SetEnvironmentVariable($name, $value, "Process")
}

if (-not $env:GRAPHIFY_EXE) {
  $env:GRAPHIFY_EXE = Join-Path $env:APPDATA "Python\Python310\Scripts\graphify.exe"
}

Write-Host "Loaded Graphify env from $EnvFile"
Write-Host "Backend: $env:GRAPHIFY_BACKEND"
if ($env:GRAPHIFY_BACKEND -eq "openai" -and $env:GRAPHIFY_OPENAI_MODEL) {
  Write-Host "OpenAI model: $env:GRAPHIFY_OPENAI_MODEL"
}
if ($env:GRAPHIFY_BACKEND -eq "ollama" -and $env:OLLAMA_MODEL) {
  Write-Host "Ollama model: $env:OLLAMA_MODEL"
}
if ($env:GRAPHIFY_BACKEND -eq "ollama" -and $env:OLLAMA_BASE_URL) {
  Write-Host "Ollama base URL: $env:OLLAMA_BASE_URL"
}
if ($env:GRAPHIFY_BACKEND -eq "deepseek" -and $env:GRAPHIFY_DEEPSEEK_MODEL) {
  Write-Host "DeepSeek model: $env:GRAPHIFY_DEEPSEEK_MODEL"
}

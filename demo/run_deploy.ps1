$ErrorActionPreference = 'Stop'
$secretPath = 'C:\CodexMoneyExperiment\.secrets\agent37-key.txt'
if (-not (Test-Path -LiteralPath $secretPath)) { throw 'Agent37 key file is missing' }
try {
    $env:AGENT37_API_KEY = [System.IO.File]::ReadAllText($secretPath)
    python (Join-Path $PSScriptRoot 'deploy_agent37.py')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Remove-Item Env:AGENT37_API_KEY -ErrorAction SilentlyContinue
}


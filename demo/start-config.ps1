param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath
)

$resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
$env:BRIDGE_CONFIG_FILE = $resolved
npm start


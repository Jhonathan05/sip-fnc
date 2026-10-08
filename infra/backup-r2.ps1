<#
.SYNOPSIS
  Backup cifrado de Postgres a Cloudflare R2 (skill fnc-monitoring).
.DESCRIPTION
  pg_dump -Fc (vía docker exec) | gzip (.NET GZipStream) | AES-256-CBC
  PBKDF2-SHA256 600k en formato compatible con `openssl enc`
  (cabecera Salted__ + salt 8B) → R2 prefijo <Prefix>/YYYY-MM/, retención 30d.
  100% .NET nativo: sin openssl/gzip/7z en Windows. Re-ejecutable.
  Restaurar en Linux: openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000
  -pass env:BACKUP_ENCRYPTION_KEY -in <f>.enc | gunzip | pg_restore.
.PARAMETER Container
  Contenedor Docker con Postgres (default: sip-fnc-dev-db).
.PARAMETER DbUser
  Usuario Postgres dentro del contenedor (default: sip).
.PARAMETER DbName
  Base a respaldar (default: sip_fnc).
.PARAMETER R2Bucket
  Bucket R2 (default: $env:R2_BUCKET).
.PARAMETER Endpoint
  Endpoint S3 de R2 (default: $env:R2_ENDPOINT).
.PARAMETER Prefix
  Prefijo en el bucket (default: sip-fnc).
.PARAMETER RetainDays
  Retención en días (default: 30).
.PARAMETER LocalOnly
  No sube a R2; solo genera el .enc local y verifica round-trip.
.PARAMETER OutDir
  Directorio local de trabajo (default: $env:TEMP\sip-fnc-backup).
.EXAMPLE
  .\infra\backup-r2.ps1 -LocalOnly
.EXAMPLE
  $env:R2_BUCKET="fnc-backups"; $env:R2_ENDPOINT="https://<id>.r2.cloudflarestorage.com"
  $env:BACKUP_ENCRYPTION_KEY="<secreto>"; .\infra\backup-r2.ps1
.NOTES
  Env: BACKUP_ENCRYPTION_KEY (obligatoria), R2_BUCKET, R2_ENDPOINT,
  AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (AWS CLI para el PUT).
  Cron Windows: schtasks /create /tn "sip-fnc-backup" /tr "powershell -NoProfile -File G:\Open\sip-fnc\infra\backup-r2.ps1" /sc daily /st 02:00
#>
param(
  [string]$Container = 'sip-fnc-dev-db',
  [string]$DbUser = 'sip',
  [string]$DbName = 'sip_fnc',
  [string]$R2Bucket = $env:R2_BUCKET,
  [string]$Endpoint = $env:R2_ENDPOINT,
  [string]$Prefix = 'sip-fnc',
  [int]$RetainDays = 30,
  [switch]$LocalOnly,
  [string]$OutDir = (Join-Path $env:TEMP 'sip-fnc-backup')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression

$key = $env:BACKUP_ENCRYPTION_KEY
if (-not $key) { Write-Error 'Falta BACKUP_ENCRYPTION_KEY en el entorno.'; exit 1 }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }

function Gzip-File([string]$src, [string]$dst) {
  $infs = $null; $outfs = $null; $gz = $null
  try {
    $infs = [IO.File]::OpenRead($src)
    $outfs = [IO.File]::Create($dst)
    $gz = New-Object IO.Compression.GzipStream($outfs, [IO.Compression.CompressionMode]::Compress)
    $infs.CopyTo($gz)
  } finally { if ($gz) { $gz.Close() }; if ($outfs) { $outfs.Close() }; if ($infs) { $infs.Close() } }
}

function Gunzip-File([string]$src, [string]$dst) {
  $infs = $null; $outfs = $null; $gz = $null
  try {
    $infs = [IO.File]::OpenRead($src)
    $outfs = [IO.File]::Create($dst)
    $gz = New-Object IO.Compression.GzipStream($infs, [IO.Compression.CompressionMode]::Decompress)
    $gz.CopyTo($outfs)
  } finally { if ($gz) { $gz.Close() }; if ($outfs) { $outfs.Close() }; if ($infs) { $infs.Close() } }
}

# Cifra estilo `openssl enc -aes-256-cbc -pbkdf2`: Salted__ + salt(8) + AES-256-CBC(PKCS7),
# llave+IV = PBKDF2-SHA256(password UTF8, salt, 600000, 48B).
function Protect-File([string]$src, [string]$dst, [string]$password) {
  $salt = New-Object byte[] 8
  (New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($salt)
  $pbk = New-Object Security.Cryptography.Rfc2898DeriveBytes([Text.Encoding]::UTF8.GetBytes($password), $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $kb = $pbk.GetBytes(48)
  $aes = [Security.Cryptography.Aes]::Create()
  $aes.Mode = [Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $kb[0..31]
  $aes.IV = $kb[32..47]
  $plain = [IO.File]::ReadAllBytes($src)
  $enc = $null; $outfs = $null
  try {
    $enc = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)
    $outfs = [IO.File]::Create($dst)
    $outfs.Write([Text.Encoding]::ASCII.GetBytes('Salted__'), 0, 8)
    $outfs.Write($salt, 0, 8)
    $outfs.Write($enc, 0, $enc.Length)
  } finally { if ($outfs) { $outfs.Close() }; $aes.Dispose() }
}

function Unprotect-File([string]$src, [string]$dst, [string]$password) {
  $all = [IO.File]::ReadAllBytes($src)
  if ($all.Length -lt 16 -or [Text.Encoding]::ASCII.GetString($all, 0, 8) -ne 'Salted__') { throw 'Formato .enc inválido (sin Salted__).' }
  $salt = $all[8..15]
  $pbk = New-Object Security.Cryptography.Rfc2898DeriveBytes([Text.Encoding]::UTF8.GetBytes($password), $salt, 600000, [Security.Cryptography.HashAlgorithmName]::SHA256)
  $kb = $pbk.GetBytes(48)
  $aes = [Security.Cryptography.Aes]::Create()
  $aes.Mode = [Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $kb[0..31]
  $aes.IV = $kb[32..47]
  $ct = $all[16..($all.Length - 1)]
  try {
    $plain = $aes.CreateDecryptor().TransformFinalBlock($ct, 0, $ct.Length)
    [IO.File]::WriteAllBytes($dst, $plain)
  } finally { $aes.Dispose() }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$month = Get-Date -Format 'yyyy-MM'
$dumpFile = Join-Path $OutDir "sip_fnc-$stamp.dump"
$gzFile = "$dumpFile.gz"
$encFile = "$gzFile.enc"

Write-Output "[backup] pg_dump $DbName ($Container)..."
& cmd /c "docker exec $Container pg_dump -U $DbUser -Fc $DbName > `"$dumpFile`""
if (-not (Test-Path -LiteralPath $dumpFile) -or (Get-Item -LiteralPath $dumpFile).Length -eq 0) { Write-Error 'pg_dump no produjo archivo.'; exit 1 }

Write-Output '[backup] gzip + AES-256-CBC PBKDF2-SHA256 600k...'
Gzip-File $dumpFile $gzFile
$hashOrig = (Get-FileHash -LiteralPath $gzFile -Algorithm SHA256).Hash
Protect-File $gzFile $encFile $key
Remove-Item -LiteralPath $dumpFile -ErrorAction SilentlyContinue

Write-Output '[backup] verificando round-trip (descifrar+descomprimir+hash)...'
$tmpGz = Join-Path $OutDir "verify-$stamp.gz"
$tmpRaw = Join-Path $OutDir "verify-$stamp.dump"
Unprotect-File $encFile $tmpGz $key
$hashRound = (Get-FileHash -LiteralPath $tmpGz -Algorithm SHA256).Hash
if ($hashRound -ne $hashOrig) { Write-Error 'Round-trip corrupto (hash difiere).'; exit 1 }
Gunzip-File $tmpGz $tmpRaw
Remove-Item -LiteralPath $tmpGz, $gzFile -ErrorAction SilentlyContinue
$size = (Get-Item -LiteralPath $encFile).Length
Write-Output "[backup] OK local: $encFile ($size bytes, verificado)"

if ($LocalOnly) { Write-Output '[backup] LocalOnly: no se sube a R2.'; exit 0 }

if (-not $R2Bucket -or -not $Endpoint) { Write-Error 'Faltan R2_BUCKET / R2_ENDPOINT.'; exit 1 }
try { $null = Get-Command aws -ErrorAction Stop } catch { Write-Error 'AWS CLI no instalado (necesario para el PUT a R2).'; exit 1 }
$dest = "s3://$R2Bucket/$Prefix/$month/sip_fnc-$stamp.dump.gz.enc"
Write-Output "[backup] subiendo a $dest ..."
& aws s3 cp $encFile $dest --endpoint-url $Endpoint --only-show-errors
if ($LASTEXITCODE -ne 0) { Write-Error 'PUT a R2 falló.'; exit 1 }

Write-Output "[backup] aplicando retención ${RetainDays}d..."
$limit = (Get-Date).AddDays(-$RetainDays).ToString('yyyyMMdd')
& aws s3 ls "s3://$R2Bucket/$Prefix/" --recursive --endpoint-url $Endpoint | ForEach-Object {
  if ($_ -match '(\d{8})-\d{6}\.dump\.gz\.enc\s*$') {
    if ($Matches[1] -lt $limit) {
      $rk = ($_ -split '\s+')[-1]
      Write-Output "[backup] purga $rk"
      & aws s3 rm "s3://$R2Bucket/$rk" --endpoint-url $Endpoint --only-show-errors
    }
  }
}
Remove-Item -LiteralPath $encFile, $tmpRaw -ErrorAction SilentlyContinue
Write-Output '[backup] listo.'

param(
  [int]$Port = 5179,
  [switch]$NoBrowser
)
# Servidor local minimo para el Editor TBS (no necesita instalar nada).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try {
  $listener.Start()
} catch {
  Write-Host "El puerto $Port ya esta en uso: probablemente el editor ya esta abierto."
  if (-not $NoBrowser) { Start-Process $url }
  exit
}

Write-Host ""
Write-Host "  Editor TBS funcionando en $url"
Write-Host "  Deja esta ventana abierta mientras editas. Cierrala para apagar el editor."
Write-Host ""

if (-not $NoBrowser) {
  $chrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if ($chrome) { Start-Process $chrome $url } else { Start-Process $url }
}

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'
  '.mp4' = 'video/mp4'; '.mov' = 'video/quicktime'; '.webm' = 'video/webm'; '.mp3' = 'audio/mpeg'; '.wav' = 'audio/wav'
  '.wasm' = 'application/wasm'; '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.md' = 'text/markdown; charset=utf-8'
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/'))))
    $res.Headers.Add('Cache-Control', 'no-store')
    if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('No encontrado')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
    $res.OutputStream.Close()
  } catch {
    try { $ctx.Response.Abort() } catch {}
  }
}

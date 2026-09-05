# Servidor estático simples para testar o Teleprompter localmente.
# Uso:  powershell -ExecutionPolicy Bypass -File serve.ps1
# Depois abra http://localhost:8080 no navegador. Ctrl+C para parar.
param([int]$Port = 8080)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Teleprompter em http://localhost:$Port/  (Ctrl+C para parar)"

$mime = @{
  ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8";
  ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
  ".webmanifest"="application/manifest+json; charset=utf-8"; ".svg"="image/svg+xml";
  ".png"="image/png"; ".ico"="image/x-icon"
}

function Handle($ctx, $root, $mime) {
  try {
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path.TrimStart("/"))
    $ctx.Response.KeepAlive = $false
    if (Test-Path $file -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      try { $ctx.Response.Headers.Add("Service-Worker-Allowed", "/") } catch {}
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $b = [Text.Encoding]::UTF8.GetBytes("404: $path")
      $ctx.Response.ContentLength64 = $b.Length
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    }
  } catch {} finally { try { $ctx.Response.OutputStream.Close() } catch {} }
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  Handle $ctx $root $mime
}

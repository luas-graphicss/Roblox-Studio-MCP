param(
    [Parameter(Mandatory = $true)][string]$Url,
    [string]$Chave = "",
    [int]$WaitMs = 20000
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32Captura {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd, int attr, out RECT rect, int size);
}
"@
[void][Win32Captura]::SetProcessDPIAware()

$base = ($Url.Trim() -replace '[?#].*$', '' -replace '/+$', '' -replace '/mcp/', '/ponte/')
if ($base -notmatch '^https?://[^/]+/ponte/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$') {
    Write-Host "URL invalida. Use https://SEU-WORKER.workers.dev/mcp/SESSAO/TOKEN" -ForegroundColor Red
    exit 1
}
$helperId = ([guid]::NewGuid().ToString('N')).Substring(0, 12)
$headers = @{ 'Content-Type' = 'application/json' }
if ($Chave -ne '') { $headers['Authorization'] = "Bearer $Chave" }
$versao = '2.4.0'

function Post($caminho, $corpo, $timeoutSec) {
    $json = $corpo | ConvertTo-Json -Depth 6 -Compress
    return Invoke-RestMethod -Method Post -Uri "$base/$caminho" -Headers $headers -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec $timeoutSec
}

function JanelaStudio() {
    $procs = Get-Process -Name 'RobloxStudioBeta', 'RobloxStudio' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
    foreach ($p in $procs) {
        if ([Win32Captura]::IsIconic($p.MainWindowHandle)) { continue }
        $r = New-Object Win32Captura+RECT

        if ([Win32Captura]::DwmGetWindowAttribute($p.MainWindowHandle, 9, [ref]$r, 16) -ne 0) { [void][Win32Captura]::GetWindowRect($p.MainWindowHandle, [ref]$r) }
        if (($r.Right - $r.Left) -gt 50 -and ($r.Bottom - $r.Top) -gt 50) { return @{ handle = $p.MainWindowHandle; rect = $r; titulo = $p.MainWindowTitle } }
    }
    return $null
}

function Capturar($pedido) {
    $janela = if ($pedido.janela) { [string]$pedido.janela } else { 'studio' }
    $maxWidth = if ($pedido.maxWidth) { [int]$pedido.maxWidth } else { 1600 }
    $rect = $null; $titulo = ''
    if ($janela -eq 'studio') {
        $w = JanelaStudio
        if ($null -eq $w) { throw "Nao encontrei uma janela visivel do Roblox Studio (RobloxStudioBeta.exe). Abra/restaure o Studio ou use window=screen." }
        $rect = $w.rect; $titulo = $w.titulo
    } else {
        $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $rect = New-Object Win32Captura+RECT; $rect.Left = $b.Left; $rect.Top = $b.Top; $rect.Right = $b.Right; $rect.Bottom = $b.Bottom
    }
    $largura = $rect.Right - $rect.Left; $altura = $rect.Bottom - $rect.Top
    $bmp = New-Object System.Drawing.Bitmap $largura, $altura
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $largura, $altura))
    $g.Dispose()
    $final = $bmp
    if ($largura -gt $maxWidth) {
        $novaAltura = [int][Math]::Round($altura * $maxWidth / $largura)
        $final = New-Object System.Drawing.Bitmap $maxWidth, $novaAltura
        $g2 = [System.Drawing.Graphics]::FromImage($final)
        $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g2.DrawImage($bmp, 0, 0, $maxWidth, $novaAltura)
        $g2.Dispose(); $bmp.Dispose()
    }
    $ms = New-Object System.IO.MemoryStream
    $final.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray(); $ms.Dispose()
    $resultado = @{ helper = $helperId; id = $pedido.id; png = [Convert]::ToBase64String($bytes); largura = $final.Width; altura = $final.Height; janela = $janela; titulo = $titulo }
    $final.Dispose()
    return $resultado
}

Write-Host "Helper de captura $versao conectado a $base" -ForegroundColor Green
Write-Host "Aguardando pedidos de studio_screenshot... (Ctrl+C ou feche a janela para parar)"
$falhas = 0
while ($true) {
    try {
        $resposta = Post 'captura/poll' @{ helper = $helperId; nome = $env:COMPUTERNAME; so = 'Windows'; versao = $versao; wait = $WaitMs } ([int]($WaitMs / 1000) + 15)
        $falhas = 0
        foreach ($pedido in @($resposta.pedidos)) {
            if ($null -eq $pedido -or -not $pedido.id) { continue }
            try {
                $inicio = Get-Date
                $r = Capturar $pedido
                [void](Post 'captura/enviar' $r 60)
                Write-Host ("[{0}] captura {1}: {2}x{3} ({4} KB) em {5:n1}s" -f (Get-Date -Format 'HH:mm:ss'), $pedido.id, $r.largura, $r.altura, [int]($r.png.Length * 3 / 4 / 1024), ((Get-Date) - $inicio).TotalSeconds)
            } catch {
                Write-Host ("[{0}] falha na captura {1}: {2}" -f (Get-Date -Format 'HH:mm:ss'), $pedido.id, $_.Exception.Message) -ForegroundColor Yellow
                try { [void](Post 'captura/enviar' @{ helper = $helperId; id = $pedido.id; erro = $_.Exception.Message } 30) } catch { }
            }
        }
    } catch {
        $falhas++
        $espera = [Math]::Min(30, [Math]::Pow(2, [Math]::Min($falhas, 5)))
        Write-Host ("[{0}] sem contato com o Worker ({1}); tentando de novo em {2}s" -f (Get-Date -Format 'HH:mm:ss'), $_.Exception.Message, $espera) -ForegroundColor Yellow
        Start-Sleep -Seconds $espera
    }
}

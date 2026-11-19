$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repo = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repo 'brand'
$clientBrand = Join-Path $repo 'client/public/brand'
$siteBrand = Join-Path $repo 'site/brand'
New-Item -ItemType Directory -Force -Path $clientBrand, $siteBrand | Out-Null

Get-ChildItem $source -Filter '*.svg' -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $clientBrand $_.Name) -Force
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $siteBrand $_.Name) -Force
}

function Convert-HexColor([string]$hex) {
    return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Draw-Ribbon([System.Drawing.Graphics]$graphics, [single]$x, [single]$y, [single]$size, [string]$primary, [string]$fold) {
    $graphics.TranslateTransform($x, $y)
    $scale = $size / 128.0
    $graphics.ScaleTransform($scale, $scale)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $ribbon = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $ribbon.AddLine(30, 96, 30, 42)
    $ribbon.AddBezier(30, 42, 30, 35, 39, 32, 44, 38)
    $ribbon.AddLine(44, 38, 64, 60)
    $ribbon.AddLine(64, 60, 84, 38)
    $ribbon.AddBezier(84, 38, 89, 32, 98, 35, 98, 42)
    $ribbon.AddLine(98, 42, 98, 96)
    $pen = [System.Drawing.Pen]::new((Convert-HexColor $primary), 12)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($pen, $ribbon)

    $crease = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $crease.AddLine(57, 65, 64, 72)
    $crease.AddLine(64, 72, 71, 65)
    $foldPen = [System.Drawing.Pen]::new((Convert-HexColor $fold), 4)
    $foldPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $foldPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $foldPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $graphics.DrawPath($foldPen, $crease)

    $ribbon.Dispose(); $crease.Dispose(); $pen.Dispose(); $foldPen.Dispose()
    $graphics.ResetTransform()
}

function Save-Icon([string]$path, [int]$size, [string]$background, [string]$primary, [string]$fold, [int]$inset = 0) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear((Convert-HexColor $background))
    Draw-Ribbon $graphics $inset $inset ($size - 2 * $inset) $primary $fold
    $graphics.Dispose()
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()
}

Save-Icon (Join-Path $repo 'client/public/pwa-192x192.png') 192 '#0B0E14' '#A5AAFF' '#5EEAD4'
Save-Icon (Join-Path $repo 'client/public/pwa-512x512.png') 512 '#0B0E14' '#A5AAFF' '#5EEAD4'
Save-Icon (Join-Path $repo 'client/public/pwa-maskable-512x512.png') 512 '#0B0E14' '#A5AAFF' '#5EEAD4' 32
Save-Icon (Join-Path $repo 'client/public/apple-touch-icon.png') 180 '#0B0E14' '#A5AAFF' '#5EEAD4' 5
Save-Icon (Join-Path $clientBrand 'app-icon-light-512.png') 512 '#F5F7FB' '#5558E8' '#0F766E'

$width = 1200; $height = 630
$card = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($card)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear((Convert-HexColor '#0B0E14'))
Draw-Ribbon $g 74 82 116 '#A5AAFF' '#5EEAD4'
$wordmarkFont = [System.Drawing.Font]::new('Segoe UI', [single]29, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$headlineFont = [System.Drawing.Font]::new('Georgia', [single]62, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new('Segoe UI', [single]26, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$labelFont = [System.Drawing.Font]::new('Segoe UI', [single]17, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$white = [System.Drawing.SolidBrush]::new((Convert-HexColor '#E9EEF6'))
$muted = [System.Drawing.SolidBrush]::new((Convert-HexColor '#AEB9C9'))
$accent = [System.Drawing.SolidBrush]::new((Convert-HexColor '#A5AAFF'))
$g.DrawString('Memex', $wordmarkFont, $white, 218, 119)
$g.DrawString('Everything you save.', $headlineFont, $white, 74, 278)
$g.DrawString('Ready when you need it.', $headlineFont, $white, 74, 356)
$g.DrawString('Your personal knowledge, intelligently organized.', $bodyFont, $muted, 78, 460)
$g.DrawString('LOCAL-FIRST  |  OPEN SOURCE  |  YOUR DATA', $labelFont, $accent, 78, 545)
$g.Dispose()
$card.Save((Join-Path $siteBrand 'social-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$card.Dispose()
$wordmarkFont.Dispose(); $headlineFont.Dispose(); $bodyFont.Dispose(); $labelFont.Dispose()
$white.Dispose(); $muted.Dispose(); $accent.Dispose()

Copy-Item -LiteralPath (Join-Path $siteBrand 'social-preview.png') -Destination (Join-Path $clientBrand 'social-preview.png') -Force
Copy-Item -LiteralPath (Join-Path $repo 'client/public/apple-touch-icon.png') -Destination (Join-Path $siteBrand 'apple-touch-icon.png') -Force
Write-Output 'Brand SVG copies and PNG exports refreshed.'

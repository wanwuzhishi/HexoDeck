# HexoDeck icon generator (ASCII-only for PowerShell 5.1 compatibility)
# Deep space rounded square + cyan/violet gradient hexagon ring + center bar
param(
  [int]$Size = 256,
  [string]$Out = 'F:\HexoDeck\build\icon.png'
)
Add-Type -AssemblyName System.Drawing

$s = $Size
$bmp = New-Object System.Drawing.Bitmap($s, $s)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# --- background: dark rounded square with subtle gradient ---
$pad = [int]($s * 0.04)
$corner = [int]($s * 0.22)
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($pad, $pad, $corner, $corner, 180, 90)
$path.AddArc(($s - $pad - $corner), $pad, $corner, $corner, 270, 90)
$path.AddArc(($s - $pad - $corner), ($s - $pad - $corner), $corner, $corner, 0, 90)
$path.AddArc($pad, ($s - $pad - $corner), $corner, $corner, 90, 90)
$path.CloseFigure()
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point($s, $s)),
  [System.Drawing.Color]::FromArgb(255, 11, 15, 26),
  [System.Drawing.Color]::FromArgb(255, 24, 40, 66)
)
$g.FillPath($bg, $path)

# --- hexagon ring ---
$cx = [double]$s / 2.0
$cy = [double]$s / 2.0
$rOuter = [double]$s * 0.33
$rInner = [double]$s * 0.22
Write-Output ("debug: s={0} cx={1} cy={2} rOuter={3} rInner={4}" -f $s, $cx, $cy, $rOuter, $rInner)

$ptsOuter = New-Object System.Collections.Generic.List[System.Drawing.PointF]
$ptsInner = New-Object System.Collections.Generic.List[System.Drawing.PointF]
for ($i = 0; $i -lt 6; $i++) {
  $a = [Math]::PI / 180.0 * (60.0 * $i - 90.0)
  $xo = [float]($cx + $rOuter * [Math]::Cos($a))
  $yo = [float]($cy + $rOuter * [Math]::Sin($a))
  $xi = [float]($cx + $rInner * [Math]::Cos($a))
  $yi = [float]($cy + $rInner * [Math]::Sin($a))
  $ptsOuter.Add((New-Object System.Drawing.PointF($xo, $yo)))
  $ptsInner.Add((New-Object System.Drawing.PointF($xi, $yi)))
}
Write-Output ("debug: outer0={0},{1}" -f $ptsOuter[0].X, $ptsOuter[0].Y)

$ring = New-Object System.Collections.Generic.List[System.Drawing.PointF]
foreach ($p in $ptsOuter) { $ring.Add($p) }
for ($i = 5; $i -ge 0; $i--) { $ring.Add($ptsInner[$i]) }

$hexBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point([int]($s * 0.2), [int]($s * 0.15))),
  (New-Object System.Drawing.Point([int]($s * 0.85), [int]($s * 0.9))),
  [System.Drawing.Color]::FromArgb(255, 34, 211, 238),
  [System.Drawing.Color]::FromArgb(255, 167, 139, 250)
)
$g.FillPolygon($hexBrush, $ring.ToArray())

# --- center bar ---
$barW = [int]($s * 0.20)
$barH = [int]($s * 0.055)
$barX = [int]($cx - $barW / 2.0)
$barY = [int]($cy - $barH / 2.0)
Write-Output ("debug: bar={0},{1} {2}x{3}" -f $barX, $barY, $barW, $barH)
$bar = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
$g.FillRectangle($bar, $barX, $barY, $barW, $barH)

$g.Dispose()
$dir = Split-Path $Out -Parent
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "saved: $Out"

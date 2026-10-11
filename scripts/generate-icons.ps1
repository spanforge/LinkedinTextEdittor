Add-Type -AssemblyName System.Drawing
foreach ($iconSize in @(192, 512)) {
  $bitmap = [System.Drawing.Bitmap]::new($iconSize, $iconSize)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#2563eb'))
  $graphics.FillRectangle([System.Drawing.Brushes]::White, [int]($iconSize * .25), [int]($iconSize * .24), [int]($iconSize * .50), [int]($iconSize * .12))
  $graphics.FillRectangle([System.Drawing.Brushes]::White, [int]($iconSize * .44), [int]($iconSize * .35), [int]($iconSize * .12), [int]($iconSize * .43))
  $bitmap.Save((Join-Path (Get-Location) "public/icon-$iconSize.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
}
$socialBitmap = [System.Drawing.Bitmap]::new(1200, 630)
$socialGraphics = [System.Drawing.Graphics]::FromImage($socialBitmap)
$socialGraphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$socialGraphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#eff6ff'))
$socialFont = [System.Drawing.Font]::new('Segoe UI', 46, [System.Drawing.FontStyle]::Bold)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 23)
$textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#172554'))
$blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#2563eb'))
$socialGraphics.DrawString('Clear words.', $socialFont, $textBrush, 90, 165)
$socialGraphics.DrawString('Thoughtful emphasis.', $socialFont, $blueBrush, 90, 255)
$socialGraphics.DrawString('LinkedIn Text Formatter | Sriram Advisory', $smallFont, $textBrush, 90, 415)
$socialBitmap.Save((Join-Path (Get-Location) 'public/social.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$socialGraphics.Dispose(); $socialBitmap.Dispose(); $socialFont.Dispose(); $smallFont.Dispose(); $textBrush.Dispose(); $blueBrush.Dispose()

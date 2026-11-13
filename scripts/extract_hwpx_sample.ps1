param([Parameter(Mandatory)][string]$AttachmentPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$file = Get-Item -LiteralPath $AttachmentPath
if ($file.Extension -ne '.hwpx' -or $file.Length -gt 5MB) { throw 'Expected a local HWPX file up to 5 MB.' }
$zip = [IO.Compression.ZipFile]::OpenRead($file.FullName)
try {
  $sections = @($zip.Entries | Where-Object { $_.FullName -match '^Contents/section\d+\.xml$' } | Sort-Object FullName)
  if (!$sections.Count -or ($sections | Measure-Object -Property Length -Sum).Sum -gt 10MB) { throw 'Invalid HWPX sections.' }
  $lines = foreach ($section in $sections) {
    $stream = $section.Open()
    try {
      $settings = [System.Xml.XmlReaderSettings]::new()
      $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
      $settings.XmlResolver = $null
      $settings.MaxCharactersInDocument = 10MB
      $reader = [System.Xml.XmlReader]::Create($stream, $settings)
      try {
        $document = [System.Xml.XmlDocument]::new()
        $document.Load($reader)
        foreach ($node in $document.SelectNodes('//*[local-name()="t"]')) {
          if ($node.InnerText.Trim()) { $node.InnerText.Trim() }
        }
      } finally { $reader.Dispose() }
    } finally { $stream.Dispose() }
  }
  $hashStream = [IO.File]::OpenRead($file.FullName)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $digest = [BitConverter]::ToString($sha.ComputeHash($hashStream)).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose(); $hashStream.Dispose() }
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  @{ name = $file.Name; sha256 = $digest; text = ($lines -join "`n") } | ConvertTo-Json -Compress
} finally { $zip.Dispose() }

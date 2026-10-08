$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $pluginRoot 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zipPath = Join-Path $dist 'clipboard_image_paste-2.0.0-redmine-7.0.2.zip'
Add-Type -AssemblyName System.IO.Compression
$runtimePaths = @('init.rb', 'README.md', 'README.textile', 'UPSTREAM.md', 'VERIFICATION.md', 'COPYING')
$runtimePaths += Get-ChildItem (Join-Path $pluginRoot 'app'), (Join-Path $pluginRoot 'lib'), (Join-Path $pluginRoot 'assets'), (Join-Path $pluginRoot 'config/locales') -Recurse -File | ForEach-Object { [IO.Path]::GetRelativePath($pluginRoot, $_.FullName).Replace('\','/') }
$manifest = @{}
$zipFile = [IO.File]::Open($zipPath, [IO.FileMode]::Create, [IO.FileAccess]::Write)
$archive = [IO.Compression.ZipArchive]::new($zipFile, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($relative in ($runtimePaths | Sort-Object)) {
        $file = Join-Path $pluginRoot $relative
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file, ('clipboard_image_paste/' + $relative), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $manifest[$relative] = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    }
} finally { $archive.Dispose() }
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($archive.Entries.Count -ne $runtimePaths.Count) { throw 'Package entry count mismatch' }
    foreach ($entry in $archive.Entries) {
        $relative = $entry.FullName.Substring('clipboard_image_paste/'.Length)
        $stream = $entry.Open()
        try { $digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)).ToLowerInvariant() } finally { $stream.Dispose() }
        if ($digest -ne $manifest[$relative]) { throw "Package hash mismatch: $relative" }
    }
} finally { $archive.Dispose() }
$info = @{ file = [IO.Path]::GetFileName($zipPath); sha256 = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant(); entries = $runtimePaths.Count; source = $manifest }
[IO.File]::WriteAllText((Join-Path $dist 'manifest.json'), ($info | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
$info | Select-Object file, sha256, entries

$ErrorActionPreference = 'Stop'
$pluginRoot = Split-Path $PSScriptRoot -Parent
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is required' }
docker image inspect redmine:7.0.2 *> $null
if ($LASTEXITCODE -ne 0) { throw 'Prepare the redmine:7.0.2 Docker image before verification' }
$paths = @('init.rb')
$paths += Get-ChildItem (Join-Path $pluginRoot 'app'), (Join-Path $pluginRoot 'lib'), (Join-Path $pluginRoot 'config'), (Join-Path $pluginRoot 'assets') -Recurse -File | ForEach-Object { [IO.Path]::GetRelativePath($pluginRoot, $_.FullName).Replace('\','/') }
$payload = @{}
foreach ($path in $paths) { $payload[$path] = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $pluginRoot $path))) }
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress)))
$script = "require 'base64'; require 'json'; " + '$cbp_payload = JSON.parse(Base64.strict_decode64(' + "'$encoded'));`n" + [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'verify_runtime.rb'))
# No network or production mounts; temporary memory-backed writes only.
$output = $script | docker run --rm --network none --read-only --tmpfs /tmp:rw,nosuid,nodev --tmpfs /usr/src/redmine/public/assets:rw,nosuid,nodev --tmpfs /usr/src/redmine/tmp:rw,nosuid,nodev --tmpfs /usr/src/redmine/log:rw,nosuid,nodev -i --entrypoint ruby redmine:7.0.2 -
if ($LASTEXITCODE -ne 0) { $output | Where-Object { -not $_.StartsWith('CBP_FIXTURE=') }; throw 'Isolated runtime verification failed' }
$fixture = $output | Where-Object { $_.StartsWith('CBP_FIXTURE=') } | Select-Object -Last 1
if (!$fixture) { throw 'Runtime fixture was not returned' }
$fixtureDir = Join-Path $PSScriptRoot 'fixtures'
New-Item -ItemType Directory -Force $fixtureDir | Out-Null
[IO.File]::WriteAllBytes((Join-Path $fixtureDir 'redmine-7.0.2.json'), [Convert]::FromBase64String($fixture.Substring(12)))
$checks = $output | Where-Object { -not $_.StartsWith('CBP_FIXTURE=') }
$checks | Where-Object { $_.StartsWith('PASS:') -or $_.StartsWith('WARN:') }
[IO.File]::WriteAllLines((Join-Path $fixtureDir 'runtime-results.txt'), [string[]]$checks, [Text.UTF8Encoding]::new($false))

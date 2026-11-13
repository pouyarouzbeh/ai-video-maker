$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root

function Invoke-Checked {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable exited with $LASTEXITCODE" }
}

$pinBlender = '428f60cdb819c55c69d67eef681f0318e464e0e9'
$pinShotcraft = 'b1534bbfb892c1047f29f3fe63677b961844d37e'
$pinRemotion = '1fc074b74b95cfecf7b1e419132f2cfe23dafebe'
$skills = Join-Path $root '.agents/skills'
$installer = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py'

Invoke-Checked npm @('ci', '--no-audit', '--no-fund')
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue) -and -not $env:REEL_FFMPEG_BIN) {
    $installed = winget list --id Gyan.FFmpeg -e --accept-source-agreements
    if (($installed -join "`n") -notmatch 'Gyan\.FFmpeg') {
        Invoke-Checked winget @('install', '--id', 'Gyan.FFmpeg', '-e', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity')
    }
}
if (-not (Test-Path '.tools/blender-venv/Scripts/blender-mcp-server.exe')) {
    Invoke-Checked python @('-m', 'venv', '.tools/blender-venv')
    Invoke-Checked '.tools/blender-venv/Scripts/python.exe' @('-m', 'pip', 'install', "git+https://github.com/djeada/blender-mcp-server.git@$pinBlender")
}
if (-not (Test-Path '.agents/skills/video-shotcraft/SKILL.md')) {
    Invoke-Checked git @('clone', '--filter=blob:none', '--no-checkout', 'https://github.com/kytranautomind-glitch/video-shotcraft-remotion.git', '.agents/skills/video-shotcraft')
    Invoke-Checked git @('-C', '.agents/skills/video-shotcraft', 'checkout', '--detach', $pinShotcraft)
}
if (-not (Test-Path '.agents/skills/remotion-best-practices/SKILL.md')) {
    if (Test-Path -LiteralPath $installer) {
        Invoke-Checked python @($installer, '--repo', 'remotion-dev/skills', '--path', 'skills/remotion-best-practices', '--ref', $pinRemotion, '--dest', $skills)
    } else {
        if (-not (Test-Path '.tools/remotion-skills/.git')) {
            Invoke-Checked git @('clone', '--filter=blob:none', '--no-checkout', 'https://github.com/remotion-dev/skills.git', '.tools/remotion-skills')
        }
        Invoke-Checked git @('-C', '.tools/remotion-skills', 'checkout', '--detach', $pinRemotion)
        Copy-Item -Recurse -LiteralPath '.tools/remotion-skills/skills/remotion-best-practices' -Destination $skills
    }
}
if (-not (Test-Path '.agents/skills/ffmpeg-skill/SKILL.md')) {
    Invoke-Checked npx @('--yes', 'ffmpeg-skill@3.4.3', '--dir', $skills)
}

$config = Join-Path $root '.codex/config.toml'
$posixPath = $root.Replace('\','/')
$contents = Get-Content -LiteralPath $config -Raw
$contents = $contents -replace '(?m)^cwd = "[^"]+"$', ('cwd = "' + $posixPath + '"')
Set-Content -LiteralPath $config -Value $contents.TrimEnd() -Encoding utf8
Invoke-Checked npm @('run', 'doctor')

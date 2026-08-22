param(
    [Parameter(Mandatory = $true)]
    [string]$RuntimePath
)

$expected = "0df097cc7af44247d33bae32d2e5e5baf2911ef7888ca5583e83fdab59db7a25"
$resolved = Resolve-Path -LiteralPath $RuntimePath -ErrorAction SilentlyContinue

if ($null -eq $resolved) {
    [Console]::Error.WriteLine("runtime file does not exist: $RuntimePath")
    exit 2
}

$file = Get-Item -LiteralPath $resolved.Path
if ($file.Name -cne "omp-windows-x64.exe") {
    [Console]::Error.WriteLine("unexpected runtime filename: $($file.Name)")
    exit 3
}

$actual = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$result = [ordered]@{
    file = $file.Name
    sha256 = $actual
    expected = $expected
    ok = ($actual -ceq $expected)
}
Write-Output ($result | ConvertTo-Json -Compress)

if (-not $result.ok) {
    exit 4
}

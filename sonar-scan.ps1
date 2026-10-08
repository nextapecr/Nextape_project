# SonarScanner PowerShell Script for Windows
# Usage:
#   .\sonar-scan.ps1           # Run analysis
#   .\sonar-scan.ps1 -DryRun   # Validate configuration only

param(
    [switch]$DryRun
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "SonarScanner for Nextape" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Configure SonarScanner PATH
$SONAR_SCANNER_VERSION = "8.1.0.6389"
$SONAR_SCANNER_HOME = "$env:USERPROFILE\.sonar\sonar-scanner-$SONAR_SCANNER_VERSION-windows-x64"
$env:PATH = "$SONAR_SCANNER_HOME\bin;$env:PATH"

$scannerPath = Join-Path $SONAR_SCANNER_HOME "bin\sonar-scanner.bat"

if (-not (Test-Path $scannerPath)) {
    Write-Host "ERROR: SonarScanner not found at: $SONAR_SCANNER_HOME" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run the installation commands first:" -ForegroundColor Yellow
    Write-Host "  1. Download and extract SonarScanner" -ForegroundColor Yellow
    Write-Host "  2. Configure SONAR_TOKEN environment variable" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "OK: SonarScanner found: $SONAR_SCANNER_HOME" -ForegroundColor Green

# 2. Check SONAR_TOKEN
if (-not $env:SONAR_TOKEN) {
    Write-Host ""
    Write-Host "WARNING: SONAR_TOKEN environment variable not set" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Set it with:" -ForegroundColor Yellow
    Write-Host '  $env:SONAR_TOKEN = "f99c95a1a30829d7da97d4512d9e240b68f571fa"' -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Or permanently:" -ForegroundColor Yellow
    Write-Host '  [System.Environment]::SetEnvironmentVariable("SONAR_TOKEN","f99c95a1a30829d7da97d4512d9e240b68f571fa","User")' -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "OK: SONAR_TOKEN configured" -ForegroundColor Green

# 3. Verify project configuration
Write-Host ""
Write-Host "Verifying project..." -ForegroundColor Cyan

if (-not (Test-Path ".next")) {
    Write-Host "WARNING: .next directory not found" -ForegroundColor Yellow
    Write-Host "   Run 'npm run build' before analysis (recommended)" -ForegroundColor Yellow
}
else {
    Write-Host "OK: Build found (.next/)" -ForegroundColor Green
}

if (-not (Test-Path "sonar-project.properties")) {
    Write-Host "ERROR: sonar-project.properties not found" -ForegroundColor Red
    exit 1
}

Write-Host "OK: Configuration found (sonar-project.properties)" -ForegroundColor Green

# 4. Run analysis
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Running code analysis..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "DRY-RUN mode (validation only)" -ForegroundColor Yellow
    Write-Host ""
    & sonar-scanner --help
}
else {
    $startTime = Get-Date
    
    & sonar-scanner "-Dsonar.organization=skrsoftwarecr1" "-Dsonar.projectKey=skrsoftwarecr_nextape"
    
    $exitCode = $LASTEXITCODE
    $endTime = Get-Date
    $duration = ($endTime - $startTime).TotalSeconds
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    
    if ($exitCode -eq 0) {
        Write-Host "SUCCESS: Analysis completed" -ForegroundColor Green
        Write-Host "Duration: $([math]::Round($duration, 1))s" -ForegroundColor Green
        Write-Host ""
        Write-Host "View results at:" -ForegroundColor Cyan
        Write-Host "   https://sonarcloud.io/project/overview?id=skrsoftwarecr_nextape" -ForegroundColor White
    }
    else {
        Write-Host "ERROR: Analysis failed with exit code: $exitCode" -ForegroundColor Red
        Write-Host "Duration: $([math]::Round($duration, 1))s" -ForegroundColor Red
    }
    
    Write-Host "================================================" -ForegroundColor Cyan
    
    exit $exitCode
}

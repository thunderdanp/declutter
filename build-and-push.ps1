# Build and Push Declutter Assistant to Docker Hub (Windows PowerShell)
# Run this script from the github-ready directory

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Building Declutter Assistant" -ForegroundColor Cyan
Write-Host "  Docker Hub: thunderdanp/declutter" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker info | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running!" -ForegroundColor Red
    Write-Host "  Please start Docker Desktop and try again" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Check if logged into Docker Hub
Write-Host "Checking Docker Hub login..." -ForegroundColor Yellow
$dockerInfo = docker info 2>&1 | Out-String
if ($dockerInfo -notmatch "Username") {
    Write-Host "✗ Not logged into Docker Hub" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please login first:" -ForegroundColor Yellow
    Write-Host "  docker login" -ForegroundColor White
    Write-Host ""
    Write-Host "Press Enter to login now, or Ctrl+C to cancel..."
    Read-Host
    docker login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Login failed. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host "✓ Logged into Docker Hub" -ForegroundColor Green
Write-Host ""

# Navigate to docker-build directory
if (-not (Test-Path "docker-build")) {
    Write-Host "✗ Error: docker-build directory not found" -ForegroundColor Red
    Write-Host "  Make sure you're in the github-ready directory" -ForegroundColor Red
    exit 1
}

Set-Location docker-build
Write-Host "✓ Found docker-build directory" -ForegroundColor Green
Write-Host ""

# Ask user which build method
Write-Host "Choose build method:" -ForegroundColor Yellow
Write-Host "  1. Multi-platform (amd64 + arm64) - Recommended" -ForegroundColor White
Write-Host "  2. Single platform (amd64 only) - Faster" -ForegroundColor White
Write-Host ""
$choice = Read-Host "Enter choice (1 or 2)"

Write-Host ""
Write-Host "Building Docker image..." -ForegroundColor Yellow
Write-Host "This will take 3-5 minutes..." -ForegroundColor Yellow
Write-Host ""

if ($choice -eq "1") {
    # Multi-platform build
    Write-Host "Building for multiple platforms (amd64 + arm64)..." -ForegroundColor Cyan
    
    # Create buildx builder if it doesn't exist
    docker buildx create --use 2>$null
    
    docker buildx build `
        --platform linux/amd64,linux/arm64 `
        -t thunderdanp/declutter:latest `
        -t thunderdanp/declutter:1.0.0 `
        --push `
        .
} else {
    # Single platform build
    Write-Host "Building for single platform (amd64)..." -ForegroundColor Cyan
    
    docker build -t thunderdanp/declutter:latest .
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Build successful" -ForegroundColor Green
        Write-Host ""
        Write-Host "Tagging version 1.0.0..." -ForegroundColor Yellow
        docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0
        
        Write-Host "Pushing to Docker Hub..." -ForegroundColor Yellow
        docker push thunderdanp/declutter:latest
        docker push thunderdanp/declutter:1.0.0
    }
}

# Check if build was successful
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✓ SUCCESS!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Your image is now available at:" -ForegroundColor White
    Write-Host "  docker pull thunderdanp/declutter:latest" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Verify it's on Docker Hub:" -ForegroundColor White
    Write-Host "  https://hub.docker.com/r/thunderdanp/declutter" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Users can now deploy with the zero-setup package!" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ✗ BUILD FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check the errors above and try again." -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Return to original directory
Set-Location ..

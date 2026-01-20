#!/bin/bash

# Build and Push Declutter Assistant to Docker Hub (macOS)
# Run this script from the github-ready directory

echo "========================================"
echo "  Building Declutter Assistant"
echo "  Docker Hub: thunderdanp/declutter"
echo "========================================"
echo ""

# Check if Docker is running
echo "🔍 Checking Docker..."
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo "   Please start Docker Desktop and try again"
    echo ""
    echo "   Open Docker Desktop from Applications folder"
    exit 1
fi
echo "✅ Docker is running"
echo ""

# Check if logged into Docker Hub
echo "🔍 Checking Docker Hub login..."
if ! docker info 2>/dev/null | grep -q "Username"; then
    echo "⚠️  Not logged into Docker Hub"
    echo ""
    echo "Please login to Docker Hub:"
    docker login
    if [ $? -ne 0 ]; then
        echo "❌ Login failed. Exiting."
        exit 1
    fi
fi
echo "✅ Logged into Docker Hub"
echo ""

# Navigate to docker-build directory
if [ ! -d "docker-build" ]; then
    echo "❌ Error: docker-build directory not found"
    echo "   Make sure you're in the github-ready directory"
    exit 1
fi

cd docker-build
echo "✅ Found docker-build directory"
echo ""

# Ask user which build method
echo "Choose build method:"
echo "  1. Multi-platform (amd64 + arm64) - Recommended for Apple Silicon"
echo "  2. Single platform (current architecture only) - Faster"
echo ""
read -p "Enter choice (1 or 2): " choice

echo ""
echo "🔨 Building Docker image..."
echo "This will take 3-5 minutes..."
echo ""

if [ "$choice" = "1" ]; then
    # Multi-platform build
    echo "Building for multiple platforms (amd64 + arm64)..."
    
    # Create buildx builder if it doesn't exist
    docker buildx create --name declutter-builder --use 2>/dev/null || \
    docker buildx use declutter-builder 2>/dev/null || \
    docker buildx create --name declutter-builder --use
    
    docker buildx build \
        --platform linux/amd64,linux/arm64 \
        -t thunderdanp/declutter:latest \
        -t thunderdanp/declutter:1.0.0 \
        --push \
        .
    
    BUILD_EXIT=$?
else
    # Single platform build
    echo "Building for current platform..."
    
    docker build -t thunderdanp/declutter:latest .
    
    if [ $? -eq 0 ]; then
        echo "✅ Build successful"
        echo ""
        echo "🏷️  Tagging version 1.0.0..."
        docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0
        
        echo "📤 Pushing to Docker Hub..."
        docker push thunderdanp/declutter:latest
        docker push thunderdanp/declutter:1.0.0
        
        BUILD_EXIT=$?
    else
        BUILD_EXIT=1
    fi
fi

# Check if build was successful
if [ $BUILD_EXIT -eq 0 ]; then
    echo ""
    echo "========================================"
    echo "  ✅ SUCCESS!"
    echo "========================================"
    echo ""
    echo "Your image is now available at:"
    echo "  docker pull thunderdanp/declutter:latest"
    echo ""
    echo "Verify it's on Docker Hub:"
    echo "  https://hub.docker.com/r/thunderdanp/declutter"
    echo ""
    echo "🎉 Users can now deploy with the zero-setup package!"
    echo ""
else
    echo ""
    echo "========================================"
    echo "  ❌ BUILD FAILED"
    echo "========================================"
    echo ""
    echo "Check the errors above and try again."
    echo ""
    exit 1
fi

# Return to original directory
cd ..

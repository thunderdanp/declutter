#!/bin/bash

# Build and Push Declutter Assistant to Docker Hub (Linux)
# Run this script from the project root directory

echo "========================================"
echo "  Building Declutter Assistant"
echo "  Docker Hub: thunderdanp/declutter"
echo "========================================"
echo ""

# Check if Docker is running
echo "🔍 Checking Docker..."
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running!"
    echo "   Please start Docker and try again"
    echo ""
    echo "   Try: sudo systemctl start docker"
    echo "   Or:  sudo service docker start"
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
    echo "   Make sure you're in the project root directory"
    exit 1
fi

cd docker-build
echo "✅ Found docker-build directory"
echo ""

echo "🔨 Building Docker image..."
echo "This will take 3-5 minutes..."
echo ""

# Build the image
docker build -t thunderdanp/declutter:latest .

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
    echo ""
    echo "🏷️  Tagging version 1.0.0..."
    docker tag thunderdanp/declutter:latest thunderdanp/declutter:1.0.0

    echo ""
    read -p "Push to Docker Hub? (y/n): " push_choice

    if [ "$push_choice" = "y" ] || [ "$push_choice" = "Y" ]; then
        echo "📤 Pushing to Docker Hub..."
        docker push thunderdanp/declutter:latest
        docker push thunderdanp/declutter:1.0.0

        if [ $? -eq 0 ]; then
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
            echo "❌ Push failed. Check errors above."
            exit 1
        fi
    else
        echo ""
        echo "✅ Build complete (not pushed to Docker Hub)"
        echo ""
        echo "Image is available locally as:"
        echo "  thunderdanp/declutter:latest"
        echo ""
    fi
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

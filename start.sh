#!/bin/bash

echo "🏠 Declutter Assistant - Starting Application"
echo "=============================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    echo "   Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Create uploads directory if it doesn't exist
if [ ! -d "uploads" ]; then
    echo "📁 Creating uploads directory..."
    mkdir -p uploads
fi

echo "🔨 Building and starting services..."
echo "   This may take a few minutes on first run..."
echo ""

# Build and start services
docker-compose up --build -d

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Application is starting!"
    echo ""
    echo "📊 Checking service status..."
    sleep 5
    docker-compose ps
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "🌐 Access the application at: http://localhost:3000"
    echo ""
    echo "📝 Useful commands:"
    echo "   View logs:        docker-compose logs -f"
    echo "   Stop services:    docker-compose down"
    echo "   Restart:          docker-compose restart"
    echo ""
else
    echo "❌ Failed to start services. Please check the error messages above."
    exit 1
fi

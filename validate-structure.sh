#!/bin/bash

echo "🔧 Declutter Assistant - Structure Validator & Fixer"
echo "===================================================="
echo ""

ERRORS=0
WARNINGS=0

# Function to check file existence
check_file() {
    if [ -f "$1" ]; then
        echo "  ✅ $1"
        return 0
    else
        echo "  ❌ $1 - MISSING"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
}

# Function to check directory existence
check_dir() {
    if [ -d "$1" ]; then
        echo "  ✅ $1/"
        return 0
    else
        echo "  ⚠️  $1/ - MISSING"
        WARNINGS=$((WARNINGS + 1))
        return 1
    fi
}

echo "📋 Checking required files..."
echo ""

# Check docker-compose.yml
echo "Docker Compose:"
check_file "docker-compose.yml" || check_file "docker-compose-minimal.yml"
echo ""

# Check backend structure
echo "Backend Structure:"
check_file "backend/Dockerfile"
check_file "backend/package.json"
check_file "backend/server.js"
check_file "backend/init.sql"
echo ""

# Check frontend structure
echo "Frontend Structure:"
check_file "frontend/Dockerfile"
check_file "frontend/package.json"
check_file "frontend/nginx.conf"
check_file "frontend/public/index.html"
check_file "frontend/src/index.js"
check_file "frontend/src/App.js"
check_file "frontend/src/App.css"
echo ""

# Check for pages
echo "Frontend Pages:"
PAGE_COUNT=$(find frontend/src/pages -name "*.js" 2>/dev/null | wc -l)
if [ "$PAGE_COUNT" -ge 9 ]; then
    echo "  ✅ frontend/src/pages/ ($PAGE_COUNT page components found)"
else
    echo "  ⚠️  frontend/src/pages/ (only $PAGE_COUNT page components, expected 9)"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# Check optional files
echo "Optional Files:"
check_dir "uploads" || echo "  💡 Will be created automatically"
check_file "init.sql" || echo "  💡 Using backend/init.sql instead"
echo ""

echo "===================================================="
echo ""

# Auto-fix section
if [ $ERRORS -gt 0 ]; then
    echo "❌ Found $ERRORS critical errors"
    echo "⚠️  Found $WARNINGS warnings"
    echo ""
    echo "Cannot proceed with build. Please fix missing files."
    exit 1
fi

if [ $WARNINGS -gt 0 ]; then
    echo "⚠️  Found $WARNINGS warnings. Attempting to fix..."
    echo ""
    
    # Create uploads directory if missing
    if [ ! -d uploads ]; then
        echo "📁 Creating uploads directory..."
        mkdir -p uploads
        echo "  ✅ Created uploads/"
    fi
    
    # Copy init.sql to root if missing and docker-compose.yml expects it
    if [ ! -f init.sql ] && [ -f backend/init.sql ]; then
        if grep -q "./init.sql:" docker-compose.yml 2>/dev/null; then
            echo "📋 Copying init.sql to root directory..."
            cp backend/init.sql ./init.sql
            echo "  ✅ Created init.sql"
        fi
    fi
    
    echo ""
fi

echo "✅ All checks passed!"
echo ""
echo "🚀 Ready to build! Run one of these commands:"
echo ""
echo "  docker-compose up --build          # Build and start"
echo "  docker-compose up --build -d       # Build and start in background"
echo ""
echo "📝 First time setup will take 3-5 minutes"
echo "🌐 Access the app at: http://localhost:3000"
echo ""

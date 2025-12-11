#!/bin/bash

# Advanced Q&A Generator - Deployment Script
# This script will deploy the latest version to Fly.io

set -e  # Exit on error

echo "============================================"
echo "  Advanced Q&A Generator Deployment"
echo "============================================"
echo ""

# Check current directory
if [ ! -f "fly.toml" ]; then
    echo "❌ Error: fly.toml not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ Error: flyctl is not installed"
    echo "Please install flyctl first:"
    echo "  curl -L https://fly.io/install.sh | sh"
    echo "  export PATH=\"\$HOME/.fly/bin:\$PATH\""
    exit 1
fi

# Check authentication
echo "📋 Checking Fly.io authentication..."
if ! flyctl auth whoami &> /dev/null; then
    echo "❌ Error: Not authenticated with Fly.io"
    echo "Please run: flyctl auth login"
    exit 1
fi

echo "✅ Authenticated"
echo ""

# Pull latest changes
echo "📥 Pulling latest changes from GitHub..."
git pull origin main
echo ""

# Build the application
echo "🔨 Building application..."
npm run build
echo ""

# Deploy to Fly.io
echo "🚀 Deploying to Fly.io..."
echo ""
echo "⚠️  IMPORTANT: Using --no-cache to ensure fresh deployment"
echo ""

flyctl deploy --no-cache

echo ""
echo "============================================"
echo "  ✅ Deployment Complete!"
echo "============================================"
echo ""
echo "🔍 Next steps:"
echo "1. Check deployment status: flyctl status"
echo "2. View logs: flyctl logs"
echo "3. Test the application: https://advanced-qa-generator.fly.dev"
echo ""
echo "📝 Verify the fix:"
echo "   Test URL: https://www.neweracap.jp/products/14668175"
echo "   Generate 40 Q&As and check that ALL are about the product"
echo "   (NOT about store inventory)"
echo ""

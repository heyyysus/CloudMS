#!/bin/bash

set -e

echo "Starting deployment..."

# Navigate to app directory
cd "$(dirname "$0")/.." || exit 1

# Pull latest changes from git
echo "Pulling latest changes..."
git pull origin main

# Build and start containers
echo "Building and starting containers..."
docker compose up --build -d

# Remove unused images and containers to free up space
echo "Cleaning up unused Docker resources..."
docker system prune -f

echo "Deployment complete!"
echo ""
echo "Container status:"
docker compose ps
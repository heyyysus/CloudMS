#!/bin/bash

set -e

echo "Starting deployment..."

# Navigate to app directory
cd "$(dirname "$0")/.." || exit 1

# Pull latest changes from git
echo "Pulling latest changes..."
git pull origin main

# Building while the other services are running starves the TypeScript build
# of memory on this host and hangs the deploy, so stop everything first.
# `down` keeps named volumes: postgres_data survives, and must never be
# dropped by adding -v here.
echo "Stopping containers..."
docker compose down

echo "Building app image..."
docker compose build app

echo "Starting containers..."
docker compose up -d

# Remove unused images and containers to free up space
echo "Cleaning up unused Docker resources..."
docker system prune -f

echo "Deployment complete!"
echo ""
echo "Container status:"
docker compose ps
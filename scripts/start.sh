#!/bin/bash

set -e

echo "Starting deployment..."

# Navigate to app directory
cd "$(dirname "$0")/.." || exit 1

# Pull latest changes from git
echo "Pulling latest changes..."
git pull origin main

echo "Pulling app image..."
docker compose pull app

# Never add `down -v` to this script: postgres_data is a named volume holding
# the production database.
echo "Starting containers..."
docker compose up -d

# The app runs its own migrations at boot (see backend/Dockerfile CMD) and
# only listens once they have all succeeded, so "is it answering?" is also
# "did the migrations land?". Without this the deploy reports success while
# `restart: always` quietly cycles a container that never gets that far.
echo "Waiting for the app to come up..."
for attempt in $(seq 1 30); do
    if docker compose exec -T app node -e \
        "fetch('http://localhost:8000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
        >/dev/null 2>&1; then
        echo "App is healthy (after $(( (attempt - 1) * 10 ))s)."
        break
    fi
    if [ "$attempt" -eq 30 ]; then
        echo "App did not become healthy within 5 minutes. Last 250 lines:"
        docker compose logs --tail 250 app
        echo ""
        echo "Deployment FAILED - the previous image is no longer running either."
        exit 1
    fi
    sleep 10
done

# `up -d` leaves nginx alone when its service definition is unchanged, so a
# pulled nginx/conf.d edit would otherwise sit unread until the next restart.
echo "Reloading nginx config..."
docker compose restart nginx

# Remove unused images and containers to free up space
echo "Cleaning up unused Docker resources..."
docker system prune -f

echo "Deployment complete!"
echo ""
echo "Container status:"
docker compose ps
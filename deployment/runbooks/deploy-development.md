# Deploy UNAGENCY (dev compose)

1. Copy env defaults under `deployment/environments/development`.
2. `bash deployment/scripts/deploy-dev.sh`
3. Open `http://localhost:8080/health`
4. Confirm migrate service exited 0: `docker compose -f deployment/docker-compose/docker-compose.development.yml ps`

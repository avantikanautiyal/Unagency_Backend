# Deployment Guide

## Quick start (development)

```bash
bash deployment/scripts/deploy-dev.sh
# API via nginx: http://localhost:8080
```

## Production (Kubernetes + Helm)

```bash
bash deployment/scripts/build-images.sh 1.0.0
bash deployment/scripts/deploy-helm.sh
```

## Environments

`deployment/environments/{development,staging,production}/`

## Success criterion

A customer can deploy the complete platform with Compose (dev) or Helm (prod) **without backend code changes**.

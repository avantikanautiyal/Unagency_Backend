# Docker Guide

## Base image

`deployment/docker/Dockerfile` — multi-stage Node 20 build of existing `tsc` output.

## Role images

`Dockerfile.api|business|intelligence|worker|background|migration` set `SERVICE_ROLE`.

## Build

```bash
bash deployment/scripts/build-images.sh 1.0.0
```

## Hardening

Non-root user, `tini`, healthcheck, ca-certificates only.

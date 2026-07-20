# CI/CD Guide

Workflow: `deployment/ci/unagency-platform.yml` (mirrored to `.github/workflows/`).

Pipeline: lint/compile → platform tests → deployment validation → security checks → container build → migrate/deploy → rollback on failure.

Manual dispatch supports environment selection (development/staging/production).

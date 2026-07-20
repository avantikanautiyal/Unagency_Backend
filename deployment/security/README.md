# Security hardening checklist

- Non-root container user (`unagency`)
- `tini` as PID 1
- Drop Linux capabilities in K8s
- TLS 1.2+ at Nginx / Ingress
- HSTS, nosniff, DENY frame, CSP headers
- Secrets via K8s Secret / env files (never commit production passwords)
- `npm audit` in CI
- Image config checks in CI
- Certificate rotation: replace `deployment/certificates/{env}/tls.crt|tls.key` and reload nginx

## Image scanning

```bash
# Example (tools optional)
trivy image unagency/platform:1.0.0 || true
```

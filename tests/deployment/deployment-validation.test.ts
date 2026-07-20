const path = require("path");
const { exists, read } = require("../../deployment/testing/inventory");

describe("Production Deployment & DevOps Platform", () => {
  const requiredDirs = [
    "deployment/docker",
    "deployment/docker-compose",
    "deployment/kubernetes",
    "deployment/helm/unagency",
    "deployment/nginx",
    "deployment/environments",
    "deployment/ci",
    "deployment/cd",
    "deployment/releases",
    "deployment/rollback",
    "deployment/migrations",
    "deployment/monitoring",
    "deployment/backups",
    "deployment/disaster-recovery",
    "deployment/security",
    "deployment/certificates",
    "deployment/scripts",
    "deployment/docs",
    "deployment/runbooks",
  ];

  it("has required deployment directory tree", () => {
    for (const d of requiredDirs) {
      expect(exists(d)).toBe(true);
    }
  });

  it("provides Dockerfiles for all service roles", () => {
    for (const role of [
      "Dockerfile",
      "Dockerfile.api",
      "Dockerfile.business",
      "Dockerfile.intelligence",
      "Dockerfile.worker",
      "Dockerfile.background",
      "Dockerfile.migration",
    ]) {
      expect(exists(`deployment/docker/${role}`)).toBe(true);
    }
    const df = read("deployment/docker/Dockerfile");
    expect(df).toContain("USER unagency");
    expect(df).toContain("tini");
  });

  it("provides compose files for development, staging, production", () => {
    expect(exists("deployment/docker-compose/docker-compose.development.yml")).toBe(true);
    expect(exists("deployment/docker-compose/docker-compose.staging.yml")).toBe(true);
    expect(exists("deployment/docker-compose/docker-compose.production.yml")).toBe(true);
    const dev = read("deployment/docker-compose/docker-compose.development.yml");
    expect(dev).toContain("postgres:");
    expect(dev).toContain("mongodb:");
    expect(dev).toContain("redis:");
    expect(dev).toContain("nginx:");
    expect(dev).toContain("WORKER".toLowerCase() === "worker" ? "worker:" : "worker:");
  });

  it("provides kubernetes base manifests and overlays", () => {
    expect(exists("deployment/kubernetes/base/kustomization.yaml")).toBe(true);
    expect(exists("deployment/kubernetes/base/api-deployment.yaml")).toBe(true);
    expect(exists("deployment/kubernetes/base/statefulsets.yaml")).toBe(true);
    expect(exists("deployment/kubernetes/base/ingress.yaml")).toBe(true);
    expect(exists("deployment/kubernetes/base/hpa.yaml")).toBe(true);
    expect(exists("deployment/kubernetes/overlays/production/kustomization.yaml")).toBe(true);
  });

  it("provides helm chart with Chart.yaml and templates", () => {
    expect(exists("deployment/helm/unagency/Chart.yaml")).toBe(true);
    expect(exists("deployment/helm/unagency/values.yaml")).toBe(true);
    expect(exists("deployment/helm/unagency/templates/api.yaml")).toBe(true);
    const chart = read("deployment/helm/unagency/Chart.yaml");
    expect(chart).toContain("appVersion: \"1.0.0\"");
  });

  it("configures nginx for TLS, streaming, and rate limits", () => {
    const prod = read("deployment/nginx/nginx.production.conf");
    expect(prod).toContain("ssl_certificate");
    expect(prod).toContain("limit_req_zone");
    expect(prod).toContain("proxy_buffering off");
    expect(prod).toContain("Strict-Transport-Security");
  });

  it("includes CI/CD workflow definition", () => {
    expect(exists("deployment/ci/unagency-platform.yml")).toBe(true);
    expect(exists(".github/workflows/unagency-platform.yml")).toBe(true);
    const ci = read("deployment/ci/unagency-platform.yml");
    expect(ci).toContain("Deployment validation tests");
    expect(ci).toContain("docker build");
  });

  it("includes ops scripts for build, deploy, backup, rollback", () => {
    expect(exists("deployment/scripts/build-images.sh")).toBe(true);
    expect(exists("deployment/scripts/deploy-dev.sh")).toBe(true);
    expect(exists("deployment/scripts/backup.sh")).toBe(true);
    expect(exists("deployment/rollback/rollback.sh")).toBe(true);
    expect(exists("deployment/scripts/run-migrations.js")).toBe(true);
  });

  it("ships release 1.0.0 record for frozen backend", () => {
    const rel = read("deployment/releases/1.0.0.yaml");
    expect(rel).toContain("1.0.0");
    expect(rel).toContain("frozen");
  });
});

/**
 * SSRF protection for provider temporary URL ingestion.
 * Hostname + IP literal checks; optional DNS resolution for rebind safety.
 */

import dns from "node:dns/promises";
import { failure, success, type Result } from "../../core/result";
import { ValidationError } from "../../core/errors";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "metadata",
]);

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

export function isBlockedIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") return true;
  if (h.startsWith("fe80:")) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("::ffff:")) {
    const v4 = h.slice("::ffff:".length);
    if (/^\d+\.\d+\.\d+\.\d+$/.test(v4)) return isPrivateIpv4(v4);
  }
  return false;
}

export function isBlockedAddress(address: string): boolean {
  const bare = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(bare)) return true;
  if (bare.includes(":")) return isBlockedIpv6(bare);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare)) return isPrivateIpv4(bare);
  return false;
}

function validateHostname(host: string): Result<void> {
  const lower = host.toLowerCase();
  const bareHost = lower.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(lower) || BLOCKED_HOSTNAMES.has(bareHost)) {
    return failure(new ValidationError("Ingestion URL host is not allowed"));
  }
  if (lower.endsWith(".localhost") || lower.endsWith(".local")) {
    return failure(new ValidationError("Ingestion URL host is not allowed"));
  }
  if (lower.includes(":") || bareHost.includes(":")) {
    if (isBlockedIpv6(lower) || isBlockedIpv6(bareHost)) {
      return failure(new ValidationError("Ingestion URL resolves to blocked IPv6 range"));
    }
    return success(undefined);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    if (isPrivateIpv4(lower)) {
      return failure(new ValidationError("Ingestion URL resolves to private IPv4 range"));
    }
  }
  return success(undefined);
}

export interface ValidateIngestionUrlOptions {
  readonly httpsOnly?: boolean;
  readonly resolveDns?: boolean;
}

export function validateIngestionUrl(
  url: string,
  options: ValidateIngestionUrlOptions = {}
): Result<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return failure(new ValidationError("Invalid ingestion URL"));
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return failure(new ValidationError("Ingestion URL must be http(s)"));
  }
  if (options.httpsOnly && parsed.protocol !== "https:") {
    return failure(new ValidationError("Production ingestion URL must use HTTPS"));
  }

  const hostCheck = validateHostname(parsed.hostname);
  if (!hostCheck.ok) return hostCheck;

  return success(parsed);
}

export async function validateIngestionUrlWithDns(
  url: string,
  options: ValidateIngestionUrlOptions = {}
): Promise<Result<URL>> {
  const basic = validateIngestionUrl(url, options);
  if (!basic.ok) return basic;

  if (options.resolveDns === false) return basic;

  const host = basic.value.hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    return basic;
  }

  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    for (const rec of records) {
      if (isBlockedAddress(rec.address)) {
        return failure(
          new ValidationError("Ingestion URL DNS resolves to blocked address range")
        );
      }
    }
  } catch {
    return failure(new ValidationError("Ingestion URL DNS resolution failed"));
  }

  return basic;
}

export function validateRedirectUrl(
  from: string,
  to: string,
  options: ValidateIngestionUrlOptions = {}
): Result<URL> {
  const base = validateIngestionUrl(from, options);
  if (!base.ok) return base;
  return validateIngestionUrl(to, options);
}

export async function validateRedirectUrlWithDns(
  from: string,
  to: string,
  options: ValidateIngestionUrlOptions = {}
): Promise<Result<URL>> {
  const base = await validateIngestionUrlWithDns(from, options);
  if (!base.ok) return base;
  return validateIngestionUrlWithDns(to, options);
}

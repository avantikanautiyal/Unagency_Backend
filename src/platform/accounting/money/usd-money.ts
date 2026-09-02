/**
 * Decimal-safe USD money arithmetic using micro-dollars (6 decimal places).
 */

const SCALE = BigInt(1000000);
const ZERO = BigInt(0);
const ONE_MILLION = BigInt(1000000);

export function parseUsdToMicro(amount: string | number | null | undefined): bigint | null {
  if (amount == null) return null;
  const raw = String(amount).trim();
  if (!raw || raw === "null" || raw === "undefined") return null;
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;

  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [whole, frac = ""] = normalized.split(".");
  const paddedFrac = (frac + "000000").slice(0, 6);
  const micro =
    BigInt(whole || "0") * SCALE + BigInt(paddedFrac.padStart(6, "0").slice(0, 6));
  return negative ? -micro : micro;
}

export function microToUsdString(micro: bigint): string {
  const negative = micro < ZERO;
  const abs = negative ? -micro : micro;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  const value = fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
  return negative ? `-${value}` : value;
}

export function addUsd(a: string | null, b: string | null): string | null {
  const aMicro = parseUsdToMicro(a);
  const bMicro = parseUsdToMicro(b);
  if (aMicro == null && bMicro == null) return null;
  return microToUsdString((aMicro ?? ZERO) + (bMicro ?? ZERO));
}

export function multiplyUsdRate(quantity: number, pricePerUnit: string): string | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const priceMicro = parseUsdToMicro(pricePerUnit);
  if (priceMicro == null) return null;
  const qtyMicro = BigInt(Math.round(quantity * 1000000));
  const result = (qtyMicro * priceMicro) / SCALE;
  return microToUsdString(result);
}

export function divideTokensCost(tokens: number, pricePer1M: string): string | null {
  if (!Number.isFinite(tokens) || tokens < 0) return null;
  const priceMicro = parseUsdToMicro(pricePer1M);
  if (priceMicro == null) return null;
  const tokenMicro = BigInt(Math.round(tokens * 1000000));
  const result = (tokenMicro * priceMicro) / (ONE_MILLION * SCALE);
  return microToUsdString(result);
}

export function roundUsd(amount: string | null): string | null {
  const micro = parseUsdToMicro(amount);
  if (micro == null) return null;
  return microToUsdString(micro);
}

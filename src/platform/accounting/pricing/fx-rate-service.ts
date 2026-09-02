/**
 * Versioned FX conversion for presentation currencies.
 * Canonical accounting currency is USD.
 */

import { REPORTING_CURRENCY } from "../contracts/enums";

export interface FxRateRecord {
  readonly version: string;
  readonly baseCurrency: string;
  readonly quoteCurrency: string;
  readonly rate: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export interface FxConversionResult {
  readonly converted: boolean;
  readonly amountUsd: string | null;
  readonly originalCurrency: string;
  readonly originalAmount: string | null;
  readonly exchangeRate: string | null;
  readonly exchangeRateVersion: string | null;
  readonly exchangeRateTimestamp: string | null;
  readonly pendingConversion: boolean;
}

export interface IFxRateService {
  convertToUsd(
    amount: string | null,
    currency: string,
    asOf: string
  ): FxConversionResult;
}

export class InMemoryFxRateService implements IFxRateService {
  constructor(private readonly rates: readonly FxRateRecord[] = []) {}

  convertToUsd(
    amount: string | null,
    currency: string,
    asOf: string
  ): FxConversionResult {
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!amount) {
      return {
        converted: false,
        amountUsd: null,
        originalCurrency: normalizedCurrency,
        originalAmount: null,
        exchangeRate: null,
        exchangeRateVersion: null,
        exchangeRateTimestamp: null,
        pendingConversion: false,
      };
    }

    if (normalizedCurrency === REPORTING_CURRENCY) {
      return {
        converted: true,
        amountUsd: amount,
        originalCurrency: normalizedCurrency,
        originalAmount: amount,
        exchangeRate: "1",
        exchangeRateVersion: "usd-identity",
        exchangeRateTimestamp: asOf,
        pendingConversion: false,
      };
    }

    const asOfMs = Date.parse(asOf);
    const match = this.rates
      .filter((rate) => {
        if (rate.quoteCurrency !== normalizedCurrency || rate.baseCurrency !== REPORTING_CURRENCY) {
          return false;
        }
        const fromMs = Date.parse(rate.effectiveFrom);
        const toMs = rate.effectiveTo ? Date.parse(rate.effectiveTo) : Number.POSITIVE_INFINITY;
        return asOfMs >= fromMs && asOfMs < toMs;
      })
      .sort((a, b) => Date.parse(b.effectiveFrom) - Date.parse(a.effectiveFrom))[0];

    if (!match) {
      return {
        converted: false,
        amountUsd: null,
        originalCurrency: normalizedCurrency,
        originalAmount: amount,
        exchangeRate: null,
        exchangeRateVersion: null,
        exchangeRateTimestamp: null,
        pendingConversion: true,
      };
    }

    const numericAmount = Number(amount);
    const numericRate = Number(match.rate);
    if (!Number.isFinite(numericAmount) || !Number.isFinite(numericRate) || numericRate <= 0) {
      return {
        converted: false,
        amountUsd: null,
        originalCurrency: normalizedCurrency,
        originalAmount: amount,
        exchangeRate: null,
        exchangeRateVersion: null,
        exchangeRateTimestamp: null,
        pendingConversion: true,
      };
    }

    const amountUsd = (numericAmount / numericRate).toFixed(6).replace(/\.?0+$/, "");
    return {
      converted: true,
      amountUsd,
      originalCurrency: normalizedCurrency,
      originalAmount: amount,
      exchangeRate: match.rate,
      exchangeRateVersion: match.version,
      exchangeRateTimestamp: asOf,
      pendingConversion: false,
    };
  }
}

let defaultFxService: InMemoryFxRateService | null = null;

export function getDefaultFxRateService(): InMemoryFxRateService {
  if (!defaultFxService) {
    defaultFxService = new InMemoryFxRateService();
  }
  return defaultFxService;
}

export function setDefaultFxRateService(service: InMemoryFxRateService): void {
  defaultFxService = service;
}

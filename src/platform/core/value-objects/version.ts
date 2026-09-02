/**
 * Semantic version value object for platform artifacts.
 */

import { ValidationError } from "../errors/intelligence-error";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;

export class Version {
  readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  static create(value: string): Version {
    if (!VERSION_PATTERN.test(value)) {
      throw new ValidationError("Invalid version format", { value });
    }
    return new Version(value);
  }

  toString(): string {
    return this.value;
  }
}

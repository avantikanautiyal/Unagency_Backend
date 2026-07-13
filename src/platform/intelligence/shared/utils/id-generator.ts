import { randomUUID } from "crypto";
import type { IIdGenerator } from "../interfaces/primitives";

export class UuidGenerator implements IIdGenerator {
  generate(prefix?: string): string {
    const id = randomUUID();
    return prefix ? `${prefix}_${id}` : id;
  }
}

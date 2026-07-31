/** @deprecated Import from `../auth/composite-authentication-service` */
export {
  CompositeAuthenticationService,
  createCompositeAuthenticationService,
} from "../auth/composite-authentication-service";

import type { IAuthenticationService } from "../interfaces";
import { CompositeAuthenticationService } from "../auth/composite-authentication-service";
import { InMemoryAuthenticationService } from "./in-memory-authentication-service";

export function unwrapPlatformAuth(
  auth: IAuthenticationService
): InMemoryAuthenticationService | undefined {
  if (auth instanceof CompositeAuthenticationService) {
    return auth.platformAuth;
  }
  if (auth instanceof InMemoryAuthenticationService) {
    return auth;
  }
  return undefined;
}

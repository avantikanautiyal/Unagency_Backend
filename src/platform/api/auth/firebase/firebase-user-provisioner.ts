/**
 * Minimal Firebase → Mongo user provisioning (M10.2).
 * Deterministic on firebaseUid; does not grant org memberships.
 */

import Users, { type IUser } from "../../../../models/users.model";
import type { VerifiedFirebaseIdentity } from "../../../../libs/firebase/verify-id-token";
import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";

export type ProvisionFirebaseUserResult = {
  readonly user: IUser;
  readonly created: boolean;
};

export interface FirebaseUserProvisionerDeps {
  readonly findByFirebaseId?: (uid: string) => Promise<IUser | null>;
  readonly findByEmail?: (email: string) => Promise<IUser | null>;
  readonly createUser?: (data: {
    firebaseId: string;
    email?: string;
    name?: string;
    isVerified?: boolean;
    contact?: string;
  }) => Promise<IUser>;
  readonly relinkFirebaseId?: (
    email: string,
    firebaseId: string
  ) => Promise<void>;
}

/**
 * Resolve-or-create Mongo user for a verified Firebase identity.
 * - Prefer firebaseId match
 * - Else email match → relink firebaseId (legacy RegisterIfNot behaviour)
 * - Else create customer with no organisation
 */
export async function provisionFirebaseUser(
  verified: VerifiedFirebaseIdentity,
  deps: FirebaseUserProvisionerDeps = {}
): Promise<Result<ProvisionFirebaseUserResult>> {
  const firebaseId = verified.uid?.trim();
  if (!firebaseId) {
    return failure(new ValidationError("firebase uid required"));
  }

  const findByFirebaseId =
    deps.findByFirebaseId ??
    ((uid: string) => Users.findOne({ firebaseId: uid }));
  const findByEmail =
    deps.findByEmail ??
    ((email: string) => Users.findOne({ email }));
  const createUser =
    deps.createUser ??
    (async (data) =>
      Users.create({
        firebaseId: data.firebaseId,
        email: data.email,
        name: data.name,
        role: "customer",
        isVerified: data.isVerified ?? false,
        contact: data.contact,
        isActive: true,
      }));
  const relinkFirebaseId =
    deps.relinkFirebaseId ??
    (async (email: string, uid: string) => {
      await Users.updateOne({ email }, { $set: { firebaseId: uid } });
    });

  const existingByUid = await findByFirebaseId(firebaseId);
  if (existingByUid) {
    if (existingByUid.isActive === false) {
      return failure(new ValidationError("user account is inactive"));
    }
    return success({ user: existingByUid, created: false });
  }

  const email = verified.email?.trim().toLowerCase();
  if (email) {
    const existingByEmail = await findByEmail(email);
    if (existingByEmail) {
      if (existingByEmail.isActive === false) {
        return failure(new ValidationError("user account is inactive"));
      }
      if (existingByEmail.firebaseId !== firebaseId) {
        await relinkFirebaseId(email, firebaseId);
        existingByEmail.firebaseId = firebaseId;
      }
      return success({ user: existingByEmail, created: false });
    }
  }

  // Phone-only Firebase identities: require a stable email placeholder forbidden —
  // without email we still create with synthetic email for Mongo required field.
  const createEmail =
    email ||
    (verified.phoneNumber
      ? `phone+${firebaseId.replace(/\W/g, "")}@users.unagency.local`
      : `uid+${firebaseId.replace(/\W/g, "")}@users.unagency.local`);

  try {
    const displayName =
      verified.name?.trim() ||
      (email ? email.split("@")[0] : undefined) ||
      "UNAGENCY User";
    const created = await createUser({
      firebaseId,
      email: createEmail,
      name: displayName,
      isVerified: verified.emailVerified ?? false,
      contact: verified.phoneNumber,
    });
    return success({ user: created, created: true });
  } catch (err) {
    // Concurrent first-login race: re-read by firebaseId
    const raced = await findByFirebaseId(firebaseId);
    if (raced) {
      return success({ user: raced, created: false });
    }
    const message = err instanceof Error ? err.message : "provision failed";
    return failure(new ValidationError(message));
  }
}

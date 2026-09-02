/**
 * Resolves legacy Mongo user + organisation from verified Firebase UID.
 * Server-side only — never trusts client-supplied tenant identifiers.
 */

import type { Types } from "mongoose";
import Users, { type IUser } from "../../../../models/users.model";
import Organizations from "../../../../models/organization.model";
import Teams from "../../../../models/team.model";
import { failure, success, type Result } from "../../../core/result";
import { ValidationError } from "../../../core/errors";
import type { VerifiedFirebaseIdentity } from "../../../../libs/firebase/verify-id-token";
import type { LegacyRoleMappingContext } from "./role-permission-mapper";

export interface ResolvedLegacyIdentity {
  readonly userId: string;
  readonly firebaseUid: string;
  readonly email?: string;
  readonly legacyRole: string;
  readonly isActive: boolean;
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly roleContext: LegacyRoleMappingContext;
}

export interface LegacyUserIdentityResolverDeps {
  readonly findUserByFirebaseId?: (
    firebaseUid: string
  ) => Promise<IUser | null>;
  readonly findOrganizationByOwner?: (
    ownerId: Types.ObjectId
  ) => Promise<{ _id: Types.ObjectId; companyName: string } | null>;
  readonly findAcceptedTeamMembership?: (
    userId: Types.ObjectId
  ) => Promise<{
    Organization: Types.ObjectId;
    role: "owner" | "member";
  } | null>;
}

export class LegacyUserIdentityResolver {
  constructor(private readonly deps: LegacyUserIdentityResolverDeps = {}) {}

  async resolve(
    verified: VerifiedFirebaseIdentity
  ): Promise<Result<ResolvedLegacyIdentity>> {
    const mongoUser = this.deps.findUserByFirebaseId
      ? await this.deps.findUserByFirebaseId(verified.uid)
      : await Users.findOne({ firebaseId: verified.uid });

    if (!mongoUser) {
      return failure(new ValidationError("user not found"));
    }

    if (mongoUser.isActive === false) {
      return failure(new ValidationError("user account is inactive"));
    }

    const roleContext: {
      isOrganizationOwner?: boolean;
      teamRole?: "owner" | "member";
    } = {};
    let organizationId: string | undefined;
    let organizationName: string | undefined;

    const ownedOrg = this.deps.findOrganizationByOwner
      ? await this.deps.findOrganizationByOwner(mongoUser._id)
      : await Organizations.findOne({ owner: mongoUser._id });

    if (ownedOrg) {
      organizationId = ownedOrg._id.toString();
      organizationName = ownedOrg.companyName;
      roleContext.isOrganizationOwner = true;
    } else {
      const membership = this.deps.findAcceptedTeamMembership
        ? await this.deps.findAcceptedTeamMembership(mongoUser._id)
        : await Teams.findOne({
            userId: mongoUser._id,
            invitationStatus: "accepted",
          });

      if (membership) {
        organizationId = membership.Organization.toString();
        roleContext.teamRole = membership.role;
        const org = await Organizations.findById(membership.Organization);
        organizationName = org?.companyName;
      }
    }

    return success({
      userId: mongoUser._id.toString(),
      firebaseUid: verified.uid,
      email: mongoUser.email ?? verified.email,
      legacyRole: mongoUser.role,
      isActive: mongoUser.isActive,
      organizationId,
      organizationName,
      roleContext,
    });
  }
}

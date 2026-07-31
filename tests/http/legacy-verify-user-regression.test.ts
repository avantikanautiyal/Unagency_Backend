/**
 * Legacy VerifyUserHandler regression — shared Firebase verification primitive.
 */

import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { VerifyUserHandler } from "../../src/middlewares/verifyUser.middleware";
import type { RequestUser } from "../../src/types/user";

jest.mock("../../src/libs/firebase/verify-id-token", () => ({
  verifyFirebaseIdToken: jest.fn(),
}));

jest.mock("../../src/models/users.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("../../src/models/organization.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("../../src/models/staff.model", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import { verifyFirebaseIdToken } from "../../src/libs/firebase/verify-id-token";
import Users from "../../src/models/users.model";
import Organizations from "../../src/models/organization.model";

describe("Legacy VerifyUserHandler regression", () => {
  const userId = new Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("still authenticates via shared verifyFirebaseIdToken primitive", async () => {
    (verifyFirebaseIdToken as jest.Mock).mockResolvedValue({
      uid: "legacy_uid",
      emailVerified: true,
    });
    (Users.findOne as jest.Mock).mockResolvedValue({
      _id: userId,
      firebaseId: "legacy_uid",
      role: "customer",
      email: "legacy@example.com",
      toObject: () => ({
        _id: userId,
        firebaseId: "legacy_uid",
        role: "customer",
        email: "legacy@example.com",
      }),
    });
    (Organizations.findOne as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      companyName: "Legacy Org",
    });

    const req = {
      headers: { authorization: "Bearer legacy_token" },
    } as unknown as RequestUser;
    const next = jest.fn();

    await VerifyUserHandler(req, {} as Response, next as NextFunction);

    expect(verifyFirebaseIdToken).toHaveBeenCalledWith("legacy_token");
    expect(req.user?.userId).toBe(userId.toString());
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 401 when token is missing", async () => {
    const req = { headers: {} } as unknown as RequestUser;
    const next = jest.fn();

    await VerifyUserHandler(req, {} as Response, next as NextFunction);

    expect(next).toHaveBeenCalled();
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });
});

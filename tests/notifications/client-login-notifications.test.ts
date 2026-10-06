jest.mock("../../src/notifications/client-notification-service", () => ({
  dispatchClientNotification: jest.fn().mockResolvedValue({}),
}));
jest.mock("../../src/models/users.model", () => ({
  __esModule: true,
  default: { findOneAndUpdate: jest.fn() },
}));

import mongoose from "mongoose";
import Users from "../../src/models/users.model";
import { dispatchClientNotification as dispatch } from "../../src/notifications/client-notification-service";
import { recordClientLogin } from "../../src/notifications/client-login-notifications";

const dispatchClientNotification = dispatch as jest.Mock;
const findOneAndUpdate = Users.findOneAndUpdate as jest.Mock;
const user = { _id: new mongoose.Types.ObjectId(), role: "customer", name: "Avantika" };

function previousUser(value: Record<string, unknown> | null) {
  findOneAndUpdate.mockReturnValue({ lean: () => Promise.resolve(value) });
}

describe("recordClientLogin", () => {
  beforeEach(() => {
    dispatchClientNotification.mockClear();
    findOneAndUpdate.mockClear();
  });

  it("sends the provider-specific returning login once per sign-in", async () => {
    previousUser({ lastLoginAt: new Date(0), createdAt: new Date(0), name: "Avantika" });
    await recordClientLogin({ user, authTime: 1_800_000_000, signInProvider: "google.com" });
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "GOOGLE_LOGIN",
        variables: { Name: "Avantika" },
        dedupeKey: "login:1800000000",
      })
    );
  });

  it("defaults to email login and treats old accounts without history as returning", async () => {
    previousUser({ createdAt: new Date(0), name: "Avantika" });
    await recordClientLogin({ user, authTime: 1_800_000_000, signInProvider: "password" });
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "EMAIL_LOGIN" })
    );
  });

  it("welcomes brand-new accounts instead", async () => {
    previousUser({ createdAt: new Date(), name: "Avantika" });
    await recordClientLogin({ user, authTime: 1_800_000_000, signInProvider: "password" });
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: "FIRST_LOGIN", dedupeKey: "first-login" })
    );
  });

  it("alerts on a sign-in from a device the account has not used before", async () => {
    previousUser({
      lastLoginAt: new Date(0),
      createdAt: new Date(0),
      knownDevices: ["Chrome on macOS"],
    });
    await recordClientLogin({
      user,
      authTime: 1_800_000_000,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/120.0",
    });
    expect(dispatchClientNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "NEW_DEVICE_LOGIN",
        variables: { Device: "Firefox on Windows" },
      })
    );
  });

  it("does nothing for token refreshes, staff, or tokens without auth_time", async () => {
    previousUser(null);
    await recordClientLogin({ user, authTime: 1_800_000_000 });
    await recordClientLogin({ user: { ...user, role: "servicing" }, authTime: 1_800_000_000 });
    await recordClientLogin({ user });
    expect(dispatchClientNotification).not.toHaveBeenCalled();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
  });
});

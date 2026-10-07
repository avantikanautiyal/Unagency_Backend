import mongoose from "mongoose";

const firebaseAuth = {
  updateUser: jest.fn(async () => undefined),
  deleteUser: jest.fn(async () => undefined),
};
jest.mock("../../../src/libs/firebase", () => ({
  __esModule: true,
  default: { auth: () => firebaseAuth },
}));

const razorpayCancel = jest.fn();
jest.mock("../../../src/utils/razorpayInstance", () => ({
  __esModule: true,
  default: { subscriptions: { cancel: (...args: unknown[]) => razorpayCancel(...args) } },
}));

const userStore = new Map<string, any>();
jest.mock("../../../src/models/users.model", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(async (id: string) => userStore.get(String(id)) ?? null),
    deleteOne: jest.fn(async ({ _id }: { _id: unknown }) => {
      userStore.delete(String(_id));
    }),
  },
}));

function deleteManyModel() {
  return {
    __esModule: true,
    default: {
      deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
      updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    },
  };
}
jest.mock("../../../src/models/team.model", () => deleteManyModel());
jest.mock("../../../src/models/brand.model", () => deleteManyModel());
jest.mock("../../../src/models/mediaFile.model", () => deleteManyModel());
jest.mock("../../../src/models/projects.model", () => deleteManyModel());
jest.mock("../../../src/models/requestProject.model", () => deleteManyModel());
jest.mock("../../../src/models/notification.model", () => deleteManyModel());
jest.mock("../../../src/models/userPreferences.model", () => deleteManyModel());
jest.mock("../../../src/models/savedRoute.model", () => deleteManyModel());
jest.mock("../../../src/models/searchRecent.model", () => deleteManyModel());

const ownedOrgs: Array<{ _id: mongoose.Types.ObjectId }> = [];
jest.mock("../../../src/models/organization.model", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: () => ({ lean: async () => ownedOrgs }) })),
    deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
  },
}));

const subscriptions: any[] = [];
jest.mock("../../../src/models/subscription.model", () => ({
  __esModule: true,
  default: { find: jest.fn(async () => subscriptions) },
}));

import { accountService } from "../../../src/services/account-service";
import Users from "../../../src/models/users.model";
import Brands from "../../../src/models/brand.model";
import Organizations from "../../../src/models/organization.model";

function seedUser(extra: Record<string, unknown> = {}) {
  const id = new mongoose.Types.ObjectId();
  const doc: any = {
    _id: id,
    firebaseId: "fb-uid",
    name: "Avantika Nautiyal",
    email: "a@example.com",
    contact: "",
    bio: "",
    ...extra,
    set(key: string, value: unknown) {
      this[key] = value;
    },
    save: jest.fn(async function (this: any) {
      return this;
    }),
  };
  userStore.set(String(id), doc);
  return doc;
}

beforeEach(() => {
  userStore.clear();
  ownedOrgs.length = 0;
  subscriptions.length = 0;
  jest.clearAllMocks();
});

describe("AccountService.updateProfile", () => {
  it("saves name, phone, bio and photo, and syncs the Firebase display name", async () => {
    const user = seedUser();
    const image = "data:image/jpeg;base64,/9j/AAAA";
    const dto = await accountService.updateProfile(String(user._id), {
      name: "  Avantika   N ",
      phone: "+91 98765 43210",
      bio: "Hello",
      image,
    });
    expect(dto).toMatchObject({
      name: "Avantika N",
      phone: "+91 98765 43210",
      bio: "Hello",
      image,
    });
    expect(firebaseAuth.updateUser).toHaveBeenCalledWith("fb-uid", { displayName: "Avantika N" });
    expect(user.save).toHaveBeenCalled();
  });

  it("removes the photo when image is null", async () => {
    const user = seedUser({ image: "data:image/png;base64,AAAA" });
    const dto = await accountService.updateProfile(String(user._id), { image: null });
    expect(dto.image).toBeNull();
  });

  it("rejects invalid input", async () => {
    const user = seedUser();
    const id = String(user._id);
    await expect(accountService.updateProfile(id, { name: "  " })).rejects.toMatchObject({ statusCode: 400 });
    await expect(accountService.updateProfile(id, { phone: "abc" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(accountService.updateProfile(id, { bio: "x".repeat(161) })).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      accountService.updateProfile(id, { image: "https://evil.example/x.svg" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("AccountService.deleteAccount", () => {
  it("cancels live subscriptions, removes owned data, the Firebase login and the user", async () => {
    const user = seedUser();
    ownedOrgs.push({ _id: new mongoose.Types.ObjectId() });
    const liveSub = { subscriptionId: "sub_1", status: "active", save: jest.fn() };
    const endedSub = { subscriptionId: "sub_0", status: "cancelled", save: jest.fn() };
    subscriptions.push(liveSub, endedSub);
    razorpayCancel.mockResolvedValue({ status: "cancelled" });

    await expect(accountService.deleteAccount(String(user._id))).resolves.toEqual({ deleted: true });

    expect(razorpayCancel).toHaveBeenCalledTimes(1);
    expect(razorpayCancel).toHaveBeenCalledWith("sub_1", false);
    expect(liveSub.save).toHaveBeenCalled();
    expect(Brands.deleteMany).toHaveBeenCalled();
    expect(Organizations.deleteMany).toHaveBeenCalled();
    expect(firebaseAuth.deleteUser).toHaveBeenCalledWith("fb-uid");
    expect(Users.deleteOne).toHaveBeenCalled();
    expect(userStore.size).toBe(0);
  });

  it("keeps the account when the subscription cannot be cancelled", async () => {
    const user = seedUser();
    subscriptions.push({ subscriptionId: "sub_1", status: "active", save: jest.fn() });
    razorpayCancel.mockRejectedValue(new Error("gateway down"));

    await expect(accountService.deleteAccount(String(user._id))).rejects.toMatchObject({ statusCode: 502 });
    expect(firebaseAuth.deleteUser).not.toHaveBeenCalled();
    expect(Users.deleteOne).not.toHaveBeenCalled();
    expect(userStore.size).toBe(1);
  });
});

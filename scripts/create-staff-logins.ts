/**
 * Create (or repair) the staff portal logins — idempotent.
 *
 * For each account: sets the Firebase password, sets the correct role on the
 * user record (also when the account was auto-created as a customer by an
 * earlier login attempt), and gives CS / resource accounts their staff record.
 * Touches nothing else.
 *
 * Run:  STAFF_PASSWORD='<password>' npm run seed:staff-logins
 */
import { config } from "../src/config/dot.env";
config();

import mongoose from "mongoose";
import firebaseAdmin from "../src/libs/firebase";
import Users, { IUser } from "../src/models/users.model";
import Staff from "../src/models/staff.model";
import { createUserUpster } from "../src/services/Chatstream";

type StaffLogin = {
  email: string;
  name: string;
  role: IUser["role"];
  /** CS and resource accounts need a staff record; admins do not. */
  staff?: { designation: string; specialization: string[] };
};

const LOGINS: StaffLogin[] = [
  { email: "cs@unagency.test", name: "CS Lead", role: "servicing", staff: { designation: "Relationship Manager", specialization: ["client servicing"] } },
  { email: "cs1@unagency.test", name: "CS Associate", role: "servicing", staff: { designation: "CS Associate", specialization: ["client servicing"] } },
  { email: "resource@unagency.test", name: "Designer", role: "resource", staff: { designation: "Designer", specialization: ["design"] } },
  { email: "resource1@unagency.test", name: "Designer — Brand", role: "resource", staff: { designation: "Brand Designer", specialization: ["branding"] } },
  { email: "admin@unagency.test", name: "Admin", role: "admin" },
  { email: "superadmin@unagency.test", name: "Super Admin", role: "superadmin" },
];

async function ensureFirebaseUser(email: string, password: string, name: string): Promise<string> {
  try {
    const existing = await firebaseAdmin.auth().getUserByEmail(email);
    await firebaseAdmin.auth().updateUser(existing.uid, {
      password,
      displayName: name,
      emailVerified: true,
    });
    return existing.uid;
  } catch (error: any) {
    if (error?.code === "auth/user-not-found") {
      const created = await firebaseAdmin.auth().createUser({
        email,
        password,
        displayName: name,
        emailVerified: true,
      });
      return created.uid;
    }
    throw error;
  }
}

async function main() {
  const password = process.env.STAFF_PASSWORD?.trim();
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(
      "Set STAFF_PASSWORD to the password for these logins (8+ characters, letters and numbers)."
    );
  }
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set");
  await mongoose.connect(uri);

  for (const login of LOGINS) {
    const firebaseId = await ensureFirebaseUser(login.email, password, login.name);
    const existing = await Users.findOne({ email: login.email });
    const payload = {
      firebaseId,
      name: login.name,
      email: login.email,
      role: login.role,
      isVerified: true,
      isActive: true,
    };
    const user = existing
      ? await Users.findByIdAndUpdate(existing._id, { $set: payload }, { new: true })
      : await Users.create({ _id: new mongoose.Types.ObjectId(), contact: "", ...payload });
    if (!user) throw new Error(`Failed to save user ${login.email}`);

    if (login.staff) {
      await Staff.findOneAndUpdate(
        { userId: user._id },
        {
          $set: {
            userId: user._id,
            experience: 3,
            specialization: login.staff.specialization,
            minTaskCapacity: 0,
            maxTaskCapacity: 10,
            availability: true,
            designation: login.staff.designation,
            status: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Chat identity — a failure here does not affect signing in.
    await createUserUpster({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      userRole: user.role,
    }).catch((err: unknown) =>
      console.warn(`  ! chat identity not updated for ${login.email}:`, err instanceof Error ? err.message : err)
    );

    console.log(
      `  ✓ ${login.email} | role: ${login.role} | ${existing ? `updated (was ${existing.role})` : "created"}${login.staff ? " | staff record ok" : ""}`
    );
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit();
  });

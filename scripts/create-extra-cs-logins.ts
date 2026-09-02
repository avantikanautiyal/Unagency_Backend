/**
 * Create additional CS (servicing) portal logins.
 *
 * Run: npm run seed:cs-extra
 */
import { config } from "../src/config/dot.env";
config();

import mongoose from "mongoose";
import firebaseAdmin from "../src/libs/firebase";
import Users from "../src/models/users.model";
import Staff from "../src/models/staff.model";
import { createUserUpster } from "../src/services/Chatstream";
import { DEMO_USERS } from "../src/utils/demoSeed";

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPass123!";

const EXTRA_CS = [
  {
    email: DEMO_USERS.cs2,
    name: "CS Associate",
    designation: "CS Associate",
    experience: 4,
    specialization: ["Branding", "Social Media"],
    minTaskCapacity: 1,
    maxTaskCapacity: 10,
  },
  {
    email: DEMO_USERS.cs3,
    name: "CS Manager",
    designation: "CS Manager",
    experience: 6,
    specialization: ["UI/UX", "Project Management"],
    minTaskCapacity: 2,
    maxTaskCapacity: 12,
  },
  {
    email: DEMO_USERS.cs4,
    name: "CS Coordinator",
    designation: "CS Coordinator",
    experience: 3,
    specialization: ["Presentations", "Branding"],
    minTaskCapacity: 1,
    maxTaskCapacity: 8,
  },
] as const;

async function ensureFirebaseUser(email: string, password: string, name: string) {
  try {
    const existing = await firebaseAdmin.auth().getUserByEmail(email);
    await firebaseAdmin.auth().updateUser(existing.uid, {
      password,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });
    return existing.uid;
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") throw err;
    const created = await firebaseAdmin.auth().createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
    });
    return created.uid;
  }
}

async function main() {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set");
  await mongoose.connect(uri);
  console.log("\nCreating extra CS portal logins...\n");

  for (const spec of EXTRA_CS) {
    const firebaseId = await ensureFirebaseUser(
      spec.email,
      DEMO_PASSWORD,
      spec.name,
    );
    let user = await Users.findOne({ email: spec.email });
    if (user) {
      user = await Users.findByIdAndUpdate(
        user._id,
        {
          $set: {
            firebaseId,
            name: spec.name,
            email: spec.email,
            role: "servicing",
            isVerified: true,
            isActive: true,
          },
        },
        { new: true },
      );
    } else {
      user = await Users.create({
        _id: new mongoose.Types.ObjectId(),
        firebaseId,
        name: spec.name,
        email: spec.email,
        role: "servicing",
        isVerified: true,
        isActive: true,
        contact: "",
      });
    }
    if (!user) throw new Error(`Failed to upsert user ${spec.email}`);

    await createUserUpster({
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      userRole: user.role,
    }).catch(() => undefined);

    const staff = await Staff.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          userId: user._id,
          experience: spec.experience,
          specialization: [...spec.specialization],
          minTaskCapacity: spec.minTaskCapacity,
          maxTaskCapacity: spec.maxTaskCapacity,
          availability: true,
          designation: spec.designation,
          status: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    console.log(`  ✓ ${spec.email}  (${spec.name})  staff=${staff._id}`);
  }

  console.log("\nCS logins ready (password for all):");
  console.log(`  ${DEMO_PASSWORD}`);
  console.log(`  ${DEMO_USERS.rm}   — CS Lead`);
  for (const spec of EXTRA_CS) {
    console.log(`  ${spec.email}  — ${spec.name}`);
  }
  console.log("");

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});

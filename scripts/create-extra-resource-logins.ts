/**
 * Create additional Resource (designer) portal logins.
 *
 * Run: npm run seed:resource-extra
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

const EXTRA_RESOURCES = [
  {
    email: DEMO_USERS.resource2,
    name: "Designer — Brand",
    designation: "Brand Designer",
    experience: 4,
    specialization: ["Branding", "Logo Design", "Print Design"],
    minTaskCapacity: 1,
    maxTaskCapacity: 8,
  },
  {
    email: DEMO_USERS.resource3,
    name: "Designer — Motion",
    designation: "Motion Designer",
    experience: 5,
    specialization: ["Motion Graphics", "Social Media", "Video"],
    minTaskCapacity: 1,
    maxTaskCapacity: 7,
  },
  {
    email: DEMO_USERS.resource4,
    name: "Designer — Web",
    designation: "Web Designer",
    experience: 6,
    specialization: ["UI/UX", "Website", "Web Tech"],
    minTaskCapacity: 1,
    maxTaskCapacity: 9,
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
  console.log("\nCreating extra Resource portal logins...\n");

  for (const spec of EXTRA_RESOURCES) {
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
            role: "resource",
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
        role: "resource",
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

  console.log("\nResource logins ready (password for all):");
  console.log(`  ${DEMO_PASSWORD}`);
  console.log(`  ${DEMO_USERS.resource}   — Designer`);
  for (const spec of EXTRA_RESOURCES) {
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

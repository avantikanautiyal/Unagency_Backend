/**
 * Remove all demo seed data (@unagency.test users and related records).
 * Run: npm run seed:demo:reset
 */
import { config } from "../src/config/dot.env";
config();

import mongoose from "mongoose";
import firebaseAdmin from "../src/libs/firebase";
import Categories from "../src/models/categories.model";
import { PlansModel } from "../src/models/plan.model";
import Users from "../src/models/users.model";
import Staff from "../src/models/staff.model";
import Subscriptions from "../src/models/subscription.model";
import Organizations from "../src/models/organization.model";
import Teams from "../src/models/team.model";
import Requirement from "../src/models/requestProject.model";
import Projects from "../src/models/projects.model";
import Notifications from "../src/models/notification.model";
import Payments from "../src/models/payment.model";
import ProjectLogs from "../src/models/projectlogs.model";
import ChatRoom from "../src/models/chatRoom.model";
import Tasks from "../src/models/tasks.model";
import { streamServerClient } from "../src/config/getStreamIo.config";
import {
  DEMO_EMAIL_DOMAIN,
  DEMO_PAYMENT_IDS,
  DEMO_PLAN_IDS,
  DEMO_SUBSCRIPTION_ID,
  DEMO_USERS,
} from "../src/utils/demoSeed";
import { CATEGORY_SPECS } from "./seed-demo-constants";

async function connectDb() {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set");
  await mongoose.connect(uri);
}

async function deleteFirebaseUsers() {
  for (const email of Object.values(DEMO_USERS)) {
    try {
      const user = await firebaseAdmin.auth().getUserByEmail(email);
      await firebaseAdmin.auth().deleteUser(user.uid);
      console.log(`  ✓ Firebase user deleted: ${email}`);
    } catch (error: any) {
      if (error?.code !== "auth/user-not-found") {
        console.warn(`  ⚠ Firebase ${email}: ${error.message}`);
      }
    }
  }
}

async function deleteStreamUsers(userIds: string[]) {
  for (const id of userIds) {
    try {
      await streamServerClient.deleteUser(id);
      console.log(`  ✓ Stream user deleted: ${id}`);
    } catch {
      // User may not exist
    }
  }
}

async function main() {
  console.log("\n🧹 Resetting demo seed data...\n");
  await connectDb();

  const demoUsers = await Users.find({
    email: { $regex: DEMO_EMAIL_DOMAIN.replace(".", "\\.") + "$" },
  });
  const userIds = demoUsers.map((u) => u._id);
  const userIdStrings = userIds.map((id) => id.toString());

  // Stream channels for demo users
  for (const uid of userIdStrings) {
    try {
      const channels = await streamServerClient.queryChannels({
        members: { $in: [uid] },
      });
      if (channels.length) {
        await streamServerClient.deleteChannels(
          channels.map((c) => c.cid!),
          { hard_delete: true }
        );
      }
    } catch {
      // continue
    }
  }

  await deleteStreamUsers(userIdStrings);
  await deleteFirebaseUsers();

  const orgs = await Organizations.find({ owner: { $in: userIds } });
  const orgIds = orgs.map((o) => o._id);

  await Teams.deleteMany({
    $or: [{ userId: { $in: userIds } }, { Organization: { $in: orgIds } }],
  });
  await Notifications.deleteMany({ userId: { $in: userIds } });
  await Payments.deleteMany({
    razorpay_payment_id: { $in: [...DEMO_PAYMENT_IDS] },
  });
  await Subscriptions.deleteMany({
    subscriptionId: DEMO_SUBSCRIPTION_ID,
  });
  await Requirement.deleteMany({ title: { $regex: "^\\[Demo\\]" } });
  await Tasks.deleteMany({ title: { $regex: "^\\[Demo\\]" } });
  const demoProjects = await Projects.find({ title: { $regex: "^\\[Demo\\]" } });
  const demoProjectIds = demoProjects.map((p) => p._id);
  await ProjectLogs.deleteMany({ projectId: { $in: demoProjectIds } });
  await Projects.deleteMany({ _id: { $in: demoProjectIds } });
  await ChatRoom.deleteMany({ members: { $in: userIds } });
  await Organizations.deleteMany({ _id: { $in: orgIds } });
  await Staff.deleteMany({ userId: { $in: userIds } });
  await Users.deleteMany({ _id: { $in: userIds } });

  await PlansModel.deleteMany({
    plan_id: { $in: Object.values(DEMO_PLAN_IDS) },
  });

  const categoryTitles = CATEGORY_SPECS.map((c) => c.title);
  await Categories.deleteMany({ title: { $in: categoryTitles } });

  console.log("\n✅ Demo data reset complete. Run npm run seed:demo to re-seed.\n");
}

main()
  .catch((err) => {
    console.error("\n❌ Reset failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit();
  });

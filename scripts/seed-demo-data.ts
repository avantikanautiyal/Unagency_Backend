/**
 * Idempotent demo seed for Unagency backend.
 * Run: npm run seed:demo
 */
import { config } from "../src/config/dot.env";
config();

import mongoose from "mongoose";
import firebaseAdmin from "../src/libs/firebase";
import Categories from "../src/models/categories.model";
import { PlansModel } from "../src/models/plan.model";
import Users, { IUser } from "../src/models/users.model";
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
import {
  createDistincChatRoom,
  createUserUpster,
} from "../src/services/Chatstream";
import { streamServerClient } from "../src/config/getStreamIo.config";
import {
  DEMO_PAYMENT_IDS,
  DEMO_PLAN_IDS,
  DEMO_SUBSCRIPTION_ID,
  DEMO_USERS,
  buildRazorpayPlanItem,
} from "../src/utils/demoSeed";
import { CATEGORY_SPECS } from "./seed-demo-constants";
import { upsertCanonicalCategories } from "./seed-categories";

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || "DemoPass123!";
const GOLD_PLAN_ID = DEMO_PLAN_IDS.gold;

type SeedUserKey = keyof typeof DEMO_USERS;

const USER_SPECS: Record<
  SeedUserKey,
  { name: string; role: IUser["role"]; contact?: string }
> = {
  demo: { name: "Demo User", role: "customer", contact: "9876543210" },
  rm: { name: "Demo RM", role: "servicing" },
  teammate: { name: "Demo Teammate", role: "customer" },
  invitee: { name: "Demo Invitee", role: "customer" },
};

const PLAN_SPECS = [
  {
    plan_id: DEMO_PLAN_IDS.trial,
    tag: "trial" as const,
    occurance: "days" as const,
    amount: 0,
    name: "Trial Plan",
    group_line: "Try Unagency free for 7 days",
    points: [
      { include: true, value: "1 concurrent design service" },
      { include: true, value: "2 briefs per month" },
    ],
    max_concurrent_services: 1,
    max_briefs: 2,
    unlimited_briefs: false,
    max_additional_members: 0,
  },
  {
    plan_id: DEMO_PLAN_IDS.bronze,
    tag: "bronze" as const,
    occurance: "monthly" as const,
    amount: 99900,
    name: "Bronze Monthly",
    group_line: "Essentials for solo creators",
    points: [
      { include: true, value: "1 concurrent design service" },
      { include: true, value: "5 briefs per month" },
    ],
    max_concurrent_services: 1,
    max_briefs: 5,
    unlimited_briefs: false,
    max_additional_members: 0,
  },
  {
    plan_id: DEMO_PLAN_IDS.silver,
    tag: "silver" as const,
    occurance: "monthly" as const,
    amount: 249900,
    name: "Silver Monthly",
    group_line: "Grow your brand with a dedicated team",
    points: [
      { include: true, value: "2 concurrent design services" },
      { include: true, value: "Unlimited briefs" },
      { include: true, value: "Create organization & invite 2 members" },
    ],
    max_concurrent_services: 2,
    max_briefs: 0,
    unlimited_briefs: true,
    max_additional_members: 2,
  },
  {
    plan_id: DEMO_PLAN_IDS.gold,
    tag: "gold" as const,
    occurance: "monthly" as const,
    amount: 499900,
    name: "Gold Monthly",
    group_line: "Full creative partnership for scaling teams",
    points: [
      { include: true, value: "5 concurrent design services" },
      { include: true, value: "Unlimited briefs" },
      { include: true, value: "Invite up to 10 team members" },
      { include: true, value: "Priority RM support" },
    ],
    max_concurrent_services: 5,
    max_briefs: 0,
    unlimited_briefs: true,
    max_additional_members: 10,
  },
  {
    plan_id: DEMO_PLAN_IDS.platinum,
    tag: "platinum" as const,
    occurance: "monthly" as const,
    amount: 999900,
    name: "Platinum Monthly",
    group_line: "Enterprise-grade creative operations",
    points: [
      { include: true, value: "Unlimited concurrent services" },
      { include: true, value: "Unlimited briefs" },
      { include: true, value: "Unlimited team members" },
    ],
    max_concurrent_services: 99,
    max_briefs: 0,
    unlimited_briefs: true,
    max_additional_members: 99,
  },
];

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function ensureFirebaseUser(
  email: string,
  password: string,
  name: string
): Promise<string> {
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

async function ensureMongoUser(
  email: string,
  firebaseId: string,
  spec: { name: string; role: IUser["role"]; contact?: string },
  extra: Record<string, unknown> = {}
) {
  const existing = await Users.findOne({ email });
  const payload = {
    firebaseId,
    name: spec.name,
    email,
    role: spec.role,
    isVerified: true,
    isActive: true,
    contact: spec.contact || "",
    ...extra,
  };

  if (existing) {
    const updated = await Users.findByIdAndUpdate(existing._id, { $set: payload }, { new: true });
    if (!updated) throw new Error(`Failed to update user ${email}`);
    return updated;
  }

  return Users.create({
    _id: new mongoose.Types.ObjectId(),
    ...payload,
  });
}

async function ensureStreamUser(user: { _id: mongoose.Types.ObjectId; name: string; email: string; role: string }) {
  await createUserUpster({
    _id: user._id.toString(),
    name: user.name,
    email: user.email,
    userRole: user.role,
  });
}

async function seedCategories() {
  console.log("→ Seeding categories...");
  const count = await upsertCanonicalCategories();
  const categoryMap = new Map<string, mongoose.Types.ObjectId>();
  for (const spec of CATEGORY_SPECS) {
    const doc = await Categories.findOne({ title: spec.title });
    if (doc) categoryMap.set(spec.title, doc._id);
  }
  console.log(`  ✓ ${count} categories`);
  return categoryMap;
}

async function seedPlans() {
  console.log("→ Seeding Razorpay plans (MongoDB only, demo IDs)...");

  for (const spec of PLAN_SPECS) {
    await PlansModel.findOneAndUpdate(
      { plan_id: spec.plan_id },
      {
        $set: {
          plan_id: spec.plan_id,
          tag: spec.tag,
          occurance: spec.occurance,
          group_line: spec.group_line,
          points: spec.points,
          max_concurrent_services: spec.max_concurrent_services,
          max_briefs: spec.max_briefs,
          unlimited_briefs: spec.unlimited_briefs,
          max_additional_members: spec.max_additional_members,
          user_popup_on_limit: true,
          razorpayPlanItem: buildRazorpayPlanItem(
            spec.plan_id,
            spec.name,
            spec.amount,
            spec.occurance === "days" ? "monthly" : spec.occurance
          ),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`  ✓ ${PLAN_SPECS.length} plans`);
}

async function seedUsers() {
  console.log("→ Seeding Firebase + MongoDB + Stream users...");
  const users: Record<SeedUserKey, any> = {} as any;

  for (const [key, email] of Object.entries(DEMO_USERS) as [SeedUserKey, string][]) {
    const spec = USER_SPECS[key];
    const firebaseId = await ensureFirebaseUser(email, DEMO_PASSWORD, spec.name);
    const extra =
      key === "demo"
        ? { tourCompleted: "complete" as const, contact: spec.contact }
        : {};
    const user = await ensureMongoUser(email, firebaseId, spec, extra);
    await ensureStreamUser(user);
    users[key] = user;
    console.log(`  ✓ ${email} (${user._id})`);
  }

  return users;
}

async function seedStaff(rmUser: any) {
  console.log("→ Seeding RM staff profile...");
  const staff = await Staff.findOneAndUpdate(
    { userId: rmUser._id },
    {
      $set: {
        userId: rmUser._id,
        experience: 8,
        specialization: ["Branding", "UI/UX", "Project Management"],
        minTaskCapacity: 2,
        maxTaskCapacity: 15,
        availability: true,
        designation: "Relationship Manager",
        status: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`  ✓ Staff ${staff._id}`);
  return staff;
}

async function seedSubscription(demoUser: any) {
  console.log("→ Seeding active gold subscription for demo user...");
  const now = Math.floor(Date.now() / 1000);
  const end = now + 365 * 24 * 60 * 60;

  await Subscriptions.findOneAndUpdate(
    { subscriptionId: DEMO_SUBSCRIPTION_ID },
    {
      $set: {
        subscriptionId: DEMO_SUBSCRIPTION_ID,
        userId: demoUser._id.toString(),
        planId: GOLD_PLAN_ID,
        status: "active",
        customerId: "cust_demo_unagency",
        current_start: now,
        current_end: end,
        cancelledByUser: false,
        razorpayCancelRequested: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Users.findByIdAndUpdate(demoUser._id, {
    $set: {
      subscription: { id: DEMO_SUBSCRIPTION_ID, status: "active" },
    },
  });

  console.log(`  ✓ Subscription ${DEMO_SUBSCRIPTION_ID} (gold)`);
}

async function seedOrganization(demoUser: any) {
  console.log("→ Seeding organization...");
  const org = await Organizations.findOneAndUpdate(
    { owner: demoUser._id },
    {
      $set: {
        owner: demoUser._id,
        companyName: "Demo Creative Studio",
        companyType: "Private Limited",
        companyHeadquaters: "Bangalore, India",
        companyAddress: "123 MG Road, Bangalore",
        GST: "29ABCDE1234F1Z5",
        industry: "Advertising & Marketing",
        website: "https://demo.unagency.test",
        contactPerson: "Demo User",
        contactEmail: DEMO_USERS.demo,
        contactMobile: "9876543210",
        status: "active",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`  ✓ Organization ${org._id}`);
  return org;
}

async function seedTeams(demoUser: any, teammateUser: any, inviteeUser: any, org: any) {
  console.log("→ Seeding team members & invitations...");

  await Teams.findOneAndUpdate(
    { Organization: org._id, userId: demoUser._id },
    {
      $set: {
        Organization: org._id,
        userId: demoUser._id,
        role: "owner",
        invitationStatus: "accepted",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const teammateTeam = await Teams.findOneAndUpdate(
    { Organization: org._id, userId: teammateUser._id },
    {
      $set: {
        Organization: org._id,
        userId: teammateUser._id,
        role: "member",
        invitationStatus: "accepted",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Teams.findOneAndUpdate(
    { Organization: org._id, userId: inviteeUser._id },
    {
      $set: {
        Organization: org._id,
        userId: inviteeUser._id,
        role: "member",
        invitationStatus: "pending",
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log("  ✓ Owner, accepted member, pending invitation");
  return teammateTeam;
}

async function seedRequirements(demoUser: any, categoryMap: Map<string, mongoose.Types.ObjectId>) {
  console.log("→ Seeding requirements (briefs)...");

  const specs = [
    {
      title: "[Demo] E-commerce Website Redesign",
      category: "Website",
      description:
        "Redesign our Shopify store with a modern, mobile-first layout and improved checkout flow.",
      deadlineDays: 14,
    },
    {
      title: "[Demo] Product Packaging for Skincare Line",
      category: "Packaging",
      description:
        "Create premium packaging designs for a 5-product Ayurvedic skincare collection.",
      deadlineDays: 21,
    },
    {
      title: "[Demo] Instagram Campaign Creatives",
      category: "Social Media",
      description:
        "Design 12 carousel posts and 6 story templates for a summer product launch.",
      deadlineDays: 10,
    },
    {
      title: "[Demo] Brand Identity Refresh",
      category: "Branding",
      description:
        "Update logo, color palette, and brand guidelines for our 2026 repositioning.",
      deadlineDays: 30,
    },
  ];

  for (const spec of specs) {
    const categoryId = categoryMap.get(spec.category);
    if (!categoryId) continue;

    await Requirement.findOneAndUpdate(
      { title: spec.title },
      {
        $set: {
          userId: demoUser._id,
          title: spec.title,
          description: spec.description,
          category: categoryId,
          deadline: daysFromNow(spec.deadlineDays),
          status: "raised",
          files: [`https://picsum.photos/seed/${encodeURIComponent(spec.title)}/800/600`],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`  ✓ ${specs.length} requirements`);
}

async function seedProjects(
  demoUser: any,
  org: any,
  staff: any,
  teammateTeam: any,
  categoryMap: Map<string, mongoose.Types.ObjectId>
) {
  console.log("→ Seeding projects...");

  const specs = [
    {
      title: "[Demo] Website Launch Sprint",
      category: "Website",
      status: "planning",
      orgLinked: true,
      updatedDaysAgo: 1,
    },
    {
      title: "[Demo] Brand Style Guide",
      category: "Branding",
      status: "initiated",
      orgLinked: true,
      updatedDaysAgo: 2,
    },
    {
      title: "[Demo] Social Media Kit Q2",
      category: "Social Media",
      status: "delivered",
      orgLinked: false,
      updatedDaysAgo: 3,
    },
    {
      title: "[Demo] App UI Prototype",
      category: "UI/UX",
      status: "revision",
      orgLinked: false,
      updatedDaysAgo: 1,
    },
    {
      title: "[Demo] Motion Graphics Reel",
      category: "Motion Graphics",
      status: "approved",
      orgLinked: false,
      updatedDaysAgo: 4,
    },
    {
      title: "[Demo] Print Catalog 2026",
      category: "Print Design",
      status: "closed",
      orgLinked: false,
      updatedDaysAgo: 6,
    },
  ];

  const projectIds: mongoose.Types.ObjectId[] = [];

  for (const spec of specs) {
    const categoryId = categoryMap.get(spec.category);
    if (!categoryId) continue;

    const updatedAt = daysAgo(spec.updatedDaysAgo);
    const project = await Projects.findOneAndUpdate(
      { title: spec.title },
      {
        $set: {
          userId: demoUser._id,
          orgId: spec.orgLinked ? org._id : undefined,
          title: spec.title,
          category: categoryId,
          description: `Demo project: ${spec.title.replace("[Demo] ", "")}`,
          startDate: daysAgo(14),
          deadline: daysFromNow(21),
          status: spec.status,
          resource: [staff._id],
          clientTeam: teammateTeam ? [teammateTeam._id] : [],
          updatedAt,
          createdAt: daysAgo(14),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    projectIds.push(project._id);
  }

  // Project logs for first project
  const firstProject = projectIds[0];
  if (firstProject) {
    const logTypes = ["planning", "initiated"] as const;
    for (const action of logTypes) {
      await ProjectLogs.findOneAndUpdate(
        { projectId: firstProject, ActionType: action },
        {
          $set: {
            projectId: firstProject,
            ActionType: action,
            ActionDate: daysAgo(3),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  console.log(`  ✓ ${specs.length} projects`);
}

async function seedNotifications(demoUser: any) {
  console.log("→ Seeding notifications...");

  const specs = [
    {
      title: "Brief received",
      description: "Your brief for E-commerce Website Redesign has been received by your RM.",
      type: "PROJECT",
      actionText: "View Requirement",
      symbol: "📋",
    },
    {
      title: "Project status updated",
      description: "Brand Style Guide moved to Initiated. Your team is now working on it.",
      type: "PROJECT",
      actionText: "View Dashboard",
      symbol: "🚀",
    },
    {
      title: "New message from your RM",
      description: "Demo RM sent you a message about your upcoming deliverables.",
      type: "COMMON",
      actionText: "Open Chat",
      symbol: "💬",
    },
    {
      title: "Team invitation sent",
      description: "You invited Demo Invitee to join Demo Creative Studio.",
      type: "COMMON",
      actionText: "View Team",
      symbol: "🤝",
    },
    {
      title: "Membership activated",
      description: "Your Gold Monthly membership is now active. Enjoy unlimited briefs!",
      type: "COMMON",
      actionText: "Go to Dashboard",
      symbol: "⭐",
    },
    {
      title: "Deliverable ready for review",
      description: "Social Media Kit Q2 is ready for your feedback.",
      type: "PROJECT",
      actionText: "View Dashboard",
      symbol: "✅",
    },
    {
      title: "Payment received",
      description: "We received your Gold Monthly subscription payment. Invoice is available.",
      type: "COMMON",
      actionText: "Go to Dashboard",
      symbol: "💳",
    },
  ];

  for (const spec of specs) {
    await Notifications.findOneAndUpdate(
      { userId: demoUser._id, title: spec.title },
      {
        $set: {
          userId: demoUser._id,
          title: spec.title,
          description: spec.description,
          type: spec.type,
          actionText: spec.actionText,
          symbol: spec.symbol,
          isRead: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log(`  ✓ ${specs.length} notifications`);
}

async function seedPayments(demoUser: any) {
  console.log("→ Seeding payment history...");

  const amounts = [499900, 499900, 499900];
  const createdAts = [daysAgo(60), daysAgo(30), daysAgo(2)];

  for (let i = 0; i < DEMO_PAYMENT_IDS.length; i++) {
    const paymentId = DEMO_PAYMENT_IDS[i];
    await Payments.findOneAndUpdate(
      { razorpay_payment_id: paymentId },
      {
        $set: {
          razorpay_payment_id: paymentId,
          razorpay_subscription_id: DEMO_SUBSCRIPTION_ID,
          razorpay_signature: `demo_sig_${paymentId}`,
          userId: demoUser._id,
          status: "captured",
          createdAt: createdAts[i],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    void amounts[i];
  }

  console.log(`  ✓ ${DEMO_PAYMENT_IDS.length} payments`);
}

async function seedChat(demoUser: any, rmUser: any, staff: any) {
  console.log("→ Seeding Stream chat channel & messages...");

  await Users.findByIdAndUpdate(demoUser._id, {
    $set: { relationship_manager: staff._id },
  });

  const room = await createDistincChatRoom({
    roomName: `${rmUser.name}, ${demoUser.name}`,
    members: [demoUser._id.toString(), rmUser._id.toString()],
    room_type: "personal",
    createdBy: demoUser._id.toString(),
    isCustomer: true,
  });

  if (room.error) {
    console.warn(`  ⚠ Stream channel warning: ${room.error}`);
    return;
  }

  await ChatRoom.findOneAndUpdate(
    { roomId: room.roomId },
    {
      $setOnInsert: {
        cid: room.cid,
        roomId: room.roomId,
        members: [demoUser._id, rmUser._id],
        room_type: "personal",
      },
    },
    { upsert: true, new: true }
  );

  const channel = streamServerClient.channel("messaging", room.roomId!);
  const messages = [
  { text: "Hi Demo! I'm your relationship manager. How can I help you today?", from: rmUser },
  { text: "Thanks! I'd like to kick off the website redesign project.", from: demoUser },
  { text: "Perfect — I've reviewed your brief. Let's schedule a kickoff call this week.", from: rmUser },
  { text: "Sounds great. I'll share brand assets in the project folder.", from: demoUser },
  { text: "Received. The design team will share first concepts by Friday.", from: rmUser },
  ];

  for (const msg of messages) {
    try {
      await channel.sendMessage({
        text: msg.text,
        user_id: msg.from._id.toString(),
      });
    } catch {
      // Messages may already exist on re-run; continue
    }
  }

  console.log(`  ✓ RM channel ${room.roomId} with ${messages.length} messages`);
}

async function connectDb() {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set in environment");
  await mongoose.connect(uri);
  console.log("✓ Connected to MongoDB");
}

async function main() {
  console.log("\n🌱 Unagency demo seed starting...\n");

  await connectDb();

  const categoryMap = await seedCategories();
  await seedPlans();
  const users = await seedUsers();
  const staff = await seedStaff(users.rm);
  await seedSubscription(users.demo);
  const org = await seedOrganization(users.demo);
  const teammateTeam = await seedTeams(users.demo, users.teammate, users.invitee, org);
  await seedRequirements(users.demo, categoryMap);
  await seedProjects(users.demo, org, staff, teammateTeam, categoryMap);
  await seedNotifications(users.demo);
  await seedChat(users.demo, users.rm, staff);
  await seedPayments(users.demo);

  console.log("\n✅ Demo seed complete!\n");
  console.log("Primary login:");
  console.log(`  Email:    ${DEMO_USERS.demo}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("\nOther demo accounts (same password):");
  Object.values(DEMO_USERS)
    .filter((e) => e !== DEMO_USERS.demo)
    .forEach((e) => console.log(`  - ${e}`));
  console.log("");
}

main()
  .catch((err) => {
    console.error("\n❌ Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit();
  });

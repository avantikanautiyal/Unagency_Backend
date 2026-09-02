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
import Tasks from "../src/models/tasks.model";
import {
  createDistincChatRoom,
  createUserUpster,
} from "../src/services/Chatstream";
import { collaborationOsService } from "../src/platform/collaboration/collaboration-os-service";
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
  rm: { name: "CS Lead", role: "servicing" },
  cs2: { name: "CS Associate", role: "servicing" },
  cs3: { name: "CS Manager", role: "servicing" },
  cs4: { name: "CS Coordinator", role: "servicing" },
  teammate: { name: "Demo Teammate", role: "customer" },
  invitee: { name: "Demo Invitee", role: "customer" },
  admin: { name: "Admin", role: "admin" },
  superadmin: { name: "Super Admin", role: "superadmin" },
  resource: { name: "Designer", role: "resource" },
  resource2: { name: "Designer — Brand", role: "resource" },
  resource3: { name: "Designer — Motion", role: "resource" },
  resource4: { name: "Designer — Web", role: "resource" },
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

async function ensureStaffProfile(
  user: { _id: mongoose.Types.ObjectId },
  profile: {
    experience: number;
    specialization: string[];
    minTaskCapacity: number;
    maxTaskCapacity: number;
    designation: string;
  }
) {
  return Staff.findOneAndUpdate(
    { userId: user._id },
    {
      $set: {
        userId: user._id,
        experience: profile.experience,
        specialization: profile.specialization,
        minTaskCapacity: profile.minTaskCapacity,
        maxTaskCapacity: profile.maxTaskCapacity,
        availability: true,
        designation: profile.designation,
        status: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function seedStaff(
  rmUser: any,
  resourceUser: any,
  extraCsUsers: any[] = [],
  extraResourceUsers: any[] = [],
) {
  console.log("→ Seeding staff profiles (RM + CS + resource)...");
  const rmStaff = await ensureStaffProfile(rmUser, {
    experience: 8,
    specialization: ["Branding", "UI/UX", "Project Management"],
    minTaskCapacity: 2,
    maxTaskCapacity: 15,
    designation: "Relationship Manager",
  });
  console.log(`  ✓ RM staff ${rmStaff._id}`);

  const extraCsProfiles = [
    {
      experience: 4,
      specialization: ["Branding", "Social Media"],
      minTaskCapacity: 1,
      maxTaskCapacity: 10,
      designation: "CS Associate",
    },
    {
      experience: 6,
      specialization: ["UI/UX", "Project Management"],
      minTaskCapacity: 2,
      maxTaskCapacity: 12,
      designation: "CS Manager",
    },
    {
      experience: 3,
      specialization: ["Presentations", "Branding"],
      minTaskCapacity: 1,
      maxTaskCapacity: 8,
      designation: "CS Coordinator",
    },
  ];

  for (let i = 0; i < extraCsUsers.length; i++) {
    const user = extraCsUsers[i];
    const profile = extraCsProfiles[i] ?? extraCsProfiles[0];
    const staff = await ensureStaffProfile(user, profile);
    console.log(`  ✓ CS staff ${user.email} ${staff._id}`);
  }

  const resourceStaff = await ensureStaffProfile(resourceUser, {
    experience: 5,
    specialization: ["UI/UX", "Branding", "Motion Graphics"],
    minTaskCapacity: 1,
    maxTaskCapacity: 8,
    designation: "Designer",
  });
  console.log(`  ✓ Resource staff ${resourceStaff._id}`);

  const extraResourceProfiles = [
    {
      experience: 4,
      specialization: ["Branding", "Logo Design", "Print Design"],
      minTaskCapacity: 1,
      maxTaskCapacity: 8,
      designation: "Brand Designer",
    },
    {
      experience: 5,
      specialization: ["Motion Graphics", "Social Media", "Video"],
      minTaskCapacity: 1,
      maxTaskCapacity: 7,
      designation: "Motion Designer",
    },
    {
      experience: 6,
      specialization: ["UI/UX", "Website", "Web Tech"],
      minTaskCapacity: 1,
      maxTaskCapacity: 9,
      designation: "Web Designer",
    },
  ];

  for (let i = 0; i < extraResourceUsers.length; i++) {
    const user = extraResourceUsers[i];
    const profile = extraResourceProfiles[i] ?? extraResourceProfiles[0];
    const staff = await ensureStaffProfile(user, profile);
    console.log(`  ✓ Resource staff ${user.email} ${staff._id}`);
  }

  return { rmStaff, resourceStaff };
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
  resourceStaff: any,
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
          resource: [resourceStaff._id],
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
  return projectIds;
}

async function seedTasks(
  projectIds: mongoose.Types.ObjectId[],
  resourceStaff: any,
  rmStaff: any
) {
  console.log("→ Seeding tasks (resource ← CS)...");

  const specs: Array<{
    title: string;
    description: string;
    priority: "low" | "medium" | "high";
    status: "todo" | "progress" | "submitted" | "feedback" | "revision" | "approved";
    deadlineDays: number;
    projectIndex: number;
  }> = [
    {
      title: "[Demo] Website hero concepts",
      description: "Produce 3 hero layout options for the website launch sprint.",
      priority: "high",
      status: "progress",
      deadlineDays: 5,
      projectIndex: 0,
    },
    {
      title: "[Demo] Brand style guide pages",
      description: "Draft color, type, and logo usage pages for brand review.",
      priority: "medium",
      status: "todo",
      deadlineDays: 10,
      projectIndex: 1,
    },
    {
      title: "[Demo] Social kit carousel",
      description: "Finalize Q2 social media kit carousel assets.",
      priority: "medium",
      status: "submitted",
      deadlineDays: 2,
      projectIndex: 2,
    },
    {
      title: "[Demo] App UI revision pass",
      description: "Address client feedback on the app UI prototype screens.",
      priority: "high",
      status: "revision",
      deadlineDays: 3,
      projectIndex: 3,
    },
    {
      title: "[Demo] Motion reel export",
      description: "Export approved motion graphics reel in delivery formats.",
      priority: "low",
      status: "approved",
      deadlineDays: -2,
      projectIndex: 4,
    },
  ];

  let count = 0;
  for (const spec of specs) {
    const projectId = projectIds[spec.projectIndex];
    if (!projectId) continue;

    await Tasks.findOneAndUpdate(
      { title: spec.title },
      {
        $set: {
          project: projectId,
          title: spec.title,
          description: spec.description,
          priority: spec.priority,
          status: spec.status,
          assignedTo: resourceStaff._id,
          assignedBy: rmStaff._id,
          deadline: daysFromNow(spec.deadlineDays),
          completionDate:
            spec.status === "approved" ? daysAgo(1) : undefined,
          files: [],
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }

  console.log(`  ✓ ${count} tasks`);
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

async function seedChat(
  demoUser: any,
  rmUser: any,
  resourceUser: any,
  rmStaff: any,
  projectIds: mongoose.Types.ObjectId[]
) {
  console.log("→ Seeding RM + project chat channels...");

  await Users.findByIdAndUpdate(demoUser._id, {
    $set: { relationship_manager: rmStaff._id },
  });

  try {
    const rmRoom = await createDistincChatRoom({
      roomName: `${rmUser.name}, ${demoUser.name}`,
      members: [
        demoUser._id.toString(),
        rmUser._id.toString(),
        resourceUser._id.toString(),
      ],
      room_type: "personal",
      createdBy: demoUser._id.toString(),
      isCustomer: true,
    });

    await ChatRoom.findOneAndUpdate(
      { roomId: rmRoom.roomId },
      {
        $setOnInsert: {
          cid: rmRoom.cid,
          roomId: rmRoom.roomId,
          members: [demoUser._id, rmUser._id, resourceUser._id],
          room_type: "personal",
        },
      },
      { upsert: true, new: true }
    );

    const seededMessages = [
      {
        from: rmUser._id.toString(),
        text: "Hi Demo! I'm your relationship manager. How can I help you today?",
      },
      {
        from: demoUser._id.toString(),
        text: "Thanks! I'd like to kick off the website redesign project.",
      },
      {
        from: rmUser._id.toString(),
        text: "Perfect — I've assigned Demo Resource. Let's keep feedback in this thread.",
      },
      {
        from: resourceUser._id.toString(),
        text: "On it — I'll share first concepts here once ready.",
      },
      {
        from: demoUser._id.toString(),
        text: "Sounds great. Brand assets are in the project folder.",
      },
    ];

    for (const msg of seededMessages) {
      try {
        await collaborationOsService.sendMessage({
          userId: msg.from,
          channelId: rmRoom.roomId,
          text: msg.text,
          clientMessageId: `demo-seed-${rmRoom.roomId}-${msg.from}-${msg.text.slice(0, 24)}`,
        });
      } catch {
        // Idempotent / membership race — continue
      }
    }

    console.log(`  ✓ RM channel ${rmRoom.roomId} (${seededMessages.length} messages)`);

    const firstProjectId = projectIds[0];
    if (firstProjectId) {
      const projectRoom = await collaborationOsService.provisionForProject({
        projectId: firstProjectId.toString(),
        name: "[Demo] Website Launch Sprint",
        organizationId: demoUser._id.toString(),
        memberUserIds: [
          demoUser._id.toString(),
          rmUser._id.toString(),
          resourceUser._id.toString(),
        ],
        createdByUserId: rmUser._id.toString(),
      });

      const projectMessages = [
        {
          from: rmUser._id.toString(),
          text: "Project kickoff: Website Launch Sprint is live.",
        },
        {
          from: resourceUser._id.toString(),
          text: "Starting hero concepts — will ping when draft is ready.",
        },
      ];

      for (const msg of projectMessages) {
        try {
          await collaborationOsService.sendMessage({
            userId: msg.from,
            channelId: projectRoom.channelId,
            text: msg.text,
            clientMessageId: `demo-seed-${projectRoom.channelId}-${msg.from}-${msg.text.slice(0, 24)}`,
          });
        } catch {
          // continue
        }
      }

      console.log(`  ✓ Project channel ${projectRoom.channelId}`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Chat channel skipped: ${err?.message || err}`);
  }
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
  const { rmStaff, resourceStaff } = await seedStaff(
    users.rm,
    users.resource,
    [users.cs2, users.cs3, users.cs4],
    [users.resource2, users.resource3, users.resource4],
  );
  await seedSubscription(users.demo);
  const org = await seedOrganization(users.demo);
  const teammateTeam = await seedTeams(users.demo, users.teammate, users.invitee, org);
  await seedRequirements(users.demo, categoryMap);
  const projectIds = await seedProjects(
    users.demo,
    org,
    resourceStaff,
    teammateTeam,
    categoryMap
  );
  await seedTasks(projectIds, resourceStaff, rmStaff);
  await seedNotifications(users.demo);
  await seedChat(users.demo, users.rm, users.resource, rmStaff, projectIds);
  await seedPayments(users.demo);

  console.log("\n✅ Demo seed complete!\n");
  console.log("Primary mobile login:");
  console.log(`  Email:    ${DEMO_USERS.demo}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("\nAdmin portal logins (same password):");
  console.log(`  Super Admin  ${DEMO_USERS.superadmin}`);
  console.log(`  Admin        ${DEMO_USERS.admin}`);
  console.log(`  Resource     ${DEMO_USERS.resource}`);
  console.log(`  Resource     ${DEMO_USERS.resource2}`);
  console.log(`  Resource     ${DEMO_USERS.resource3}`);
  console.log(`  Resource     ${DEMO_USERS.resource4}`);
  console.log(`  CS (RM)      ${DEMO_USERS.rm}`);
  console.log(`  CS           ${DEMO_USERS.cs2}`);
  console.log(`  CS           ${DEMO_USERS.cs3}`);
  console.log(`  CS           ${DEMO_USERS.cs4}`);
  console.log("\nOther customer accounts:");
  console.log(`  - ${DEMO_USERS.teammate}`);
  console.log(`  - ${DEMO_USERS.invitee}`);
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

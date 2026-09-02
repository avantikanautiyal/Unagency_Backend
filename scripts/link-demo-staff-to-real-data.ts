/**
 * Link real (non-@unagency.test) customers to demo staff logins so
 * CS / Resource / Admin portals show live org, project, task, and chat data.
 *
 * Run: TS_NODE_TRANSPILE_ONLY=true npx ts-node ./scripts/link-demo-staff-to-real-data.ts
 */
import { config } from "../src/config/dot.env";
config();

import mongoose from "mongoose";
import Users from "../src/models/users.model";
import Staff from "../src/models/staff.model";
import Projects from "../src/models/projects.model";
import Tasks from "../src/models/tasks.model";
import Organizations from "../src/models/organization.model";
import Requirement from "../src/models/requestProject.model";
import ChatRoom from "../src/models/chatRoom.model";
import {
  createDistincChatRoom,
} from "../src/services/Chatstream";
import { collaborationOsService } from "../src/platform/collaboration/collaboration-os-service";
import { DEMO_USERS } from "../src/utils/demoSeed";

const MAX_TASKS_PER_CUSTOMER = 24;

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function mapProjectStatusToTask(
  status?: string
): "todo" | "progress" | "submitted" | "revision" | "approved" {
  const value = (status ?? "").toLowerCase();
  if (value.includes("approv") || value.includes("closed") || value.includes("deliver")) {
    return "approved";
  }
  if (value.includes("revision")) return "revision";
  if (value.includes("initiat") || value.includes("progress")) return "progress";
  return "todo";
}

async function main() {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set");
  await mongoose.connect(uri);
  console.log("\n🔗 Linking real customers → demo staff portals...\n");

  const rmUser = await Users.findOne({ email: DEMO_USERS.rm });
  const resourceUser = await Users.findOne({ email: DEMO_USERS.resource });
  const adminUser = await Users.findOne({ email: DEMO_USERS.admin });
  if (!rmUser || !resourceUser) {
    throw new Error("Demo RM/resource users missing — run npm run seed:demo first");
  }

  const rmStaff = await Staff.findOne({ userId: rmUser._id });
  const resourceStaff = await Staff.findOne({ userId: resourceUser._id });
  if (!rmStaff || !resourceStaff) {
    throw new Error("Demo staff profiles missing — run npm run seed:demo first");
  }

  const realCustomers = await Users.find({
    role: "customer",
    email: { $not: /@unagency\.test$/i },
  });

  console.log(`→ Found ${realCustomers.length} real customers`);

  for (const customer of realCustomers) {
    await Users.findByIdAndUpdate(customer._id, {
      $set: { relationship_manager: rmStaff._id },
    });
    console.log(`  ✓ RM assigned: ${customer.email}`);

    const org = await Organizations.findOne({ owner: customer._id });
    const projects = await Projects.find({ userId: customer._id }).sort({
      updatedAt: -1,
    });

    // Ensure resource is on projects so resource portal + FetchCustomers work
    let projectsUpdated = 0;
    for (const project of projects) {
      const resources = (project.resource || []).map(String);
      if (!resources.includes(String(resourceStaff._id))) {
        await Projects.findByIdAndUpdate(project._id, {
          $addToSet: { resource: resourceStaff._id },
        });
        projectsUpdated += 1;
      }
    }
    console.log(
      `  ✓ Projects for ${customer.email}: ${projects.length} (resource tagged on ${projectsUpdated})`
    );

    // Create tasks from human-servicing projects only (never AI Create Design)
    let tasksCreated = 0;
    for (const project of projects.slice(0, MAX_TASKS_PER_CUSTOMER)) {
      const isAi =
        String(project.origin || "").toLowerCase() === "ai_creative" ||
        Boolean(String(project.executionId || "").trim());
      if (isAi) continue;

      const title = `[Live] ${project.title || "Creative task"}`.slice(0, 180);
      const existing = await Tasks.findOne({
        project: project._id,
        assignedTo: resourceStaff._id,
      });
      if (existing) continue;

      await Tasks.create({
        project: project._id,
        title,
        description:
          project.description ||
          `Live assignment for ${project.title || "project"} (${customer.name || customer.email})`,
        priority: project.status === "initiated" ? "high" : "medium",
        status: mapProjectStatusToTask(project.status),
        assignedTo: resourceStaff._id,
        assignedBy: rmStaff._id,
        deadline: project.deadline || daysFromNow(14),
        files: [],
      });
      tasksCreated += 1;
    }
    console.log(`  ✓ Tasks created (human only): ${tasksCreated}`);

    // Do not mint inbox requirements from AI Create Design projects
    const reqCount = await Requirement.countDocuments({ userId: customer._id });
    console.log(`  · Requirements present: ${reqCount}`);

    // Collaboration chat: customer + CS + resource (+ admin observer)
    const memberIds = [
      customer._id.toString(),
      rmUser._id.toString(),
      resourceUser._id.toString(),
      ...(adminUser ? [adminUser._id.toString()] : []),
    ];

    try {
      const room = await createDistincChatRoom({
        roomName: `${rmUser.name}, ${customer.name || customer.email}`,
        members: memberIds,
        room_type: "personal",
        createdBy: customer._id.toString(),
        isCustomer: true,
      });

      await ChatRoom.findOneAndUpdate(
        { roomId: room.roomId },
        {
          $setOnInsert: {
            cid: room.cid,
            roomId: room.roomId,
            members: memberIds.map((id) => new mongoose.Types.ObjectId(id)),
            room_type: "personal",
          },
        },
        { upsert: true, new: true }
      );

      const seedLines = [
        {
          from: rmUser._id.toString(),
          text: `Hi ${customer.name || "there"} — I'm your CS lead on Unagency. We'll coordinate deliverables here.`,
        },
        {
          from: resourceUser._id.toString(),
          text: "Designer here — I'll share drafts and revisions in this thread.",
        },
        {
          from: customer._id.toString(),
          text: "Sounds good — looking forward to the next update.",
        },
      ];

      for (const msg of seedLines) {
        try {
          await collaborationOsService.sendMessage({
            userId: msg.from,
            channelId: room.roomId,
            text: msg.text,
            clientMessageId: `live-link-${room.roomId}-${msg.from}-${msg.text.slice(0, 20)}`,
          });
        } catch {
          // membership / idempotency
        }
      }

      // Project channel for the newest project
      const top = projects[0];
      if (top) {
        const projectRoom = await collaborationOsService.provisionForProject({
          projectId: top._id.toString(),
          name: top.title || "Project chat",
          organizationId: (org?.owner || customer._id).toString(),
          memberUserIds: memberIds,
          createdByUserId: rmUser._id.toString(),
        });
        try {
          await collaborationOsService.sendMessage({
            userId: rmUser._id.toString(),
            channelId: projectRoom.channelId,
            text: `Project thread for “${top.title}” is live.`,
            clientMessageId: `live-link-${projectRoom.channelId}-kickoff`,
          });
        } catch {
          // ignore
        }
        console.log(`  ✓ Chat: RM room ${room.roomId} + project ${projectRoom.channelId}`);
      } else {
        console.log(`  ✓ Chat: RM room ${room.roomId}`);
      }
    } catch (err: any) {
      console.warn(`  ⚠ Chat skipped for ${customer.email}: ${err?.message || err}`);
    }
  }

  const taskTotal = await Tasks.countDocuments({
    assignedBy: rmStaff._id,
  });
  const customerTotal = await Users.countDocuments({
    role: "customer",
    relationship_manager: rmStaff._id,
  });

  console.log("\n✅ Link complete");
  console.log(`  CS (${DEMO_USERS.rm}) customers: ${customerTotal}`);
  console.log(`  CS-assigned tasks: ${taskTotal}`);
  console.log(`  Password for portal logins: DemoPass123!\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Link failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => undefined);
    process.exit();
  });

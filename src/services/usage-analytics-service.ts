/**
 * Usage analytics aggregation (M10.12).
 * Returns zeros when empty — never fabricates non-zero metrics.
 */

import mongoose from "mongoose";
import Projects from "../models/projects.model";
import Requirement from "../models/requestProject.model";
import MediaFile from "../models/mediaFile.model";
import Teams from "../models/team.model";
import Brands from "../models/brand.model";
import { resolveCustomerOrganizationId } from "./product-asset-service";

export type UsageAnalyticsDto = {
  organizationId: string;
  generatedAt: string;
  totals: {
    projects: number;
    briefs: number;
    assets: number;
    storageBytes: number;
    teamMembers: number;
    brands: number;
  };
  periods: {
    daily: { date: string; projectsCreated: number; assetsUploaded: number }[];
    weekly: {
      weekStart: string;
      projectsCreated: number;
      assetsUploaded: number;
    }[];
    monthly: {
      month: string;
      projectsCreated: number;
      assetsUploaded: number;
    }[];
  };
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export class UsageAnalyticsService {
  async summarize(input: {
    userId: string;
    organizationId?: string;
  }): Promise<UsageAnalyticsDto> {
    const organizationId = await resolveCustomerOrganizationId(
      input.userId,
      input.organizationId
    );
    const orgOid = new mongoose.Types.ObjectId(organizationId);
    const userOid = new mongoose.Types.ObjectId(input.userId);

    const [projects, briefs, assets, teamMembers, brands] = await Promise.all([
      Projects.countDocuments({ orgId: orgOid }),
      Requirement.countDocuments({ userId: userOid }),
      MediaFile.find({
        organizationId: orgOid,
        status: { $ne: "deleted" },
        storageKey: { $exists: true, $ne: null },
      }).select("sizeBytes uploadedAt createdAt"),
      Teams.countDocuments({
        Organization: orgOid,
        invitationStatus: "accepted",
      }),
      Brands.countDocuments({ organizationId: orgOid, status: "active" }),
    ]);

    const storageBytes = assets.reduce(
      (sum, a) => sum + (a.sizeBytes ?? 0),
      0
    );

    const now = new Date();
    const weekAgo = startOfDay(new Date(now.getTime() - 6 * 86400000));
    const recentProjects = await Projects.find({
      orgId: orgOid,
      createdAt: { $gte: weekAgo },
    })
      .select("createdAt")
      .lean();

    const daily: UsageAnalyticsDto["periods"]["daily"] = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(new Date(now.getTime() - i * 86400000));
      const next = new Date(day.getTime() + 86400000);
      daily.push({
        date: isoDate(day),
        projectsCreated: recentProjects.filter((p: { createdAt?: Date }) => {
          const t = new Date(p.createdAt ?? 0).getTime();
          return t >= day.getTime() && t < next.getTime();
        }).length,
        assetsUploaded: assets.filter((a) => {
          const t = new Date(
            (a as { createdAt?: Date }).createdAt || a.uploadedAt || 0
          ).getTime();
          return t >= day.getTime() && t < next.getTime();
        }).length,
      });
    }

    const weekly: UsageAnalyticsDto["periods"]["weekly"] = [];
    for (let w = 3; w >= 0; w--) {
      const weekStart = startOfDay(
        new Date(now.getTime() - (w * 7 + 6) * 86400000)
      );
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
      const weekProjects = await Projects.countDocuments({
        orgId: orgOid,
        createdAt: { $gte: weekStart, $lt: weekEnd },
      });
      weekly.push({
        weekStart: isoDate(weekStart),
        projectsCreated: weekProjects,
        assetsUploaded: assets.filter((a) => {
          const t = new Date(
            (a as { createdAt?: Date }).createdAt || a.uploadedAt || 0
          ).getTime();
          return t >= weekStart.getTime() && t < weekEnd.getTime();
        }).length,
      });
    }

    const monthly: UsageAnalyticsDto["periods"]["monthly"] = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1)
      );
      const next = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
      );
      const monthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      monthly.push({
        month: monthKey,
        projectsCreated: await Projects.countDocuments({
          orgId: orgOid,
          createdAt: { $gte: d, $lt: next },
        }),
        assetsUploaded: assets.filter((a) => {
          const t = new Date(
            (a as { createdAt?: Date }).createdAt || a.uploadedAt || 0
          ).getTime();
          return t >= d.getTime() && t < next.getTime();
        }).length,
      });
    }

    return {
      organizationId,
      generatedAt: now.toISOString(),
      totals: {
        projects,
        briefs,
        assets: assets.length,
        storageBytes,
        teamMembers,
        brands,
      },
      periods: { daily, weekly, monthly },
    };
  }
}

export const usageAnalyticsService = new UsageAnalyticsService();

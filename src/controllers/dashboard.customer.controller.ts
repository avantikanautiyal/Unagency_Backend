import { asyncHandler } from "../utils/asyncHandler";
import Projects from "../models/projects.model";
import { RequestUser } from "../types/user";
export const ProjectCountProgress = asyncHandler(async (req : RequestUser, res) => {




    // Fetch all projects for this user
    const allProjects = await Projects.find({
        userId : req.user?.userId,
    });

    // Define which statuses are considered "complete"
    const completeStatuses = ["approved", "closed"];

    // Calculate total project count
    const totalProjectCount = allProjects.length;

    // Calculate completed and in-progress counts
    const completedCount = allProjects.filter(
        (project) => completeStatuses.includes(project.status)
    ).length;

    const inprogressCount = totalProjectCount - completedCount;

    // Example: respond with the counts and (optionally) project list
    res.json({
        totalProjects: totalProjectCount,
        completed: completedCount,
        inprogress: inprogressCount
    });

    
  });
  
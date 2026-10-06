import { Router } from "express";
import {
  CreateTask,
  TaskList,
  TaskListByUserId,
  TaskListForResource,
  UpdateTask,
  getTaskById,
  ClientReviewTask,
} from "../controllers/tasks.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";

const router = Router();
// descs : it's allows servecing tems to create a task for a resource
router.post("/", VerifyRole(["servicing"]), fileUpload.array("files", 10), CreateTask);
// desc : its allows a resource to fetch all assigned task and allows a servecing all the assigned task to a resources
router.get("/", VerifyRole(["servicing", "resource", "admin", "superadmin"]), TaskList);
// desc : its allows a resource to fetch its 1 week task to use it in a kanbanboard
router.get("/kanban", VerifyRole(["resource"]), TaskListForResource);

// Client reviews a CS-shared draft (approve → Admin QC, or request changes)
router.post(
  "/client-review/:taskId",
  VerifyRole(["customer"]),
  ClientReviewTask
);

// its allows a servecing and resoruce to fetch there task in the chat
router.get("/:userId", VerifyRole(["servicing", "resource", "admin", "superadmin"]), TaskListByUserId);

// its allow a resoruce and servervecing to update a task assigned to a resource
router.put(
  "/update/:taskId",
  VerifyRole(["servicing", "resource", "admin", "superadmin"]),
  fileUpload.array("files", 50),
  UpdateTask
);

// get task by id
router.get(
  "/task-by-id/:id",
  VerifyRole(["servicing", "resource", "admin", "superadmin", "customer"]),
  getTaskById
);

export default router;

import { Router } from "express";
import { CreateTask, TaskList, TaskListByUserId, TaskListForResource, UpdateTask } from "../controllers/tasks.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/", VerifyRole(["servicing"]), CreateTask);
router.get("/", VerifyRole(["servicing", "resource"]), TaskList);
router.get("/kanban", VerifyRole(["resource"]), TaskListForResource);
router.get("/:userId", VerifyRole(["servicing", "resource"]), TaskListByUserId);
router.put("/update/:taskId", VerifyRole(["servicing", "resource"]), UpdateTask);

export default router;

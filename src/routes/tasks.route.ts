import { Router } from "express";
import { CreateTask, TaskList, TaskListByUserId } from "../controllers/tasks.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/", VerifyRole(["servicing"]), CreateTask);
router.get("/", VerifyRole(["servicing", "resource"]), TaskList);
router.get("/:userId", VerifyRole(["servicing", "resource"]), TaskListByUserId)

export default router;

import { Router } from "express";
import { CreateTask, TaskList } from "../controllers/tasks.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
router.post("/", VerifyRole(["servicing"]), CreateTask);
router.get("/", VerifyRole(["servicing", "resource"]), TaskList);

export default router;

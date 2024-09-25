import { Router } from "express";
import {
  createProject,
  fetchClientProject,
  fetchClientProjectById,
  fetchProject,
  fetchProjectById,
  updateProject,
} from "../controllers/project.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.get("client/:projectId", VerifyUserHandler, fetchClientProjectById);
router.get("/client", VerifyUserHandler, fetchClientProject);
router.get("/:projectId", VerifyUserHandler, fetchProjectById);
router.post("/update/:projectId", VerifyUserHandler, updateProject);
router.post("/:id", VerifyUserHandler, fetchProjectById);
router.get("/", VerifyUserHandler, fetchProject);
router.post("/", VerifyUserHandler, createProject);

export default router;

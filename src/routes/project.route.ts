import { Router } from "express";
import {
  createProject,
  fetchMyAllCustomerProjectList,
  fetchProjectListByClientId,
  fetchClientProjectById,
  fetchProjectList,
  fetchProjectById,
  updateProject,
} from "../controllers/project.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();

router.get("/assigned-projects", VerifyUserHandler, fetchMyAllCustomerProjectList);
router.get("client/:projectId", VerifyUserHandler, fetchClientProjectById);
router.get("/client", VerifyUserHandler, fetchProjectListByClientId);
router.get("/:projectId", VerifyUserHandler, fetchProjectById);
router.post("/update/:projectId", VerifyUserHandler, updateProject);
router.post("/:id", VerifyUserHandler, fetchProjectById);
router.get("/", VerifyUserHandler, fetchProjectList);
router.post("/", VerifyUserHandler, createProject);

export default router;

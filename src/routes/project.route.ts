import { Router } from "express";
import {
  createProject,
  fetchProject,
  fetchProjectById,
  updateProject,
} from "../controllers/project.controller";

const router = Router();
router.post("/update", updateProject);
router.post("/:id", fetchProjectById);
router.get("/", fetchProject);
router.post("/", createProject);

export default router;

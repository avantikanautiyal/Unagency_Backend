import { Router } from "express";
import {
  createProject,
  FetchAssignedProjects,
  fetchProjectListByClientId,
  fetchProjectById,
  updateProject,
  getProjectLogs,
  createProjectLogs,
  FetchMyProjects,
} from "../controllers/project.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";

const router = Router();

//Desc: It allows servicing team to fetch their customer's project list
router.get(
  "/assigned-projects",
  VerifyRole(["servicing"]),
  FetchAssignedProjects
);
//Desc: This APi allows customer and servicing to fetch customer Projects
router.get(
  "/client/:userId",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchProjectListByClientId
);

//Desc: It allows to fetch a project using Project id
router.get(
  "/:projectId",
  VerifyRole(["servicing", "customer"]),
  fetchProjectById
);
//It allows servicing to update basic information of project
router.post("/update/:projectId", VerifyRole(["servicing"]), updateProject);

//Desc: It allows customer to fetch the project List
router.get("/", VerifyRole(["customer"]), FetchMyProjects);
//Desc :  It allows servicing to create a project for their customers
router.post("/", VerifyRole(["servicing"]), fileUpload.array("files", 10), createProject);

//Desc: It allows users to fetch Logs of a Specific Project
router.get(
  "/logs/:projectId",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  getProjectLogs
);
//Desc: It allows user to update the stage of a Project
router.get(
  "/update-log/:customerId/:projectId/:stage",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  createProjectLogs
);

export default router;

import { Router } from "express";
import {
  createProject,
  fetchMyAllCustomerProjectList,
  fetchProjectListByClientId,
  fetchClientProjectById,
  fetchProjectList,
  fetchProjectById,
  updateProject,
  getProjectLogs,
  createProjectLogs,
} from "../controllers/project.controller";
import {
  VerifyRole,
  VerifyUserHandler,
} from "../middlewares/verifyUser.middleware";

const router = Router();

router.get(
  "/assigned-projects",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchMyAllCustomerProjectList
);
router.get(
  "client/:projectId",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchClientProjectById
);
router.get(
  "/client",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchProjectListByClientId
);
router.get(
  "/:projectId",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchProjectById
);

router.post(
  "/update/:projectId",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  updateProject
);
router.post(
  "/:id",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchProjectById
);
router.get(
  "/",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  fetchProjectList
);
router.post(
  "/",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  createProject
);

//-------------Project Logs-----------------------------
router.get(
  "/logs/:projectId",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  getProjectLogs
);

router.get(
  "/update-log/:customerId/:projectId/:stage",
  VerifyRole(["superadmin", "admin", "resource", "servicing", "customer"]),
  createProjectLogs
);

export default router;

import { Router } from "express";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { ProjectCountProgress } from "../controllers/dashboard.customer.controller";

const dashboardRoute = Router();

dashboardRoute.get("/customer-project-count",ProjectCountProgress);

export default dashboardRoute;

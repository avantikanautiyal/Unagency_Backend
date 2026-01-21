import { Router } from "express";
import { getAllPlans, updatePlanLimits, checkUserPlanLimit, checkUserPlanLimitByUserId } from "../controllers/plan.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();

router.route("/check-limit").get(VerifyUserHandler, checkUserPlanLimit);
router.route("/check-limit/:userId").get(VerifyUserHandler, checkUserPlanLimitByUserId);

router.route("/").get(getAllPlans);
router.route("/:id").put(updatePlanLimits);

export default router;

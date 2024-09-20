import { Router } from "express";
import { helloWrld } from "../controllers/helloWorld.controller";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";

const router = Router();
router.get("/", helloWrld);

export default router;

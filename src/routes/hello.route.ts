import { Router } from "express";
import { helloWrld } from "../controllers/helloWorld.controller";

const router = Router();
router.get("/", helloWrld);

export default router;

import { Router } from "express";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { getInternalUserList, createResourseChat } from "../controllers/resourse.controller";

const router = Router();

// create chat for any internal user's / member
router.post("/create-chat", createResourseChat);

// search the list of internal users to create a chat
router.post("/list", getInternalUserList);

export default router;
import { Router } from "express";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";
import {
    createRequirement,
    getCustomerRequirement

} from "../controllers/requirement.controller";

const router = Router();
router.post("/create", VerifyUserHandler, fileUpload.array("attach"),
    createRequirement);
router.get("/:userId", VerifyUserHandler, getCustomerRequirement);



export default router;

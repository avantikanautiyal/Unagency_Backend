import { Router } from "express";
import { VerifyUserHandler } from "../middlewares/verifyUser.middleware";
import { fileUpload } from "../middlewares/multers3.middleware";
import {
    createRequirement,
    getCustomerRequirement,
    getRequirement

} from "../controllers/requirement.controller";

const router = Router();
/* -------------------{ custoemr }-----------------------*/

router.post("/create", VerifyUserHandler, fileUpload.array("attach"), createRequirement);
router.get("/", VerifyUserHandler, getRequirement);

/* -------------------{ servicing }-----------------------*/
router.get("/:userId", VerifyUserHandler, getCustomerRequirement);



export default router;

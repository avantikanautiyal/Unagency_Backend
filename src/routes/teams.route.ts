import { Router } from "express";
import {
  AddMemberInOrganization,
  fetchUserTeam,
  RemoveMemberInOrganization,
} from "../controllers/teams.controller";

const router = Router();
router.post("/add-member", AddMemberInOrganization);
router.post("/remove-member", RemoveMemberInOrganization);
router.post("/fetch-team", fetchUserTeam);

export default router;

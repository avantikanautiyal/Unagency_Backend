import { Router } from "express";
import {
  AddMemberInOrganization,
  fetchUserTeam,
  RemoveMemberInOrganization,
  InviteMemberInOrgnization
} from "../controllers/teams.controller";

const router = Router();
router.post("/invite-member", InviteMemberInOrgnization);
router.post("/add-member", AddMemberInOrganization);
router.post("/remove-member", RemoveMemberInOrganization);
router.get("/fetch-team", fetchUserTeam);

export default router;

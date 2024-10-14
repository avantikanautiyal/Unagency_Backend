import { Router } from "express";
import {
  AddMemberInOrganization,
  fetchUserTeam,
  RemoveMemberInOrganization,
  InviteMemberInOrgnization,
  // getMembersInvitations,
  getMyInvitations,
  inviteAction,
} from "../controllers/teams.controller";

const router = Router();
// Invitation flow
router.post("/invite-member", InviteMemberInOrgnization);
router.patch("/invite-action", inviteAction);

// router.get("/invitation", getMembersInvitations);
router.get("/my-invitation", getMyInvitations);

router.post("/add-member", AddMemberInOrganization);
router.post("/remove-member", RemoveMemberInOrganization);
router.get("/fetch-team", fetchUserTeam);

export default router;

import { Router } from "express";
import {
  fetchUserTeam,
  RemoveMemberInOrganization,
  getMyInvitations,
  inviteAction,
  InviteMemberInOrganization,
  getCustomerTeamByOrganizationId,
} from "../controllers/teams.controller";
import { VerifyRole } from "../middlewares/verifyUser.middleware";

const router = Router();
//Desc: It allows customer to send invitation to join organization
router.post(
  "/invite-member",
  VerifyRole(["customer"]),
  InviteMemberInOrganization
);
//Desc:  It allows to update the status of Invitation in the team
router.patch("/invite-action", VerifyRole(["customer"]), inviteAction);
//Desc: It allow customer to fetch their invitations to join organization.
router.get("/my-invitation", VerifyRole(["customer"]), getMyInvitations);
//Desc: It allow customer to remove member from the organization.
router.post(
  "/remove-member",
  VerifyRole(["customer"]),
  RemoveMemberInOrganization
);
//Desc: It allow customer to fetch all members in the organization.
router.get("/fetch-team", VerifyRole(["customer"]), fetchUserTeam);

router.get("/client-team/:organizationId", getCustomerTeamByOrganizationId);

export default router;

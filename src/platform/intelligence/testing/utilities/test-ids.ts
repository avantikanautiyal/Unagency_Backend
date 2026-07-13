/**
 * Test ID helpers (scaffolding). Not used by production code.
 */

import {
  asOrganizationId,
  asUserId,
  asWorkspaceId,
} from "../../shared/identifiers";

export const TEST_ORGANIZATION_ID = asOrganizationId("org_test");
export const TEST_WORKSPACE_ID = asWorkspaceId("ws_test");
export const TEST_USER_ID = asUserId("user_test");

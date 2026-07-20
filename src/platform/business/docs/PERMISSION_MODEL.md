# Permission Model

Roles: `owner` · `admin` · `manager` · `contributor` · `reviewer` · `viewer` · `billing`

Permissions include `org:manage`, `campaign:manage`, `execution:request`,
`approval:decide`, `billing:manage`, `analytics:read`, etc.

Defined in `organizations/permissions.ts`. Independent from Enterprise API Gateway RBAC
(product roles vs transport roles).

`requestExecution` requires `execution:request` on the acting user.

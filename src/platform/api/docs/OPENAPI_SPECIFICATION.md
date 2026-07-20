# OpenAPI Specification (3.0)

Canonical machine-readable summary for SDK generation. Full route map:
`routes/route-map.ts`.

```yaml
openapi: 3.0.3
info:
  title: UNAGENCY Enterprise API
  version: 1.0.0
  description: Sole external entry point to the UNAGENCY platform.
servers:
  - url: /v1
  - url: /v2
paths:
  /health:
    get:
      summary: Gateway health
      security: []
      responses:
        "200":
          description: Healthy
  /auth/login:
    post:
      summary: Login (JWT / session / oauth abstraction)
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [email, password, organizationId, deviceId]
              properties:
                email: { type: string }
                password: { type: string }
                organizationId: { type: string }
                deviceId: { type: string }
                scheme: { type: string, enum: [jwt, oauth, session] }
      responses:
        "201":
          description: Issued token
  /executions:
    post:
      summary: Create execution
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [prompt, organizationId]
              properties:
                prompt: { type: string }
                organizationId: { type: string }
                workspaceId: { type: string }
                capabilityId: { type: string }
                stream: { type: boolean }
    get:
      summary: Execution history
      security: [{ bearerAuth: [] }]
  /executions/{executionId}:
    get:
      summary: Get execution
      parameters:
        - in: path
          name: executionId
          required: true
          schema: { type: string }
  /executions/{executionId}/stream:
    get:
      summary: Stream execution (SSE frames in JSON envelope)
  /capabilities:
    get:
      summary: List capabilities
  /providers:
    get:
      summary: Provider catalog
  /models:
    get:
      summary: Model catalog
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
    apiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
```

Export runtime: `gateway.listRoutes()` for exhaustive path inventory.

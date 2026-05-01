# Themis API Guide for Agents

This guide is for coding agents, workflow agents, and API clients that need to interact with
Themis without reading the frontend source.

## Discovery

- RapiDoc UI: `GET /docs.html`
- OpenAPI: `GET /openapi.yaml`
- Agent manifest: `GET /.well-known/themis-agent.json`
- Plugin-compatible manifest: `GET /.well-known/ai-plugin.json`
- LLM index: `GET /llms.txt`

## Authentication

Most endpoints require a Themis JWT:

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "<password>"
}
```

Use the returned token on later calls:

```http
Authorization: Bearer <token>
```

OAuth/OIDC browser login starts at `GET /api/auth/oauth/start`. The callback stores a Themis
JWT for the browser session.

## Roles

- `viewer`: read-only.
- `engineer`: can create changes and deploy approved changes, but cannot approve their own changes.
- `admin`: full access, including settings, user roles, and force device deletion.

## Common Workflows

### Inventory

1. `GET /api/devices`
2. `GET /api/devices/{id}`
3. `GET /api/devices/{id}/golden-configs`
4. `GET /api/devices/{id}/drift`

### Create a Single-Device Change

1. `POST /api/devices/{id}/changes`
2. `GET /api/changes/{change_id}`
3. `POST /api/changes/{change_id}/approve`
4. `GET /api/changes/{change_id}/deploy`

Deployment output is streamed as Server-Sent Events from the deploy endpoint.

### Create a Batch Change

1. `GET /api/devices`
2. Pick devices with the same OS.
3. `POST /api/changes/batch`
4. Approve the parent change once.
5. `GET /api/changes/{batch_parent_change_id}/deploy`

### Drift Remediation

1. `GET /api/drift`
2. Review `current_config` against the linked golden config.
3. `POST /api/drift/{id}/accept` to create a change from drift, or
4. `POST /api/devices/{device_id}/revert-golden` to replace the device config with golden.

## Safety Notes

- Do not deploy pending changes with unresolved comments.
- Treat `full_config` as sensitive.
- Device passwords are write-only and are not returned by the API.
- Config deployment and golden revert can impact live network devices.

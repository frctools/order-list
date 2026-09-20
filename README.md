# FRCTools Orders

A simple order list app for FRC teams.

## Features

- 📦 **Order Management** - Track parts from "to order" to "arrived"
- 👥 **Team Collaboration** - Invite team members with role-based access
- 🏷️ **Tags** - Organize orders with custom tags and colors


## Development

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production
bun run build
```

## MCP server

The authenticated remote MCP endpoint is available at `/mcp`. It uses Better
Auth's OAuth 2.1 flow and exposes read-only tools for organizations, projects,
and orders:

- `list_organizations`
- `list_projects`
- `list_orders`

## API keys

Organization owners can create and revoke API keys from Organization Settings.
Use a key in the `x-api-key` header with the read-only API:

- `GET /api/v1/projects`
- `GET /api/v1/tags`
- `GET /api/v1/orders` (optionally `?projectId=...`)

## Stack

- [Nuxt 4](https://nuxt.com)
- [Nuxt UI](https://ui.nuxt.com)
- [Better Auth](https://www.better-auth.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [Cloudflare Workers](https://workers.cloudflare.com)

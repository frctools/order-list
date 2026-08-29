# Innovators Parts

*Powered by FRCTools*

A parts ordering and tracking app for FRC teams. Parts are grouped into
per-vendor purchase orders and tracked from "to order" through "ordered" to
"arrived".

## Credits

Innovators Parts is a fork of [FRCTools Orders](https://github.com/frctools/order-list)
by **[Graham Howard](https://github.com/GrahamSH-LLK)**, with a contribution
from [Th3F4nd1t](https://github.com/Th3F4nd1t). Graham wrote the original
application — the order board, organizations, tags, the Onshape BOM import,
and the vendor product lookup this build still stands on. It remains MIT
licensed, and the original copyright is retained in [LICENSE](LICENSE).

This fork has since diverged enough that its changes aren't intended to go
back upstream. Thanks to Graham for the foundation, and for making it open
source in the first place.

## Features

- 📦 **Purchase orders** — parts grouped per vendor, tracked to arrival
- 👥 **Team collaboration** — invite members with role-based access
- 🏷️ **Tags** — organize parts with custom tags and colors
- 🔎 **Vendor lookup** — paste a product link and get name, price and part number
- 🛒 **Cart handoff** — hand a whole order to the vendor's own cart in one click
- 📥 **BOM import** — bring a Bill of Materials straight in from Onshape

## Development

```bash
# Install dependencies
bun install

# Local Postgres
docker compose up -d

# Start development server
bun run dev

# Apply database migrations
bun run db:migrate

# Build for production
bun run build
```

See [CLAUDE.md](CLAUDE.md) for architecture notes, the deploy ordering
migrations require, and the per-vendor quirks behind product lookup.

## Stack

- [Nuxt 4](https://nuxt.com)
- [Nuxt UI](https://ui.nuxt.com)
- [Better Auth](https://www.better-auth.com)
- [Drizzle ORM](https://orm.drizzle.team)
- [Cloudflare Workers](https://workers.cloudflare.com)

## License

MIT — see [LICENSE](LICENSE).

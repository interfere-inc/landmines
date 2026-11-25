---
"@interfere/landmines": patch
---

Stop `max-exports-per-module` counting the Durable Object, Workflow and entrypoint classes a Cloudflare Worker's wrangler `main` exports because its wrangler config binds them.

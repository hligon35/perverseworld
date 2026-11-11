# Perverse World

Branded multi-page streetwear storefront, AlphaZoneLabs admin shell, Cloudflare Worker and Expo hybrid app.

## Public pages

| URL | Content |
| --- | --- |
| `/` | Brand hero, featured products, signature collection and newsletter |
| `/shop` | Complete product catalog, size selection and bag |
| `/collections` | Collection discovery and featured artwork |
| `/collections/tees` | Graphic tees |
| `/collections/hoodies` | Hoodies |
| `/collections/sets` | Sets and graphics |
| `/about` | Brand story |
| `/contact` | Contact form and social links |
| `/admin/` | Access-protected operations dashboard |

Pages share the original visual identity and embedded product photography. The WebView Expo app loads the same site. Page transitions keep bag selections for the current browser session.

## Development

```bash
npm install
npm run check
npm run dev
```

`npm run build` runs validation; this static site does not need a frontend compilation step. `npm run deploy` validates and deploys the Worker after Cloudflare configuration is complete.

## Cloudflare setup

Before deploying, replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml` with the actual database ID, then configure Cloudflare Access JWT validation and admin allowlisted emails. Provision Turnstile, verified outbound email and inbound email routing for public submissions/newsletters/mailbox. Bind the custom domains in your Cloudflare account. Do not put secrets in the repository.

```bash
npm run db:remote
npm run deploy
```

Current shopping bag and checkout are a **demo**, not a payment-integrated commerce system. Confirm product prices and inventory before launch.

## Structure

- `public/index.html` — original brand design, product images, cart and product modal
- `public/site-pages.js`, `public/site-pages.css` — multi-page layouts and navigation
- `public/storefront-api.js` — live catalog and customer form integration
- `public/brand-ui.js`, `public/brand-ui.css` — Material Symbols and studio attribution
- `public/admin/` — AlphaZoneLabs-style protected admin UI
- `src/worker.js` — public routes, protected APIs and email integration
- `migrations/` — D1 schema
- `apps/mobile/` — Expo shell

Official repository: **hligon35/perverseworld** (no dash).

## Cloudflare Turnstile

Turnstile is integrated into **newsletter subscriptions** and **contact submissions**. Each form renders its own challenge, with action names `newsletter` and `contact`; the Worker verifies every submitted token using Cloudflare's Siteverify endpoint, including success, hostname and expected action. Tokens are never trusted solely on the client. When the widget is unconfigured, the public forms fail closed.

1. In the Cloudflare dashboard, open **Turnstile**, create a managed widget for `perverseworld.com` (and `www.perverseworld.com` if used), then copy its **site key** and **secret key**.
2. In your Worker settings, set `TURNSTILE_SITE_KEY` to the **public site key** (a nonsecret environment variable). The variable is included in the public `/api/config` response.
3. Store the **secret key only as a Worker secret**:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

4. For local development, set equivalent values in an untracked `.dev.vars` file. The API rejects unverified requests even when testing locally. The Worker compares the Siteverify hostname to `PUBLIC_BASE_URL`; if using a `localhost` testing widget, configure `TURNSTILE_ALLOW_LOCALHOST=true` only for development.
5. Deploy with `npm run deploy` and verify newsletter signup and contact submissions on the live domain. Avoid using real mailing-list addresses for test submissions.

**Security:** Do not place `TURNSTILE_SECRET` in `wrangler.toml`, `.env.example`, frontend code, or GitHub. The domain and secret must be configured in the actual Cloudflare account before the forms can accept submissions.

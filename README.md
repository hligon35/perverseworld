# Perverse World

Branded multi-page streetwear storefront, protected admin dashboard, Cloudflare Worker and Expo hybrid app.

## Public pages

| URL | Content |
| --- | --- |
| `/` | Brand meaning, World Logo Hoodie feature and newsletter |
| `/shop` | Complete product catalog, size selection and bag |
| `/contact` | Verified contact form |
| `/admin/` | Access-protected operations dashboard |

Pages share the original visual identity and original product photography, extracted into reusable image files. The WebView Expo app loads the same site. Page transitions and refreshes keep bag selections for the current browser session, including products added through the API. Existing id/size-only sessions are migrated.

The storefront has three main pages, with individual product pages under `/shop/`. Header and footer components share Home, Shop and Contact navigation; desktop shows links and mobile shows a hamburger menu. The brand story lives on Home at `/#story`. Previous `/about` links redirect there, while `/collections` and its former category pages redirect to `/shop`, where category filters remain available. Storefront buttons have no arrow glyphs, and Instagram links have been removed.

Visitors first see the coming-soon landing screen on each storefront route. Clicking or tapping the mushroom cloud on the original logo seven times within a rolling five-second window reveals the site. Entry persists in session storage across Home, Shop, Contact and refreshes; if browser storage is unavailable, entry still works on the current page. The landing page has its own newsletter form and Turnstile widget. Catalog requests and storefront form widgets start after entry. This launch reveal is a browser interaction, not an authorization mechanism; admin documents and APIs retain Cloudflare Access protection independently. Home and Shop navigation icons are rendered in the shared components, with consistent footer icon and label alignment.

## Development

```bash
npm ci --workspaces=false
npm run build
npm run db:local
npm run dev
```

`npm run build` generates three main pages and four complete product pages in `dist/`, copies shared assets and the protected admin UI, checks JavaScript and runs the test suite. It requires Node.js 22.14 or newer and installed build dependencies, including Sharp for deterministic icon generation; no frontend framework or browser rendering is needed. Product cards, navigation, titles, prices and descriptions are present before JavaScript runs. Client code enhances catalog filtering, product galleries, item selection, live products, the bag and verified forms; it never switches pages by hiding unrelated sections.

With the local Worker running and the local migration applied, `npm run smoke` checks direct URLs, trailing-slash redirects, 404 responses, protected admin/API paths and the seeded catalog. `npm run mobile:check` runs strict TypeScript checks for the Expo Router wrapper. Use `npm ci` to install all workspaces for an Expo simulator or device build; a native device build is not part of the static web build.

Cloudflare Workers Builds should use `npm ci --workspaces=false` as its install command and `npm run build` as its build command. Static output is `dist/`, as configured in `wrangler.toml`. Ordinary static hosting can also serve these generated files when configured to resolve `/shop` to `shop.html` and other extensionless paths similarly; API/admin security requires the Worker. Workers assets use `html_handling = "drop-trailing-slash"` and a genuine 404 document. There is no SPA fallback or index rewrite.

## Cloudflare setup

Deployment is intentionally blocked by `npm run deploy:verify` while configuration is incomplete or verification has not been acknowledged. D1, Access, admin allowlist and public Turnstile values are configured in `wrangler.toml`; passing local checks confirms their presence, not the state of remote services, domain bindings or live forms.

Before deployment, verify:

- Actual D1 database ID and applied production migrations.
- Cloudflare Access application/policy covering `/admin*` and `/api/admin/*`, matching JWT issuer/audience and admin email allowlist. Worker authentication remains required for all admin documents and assets, even on workers.dev.
- Turnstile public key, Worker secret `TURNSTILE_SECRET`, widget hostnames `perverseworld.com` and `www.perverseworld.com`, and both action names.
- Worker secret `RESEND_API_KEY`, verified outbound sender/domain, and the signed Resend receiving webhook. Preserve the existing Resend MX records.
- Both custom domains/DNS bindings and the Workers Builds connection to **hligon35/perverseworld**, branch `main`.

Use `npm run deploy` as the connected deployment command. Wrangler's custom build also runs the guard when Cloudflare sets `WORKERS_CI=1`, blocking even the default Workers Builds deployment command until verification is acknowledged. The [Cloudflare build environment documentation](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/#default-variables) describes this variable. Disable any other automatic release pipelines until configuration is verified. Direct local `wrangler deploy` bypasses the npm deployment guard and must not be used before verification. The acknowledgement below records the operator's remote verification; the guard itself does not inspect Cloudflare account state. Do not commit secrets.

The guard accepts the nonsecret acknowledgement `CLOUDFLARE_CONFIGURATION_VERIFIED=true` from the process environment, an untracked root `.env` (loaded for local commands), or `[vars]` in `wrangler.toml`, in that order. An explicitly set process value, including `false` or an empty value, overrides file values. For Cloudflare, process variables belong under **Settings > Build > Build variables and secrets**; **Settings > Variables & Secrets** configures the deployed Worker runtime and does not by itself set the build process environment. Your local `.env` is intentionally ignored by Git and is not uploaded to Cloudflare. No secret values are printed by the guard.

### Admin sign-in

Open `https://perverseworld.com/admin/` and sign in through Cloudflare Access with an allowlisted admin email. A path policy for `/admin/*` can miss bare `/admin`: the Worker redirects that entry point to `/admin/`, and `www` admin document/asset visits to the apex domain, before serving any protected content. After authentication, `/admin/` resolves the internal clean asset URL without a trailing-slash redirect loop. All dashboard content, assets and APIs still require a valid signed Access assertion.

Ensure the Access application covers the apex `/admin/` and `/admin/*` paths plus `/api/admin/*`, with the application's audience matching `ADMIN_ACCESS_AUD` and its team URL matching `ADMIN_ACCESS_ISSUER`. These Worker variables do not create an Access application or login policy. If the browser returns a 401 after a completed Access login, check the audience, issuer and signed-in email against the Worker settings. Unauthenticated API calls continue to fail closed.

```bash
npm run db:remote
# Only after the remote checks above (PowerShell):
$env:CLOUDFLARE_CONFIGURATION_VERIFIED = "true"
npm run deploy
```

The bag's **Ask about your bag** action opens Contact with an order enquiry and selected pieces prefilled. Customers send their enquiry through the verified contact form; no payment is collected. Product details and prices remain editable through the protected admin.

## Structure

- `src/site/layout.html` — shared document layout and asset imports
- `src/site/components/` — shared header, footer, bag, hero, catalog, story and newsletter
- `src/site/pages/` — actual content for each storefront page
- `src/site/routes.js` — route metadata used during generation
- `src/site/products.json` — preview catalog and original image references
- `src/site/catalog-policy.js` — retired product IDs and the fixed World Logo Hoodie homepage feature
- `scripts/build.mjs` — static generator; `dist/` is ignored and rebuilt cleanly
- `public/assets/css/` — original design, page layouts and form styles
- `public/assets/js/` — catalog/bag behavior and live API/Turnstile integration
- `public/assets/images/` — original logo and four available product images
- `public/brand-ui.js`, `public/brand-ui.css` — Material Symbols and studio attribution
- `public/admin/` — AlphaZoneLabs-style protected admin UI
- `src/worker.js` — public routes, protected APIs and email integration
- `migrations/` — D1 schema
- `apps/mobile/` — TypeScript Expo Router wrapper

Official repository: **hligon35/perverseworld** (no dash).

The public catalog contains Worldscape Tee ($28), Perverse Puppeteer Tee ($28), Midnight Terror Hoodie ($65), and World Logo Set (from $45). The set's product page offers World Logo Hoodie ($65) and World Logo Sweatpants ($45) as individually priced pieces. It keeps separate selections and sizes in the bag. Home features only the hoodie, linking to `/shop/world-logo-set?item=hoodie`. Product pages use the supplied front, back and modeled images without cropping the garments. The retained transparent logo is referenced by its new filename, `perverse-world-logo.png`.

Otherworld Graphic Tee (ID 1) and Possessed Hand Graphic (ID 6) remain retired. Migration `0002_retire_non_products.sql` archives them without deleting history. Migration `0003_update_product_catalog.sql` updates names, prices and categories, and adds stored item pricing for the World Logo set. Apply pending production migrations using the existing verified migration workflow before saving product edits through the updated admin. The public API upgrades untouched seeded records and resolves built-in imagery from the current source catalog, so obsolete image URLs and original seed pricing do not return before migration. Existing administrator edits are preserved. The admin provides separate hoodie and sweatpants price fields; the listing's starting price is calculated from those prices.

## Cloudflare Turnstile

Turnstile is integrated into **newsletter subscriptions** and **contact submissions**. Each form renders its own challenge, with action names `newsletter` and `contact`; the Worker verifies every submitted token using Cloudflare's Siteverify endpoint, including success, hostname and expected action. Tokens are never trusted solely on the client. When the widget is unconfigured, the public forms fail closed.

1. In the Cloudflare dashboard, open **Turnstile**, create a managed widget for `perverseworld.com` (and `www.perverseworld.com` if used), then copy its **site key** and **secret key**.
2. Set `TURNSTILE_SITE_KEY` in the reviewed `wrangler.toml` to the **public site key** (a nonsecret variable). The variable is included in the public `/api/config` response. If managing variables in the dashboard instead, update the deployment guard to inspect that reviewed configuration and avoid overwriting it with blank file values.
3. Store the **secret key only as a Worker secret**:

   ```bash
   npx wrangler secret put TURNSTILE_SECRET
   ```

4. For local development, set equivalent values in an untracked `.dev.vars` file. The API rejects unverified requests even when testing locally. The Worker compares the Siteverify hostname to `PUBLIC_BASE_URL`; if using a `localhost` testing widget, configure `TURNSTILE_ALLOW_LOCALHOST=true` only for development.
5. Deploy with `npm run deploy` and verify newsletter signup and contact submissions on the live domain. Avoid using real mailing-list addresses for test submissions.

**Security:** Do not place `TURNSTILE_SECRET` in `wrangler.toml`, `.env.example`, frontend code, or GitHub. The domain and secret must be configured in the actual Cloudflare account before the forms can accept submissions.


### Admin images, stock and inbox

The admin uses shared navigation, a mobile drawer and Cloudflare Access logout. Its assets and APIs still require a verified, allowlisted Access identity. Product photos upload to the existing R2 bucket `perverse-world` through the `PRODUCT_IMAGES` binding. JPEG, PNG and WebP uploads are limited to 5 MB each, checked by file signature and served at immutable public `/media/products/{uuid}.{ext}` URLs. R2 public bucket access is not required. The first photo in each gallery is its cover; move buttons arrange the order. The World Logo listing, hoodie and sweatpants have separate galleries. Stock uses size/quantity rows, including separate item stock, and sold-out sizes are disabled in the storefront. Apply migration `0004_admin_media.sql` before releasing this code.

The domain currently receives through Resend (`receive.forge.rmta.net`); preserve its MX records. To activate the inbox:

1. Add a full-access `RESEND_API_KEY` to the `perverse-world` Worker's secrets. A send-only key cannot read received messages. Confirm the domain is verified for sending, including `info@perverseworld.com` and `updates@perverseworld.com`.
2. In Resend, add webhook `https://perverseworld.com/api/webhooks/resend`, subscribed to `email.received`. Store its signing secret as Worker secret `RESEND_WEBHOOK_SECRET`.
3. The webhook must be publicly reachable without a Cloudflare Access sign-in challenge. Authentication is its HMAC signature, checked against the exact raw body and a five-minute timestamp window. Keep `/admin/*` and `/api/admin/*` protected. Public `/api/products`, `/api/config`, contact/newsletter form endpoints and product media must also remain public.
4. Incoming events retrieve the full email from Resend and import only messages addressed to `info@perverseworld.com`. A unique provider ID prevents duplicate messages on retries. Use **Sync recent mail** to import the latest received messages; **Sync older mail** pages backward. Inbox, unread, sent and archive folders include search and pagination. Opening a message marks it read. Replies send from `info@perverseworld.com` and retain message references for threading. Bodies display as safe plain text; attachment names are shown, but attachment files are not stored.

Cloudflare's email handler also supports the exact info address with MIME decoding if receiving is deliberately moved there later. Do not enable Cloudflare Email Routing over the current Resend MX records.

Campaign previews and delivery share `public/assets/js/newsletter-template.js`. Every email includes the logo, dark/orange styling, campaign preheader, shop link, contact link and a recipient-specific unsubscribe link. Previewing or saving a draft sends no email. Campaign sending remains an explicit admin action to opted-in subscribers.

### Admin analytics

Open **Analytics** in the drawer (`/admin/#analytics`). The Access-protected `/api/admin/analytics?days=7|30|90` report includes daily activity and previous-period comparisons, top pages, product bag additions, contact enquiries, newsletter sign-ups, inbox/reply counts, campaign sends, current audience and current stock health. Date ranges use inclusive UTC calendar days; previous periods have the same length and do not overlap. World Logo stock counts the hoodie and sweatpants separately without also counting the shared fallback stock. Inventory and audience totals are current snapshots, regardless of the activity date filter.

Apply `0005_analytics.sql` before release. Browser activity posts to **public** `/api/analytics`; Cloudflare Access must allow that endpoint without a sign-in challenge. The public collector accepts only small, same-origin requests for allowlisted storefront routes and event types. Product IDs must refer to active, non-retired products. Each request increments one server-dated aggregate counter in D1. No analytics cookies, visitor IDs, names, email addresses, query strings, referrers or IP addresses are stored in the analytics table. The browser honors Do Not Track and Global Privacy Control. Collection failures never block browsing or bag actions.

Page views include the coming soon screen. Store entries count successful gate reveals; restored sessions are not counted again as new entries. Bag enquiries count the click through to the contact form; actual contact enquiries count saved form submissions separately. Browser-reported activity is not a unique-visitor count and can be affected by blocked scripts or artificial requests. Traffic starts at release and cannot be backfilled. Existing enquiry, subscriber and email records are included immediately. Campaign sends mean accepted by the provider, not confirmed delivery; open rates, completed orders and revenue are not recorded. The daily chart has an accessible figures table and honest empty states.


## Customer email lifecycle and conversion funnel

The coming-soon screen retains the seven-click logo reveal and now offers newsletter sign-up before entry. Subscribers receive a branded confirmation email, explicitly confirm on a branded page, then receive a welcome email. An owner notification goes to `NOTIFICATION_EMAIL` (default `info@perverseworld.com`). Pending subscribers are excluded from campaigns. Existing active subscribers retain their recorded consent. Confirmation links expire after 24 hours; repeated pending requests have a five-minute cooldown. Resubscribing after opting out requires a fresh confirmation and invalidates old links. Email-link scanners cannot activate or unsubscribe users with a GET request; one-click unsubscribe POSTs are supported for email clients.

Contact submissions are saved with a unique request key and a customer-visible PW reference. The branded auto-reply includes that reference, the message and a reply-to address. The owner notification includes the sender's details and a link to submissions. Exact browser retries do not create duplicate submissions or emails. Turnstile, origin checks and honeypot protection remain enforced; contact requests are also limited per email. Customers can use the visible direct email alternative if verification is unavailable.

Migration `0006_customer_messages.sql` adds the durable email outbox and consent events. Message creation and notification enqueueing are atomic D1 transactions. Delivery runs immediately in `waitUntil` and retries every five minutes through the Worker cron. Atomic leases prevent concurrent dispatch; Resend idempotency keys prevent duplicates inside the provider's 24-hour window. Six automatic attempts use backoff, and retries stop before that window expires. Messages queued while credentials are absent remain saved. Expired confirmations and opted-out/version-changed recipients are cancelled. Sent/cancelled payloads are cleared to remove unnecessary copies of message bodies and bearer links. Failed messages needing review remain visible. No messages are sent by previewing a template.

Admin **Subscribers** supports search, status filters, pagination, confirmation resends and unsubscribing. **Email delivery** shows queued/sent/failed state, attempts and safe error summaries, with a retry control. Only allowlisted Access identities can use these controls. Analytics counts actual confirmation events without rewriting historical sign-up counts when someone rejoins.

### Required production configuration

- Worker secrets: `TURNSTILE_SECRET`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.
- Verified Resend sending domain for `updates@perverseworld.com` and `info@perverseworld.com`; full-access key for receiving APIs.
- Public routes must bypass Cloudflare Access: `/api/config`, `/api/products`, `/api/newsletter/subscribe`, `/api/submissions`, `/api/analytics`, `/api/webhooks/resend`, `/newsletter/confirm`, `/unsubscribe`, public pages and product media. Keep `/admin*` and `/api/admin/*` protected.
- Resend receiving webhook remains `https://perverseworld.com/api/webhooks/resend`, with the `email.received` event. Cron processes the outbox; it does not send unsolicited campaigns.

## Discovery, icons and app behavior

The supplied `public/assets/images/perverseIcon.png` remains the source for native and web app icons. Build generates 32px favicon, 180px Apple icon and 192/512px install icons without changing the original. Public pages include a web manifest. Copyright uses the build year and refreshes in the browser when the page becomes visible again; sent email and confirmation-page years are generated server-side.

The sitemap is generated from the three main routes and four product routes, including product imagery and excluding private/token URLs and retired routes. Canonical URLs, social cards, organization/site/breadcrumb schema and truthful product offers are generated together. Product pages refresh visible details and structured prices from D1 in the Worker so admin edits do not leave stale search prices. No reviews, shipping promises or stock availability claims are fabricated. Robots excludes private areas; `llms.txt` exposes only public brand/catalog facts. The coming-soon gate is intentionally preserved and continues to limit ordinary storefront discovery until launch. SEO and AI discoverability are supported, not guaranteed rankings or citations.

Font requests use early connections instead of CSS imports. Images use asynchronous decoding, deferred hidden-store loading and priority for the visible landing logo. The service worker caches only a branded offline shell and its assets: no HTML catalog snapshots, API responses, admin pages, personal data or token pages. Offline forms do not queue customer messages or claim success.

The Expo app uses Router and strict TypeScript, SDK-compatible dependencies, safe areas and error/retry states. One WebView remains mounted across Home, Shop and Contact to preserve the session bag. Admin opens in the system browser for Cloudflare/Google sign-in; external links use the system browser and unsupported URL schemes are rejected. Verify with `npm run mobile:check` and `npx expo export --platform android` from `apps/mobile`. Native signing/install requires the normal device/EAS workflow and is separate from the static web release.

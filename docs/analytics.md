# Visitor analytics

No personal data: no IP, no user agent, no user id is stored. Only the anonymous device id already used for events.

## View `dash_visitors_daily`
One row per Brisbane day (Australia/Brisbane, UTC+10, no DST), from 2026-11-15, newest first. Read-only view on `events` (+ `click_log` for one comparison column), `security_invoker`, no access for anon/authenticated. Migration `supabase/migrations/20261115120000_dash_visitors_daily.sql` (definitions are also in its comments).

- **Time used:** `client_ts` when it is within 10 minutes of `created_at`, else `created_at`. Checked 2026-11-15: 99.99% of events are within 60 s (median lag 2.9 s, batch delay), so `client_ts` is reliable and gives exact timing inside a batch.
- **devices_all:** distinct non-excluded devices with at least 1 event that day.
- **devices_real:** at least 3 events and at least 5 s between first and last event that day. This is the main "visitors" number.
- **new_devices / returning_devices:** first ever event of the device is on that day / the rest of devices_all.
- **sessions:** per device, events less than 3 min apart are one session; a session belongs to the day it starts. Only sessions of devices_real count.
- **session_seconds:** last - first event + 10 s, max 3600. **total_active_minutes** = sum over real devices; **avg_minutes_per_device** = total / devices_real; **avg_minutes_per_session** = total / sessions.
- **shop_clicks / shop_click_devices:** events `view_product_click` of non-excluded devices. **click_log_clicks:** all `click_log` rows that day (includes excluded devices, so it can be higher).

## Exclusions
- Devices in `app_settings.popularity_exclude_devices` (same list as brand popularity).
- Synthetic test ids whose first 8 characters are one repeated hex character (`99999999-...`, `cccccccc-...`).

Add a test device: open the site with `?debug=1`, Profile tab shows the device id; then
`update app_settings set value = value || '["<device-id>"]'::jsonb where key = 'popularity_exclude_devices';` and `select refresh_brand_popularity();`. The view reads the list live.

## Bot guard (browser)
`src/lib/analytics-guard.ts`, words in `src/config/analytics.ts`. No events are sent, no device id is stored (a throwaway id is returned, not saved to localStorage/cookie) and Vercel Analytics is not loaded when `navigator.webdriver` is true or the user agent matches bot, crawl, spider, slurp, headless, lighthouse, prerender, preview, facebookexternalhit, whatsapp, telegram, curl, python, wget. The user agent is only matched in the browser, never sent or stored. Test: `tests/analytics-guard.test.ts`.

## Vercel Web Analytics
`@vercel/analytics`, `<AnalyticsGate />` in the root layout: cookieless, only when the guard allows tracking and not on `?debug=1`. Enable the Analytics tab in the Vercel dashboard; gives page views and country (not available in our own data). Privacy policy must mention it (see `docs/security-backlog.md`).

## Known limits
- A device is not a person: two browsers (or cleared storage, private mode) count twice.
- Events before the guard shipped may include bots; the view starts 2026-11-15.
- No country or referrer in our own data; use Vercel Analytics for that.
- Sessions use event times only (no heartbeat), so idle time on a page is not counted.

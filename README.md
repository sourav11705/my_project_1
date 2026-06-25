# PricePulse — MVP v2 (Spec-Aligned)

Upgraded runnable prototype aligned to hi-fi UX specs, compliance defaults, and fixture-backed comparison data.

## What's included

### Hi-fi / UX alignment
- Category search flow (Quick Commerce, Cabs, Food Delivery)
- Responsive result surfaces: mobile cards (`CMP-RESULTCARD-01`) + desktop table (`CMP-RESULTTABLE-01`)
- Sort controls (cheapest, fastest, best rated, lowest platform fee)
- Filter controls (ETA, rating, fee cap, promo-only, platform multiselect)
- State handling: loading skeleton, empty state with recovery CTAs, error state with retry, partial-provider banner, stale quote warnings
- Click-out interstitial modal (`SCR-CLICKOUT-01`) with spec-aligned copy
- Full analytics instrumentation (frontend + backend KPI events)

### Compliance / trust defaults
- Explicit **source labeling** per provider (affiliate/deep-link/partner-feed)
- Explicit **Sponsored** vs **Organic** labeling per result
- Mandatory disclaimer: "Prices may change at checkout"
- Freshness timestamp per offer with stale warning
- Canonical fee transparency: base, delivery, platform fee, surge, offer, tax, final estimated total
- No scraping assumption in UI/API messaging
- Centralized copy via `ui-copy-keys.json` (from designer's UI polish pack)

### Fixture integration
- Uses approved fixture data from `/home/team/shared/mock-data-fixtures/`
- Scenarios: Quick Commerce (4 providers), Cabs, Food Delivery
- Fixture metadata: display price label, source confidence, final payable disclaimer

### KPI instrumentation
- Backend analytics events: `compare_response_received`, `compare_response_failed`
- Frontend analytics endpoint: `POST /api/v1/analytics`
- In-memory event log with `/api/v1/analytics/recent` debug endpoint
- All events logged with session_id, timestamp, and full property payloads

## Quick start

```bash
# Install dependencies
cd /home/team/shared/pricepulse-prototype
npm install

# Development mode (API + Vite dev server with HMR)
npm run dev

# Production mode
npm run build    # Build frontend to dist/
npm start        # Start production server on port 3000
```

## Architecture

```
Port 3000 (public) — prod-server.js
├── Serves built frontend from dist/
├── Proxies /api/* to backend on port 4174

Port 4174 (internal) — api/server.js
├── GET  /api/v1/health         — Health check
├── POST /api/v1/compare        — Compare offers across platforms
├── POST /api/v1/analytics      — Ingest analytics events
├── GET  /api/v1/analytics/recent — View recent analytics events

Data — /home/team/shared/mock-data-fixtures/
├── quick-commerce.json  (3 scenarios, 10 offers)
├── cabs.json            (3 scenarios, 8 offers)
└── food-delivery.json   (3 scenarios, 8 offers)
```

## Testing

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Compare Quick Commerce
curl -X POST http://localhost:3000/api/v1/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "category":"quick_commerce",
    "rankingPreference":"lowest_price",
    "query":{"items":[{"name":"Milk","quantity":1}]},
    "userContext":{"cityCode":"BLR","pincode":"560001"}
  }'

# Compare Cabs
curl -X POST http://localhost:3000/api/v1/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "category":"cab",
    "rankingPreference":"fastest_eta",
    "query":{"pickup":{"address":"Koramangala"},"drop":{"address":"MG Road"}},
    "userContext":{"cityCode":"BLR","pincode":"560001"}
  }'

# Compare Food
curl -X POST http://localhost:3000/api/v1/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "category":"food_delivery",
    "rankingPreference":"best_value",
    "query":{"restaurantId":"rest_blr_empire_001","items":[{"menuItemId":"sample_item","quantity":1}]},
    "userContext":{"cityCode":"BLR","pincode":"560001"}
  }'

# View recent analytics
curl http://localhost:3000/api/v1/analytics/recent
```

## Project structure

```
pricepulse-prototype/
├── api/
│   ├── server.js                          # HTTP server + analytics endpoint
│   └── src/
│       ├── services/
│       │   ├── comparisonService.js       # Compare logic + KPI events
│       │   ├── fixtureStore.js            # Fixture data loading
│       │   ├── policyRegistry.js          # Platform policy & compliance
│       │   └── rankingHooks.js            # Multi-factor ranking engine
│       └── utils/
│           └── http.js                    # JSON HTTP helpers
├── src/
│   ├── App.tsx                            # Main app component (spec-aligned)
│   ├── api.ts                             # API client + analytics transport
│   ├── main.tsx                           # Entry point
│   ├── types.ts                           # TypeScript types
│   ├── styles.css                         # Tokenized styles
│   └── ui-copy-keys.json                  # Canonical copy dictionary
├── dist/                                  # Production build output
├── index.html
├── package.json
├── prod-server.js                         # Production server (port 3000)
├── vite.config.ts
└── tsconfig.json
```

## Design specs aligned

This prototype implements the following spec documents:
- `screen-specs-mobile.md` (SCR-HOME-01, SCR-RES-MOB-01, SCR-CLICKOUT-01)
- `screen-specs-desktop.md` (SCR-HOME-DESK-01, SCR-RES-DESK-01)
- `component-state-inventory.md` (CMP-CATSWITCH-01, CMP-SEARCH-01, CMP-SORT-01, CMP-FILTER-*, CMP-RESULTCARD-01, CMP-RESULTTABLE-01, CMP-CLICKOUT-01)
- `visual-style-guide.md` (color tokens, typography, spacing, elevation)
- `ui-polish-pack/*` (microcopy, trust labels, clickout CTAs, iconography map)
- `implementation-handoff.md` (build order, interaction rules, analytics)
- `prototype-ux-qa-checklist.md` (QA gate criteria)
- `mvp-kpi-instrumentation-spec.md` (KPI formulas and event taxonomy)
- `mvp-compliance-and-partner-packet.md` (compliance defaults)
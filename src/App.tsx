import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compareOffers } from './api';
import type { Category, CompareRequest, CompareResponse, Filters, Offer, RankingPreference, SortMode } from './types';
import copy from './ui-copy-keys.json';

// ── Constants ──────────────────────────────────────────────────────
const CATEGORIES: { label: string; value: Category }[] = [
  { label: 'Quick Commerce', value: 'quick_commerce' },
  { label: 'Cabs', value: 'cab' },
  { label: 'Food Delivery', value: 'food_delivery' },
];

const RANKING_MAP: Record<SortMode, RankingPreference> = {
  cheapest: 'lowest_price',
  fastest: 'fastest_eta',
  best_rated: 'best_value',
  lowest_fees: 'best_value',
};

const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: 'Cheapest', value: 'cheapest' },
  { label: 'Fastest', value: 'fastest' },
  { label: 'Best rated', value: 'best_rated' },
  { label: 'Lowest platform fee', value: 'lowest_fees' },
];

// ── Helpers ─────────────────────────────────────────────────────────
const inr = (paise?: number | null) => (paise == null ? 'N/A' : `₹${(paise / 100).toFixed(2)}`);

const secondsAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));

const freshnessLabel = (iso: string) => {
  const sec = secondsAgo(iso);
  if (sec < 8) return copy['label.updated_now'];
  return copy['label.updated_seconds'].replace('{n}', String(sec));
};

const isOfferStale = (offer: Offer): boolean => {
  const threshold = Number(offer.metadata?.staleThresholdSec || 120);
  return offer.isStale || offer.freshnessSeconds > threshold;
};

// ── Filter + Sort logic ─────────────────────────────────────────────
function applyFiltersAndSort(offers: Offer[], filters: Filters, sortMode: SortMode): Offer[] {
  const filtered = offers.filter((offer) => {
    const eta = offer.eta.min ?? offer.eta.max;
    if (filters.etaMax && (eta ?? Infinity) > filters.etaMax) return false;
    if (filters.ratingMin && (offer.rating?.value ?? 0) < filters.ratingMin) return false;
    if (filters.feeMax && offer.feeBreakdown.platform > filters.feeMax) return false;
    if (filters.promoOnly && offer.feeBreakdown.offer <= 0) return false;
    if (filters.platforms.length && !filters.platforms.includes(offer.provider.providerId)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    if (sortMode === 'cheapest') return a.feeBreakdown.final_estimated_total - b.feeBreakdown.final_estimated_total;
    if (sortMode === 'fastest') return (a.eta.min ?? a.eta.max ?? 999) - (b.eta.min ?? b.eta.max ?? 999);
    if (sortMode === 'best_rated') return (b.rating?.value ?? 0) - (a.rating?.value ?? 0);
    return a.feeBreakdown.platform - b.feeBreakdown.platform;
  });

  return filtered;
}

function buildCategoryQuery(category: Category, form: Record<string, string>) {
  if (category === 'quick_commerce') {
    const items = (form.items || 'Milk, Bread, Eggs')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((name) => ({ name, quantity: 1 }));
    return { items, pincode: form.pincode || undefined };
  }
  if (category === 'cab') {
    return {
      pickup: { address: form.pickup || 'Koramangala' },
      drop: { address: form.drop || 'MG Road' },
      rideTypes: [form.rideType || 'Mini'],
      pincode: form.pincode || undefined,
    };
  }
  return {
    restaurantId: form.restaurantId || 'rest_blr_empire_001',
    items: [{ menuItemId: 'sample_item', quantity: 1 }],
    pincode: form.pincode || undefined,
  };
}

// ── Analytics wrapper ───────────────────────────────────────────────
const track = (eventName: string, payload: Record<string, unknown>) => {
  // Use the analytics endpoint via api.ts
  fetch('/api/v1/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: eventName,
      occurred_at: new Date().toISOString(),
      event_source: 'frontend',
      app_version: '0.2.0',
      properties: payload,
    }),
  }).catch(() => {});
  console.info('[analytics]', eventName, payload);
};

// ── Main App ────────────────────────────────────────────────────────
export function App() {
  const [category, setCategory] = useState<Category>('quick_commerce');
  const [sortMode, setSortMode] = useState<SortMode>('cheapest');
  const [filters, setFilters] = useState<Filters>({ promoOnly: false, platforms: [] });
  const [formValues, setFormValues] = useState<Record<string, string>>({ cityCode: 'BLR', pincode: '560001' });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<CompareResponse | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [selectedOfferStale, setSelectedOfferStale] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  // ── URL sync ──────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('category', category);
    params.set('sort', sortMode);
    if (filters.etaMax) params.set('etaMax', String(filters.etaMax));
    else params.delete('etaMax');
    if (filters.ratingMin) params.set('ratingMin', String(filters.ratingMin));
    else params.delete('ratingMin');
    if (filters.feeMax) params.set('feeMax', String(filters.feeMax));
    else params.delete('feeMax');
    params.set('promoOnly', String(filters.promoOnly));
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [category, sortMode, filters]);

  // ── Memoized values ───────────────────────────────────────────────
  const visibleOffers = useMemo(() => applyFiltersAndSort(response?.offers ?? [], filters, sortMode), [response, filters, sortMode]);

  const bestDeal = useMemo(() => {
    // Best Deal = cheapest non-sponsored offer
    const organic = visibleOffers.filter((o) => !o.isSponsored);
    return organic.length ? organic.reduce((a, b) => (a.feeBreakdown.final_estimated_total <= b.feeBreakdown.final_estimated_total ? a : b)) : null;
  }, [visibleOffers]);

  const platformOptions = useMemo(() => {
    const ids = new Set((response?.offers ?? []).map((offer) => offer.provider.providerId));
    return Array.from(ids.values());
  }, [response]);

  // ── Analytics on best deal change ─────────────────────────────────
  useEffect(() => {
    if (bestDeal) {
      track('result_loaded', {
        search_id: response?.searchId,
        category,
        platform: bestDeal.provider.providerId,
        rank: bestDeal.rank,
        total_price: bestDeal.feeBreakdown.final_estimated_total,
        freshness_sec: bestDeal.freshnessSeconds,
        offers_count: visibleOffers.length,
        providers_responded: response?.completeness?.providersResponded,
        providers_requested: response?.completeness?.providersRequested,
      });
    }
  }, [bestDeal, category, response, visibleOffers.length]);

  // ── Search handler ────────────────────────────────────────────────
  const onSearch = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResponse(null);
    setSelectedOffer(null);

    const payload: CompareRequest = {
      category,
      rankingPreference: RANKING_MAP[sortMode],
      query: buildCategoryQuery(category, formValues),
      userContext: {
        cityCode: formValues.cityCode || 'BLR',
        pincode: formValues.pincode || undefined,
      },
    } as CompareRequest;

    track('search_submitted', { category, sortMode, cityCode: formValues.cityCode, pincode: formValues.pincode });

    try {
      const data = await compareOffers(payload);
      setResponse(data);
      // Scroll to results after a tick
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : copy['error.fetch_title'];
      setError(message);
      track('state_error_shown', { category, error: message, http_status: err instanceof Response ? err.status : undefined });
    } finally {
      setLoading(false);
    }
  }, [category, sortMode, formValues]);

  // ── Filter toggles ────────────────────────────────────────────────
  const togglePlatform = (id: string) => {
    setFilters((prev) => {
      const exists = prev.platforms.includes(id);
      const platforms = exists ? prev.platforms.filter((value) => value !== id) : [...prev.platforms, id];
      const next = { ...prev, platforms };
      track('filter_applied', { ...next, category, search_id: response?.searchId });
      return next;
    });
  };

  const clearFilters = () => {
    setFilters({ promoOnly: false, platforms: [] });
    setSortMode('cheapest');
  };

  // ── Click-out handlers ────────────────────────────────────────────
  const openClickout = (offer: Offer) => {
    setSelectedOffer(offer);
    setSelectedOfferStale(isOfferStale(offer));
    track('result_open_clicked', {
      search_id: response?.searchId,
      category,
      platform: offer.provider.providerId,
      rank: offer.rank,
      total_price: offer.feeBreakdown.final_estimated_total,
      base_price: offer.feeBreakdown.base,
      fees: offer.feeBreakdown.platform + offer.feeBreakdown.delivery + offer.feeBreakdown.surge,
      eta_minutes: offer.eta.min ?? offer.eta.max,
      rating: offer.rating?.value,
      offer_value: offer.feeBreakdown.offer,
      is_sponsored: offer.isSponsored,
      freshness_sec: offer.freshnessSeconds,
    });
  };

  const confirmClickout = (offer: Offer) => {
    track('clickout_confirmed', {
      search_id: response?.searchId,
      category,
      platform: offer.provider.providerId,
      offer_id: offer.id,
    });
    const url = String(offer.metadata?.deeplinkUrl || '#');
    window.open(url, '_blank', 'noopener,noreferrer');
    setSelectedOffer(null);
  };

  const cancelClickout = () => {
    if (selectedOffer) {
      track('clickout_cancelled', {
        search_id: response?.searchId,
        category,
        platform: selectedOffer.provider.providerId,
        offer_id: selectedOffer.id,
      });
    }
    setSelectedOffer(null);
  };

  // ── Stale helper ──────────────────────────────────────────────────
  const staleThresholdMs = 120_000; // 2 minutes

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="app">
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="card hero">
        <div>
          <h1>PricePulse</h1>
          <p className="hero-tagline">Compare real-time prices across Quick Commerce, Cabs, and Food Delivery</p>
        </div>
      </section>

      {/* ── Search Form ─────────────────────────────────────────────── */}
      <section className="card">
        <form onSubmit={onSearch}>
          {/* Category Switcher (CMP-CATSWITCH-01) */}
          <div className="category-switcher" role="tablist" aria-label="Category">
            {CATEGORIES.map((item) => (
              <button
                key={item.value}
                role="tab"
                aria-selected={category === item.value}
                className={`cat-tab ${category === item.value ? 'cat-tab-active' : ''}`}
                onClick={() => {
                  setCategory(item.value);
                  track('filter_applied', { category: item.value, action: 'category_change' });
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Sort (CMP-SORT-01) */}
          <div className="sort-row">
            <label className="sort-label">
              Sort by
              <select
                value={sortMode}
                onChange={(e) => {
                  const value = e.target.value as SortMode;
                  setSortMode(value);
                  track('sort_changed', { category, sortMode: value, search_id: response?.searchId });
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Dynamic search fields per category (CMP-SEARCH-01) */}
          <div className="search-fields">
            <label>
              City code
              <input value={formValues.cityCode || ''} onChange={(e) => setFormValues((p) => ({ ...p, cityCode: e.target.value.toUpperCase() }))} placeholder="BLR" />
            </label>
            <label>
              Pincode
              <input value={formValues.pincode || ''} onChange={(e) => setFormValues((p) => ({ ...p, pincode: e.target.value }))} placeholder="560001" />
            </label>

            {category === 'quick_commerce' && (
              <label>
                Search items or paste basket
                <input
                  value={formValues.items || ''}
                  onChange={(e) => setFormValues((p) => ({ ...p, items: e.target.value }))}
                  placeholder={copy['helper.search_placeholder_qc'] || 'Search items or paste basket'}
                />
              </label>
            )}

            {category === 'cab' && (
              <>
                <label>
                  {copy['helper.pickup_required'] || 'Pickup'}
                  <input value={formValues.pickup || ''} onChange={(e) => setFormValues((p) => ({ ...p, pickup: e.target.value }))} placeholder="Koramangala" />
                </label>
                <label>
                  {copy['helper.drop_required'] || 'Drop'}
                  <input value={formValues.drop || ''} onChange={(e) => setFormValues((p) => ({ ...p, drop: e.target.value }))} placeholder="MG Road" />
                </label>
                <label>
                  Ride type
                  <input value={formValues.rideType || ''} onChange={(e) => setFormValues((p) => ({ ...p, rideType: e.target.value }))} placeholder="Mini" />
                </label>
              </>
            )}

            {category === 'food_delivery' && (
              <label>
                {copy['helper.search_placeholder_food'] || 'Search dish or restaurant'}
                <input value={formValues.restaurantId || ''} onChange={(e) => setFormValues((p) => ({ ...p, restaurantId: e.target.value }))} placeholder="rest_blr_empire_001" />
              </label>
            )}
          </div>

          <button className="search-cta" type="submit" disabled={loading}>
            {loading ? copy['loading.searching'] : 'Compare now'}
          </button>
        </form>
      </section>

      {/* ── Filters Section ─────────────────────────────────────────── */}
      <section className="card">
        <div className="filter-grid">
          <label>
            Max ETA (min)
            <input type="number" min={1} onChange={(e) => setFilters((p) => ({ ...p, etaMax: e.target.value ? Number(e.target.value) : undefined }))} />
          </label>
          <label>
            Min rating
            <input type="number" min={0} max={5} step={0.1} onChange={(e) => setFilters((p) => ({ ...p, ratingMin: e.target.value ? Number(e.target.value) : undefined }))} />
          </label>
          <label>
            Max platform fee (₹)
            <input type="number" min={0} onChange={(e) => setFilters((p) => ({ ...p, feeMax: e.target.value ? Number(e.target.value) * 100 : undefined }))} />
          </label>
        </div>

        <div className="filter-chips">
          <label className="chip-toggle">
            <input
              type="checkbox"
              checked={filters.promoOnly}
              onChange={(e) => setFilters((p) => ({ ...p, promoOnly: e.target.checked }))}
            />
            Promo offers only
          </label>
          {platformOptions.map((id) => (
            <label key={id} className="chip-toggle">
              <input
                type="checkbox"
                checked={filters.platforms.includes(id)}
                onChange={() => togglePlatform(id)}
              />
              {id}
            </label>
          ))}
        </div>

        {(filters.etaMax || filters.ratingMin || filters.feeMax || filters.promoOnly || filters.platforms.length > 0) && (
          <button className="filter-clear" type="button" onClick={clearFilters}>
            {copy['empty.no_results_cta_secondary'] || 'Clear all filters'}
          </button>
        )}
      </section>

      {/* ── Summary / Results Header ────────────────────────────────── */}
      {response && (
        <section className="card summary" aria-live="polite" ref={resultsRef}>
          <div className="summary-row">
            <span className="summary-label">Cheapest: <strong>{response.summary.cheapestProviderLabel}</strong> ({inr(response.summary.cheapestPrice)})</span>
            {response.summary.estimatedSavings != null && response.summary.estimatedSavings > 0 && (
              <span className="summary-savings">Save {inr(response.summary.estimatedSavings)}</span>
            )}
          </div>
          <div className="summary-meta">
            <span>{response.completeness.providersResponded}/{response.completeness.providersRequested} providers</span>
            <span className="freshness-chip">{freshnessLabel(response.generatedAt)}</span>
            <span>{response.responseLatencyMs}ms</span>
          </div>
        </section>
      )}

      {/* ── Partial data notice ─────────────────────────────────────── */}
      {response?.completeness.timedOutProviders?.length ? (
        <div className="notice notice-partial">
          {copy['partial.providers_unavailable']} ({response.completeness.timedOutProviders.join(', ')})
        </div>
      ) : null}

      {/* ── Compliance disclaimer ───────────────────────────────────── */}
      <div className="notice notice-disclaimer">
        {copy['label.disclaimer'] || 'Prices may change at checkout'} &bull; {response?.legal?.dataSourceDisclosure || 'Only approved sources are displayed.'}
      </div>

      {/* ── Error State ─────────────────────────────────────────────── */}
      {error ? (
        <div className="card error-card">
          <p className="error-title">{copy['error.fetch_title']}</p>
          <p className="error-body">{copy['error.fetch_body']}</p>
          <button className="error-retry" type="button" onClick={onSearch}>
            {copy['error.fetch_cta'] || 'Retry'}
          </button>
        </div>
      ) : null}

      {/* ── Loading State (ST-RES-LOADING) ──────────────────────────── */}
      {loading ? (
        <section className="results" aria-label="loading-skeleton">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div className="card skeleton-card" key={idx}>
              <div className="skeleton skeleton-provider" />
              <div className="skeleton skeleton-price" />
              <div className="skeleton skeleton-meta" />
              <div className="skeleton skeleton-cta" />
            </div>
          ))}
        </section>
      ) : null}

      {/* ── Empty State (ST-RES-EMPTY) ──────────────────────────────── */}
      {!loading && response && visibleOffers.length === 0 ? (
        <div className="card empty-card">
          <p className="empty-title">{copy['empty.no_results_title']}</p>
          <p className="empty-body">{copy['empty.no_results_body']}</p>
          <div className="empty-actions">
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              {copy['empty.no_results_cta_primary'] || 'Edit search'}
            </button>
            <button type="button" className="btn-secondary" onClick={clearFilters}>
              {copy['empty.no_results_cta_secondary'] || 'Clear all filters'}
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Results: Mobile Cards (CMP-RESULTCARD-01) ──────────────── */}
      {!loading && visibleOffers.length > 0 ? (
        <>
          <section className="results mobile-cards">
            {visibleOffers.map((offer) => {
              const stale = isOfferStale(offer);
              const isBestDeal = !offer.isSponsored && bestDeal?.id === offer.id;
              return (
                <article
                  className={`card offer ${isBestDeal ? 'offer-best' : ''} ${offer.isSponsored ? 'offer-sponsored' : ''} ${stale ? 'offer-stale' : ''}`}
                  key={offer.id}
                >
                  {/* Row A: platform + freshness + sponsored */}
                  <div className="offer-row-a">
                    <div className="offer-provider">
                      <span className="provider-name">{offer.provider.providerLabel}</span>
                      <span className="provider-source">{offer.provider.sourceLabel}</span>
                    </div>
                    <div className="offer-badges">
                      {offer.isSponsored && <span className="badge badge-sponsored" title="This placement is promoted. Ranking may differ from cheapest option.">{copy['label.sponsored']}</span>}
                      <span className="badge badge-freshness">{freshnessLabel(offer.quoteTimestamp)}</span>
                      {isBestDeal && <span className="badge badge-best">{copy['label.best_deal']}</span>}
                    </div>
                  </div>

                  {/* Row B: total price */}
                  <div className="offer-row-b">
                    <span className="offer-total">{inr(offer.feeBreakdown.final_estimated_total)}</span>
                    <span className="offer-total-label">{offer.metadata?.displayPriceLabel || 'Estimated total'}</span>
                  </div>

                  {/* Row C: breakdown (always visible) */}
                  <div className="offer-row-c">
                    <span>base {inr(offer.feeBreakdown.base)}</span>
                    <span className="sep">+</span>
                    <span>delivery {inr(offer.feeBreakdown.delivery)}</span>
                    <span className="sep">+</span>
                    <span>fee {inr(offer.feeBreakdown.platform)}</span>
                    {offer.feeBreakdown.tax > 0 && (
                      <>
                        <span className="sep">+</span>
                        <span>tax {inr(offer.feeBreakdown.tax)}</span>
                      </>
                    )}
                    {offer.feeBreakdown.surge > 0 && (
                      <>
                        <span className="sep">+</span>
                        <span>surge {inr(offer.feeBreakdown.surge)}</span>
                      </>
                    )}
                    {offer.feeBreakdown.offer > 0 && (
                      <>
                        <span className="sep">−</span>
                        <span className="offer-discount">offer {inr(offer.feeBreakdown.offer)}</span>
                      </>
                    )}
                  </div>

                  {/* Row D: ETA + rating + offer pills + stale warning */}
                  <div className="offer-row-d">
                    <span className="pill pill-eta">
                      ETA: {offer.eta.min ?? offer.eta.max ?? 'N/A'} min
                    </span>
                    {offer.rating?.value != null && (
                      <span className="pill pill-rating">
                        ★ {offer.rating.value.toFixed(1)}
                      </span>
                    )}
                    {offer.feeBreakdown.offer > 0 && (
                      <span className="pill pill-offer">
                        Save {inr(offer.feeBreakdown.offer)}
                      </span>
                    )}
                    {stale && (
                      <span className="pill pill-stale">{copy['stale.warning'] || 'Quote may be outdated'}</span>
                    )}
                  </div>

                  {/* Row E: CTA */}
                  <div className="offer-row-e">
                    <button
                      className="cta-primary"
                      onClick={() => openClickout(offer)}
                    >
                      {offer.feeBreakdown.offer > 0
                        ? `Save ${inr(offer.feeBreakdown.offer)} on ${offer.provider.providerLabel}`
                        : `Open in ${offer.provider.providerLabel}`}
                    </button>
                    <button
                      className="cta-report"
                      onClick={() => {
                        alert(copy['report.success'] || 'Thanks — we\'ll review this listing.');
                      }}
                    >
                      {copy['report.issue'] || 'Report price mismatch'}
                    </button>
                  </div>

                  {/* Details expander */}
                  <details className="offer-details">
                    <summary>{copy['clickout.summary_title'] || 'See details'}</summary>
                    <div className="details-grid">
                      <span>Base</span><span>{inr(offer.feeBreakdown.base)}</span>
                      <span>Delivery</span><span>{inr(offer.feeBreakdown.delivery)}</span>
                      <span>Platform fee</span><span>{inr(offer.feeBreakdown.platform)}</span>
                      {offer.feeBreakdown.surge > 0 && <><span>Surge</span><span>{inr(offer.feeBreakdown.surge)}</span></>}
                      <span>Tax</span><span>{inr(offer.feeBreakdown.tax)}</span>
                      {offer.feeBreakdown.offer > 0 && <><span>Offer</span><span className="offer-discount">−{inr(offer.feeBreakdown.offer)}</span></>}
                      <span className="total-label">Estimated total</span><span className="total-value">{inr(offer.feeBreakdown.final_estimated_total)}</span>
                    </div>
                    {offer.rankReasons.length > 0 && (
                      <div className="rank-reasons">
                        {offer.rankReasons.map((reason) => (
                          <span className="chip" key={reason}>{reason}</span>
                        ))}
                      </div>
                    )}
                  </details>
                </article>
              );
            })}
          </section>

          {/* ── Desktop Table (CMP-RESULTTABLE-01) ──────────────────── */}
          <section className="card desktop-table">
            <table>
              <thead>
                <tr>
                  <th>Platform</th>
                  <th>Total</th>
                  <th>Base</th>
                  <th>Fees</th>
                  <th>ETA</th>
                  <th>Rating</th>
                  <th>Offer</th>
                  <th>Freshness</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visibleOffers.map((offer) => {
                  const stale = isOfferStale(offer);
                  const isBestDeal = !offer.isSponsored && bestDeal?.id === offer.id;
                  const totalFees = offer.feeBreakdown.platform + offer.feeBreakdown.delivery + offer.feeBreakdown.surge;
                  return (
                    <tr
                      key={`row-${offer.id}`}
                      className={`${isBestDeal ? 'row-best' : ''} ${offer.isSponsored ? 'row-sponsored' : ''}`}
                    >
                      <td className="cell-platform">
                        <span className="provider-name">{offer.provider.providerLabel}</span>
                        {offer.isSponsored && <span className="badge badge-sponsored badge-sm">{copy['label.sponsored']}</span>}
                        {isBestDeal && <span className="badge badge-best badge-sm">{copy['label.best_deal']}</span>}
                      </td>
                      <td className="cell-total">{inr(offer.feeBreakdown.final_estimated_total)}</td>
                      <td>{inr(offer.feeBreakdown.base)}</td>
                      <td>{inr(totalFees)}</td>
                      <td>{offer.eta.min ?? offer.eta.max ?? 'N/A'}m</td>
                      <td>{offer.rating?.value != null ? offer.rating.value.toFixed(1) : '—'}</td>
                      <td>{offer.feeBreakdown.offer > 0 ? inr(offer.feeBreakdown.offer) : '—'}</td>
                      <td className={stale ? 'cell-stale' : ''}>
                        {freshnessLabel(offer.quoteTimestamp)}
                        {stale && <span className="stale-dot" title={copy['stale.warning']} />}
                      </td>
                      <td>
                        <button className="cta-sm" onClick={() => openClickout(offer)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      ) : null}

      {/* ── Click-Out Interstitial (SCR-CLICKOUT-01) ────────────────── */}
      {selectedOffer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={cancelClickout}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {selectedOfferStale ? 'Price may have changed' : copy['clickout.summary_title']}
            </h3>

            {selectedOfferStale && (
              <div className="stale-warning-bar">
                {copy['stale.warning']} &mdash; {copy['stale.clickout_note']}
              </div>
            )}

            <div className="modal-summary">
              <div className="modal-row">
                <span className="modal-label">{copy['clickout.summary_title'] === 'Confirm and continue' ? 'Platform' : 'Platform'}</span>
                <span className="modal-value">{selectedOffer.provider.providerLabel}</span>
              </div>
              <div className="modal-row">
                <span className="modal-label">{copy['clickout.expected_total'] || 'Expected total'}</span>
                <span className="modal-value modal-total">{inr(selectedOffer.feeBreakdown.final_estimated_total)}</span>
              </div>
              <div className="modal-row">
                <span className="modal-label">{copy['clickout.eta'] || 'ETA'}</span>
                <span className="modal-value">{selectedOffer.eta.min ?? selectedOffer.eta.max ?? 'N/A'} min</span>
              </div>
              {selectedOffer.feeBreakdown.offer > 0 && (
                <div className="modal-row">
                  <span className="modal-label">{copy['clickout.savings_vs_avg'] || 'Savings'}</span>
                  <span className="modal-value modal-save">{inr(selectedOffer.feeBreakdown.offer)}</span>
                </div>
              )}
            </div>

            <p className="modal-disclaimer">
              {selectedOffer.metadata?.finalPayableDisclaimer
                ? String(selectedOffer.metadata.finalPayableDisclaimer)
                : copy['label.disclaimer']}
            </p>
            <p className="modal-leave-notice">{copy['clickout.leave_notice'] || 'You are leaving PricePulse.'}</p>
            <p className="modal-safety">{copy['safety.no_data'] || 'No personal payment info is stored in PricePulse.'}</p>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={cancelClickout}>
                {copy['clickout.secondary.cancel'] || 'Cancel'}
              </button>
              <button
                className="cta-primary"
                onClick={() => confirmClickout(selectedOffer)}
              >
                {selectedOfferStale
                  ? (copy['clickout.primary.stale'] || 'Refresh and continue')
                  : (copy['clickout.primary.default'] || 'Continue to {platform}').replace('{platform}', selectedOffer.provider.providerLabel)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
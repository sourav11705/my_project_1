const { randomUUID } = require('crypto');
const { chooseScenario } = require('./fixtureStore');
const { rankOffers } = require('./rankingHooks');
const { getPolicy } = require('./policyRegistry');

const SUPPORTED_CATEGORIES = ['quick_commerce', 'cab', 'food_delivery'];
const SUPPORTED_PREFERENCES = ['best_value', 'lowest_price', 'fastest_eta'];

const PLATFORM_LABEL = {
  flipkart_minutes: 'Flipkart Minutes',
  blinkit: 'Blinkit',
  zepto: 'Zepto',
  instamart: 'Instamart',
  uber: 'Uber',
  ola: 'Ola',
  rapido: 'Rapido',
  zomato: 'Zomato',
  swiggy: 'Swiggy',
  eatsure: 'EatSure',
};

const DISCLAIMER_TEXT = 'Prices may change at checkout';
const SOURCE_DISCLOSURE = 'Quotes shown from approved API/affiliate/deep-link or partner simulation. No unauthorized scraping.';

function validate(payload) {
  if (!payload || typeof payload !== 'object') return 'Request body must be an object.';
  if (!SUPPORTED_CATEGORIES.includes(payload.category)) {
    return `category must be one of ${SUPPORTED_CATEGORIES.join(', ')}`;
  }
  if (payload.rankingPreference && !SUPPORTED_PREFERENCES.includes(payload.rankingPreference)) {
    return `rankingPreference must be one of ${SUPPORTED_PREFERENCES.join(', ')}`;
  }
  return null;
}

function mapOffer(rawOffer, completedAt) {
  const policy = getPolicy(rawOffer.platform);
  const breakdown = rawOffer.priceBreakdown;
  const fallbackFreshnessSec = Math.max(20, Math.min(policy.ttlSeconds - 5, 45));
  const freshnessSeconds = rawOffer.metadata?.quoteAgeSec ?? fallbackFreshnessSec;
  const quoteTimestamp = new Date(Date.now() - freshnessSeconds * 1000).toISOString();

  return {
    id: rawOffer.id || randomUUID(),
    category: rawOffer.category,
    title: rawOffer.title,
    quoteTimestamp,
    freshnessSeconds,
    isStale: Boolean(rawOffer.metadata?.isStale) || freshnessSeconds > policy.ttlSeconds,
    isSponsored: Boolean(rawOffer.metadata?.isSponsored),
    currency: 'INR',
    provider: {
      providerId: rawOffer.platform,
      providerLabel: PLATFORM_LABEL[rawOffer.platform] || rawOffer.platform,
      sourceLabel:
        policy.sourceType === 'affiliate'
          ? 'Affiliate feed (approved source)'
          : policy.sourceType === 'deep_link'
            ? 'Deep-link quote (approved source)'
            : 'Partner-feed simulation (no scraping)',
      integrationMode: `${policy.sourceType}:${policy.contractStatus}`,
      contractStatus: policy.contractStatus,
      legalScope: policy.legalScope,
    },
    feeBreakdown: {
      base: breakdown.basePricePaise,
      delivery: breakdown.deliveryFeePaise,
      platform: breakdown.serviceFeePaise,
      surge: breakdown.surgeFeePaise,
      offer: breakdown.discountTotalPaise,
      tax: breakdown.taxPaise,
      final_estimated_total: rawOffer.finalPricePaise,
    },
    eta: {
      min: rawOffer.etaMin ?? undefined,
      max: rawOffer.etaMax ?? undefined,
    },
    rating: {
      value: rawOffer.rating ?? undefined,
      count: rawOffer.ratingCount ?? undefined,
    },
    metadata: {
      ...rawOffer.metadata,
      staleThresholdSec: policy.ttlSeconds,
      checkoutNote: DISCLAIMER_TEXT,
      displayPriceLabel: rawOffer.metadata?.displayPriceLabel || 'Estimated total',
      finalPayableDisclaimer: rawOffer.metadata?.finalPayableDisclaimer || DISCLAIMER_TEXT,
      deeplinkUrl: `https://example.com/clickout/${rawOffer.platform}`,
      webFallbackUrl: `https://example.com/web/${rawOffer.platform}`,
    },
  };
}

/**
 * @param {object} payload - Compare request
 * @param {object} [opts] - Options
 * @param {function} [opts.emitAnalytics] - Analytics emitter function
 * @param {number} [opts.startedAt] - Timestamp when request started
 */
function compare(payload, opts = {}) {
  const startedAt = opts.startedAt || Date.now();
  const emitAnalytics = opts.emitAnalytics || (() => {});

  const error = validate(payload);
  if (error) {
    const err = new Error(error);
    err.statusCode = 400;
    emitAnalytics({
      event_name: 'compare_response_failed',
      properties: {
        category: payload?.category || 'unknown',
        error_code: error,
        response_latency_ms: Date.now() - startedAt,
        http_status: 400,
      },
    });
    throw err;
  }

  const category = payload.category;
  const rankingPreference = payload.rankingPreference || 'best_value';

  const scenario = chooseScenario(category, payload);
  if (!scenario) {
    const responseLatencyMs = Date.now() - startedAt;
    const result = {
      searchId: randomUUID(),
      category,
      generatedAt: new Date().toISOString(),
      responseLatencyMs,
      legal: {
        finalPayableDisclaimer: DISCLAIMER_TEXT,
        dataSourceDisclosure: SOURCE_DISCLOSURE,
      },
      completeness: { providersRequested: 0, providersResponded: 0, timedOutProviders: [] },
      offers: [],
      summary: {
        cheapestProviderLabel: null,
        cheapestPrice: null,
        highestPrice: null,
        estimatedSavings: null,
      },
    };
    emitAnalytics({
      event_name: 'compare_response_received',
      properties: {
        search_id: result.searchId,
        category,
        status: 'empty',
        providers_requested: 0,
        providers_responded: 0,
        timed_out_providers: [],
        offers_returned_count: 0,
        response_latency_ms: responseLatencyMs,
        cheapest_price: null,
        highest_price: null,
        estimated_savings: null,
      },
    });
    return result;
  }

  const response = scenario.compareResponse;
  const mappedOffers = response.offers
    .map((offer) => mapOffer(offer, response.completedAt))
    .filter((offer) => {
      if (offer.provider.contractStatus === 'approved') return true;
      return offer.provider.legalScope.includes('click_out');
    });

  const rankedOffers = rankOffers(mappedOffers, rankingPreference);
  const prices = rankedOffers.map((offer) => offer.feeBreakdown.final_estimated_total);

  const cheapest = rankedOffers.length
    ? rankedOffers.reduce((a, b) =>
        a.feeBreakdown.final_estimated_total <= b.feeBreakdown.final_estimated_total ? a : b,
      )
    : null;

  const responseLatencyMs = Date.now() - startedAt;
  const result = {
    searchId: response.searchId || randomUUID(),
    category,
    generatedAt: new Date().toISOString(),
    fixtureScenarioId: scenario.scenarioId,
    fixtureDescription: scenario.description,
    responseLatencyMs,
    legal: {
      finalPayableDisclaimer: DISCLAIMER_TEXT,
      dataSourceDisclosure: SOURCE_DISCLOSURE,
    },
    completeness: response.completeness,
    offers: rankedOffers,
    summary: {
      cheapestProviderLabel: cheapest ? cheapest.provider.providerLabel : null,
      cheapestPrice: prices.length ? Math.min(...prices) : null,
      highestPrice: prices.length ? Math.max(...prices) : null,
      estimatedSavings:
        prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null,
    },
  };

  // Emit backend analytics event
  const providersResponded = response.completeness?.providersResponded ?? 0;
  const providersRequested = response.completeness?.providersRequested ?? 0;
  const status = providersResponded < providersRequested ? 'partial' : 'success';

  emitAnalytics({
    event_name: 'compare_response_received',
    properties: {
      search_id: result.searchId,
      category,
      status,
      providers_requested: providersRequested,
      providers_responded: providersResponded,
      timed_out_providers: response.completeness?.timedOutProviders || [],
      offers_returned_count: rankedOffers.length,
      response_latency_ms: responseLatencyMs,
      cheapest_price: result.summary.cheapestPrice,
      highest_price: result.summary.highestPrice,
      estimated_savings: result.summary.estimatedSavings,
    },
  });

  return result;
}

module.exports = { compare };
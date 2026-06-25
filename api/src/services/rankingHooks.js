function normalizeLowerBetter(value, max) {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - value / max));
}

function normalizeHigherBetter(value, max) {
  if (!Number.isFinite(value) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function priceHook(offer, preference) {
  const weight = preference === 'lowest_price' ? 0.68 : 0.5;
  const scoreDelta = normalizeLowerBetter(offer.feeBreakdown.final_estimated_total, 100000) * weight;
  return {
    scoreDelta,
    reason: scoreDelta > 0.25 ? 'Competitive estimated total' : undefined,
  };
}

function etaHook(offer, preference) {
  const eta = offer.eta.min ?? offer.eta.max;
  const weight = preference === 'fastest_eta' ? 0.62 : 0.24;
  const scoreDelta = normalizeLowerBetter(Number(eta), 60) * weight;
  return {
    scoreDelta,
    reason: scoreDelta > 0.1 ? 'Faster ETA' : undefined,
  };
}

function ratingHook(offer) {
  const scoreDelta = normalizeHigherBetter(Number(offer.rating?.value), 5) * 0.16;
  return {
    scoreDelta,
    reason: scoreDelta > 0.1 ? 'Higher rating' : undefined,
  };
}

function freshnessHook(offer) {
  const freshnessSec = offer.freshnessSeconds ?? 0;
  const scoreDelta = normalizeLowerBetter(freshnessSec, 600) * 0.08;
  return {
    scoreDelta,
    reason: scoreDelta > 0.05 ? 'Fresh quote' : undefined,
  };
}

function rankOffers(offers, preference) {
  const hooks = [priceHook, etaHook, ratingHook, freshnessHook];

  const scored = offers.map((offer) => {
    let score = 0;
    const rankReasons = [];

    for (const hook of hooks) {
      const result = hook(offer, preference);
      score += result.scoreDelta;
      if (result.reason) rankReasons.push(result.reason);
    }

    if (offer.isSponsored) {
      score -= 0.05;
      rankReasons.push('Sponsored placement');
    }

    return { ...offer, score: Number(score.toFixed(4)), rankReasons };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.feeBreakdown.final_estimated_total !== b.feeBreakdown.final_estimated_total) {
      return a.feeBreakdown.final_estimated_total - b.feeBreakdown.final_estimated_total;
    }
    const aEta = a.eta.min ?? a.eta.max ?? Number.MAX_SAFE_INTEGER;
    const bEta = b.eta.min ?? b.eta.max ?? Number.MAX_SAFE_INTEGER;
    return aEta - bEta;
  });

  return scored.map((offer, index) => ({ ...offer, rank: index + 1 }));
}

module.exports = { rankOffers };

const policyRegistry = {
  uber: {
    platform: 'Uber',
    sourceType: 'deep_link',
    contractStatus: 'approved',
    legalScope: ['click_out', 'logo_usage', 'price_display'],
    ttlSeconds: 60,
  },
  ola: {
    platform: 'Ola',
    sourceType: 'deep_link',
    contractStatus: 'approved',
    legalScope: ['click_out', 'logo_usage', 'price_display'],
    ttlSeconds: 60,
  },
  rapido: {
    platform: 'Rapido',
    sourceType: 'deep_link',
    contractStatus: 'approved',
    legalScope: ['click_out', 'logo_usage', 'price_display'],
    ttlSeconds: 60,
  },
  flipkart_minutes: {
    platform: 'Flipkart Minutes',
    sourceType: 'affiliate',
    contractStatus: 'approved',
    legalScope: ['click_out', 'logo_usage', 'price_display', 'fee_breakout'],
    ttlSeconds: 180,
  },
  blinkit: {
    platform: 'Blinkit',
    sourceType: 'partner_feed',
    contractStatus: 'pending',
    legalScope: ['click_out'],
    ttlSeconds: 180,
  },
  zepto: {
    platform: 'Zepto',
    sourceType: 'partner_feed',
    contractStatus: 'pending',
    legalScope: ['click_out'],
    ttlSeconds: 180,
  },
  instamart: {
    platform: 'Instamart',
    sourceType: 'partner_feed',
    contractStatus: 'pending',
    legalScope: ['click_out'],
    ttlSeconds: 180,
  },
  swiggy: {
    platform: 'Swiggy',
    sourceType: 'partner_feed',
    contractStatus: 'pending',
    legalScope: ['click_out'],
    ttlSeconds: 120,
  },
  zomato: {
    platform: 'Zomato',
    sourceType: 'partner_feed',
    contractStatus: 'pending',
    legalScope: ['click_out'],
    ttlSeconds: 120,
  },
  eatsure: {
    platform: 'EatSure',
    sourceType: 'partner_feed',
    contractStatus: 'approved',
    legalScope: ['click_out', 'price_display', 'fee_breakout'],
    ttlSeconds: 120,
  },
};

function getPolicy(platform) {
  return (
    policyRegistry[platform] || {
      platform,
      sourceType: 'partner_feed',
      contractStatus: 'pending',
      legalScope: ['click_out'],
      ttlSeconds: 120,
    }
  );
}

module.exports = { getPolicy };

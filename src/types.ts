export type Category = 'quick_commerce' | 'cab' | 'food_delivery';
export type RankingPreference = 'best_value' | 'lowest_price' | 'fastest_eta';
export type SortMode = 'cheapest' | 'fastest' | 'best_rated' | 'lowest_fees';

export interface CompareRequest {
  category: Category;
  rankingPreference: RankingPreference;
  query: Record<string, unknown>;
  userContext?: {
    cityCode?: string;
    pincode?: string;
    lat?: number;
    lng?: number;
  };
  scenarioId?: string;
}

export interface FeeBreakdown {
  base: number;
  delivery: number;
  platform: number;
  surge: number;
  offer: number;
  tax: number;
  final_estimated_total: number;
}

export interface ProviderSource {
  providerId: string;
  providerLabel: string;
  sourceLabel: string;
  integrationMode: string;
  contractStatus?: string;
  legalScope?: string[];
}

export interface Offer {
  id: string;
  category: Category;
  title: string;
  quoteTimestamp: string;
  freshnessSeconds: number;
  isStale: boolean;
  isSponsored: boolean;
  currency: 'INR';
  provider: ProviderSource;
  feeBreakdown: FeeBreakdown;
  eta: { min?: number; max?: number };
  rating?: { value?: number; count?: number };
  rank: number;
  score: number;
  rankReasons: string[];
  metadata: Record<string, unknown>;
}

export interface CompareResponse {
  searchId: string;
  category: Category;
  generatedAt: string;
  responseLatencyMs: number;
  legal: {
    finalPayableDisclaimer: string;
    dataSourceDisclosure: string;
  };
  completeness: {
    providersRequested: number;
    providersResponded: number;
    timedOutProviders: string[];
  };
  offers: Offer[];
  summary: {
    cheapestProviderLabel: string | null;
    cheapestPrice: number | null;
    highestPrice: number | null;
    estimatedSavings: number | null;
  };
  fixtureScenarioId?: string;
  fixtureDescription?: string;
}

export interface Filters {
  etaMax?: number;
  ratingMin?: number;
  feeMax?: number;
  promoOnly: boolean;
  platforms: string[];
}

export interface CopyKeys {
  [key: string]: string;
}

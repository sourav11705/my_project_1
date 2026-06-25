import type { CompareRequest, CompareResponse } from './types';

export async function compareOffers(payload: CompareRequest): Promise<CompareResponse> {
  const response = await fetch('/api/v1/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to compare offers');
  }

  return data as CompareResponse;
}

let _anonymousId: string | null = null;
function getAnonymousId(): string {
  if (!_anonymousId) {
    _anonymousId = localStorage.getItem('pp_anon_id');
    if (!_anonymousId) {
      _anonymousId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('pp_anon_id', _anonymousId);
    }
  }
  return _anonymousId;
}

let _sessionId: string | null = null;
function getSessionId(): string {
  if (!_sessionId) {
    _sessionId = crypto.randomUUID?.() || `${Date.now()}`;
  }
  return _sessionId;
}

export function trackAnalytics(
  eventName: string,
  properties: Record<string, unknown>,
) {
  const payload = {
    event_name: eventName,
    occurred_at: new Date().toISOString(),
    event_source: 'frontend',
    anonymous_id: getAnonymousId(),
    session_id: getSessionId(),
    app_version: '0.2.0',
    properties,
  };

  // Fire and forget — no await needed
  fetch('/api/v1/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silently fail — analytics should never block UX
  });

  // Also console for dev visibility
  console.info('[analytics]', eventName, properties);
}
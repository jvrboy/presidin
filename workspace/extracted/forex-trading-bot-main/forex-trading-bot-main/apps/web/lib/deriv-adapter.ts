/** Deriv WebSocket adapter that supports BOTH direct-token and OAuth-app authorization.
 *  If DERIV_APP_ID looks numeric (small integer) → normal `authorize` with token.
 *  If DERIV_APP_ID is an OAuth-secret string (e.g. `34e241BpQJgwTeFLpVEcO`), we fall back
 *  to Deriv's public app_id 1089 and pass the token verbatim — this is the only combination
 *  that has ever authenticated an OAuth-issued PAT against the WS endpoint.
 *
 *  If both fail, we surface the exact error so operators know it's a Deriv-side revocation
 *  rather than a client bug.
 */
import type { Direction } from './types';

export interface DerivAuth {
  loginid: string;
  isVirtual: boolean;
  currency: string;
  balance: number;
  scopes: string[];
  appIdUsed: string;
}

export interface DerivBuyResult {
  contractId: string | number;
  buyPrice: number;
  payout: number;
  startTime: number;
  transactionId: string | number;
}

export interface DerivSettlement {
  contractId: string | number;
  profit: number;
  sellPrice: number;
  exitTick?: number;
  status: 'won' | 'lost' | 'open' | 'sold';
  entrySpot?: number;
  exitSpot?: number;
}

export function resolveAppIdList(): string[] {
  const provided = (process.env.DERIV_APP_ID ?? '').trim();
  const ids: string[] = [];
  if (provided && /^\d+$/.test(provided)) ids.push(provided);
  if (!ids.includes('1089')) ids.push('1089'); // Deriv default public app
  if (provided && !/^\d+$/.test(provided)) ids.push(provided); // OAuth-style last resort
  return ids;
}

export function classifyDerivError(code?: string, message?: string): { retriable: boolean; permanent: boolean; hint: string } {
  const c = (code || '').toLowerCase();
  if (c === 'invalidtoken') return { retriable: false, permanent: true, hint: 'token revoked/rotated at broker' };
  if (c === 'authorizationrequired') return { retriable: true, permanent: false, hint: 'send authorize first' };
  if (c === 'invalidscope' || c === 'permissiondenied') return { retriable: false, permanent: true, hint: 'token missing Trade scope' };
  if (c === 'ratelimit') return { retriable: true, permanent: false, hint: 'backoff and retry' };
  if (c === 'contractbuyvalidationerror') return { retriable: false, permanent: false, hint: 'stake/duration invalid for symbol' };
  return { retriable: true, permanent: false, hint: message || 'unknown deriv error' };
}

# ADR-0004: CORS, Rate Limiting, and Caching for Public Search

## Title
Secure public search endpoint with CORS allowlist, rate limiting, and caching

## Date
2026-02-04

## Status
Accepted

## Context
The **search-hotels** endpoint is PUBLIC (no JWT required) to enable frictionless hotel browsing. However, this exposes several risks:

1. **Abuse**: Automated scrapers or competitors could flood the API
2. **Cost**: MyGo API likely has usage limits or per-request costs
3. **Load**: High traffic could overwhelm our Edge Functions or MyGo's servers
4. **Cross-origin attacks**: Without CORS, malicious sites could embed our API

### Business Requirements
- Users must be able to search hotels before creating an account
- Search must be fast (< 2 second response time)
- Must prevent abuse without impacting legitimate users

## Decision
**Implement layered security: CORS allowlist + per-IP rate limiting + response caching**

### 1. CORS Allowlist
**Only allow requests from trusted origins**

```typescript
const ALLOWED_ORIGINS = [
  'https://www.hotel.com.tn',    // Production frontend
  'http://localhost:5173',        // Local development (Vite default)
];
```

- Check `Origin` header in Edge Function
- Return `Access-Control-Allow-Origin` only for allowed origins
- Reject preflight `OPTIONS` requests from unauthorized origins

### 2. Per-IP Rate Limiting
**60 requests per hour per IP address**

```typescript
// Using Supabase table: rate_limits
// Schema: ip_address, endpoint, request_count, window_start
const RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 60 * 1000, // 1 hour
};
```

- Track requests in `rate_limits` table
- Reset counter after time window expires
- Return `429 Too Many Requests` when limit exceeded
- Include `X-RateLimit-*` headers in response for transparency

### 3. Response Caching
**120-second TTL for identical search queries**

```typescript
// Cache key: SHA-256 hash of (cityId + checkIn + checkOut + rooms)
// Using Supabase table: search_cache
// Schema: cache_key, response_json, created_at
const CACHE_TTL_SECONDS = 120;
```

- Check cache before calling MyGo API
- Return cached response if fresh (< 120s old)
- Store successful MyGo responses in cache
- Periodic cleanup of expired cache entries

## Consequences

### Positive
- ✅ **Prevents scraping**: CORS + rate limiting block unauthorized automated access
- ✅ **Reduces MyGo load**: Cache reduces upstream API calls by ~80% (estimated)
- ✅ **Faster responses**: Cache hits return in < 50ms vs 1-2s for MyGo API calls
- ✅ **Cost savings**: Fewer MyGo API calls = lower costs (if usage-based pricing)
- ✅ **Graceful degradation**: Rate limits prevent total service disruption from abuse

### Negative
- ❌ **Stale data window**: 120s cache means hotel availability could be up to 2 minutes old
- ❌ **Rate limit false positives**: Shared IPs (corporate NAT, VPN) might hit limits prematurely
- ❌ **Cache storage growth**: Cache table grows with unique search queries (requires cleanup)
- ❌ **CORS development friction**: Must explicitly add new dev URLs to allowlist

### Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stale cache causes booking failure | Medium | High | Short TTL (120s); MyGo re-validates on booking anyway |
| Corporate office hits rate limit | Low | Medium | Whitelist known corporate IPs; allow JWT bypass |
| Attacker rotates IPs to bypass rate limit | Medium | Medium | Add additional signal (User-Agent, browser fingerprint) |
| Cache poisoning attack | Low | High | Validate all inputs before caching; hash cache keys |
| CORS misconfiguration exposes API | Low | Critical | Automated tests for CORS headers; strict allowlist |

### Failure Modes and Handling

#### Cache Miss/Failure
- **Scenario**: Cache lookup fails or returns expired entry
- **Handling**: Fall back to direct MyGo API call (transparent to user)
- **Impact**: Slower response but no functional degradation

#### Rate Limit Exceeded
- **Scenario**: Legitimate user hits 60 req/hour limit
- **Handling**: Return 429 with `Retry-After` header and clear message
- **Impact**: User must wait (UX degradation)
- **Future enhancement**: Increase limit for authenticated users

#### CORS Preflight Rejection
- **Scenario**: Request from unauthorized origin (e.g., attacker's site)
- **Handling**: Reject OPTIONS request; browser blocks actual request
- **Impact**: Attack prevented; no impact on legitimate users

#### MyGo API Timeout
- **Scenario**: MyGo API is slow or down
- **Handling**: Return cached response even if expired (stale-while-revalidate pattern)
- **Impact**: Users get data, even if slightly stale

### Implementation Checklist
- [x] CORS middleware in search-hotels Edge Function
- [x] Rate limit check at request start (before MyGo call)
- [x] Cache lookup before MyGo API call
- [x] Cache storage after successful MyGo response
- [ ] Periodic cache cleanup job (cron or Edge Function)
- [ ] Monitoring: track cache hit rate, rate limit events
- [ ] Logging: log rate limit violations (for abuse analysis)
- [ ] Documentation: update README with CORS/rate limit details

### Monitoring and Observability
Track these metrics:
- **Cache hit rate**: Target >70% (indicates cache is effective)
- **Rate limit violations per day**: Spike indicates abuse attempt
- **Average MyGo API latency**: Compare to cache hit latency
- **429 error rate**: High rate indicates legitimate users hitting limits (adjust threshold)

### Future Enhancements
- Increase rate limit for JWT-authenticated users (e.g., 120 req/hour)
- Redis-based cache for faster lookups than Postgres
- Cloudflare CDN caching layer in front of Edge Functions
- Geographic rate limiting (stricter limits for high-risk regions)
- Progressive rate limiting (exponential backoff for repeated violations)

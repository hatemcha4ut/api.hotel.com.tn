# ADR-0002: Token Isolation (Breaking Change)

## Title
Isolate MyGo search token server-side to prevent client-side leakage

## Date
2026-02-04

## Status
Proposed (Planned for PR13)

## Context
MyGo's HotelSearch API returns a "Token" that must be supplied to BookingCreation API. Current implementation (PR10 baseline):

1. **search-hotels** (public) returns the token to the client in the response JSON
2. **Client** stores and passes token back when creating a booking
3. **create-booking** (private/JWT) uses the token from client request

### Problems with Current Approach
- **Token leakage**: Tokens are visible in client-side code, browser DevTools, and network logs
- **Token manipulation**: Clients can tamper with tokens or reuse stale tokens
- **Cache contamination**: Cached search responses contain tokens that differ per request
- **Security risk**: If token contains booking metadata, exposing it violates least-privilege principle

## Decision
**Never return the MyGo token to the client**

### New Flow (Breaking Change)
1. **search-hotels** (public):
   - Call MyGo HotelSearch API (receives token)
   - **Store token server-side** (in-memory cache or ephemeral DB table with short TTL)
   - Generate a **search session ID** (e.g., UUID)
   - Return search results + session ID to client (**NO token**)
   - Cache payload includes session ID (NOT token)

2. **create-booking** (JWT-required):
   - Receive session ID from client
   - **Retrieve token server-side** using session ID
   - Call MyGo BookingCreation API with retrieved token
   - Invalidate token/session after use (or let it expire naturally)

### Implementation Details
- **Session storage**: Redis-like cache with 15-minute TTL (longer than search cache's 120s, but short enough for security)
- **Session ID format**: UUIDv4 for uniqueness and unpredictability
- **Token hashing**: If storing tokens in DB, hash them (SHA-256) before storage
- **Audit trail**: Log session ID usage (but never log tokens)

## Consequences

### Positive
- ✅ **Enhanced security**: Tokens never leave the server
- ✅ **Cleaner caching**: Cache stores identical payloads for identical queries (no token variance)
- ✅ **Better audit trail**: Can track session ID → booking mapping server-side
- ✅ **Prevents client manipulation**: Client cannot forge or reuse tokens

### Negative
- ❌ **Breaking change**: Frontend must be updated to handle session IDs instead of tokens
- ❌ **Server-side state**: Requires session storage (adds infrastructure complexity)
- ❌ **Session expiry edge case**: If session expires between search and booking, user must retry search

### Risks and Mitigations
| Risk | Mitigation |
|------|------------|
| Session storage failure | Implement fallback: regenerate token just-in-time if needed |
| High session storage load | Use short TTLs (15 min) and automatic cleanup |
| Race condition (multiple bookings with same session) | Mark session as "consumed" after first booking |
| Debugging complexity | Log session ID (but never token) at each step |

### Rollout Plan (PR13)
1. Implement session storage and new flow
2. Update search-hotels to store token + return session ID
3. Update create-booking to retrieve token by session ID
4. Update README.md to document breaking change
5. Coordinate with frontend team for simultaneous deployment
6. Remove old token-passing code after migration

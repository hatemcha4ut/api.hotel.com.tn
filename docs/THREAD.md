# Project Thread

## Current Objective
Build a production-ready backend for **MyGo realtime bookable hotels + booking** integration at hotel.com.tn.

## Repository Scope
- **Supabase Edge Functions** (Deno + TypeScript) for MyGo API integration
- **Postgres migrations** for schema and RLS policies
- **No frontend code** (frontend lives separately)

## Current Status
- ✅ **PR10**: Merged baseline implementation (mygo-sync, search-hotels, create-booking)
- ❌ **PR11**: Closed due to merge conflicts (superseded)
- 📋 **PR13**: Planned breaking change - token isolation (see ADR-0002)

## Non-Negotiables

### 1. MyGo Protocol
**MyGo is NOT SOAP** - it's custom XML-over-HTTP POST:
- Endpoint: `https://admin.mygo.co/api/hotel/{ServiceName}`
- Authentication: Credentials embedded in XML body (NOT HTTP headers)
- See [ADR-0001](adr/0001-mygo-protocol.md) for details

### 2. Public Search Security
The `search-hotels` endpoint is PUBLIC but must be strictly protected:
- **CORS allowlist**: Only `https://www.hotel.com.tn` and `http://localhost:5173`
- **Rate limiting**: Per-IP throttling to prevent abuse
- **Input validation**: Strict schema validation on all inputs
- **Response caching**: 120s TTL to reduce upstream load
- See [ADR-0004](adr/0004-cors-rate-limit-cache.md) for details

### 3. Supplier Token Security
MyGo search returns a "Token" that must be used for booking:
- **NEVER log tokens** in application logs
- **NEVER store tokens in plaintext** (hash before DB storage)
- **Breaking change in PR13**: search-hotels will NO LONGER return the token to clients
- See [ADR-0002](adr/0002-token-isolation.md) for details

## PR Strategy
**One canonical PR at a time; merge it; close superseded PRs**

When conflicts or breaking changes arise:
1. Close conflicting PRs with clear explanation
2. Open a single new PR with the consolidated changes
3. Merge when ready, then move to the next feature

This avoids parallel PR chaos and ensures a clean git history.

## Next Actions

### Immediate (PR13 - Token Isolation)
- [ ] Issue: [Link to issue TBD]
- [ ] PR: [Link to PR TBD]
- [ ] Implementation:
  - [ ] Remove token from search-hotels response
  - [ ] Update create-booking to generate token server-side just-in-time
  - [ ] Update cache to store token-free payload only
  - [ ] Update README.md to document breaking change
- [ ] Testing:
  - [ ] Verify search-hotels no longer exposes token
  - [ ] Verify create-booking still works end-to-end
  - [ ] Verify caching behavior unchanged

### Planned (Future PRs)
- [ ] Guest authentication flow (ADR-0003)
- [ ] Additional MyGo services (ListHotel, BookingUpdate, etc.)
- [ ] Monitoring and alerting integration
- [ ] Load testing and performance optimization

## References
- [MyGo Protocol ADR](adr/0001-mygo-protocol.md)
- [Token Isolation ADR](adr/0002-token-isolation.md)
- [Auth Model ADR](adr/0003-auth-model.md)
- [CORS/Rate-Limit/Cache ADR](adr/0004-cors-rate-limit-cache.md)

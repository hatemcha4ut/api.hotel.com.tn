# api.hotel.com.tn
Hotel booking backend with MyGo XML integration

## Overview

This project implements a Supabase Edge Functions backend for hotel bookings using MyGo's custom XML API protocol.

**IMPORTANT**: MyGo is NOT SOAP. It uses plain HTTP POST with custom XML to `https://admin.mygo.co/api/hotel/{ServiceName}`.

## Architecture

- **Supabase Edge Functions** (Deno + TypeScript)
- **Supabase Postgres** for data storage
- **MyGo XML API** for hotel search and booking

## Documentation

- 📋 [Development Guide](docs/DEVELOPMENT.md) — architecture, deployment audit, security, go-live checklists
- 📝 [Project Thread](docs/THREAD.md) — current objectives and PR strategy

## Edge Functions

### 1. inventory-sync (PRIVATE/Admin)

Syncs supplier static data into generic inventory tables.

**Endpoint**: `/functions/v1/inventory-sync`

**Authentication**: Requires Supabase JWT (service role or admin user)

**Actions**:
- `cities`: Sync city list into `inventory_cities`
- `hotels`: Sync hotel list into `inventory_hotels`

**Example**:
```bash
# Sync cities
curl -X POST https://your-project.supabase.co/functions/v1/inventory-sync \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"cities"}'
```

### 2. mygo-sync (PRIVATE/Admin)

Syncs static data from MyGo API into the database.

**Endpoint**: `/functions/v1/mygo-sync`

**Authentication**: Requires Supabase JWT (service role or admin user)

**Actions**:
- `cities`: Sync city list from MyGo ListCity API

**Example**:
```bash
# Sync cities
curl -X POST https://your-project.supabase.co/functions/v1/mygo-sync \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action":"cities"}'
```

**Response**:
```json
{
  "success": true,
  "action": "cities",
  "processed": 15
}
```

### 3. search-hotels (PUBLIC but secured)

Searches for available hotels using MyGo HotelSearch API.

**Endpoint**: `/functions/v1/search-hotels`

**Authentication**: None (public endpoint)

**Security**:
- CORS restricted to `https://www.hotel.com.tn` and `http://localhost:5173`
- Rate limited: 60 requests/hour per IP (using hashed IP addresses for privacy)
- Cached responses: 120 seconds TTL (cache is token-free)
- Returns visible inventory (Available/onRequest flags preserved for frontend)
- **BREAKING CHANGE (PR13)**: Token is NO LONGER returned to client

**Request**:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/search-hotels \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.hotel.com.tn" \
  -d '{
    "cityId": 1,
    "checkIn": "2026-03-15",
    "checkOut": "2026-03-20",
    "currency": "TND",
    "rooms": [
      {
        "adults": 2,
        "childrenAges": [5, 8]
      }
    ]
  }'
```

**Response**:
```json
{
  "rawCount": 1,
  "visibleCount": 1,
  "hotels": [
    {
      "id": 101,
      "name": "Hotel Example",
      "available": true,
      "hasInstantConfirmation": true,
      "rooms": [
        {
          "onRequest": false,
          "price": 150.50
        }
      ]
    }
  ]
}
```

**IMPORTANT**: Token is NO LONGER returned. The server fetches a fresh token during booking creation.

### 4. create-booking (PRIVATE)

Creates a booking using MyGo BookingCreation API.

**Endpoint**: `/functions/v1/create-booking`

**Authentication**: Requires Supabase JWT

**Default Behavior**: PreBooking=true (recommended before final confirmation)

**NEW INPUT STRUCTURE (PR13)**:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/create-booking \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Origin: https://www.hotel.com.tn" \
  -d '{
    "searchParams": {
      "cityId": 1,
      "checkIn": "2026-03-15",
      "checkOut": "2026-03-20",
      "rooms": [
        {
          "adults": 2,
          "childrenAges": [5, 8]
        }
      ],
      "currency": "TND"
    },
    "selectedOffer": {
      "hotelId": 101,
      "roomId": 201
    },
    "guestData": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+216123456789"
    },
    "preBooking": true
  }'
```

**Response (Success)**:
```json
{
  "bookingCreated": true,
  "trackingSaved": true,
  "bookingId": 12345,
  "state": "confirmed",
  "totalPrice": 750.50,
  "recordId": 1
}
```

**Response (Booking created but tracking failed)**:
```json
{
  "bookingCreated": true,
  "trackingSaved": false,
  "bookingId": 12345,
  "state": "confirmed",
  "totalPrice": 750.50,
  "warning": "Booking was created but tracking record failed. Contact support with this booking ID."
}
```

**IMPORTANT CHANGE (PR13)**: 
- Token is NO LONGER accepted from client
- Server fetches fresh token from MyGo using searchParams
- Token never leaves the server (memory only)
- This prevents token exposure and cache pollution

### 5. version (PUBLIC)

Returns build metadata for deployment audit purposes.

**Endpoint**: `/functions/v1/version`

**Authentication**: None (public endpoint)

**Method**: `GET` (unlike other endpoints which use POST)

**Example**:
```bash
curl -X GET https://your-project.supabase.co/functions/v1/version
```

**Response**:
```json
{
  "sha": "abc123def456...",
  "builtAt": "2026-02-08T12:00:00Z",
  "env": "production"
}
```

**Purpose**:
- Verify which commit is currently deployed
- Audit deployment history
- Troubleshoot issues by correlating logs with specific builds

## MyGo Protocol Notes

1. **Authentication**: Credentials (MYGO_LOGIN, MYGO_PASSWORD) are embedded in XML request body, not HTTP headers
2. **Token Flow (UPDATED)**: Server calls HotelSearch to get fresh Token → Token is used in BookingCreation (all server-side)
3. **PreBooking**: Set `preBooking: true` for tentative bookings before final confirmation
4. **Visible Inventory**: Hotels are returned even if `Available=false` or rooms are `OnRequest=true`
5. **OnlyAvailable**: Always set to `true` in HotelSearch requests for real-time availability

## Environment Variables

Required environment variables:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret

# MyGo API (NEVER expose to client)
MYGO_LOGIN=your-mygo-login
MYGO_PASSWORD=your-mygo-password
```

## Database Tables

- `inventory_cities` - Generic city inventory (synced from supplier)
- `inventory_hotels` - Generic hotel inventory (synced from supplier)
- `mygo_cities` - Static city data from MyGo ListCity
- `mygo_hotels` - Static hotel data from MyGo ListHotel
- `rate_limits` - Rate limiting for public endpoints (uses hashed IP addresses)
- `search_cache` - Short-lived cache for search results (120s TTL, **token-free**)
- `mygo_bookings` - Booking records (stores token_hash, never plain token)

## Security Features

- ✅ No credentials in logs or client responses
- ✅ **NEW (PR13)**: Search token never sent to client or cached
- ✅ Token hashing (SHA-256) before database storage
- ✅ Rate limiting on public endpoints (60/hour per IP with hashed storage)
- ✅ CORS allowlist enforcement (`https://www.hotel.com.tn`, `http://localhost:5173`)
- ✅ JWT authentication for private endpoints
- ✅ Unified authentication middleware with admin checks
- ✅ Input validation and sanitization
- ✅ XML injection prevention (proper escaping)
- ✅ 30-second timeout on MyGo API calls
- ✅ No retries on non-idempotent operations (BookingCreation)
- ✅ Graceful DB failure handling (prevents double bookings)

## Shared Middleware (PR13)

Located in `supabase/functions/_shared/`:
- **cors.ts**: Unified CORS handling with origin allowlist
- **auth.ts**: JWT validation (`requireUserJWT`, `requireAdmin`)
- **rateLimit.ts**: IP-based rate limiting with hashed storage
- **validation.ts**: Shared input validation helpers
- **errors.ts**: Unified error types and formatting

## Development

```bash
# Deploy functions
supabase functions deploy

# Deploy specific function
supabase functions deploy inventory-sync
supabase functions deploy mygo-sync
supabase functions deploy search-hotels
supabase functions deploy create-booking

# Run migrations
supabase db push

# Run tests
deno test supabase/functions/_shared/token-security.test.ts
```

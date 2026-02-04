# api.hotel.com.tn
Hotel booking backend with MyGo XML integration

## Overview

This project implements a Supabase Edge Functions backend for hotel bookings using MyGo's custom XML API protocol.

**IMPORTANT**: MyGo is NOT SOAP. It uses plain HTTP POST with custom XML to `https://admin.mygo.co/api/hotel/{ServiceName}`.

## Architecture

- **Supabase Edge Functions** (Deno + TypeScript)
- **Supabase Postgres** for data storage
- **MyGo XML API** for hotel search and booking

## Edge Functions

### 1. mygo-sync (PRIVATE/Admin)

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

### 2. search-hotels (PUBLIC but secured)

Searches for available hotels using MyGo HotelSearch API.

**Endpoint**: `/functions/v1/search-hotels`

**Authentication**: None (public endpoint)

**Security**:
- CORS restricted to `https://www.hotel.com.tn` and `http://localhost:5173`
- Rate limited: 60 requests/hour per IP
- Cached responses: 120 seconds TTL
- Only returns real-time bookable inventory (Available=true, OnRequest=false)

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
  "token": "abc123xyz...",
  "hotels": [
    {
      "id": 101,
      "name": "Hotel Example",
      "available": true,
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

**IMPORTANT**: Save the `token` from the response - it's required for booking creation.

### 3. create-booking (PRIVATE)

Creates a booking using MyGo BookingCreation API.

**Endpoint**: `/functions/v1/create-booking`

**Authentication**: Requires Supabase JWT

**Default Behavior**: PreBooking=true (recommended before final confirmation)

**Request**:
```bash
curl -X POST https://your-project.supabase.co/functions/v1/create-booking \
  -H "Authorization: Bearer YOUR_USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123xyz...",
    "preBooking": true,
    "customerName": "John Doe",
    "customerEmail": "john@example.com",
    "customerPhone": "+216123456789",
    "roomSelections": [
      {
        "hotelId": 101,
        "roomId": 201
      }
    ]
  }'
```

**Response**:
```json
{
  "bookingId": 12345,
  "state": "confirmed",
  "totalPrice": 750.50,
  "recordId": 1
}
```

## MyGo Protocol Notes

1. **Authentication**: Credentials (MYGO_LOGIN, MYGO_PASSWORD) are embedded in XML request body, not HTTP headers
2. **Token Flow**: HotelSearch returns a Token → Token is used in BookingCreation
3. **PreBooking**: Set `preBooking: true` for tentative bookings before final confirmation
4. **Bookable Inventory**: Only hotels with `Available=true` and rooms with `OnRequest=false` are returned
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

- `mygo_cities` - Static city data from MyGo ListCity
- `mygo_hotels` - Static hotel data from MyGo ListHotel
- `rate_limits` - Rate limiting for public endpoints
- `search_cache` - Short-lived cache for search results (120s TTL)
- `mygo_bookings` - Booking records (stores token_hash, never plain token)

## Security Features

- ✅ No credentials in logs or client responses
- ✅ Token hashing (SHA-256) before database storage
- ✅ Rate limiting on public endpoints
- ✅ CORS allowlist enforcement
- ✅ JWT authentication for private endpoints
- ✅ Input validation and sanitization
- ✅ XML injection prevention (proper escaping)

## Development

```bash
# Deploy functions
supabase functions deploy

# Deploy specific function
supabase functions deploy mygo-sync
supabase functions deploy search-hotels
supabase functions deploy create-booking

# Run migrations
supabase db push
```

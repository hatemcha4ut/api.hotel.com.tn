# API Reference - Cloudflare Worker
> Complete API documentation for hotel.com.tn Cloudflare Worker

This document describes all endpoints available in the Cloudflare Worker API deployed at `api.hotel.com.tn`.

---

## Base URL

- **Production**: `https://api.hotel.com.tn`
- **Staging**: `https://api-hotel-com-tn-staging.workers.dev` (if configured)

---

## Authentication

Most endpoints require authentication via JWT token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Admin endpoints additionally require the user to have admin role in the `profiles` table.

---

## Common Headers

- `X-Request-ID`: Optional correlation ID for tracking requests
- `X-Guest-Session-ID`: Guest session ID for non-authenticated users
- `Origin`: Required for CORS (must be in allowlist)

---

## Endpoints

### Health Check

#### `GET /health`

Returns service health status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-08T22:00:00Z"
}
```

---

### Version

#### `GET /version`

Returns deployed version information.

**Response:**
```json
{
  "sha": "abc123def456...",
  "builtAt": "2026-02-08T20:00:00Z",
  "env": "production"
}
```

---

## Authentication Endpoints

### Create Guest Session

#### `POST /auth/guest`

Creates a temporary session for non-authenticated users. Sessions expire after 24 hours.

**Request:**
```json
{
  "metadata": {
    "deviceInfo": "optional metadata"
  }
}
```

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "expiresAt": "2026-02-09T22:00:00Z"
}
```

### Register User

#### `POST /auth/register`

Registers a new user via Supabase Auth.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  },
  "session": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresAt": 1707428400
  }
}
```

### Login User

#### `POST /auth/login`

Authenticates a user via Supabase Auth.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  },
  "session": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "expiresAt": 1707428400
  }
}
```

---

## Profile Endpoints

**Authentication Required**: All profile endpoints require JWT authentication.

### Get User Profile

#### `GET /profile`

Retrieves the current user's profile.

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "whatsappNumber": "+21612345678",
  "whatsappConsent": true,
  "createdAt": "2026-01-15T10:00:00Z",
  "updatedAt": "2026-02-08T22:00:00Z"
}
```

### Update User Profile

#### `PUT /profile`

Updates the current user's profile (WhatsApp information).

**Request:**
```json
{
  "whatsappNumber": "+21612345678",
  "whatsappConsent": true
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "whatsappNumber": "+21612345678",
  "whatsappConsent": true,
  "updatedAt": "2026-02-08T22:00:00Z"
}
```

---

## Static Data Endpoints

These endpoints proxy myGO static data APIs with 1-hour caching.

### List Cities

#### `POST /static/list-city`

Retrieves list of available cities.

**Response:**
```json
[
  {
    "id": 1,
    "name": "Tunis",
    "region": "Tunis Governorate"
  }
]
```

**Cache-Control**: `public, max-age=3600`

### List Countries

#### `POST /static/list-country`

Retrieves list of countries.

### List Categories

#### `POST /static/list-category`

Retrieves list of hotel categories.

### List Boardings

#### `POST /static/list-boarding`

Retrieves list of boarding types (meal plans).

### List Tags

#### `POST /static/list-tag`

Retrieves list of hotel tags/themes.

### List Languages

#### `POST /static/list-language`

Retrieves list of available languages.

### List Currencies

#### `POST /static/list-currency`

Retrieves list of supported currencies.

---

## Hotel Endpoints

### Search Hotels

#### `POST /hotels/search`

Searches for available hotels based on criteria. **Note**: Token is stripped from response for security.

**Request:**
```json
{
  "cityId": 1,
  "checkIn": "2026-03-15",
  "checkOut": "2026-03-20",
  "rooms": [
    {
      "adults": 2,
      "childrenAges": [8, 5]
    }
  ],
  "currency": "TND",
  "onlyAvailable": false,
  "keywords": "beach",
  "categories": ["hotel"],
  "tags": [1, 2]
}
```

**Response:**
```json
{
  "hotels": [
    {
      "id": 123,
      "name": "Hotel Example",
      "available": true,
      "hasInstantConfirmation": true,
      "star": 4,
      "address": "123 Main St",
      "cityName": "Tunis",
      "rooms": [
        {
          "id": 456,
          "name": "Double Room",
          "price": 150.00,
          "currency": "TND",
          "boarding": "BB",
          "boardingTitle": "Bed & Breakfast",
          "onRequest": false
        }
      ]
    }
  ]
}
```

**Note**: `token` field is intentionally omitted from the response.

### Hotel Detail

#### `POST /hotels/detail`

Retrieves detailed information about a specific hotel.

**Request:**
```json
{
  "hotelId": 123,
  "currency": "TND"
}
```

**Response:**
```json
{
  "id": 123,
  "name": "Hotel Example",
  "description": "A beautiful hotel...",
  "address": "123 Main St",
  "cityId": 1,
  "cityName": "Tunis",
  "star": 4,
  "images": ["https://..."],
  "amenities": ["Pool", "WiFi"],
  "themes": ["Beach", "Family"]
}
```

---

## Booking Endpoints

**Authentication Required**: User or guest session required.

### Pre-Book (Quote)

#### `POST /bookings/prebook`

Creates a pre-booking (quote) without committing. Sets `preBooking=true`.

**Request:**
```json
{
  "token": "mygo_search_token_here",
  "methodPayment": "CARD",
  "currency": "TND",
  "city": 1,
  "hotel": 123,
  "checkIn": "2026-03-15",
  "checkOut": "2026-03-20",
  "rooms": [
    {
      "id": 456,
      "boarding": "BB",
      "pax": {
        "adults": [
          {
            "firstName": "John",
            "lastName": "Doe",
            "nationality": "TN"
          }
        ]
      }
    }
  ],
  "customer": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+21612345678",
    "nationality": "TN"
  }
}
```

**Response:**
```json
{
  "bookingId": 789,
  "state": "PreBooked",
  "totalPrice": 750.00
}
```

### Create Booking

#### `POST /bookings/create`

Creates a final booking. Sets `preBooking=false`.

**Request**: Same as pre-book

**Response:**
```json
{
  "bookingId": 789,
  "state": "Confirmed",
  "totalPrice": 750.00
}
```

### Get Booking

#### `GET /bookings/:id`

Retrieves booking details and consolidated status.

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "mygoBookingId": 789,
  "mygoState": "Confirmed",
  "hotelId": 123,
  "hotelName": "Hotel Example",
  "checkIn": "2026-03-15",
  "checkOut": "2026-03-20",
  "totalPrice": 750.00,
  "currency": "TND",
  "status": "confirmed",
  "paymentStatus": "authorized",
  "customer": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+21612345678"
  }
}
```

---

## Checkout & Payment Endpoints

### Initiate Checkout

#### `POST /checkout/initiate`

Initiates checkout flow with policy enforcement, credit check, and ClicToPay pre-authorization.

**Request:**
```json
{
  "bookingId": "550e8400-e29b-41d4-a716-446655440000",
  "returnUrl": "https://www.hotel.com.tn/booking/success",
  "failUrl": "https://www.hotel.com.tn/booking/failed"
}
```

**Response - Success (Credit Sufficient):**
```json
{
  "blocked": false,
  "orderId": "ORD123456",
  "orderNumber": "BK-550e8400-1707428400000",
  "formUrl": "https://test.clictopay.com/payment/form?orderId=...",
  "paymentId": "pay_550e8400-e29b-41d4-a716-446655440001",
  "checkoutPolicy": "STRICT"
}
```

**Response - Blocked (Insufficient Wallet Credit):**
```json
{
  "blocked": true,
  "reason": "wallet_insufficient",
  "message": "Insufficient MyGO wallet credit. Required: 250.00 TND, Available: 100.00 TND",
  "requiredAmount": 250.00,
  "availableCredit": 100.00,
  "deficit": 150.00,
  "checkoutPolicy": "STRICT",
  "bookingId": "550e8400-e29b-41d4-a716-446655440000",
  "bookingStatus": "pending",
  "mygoState": "OnRequest"
}
```

**Flow**:
1. Reads checkout policy from `settings` table (`STRICT` or `ON_HOLD_PREAUTH`)
2. Verifies booking exists and is accessible by user
3. If **STRICT** policy:
   - Performs myGO credit check
   - If wallet credit < booking amount:
     - Updates booking to `mygo_state: "OnRequest"` and `status: "pending"`
     - Returns `blocked: true` response with `reason: "wallet_insufficient"`
     - No payment pre-authorization is created
   - If wallet credit >= booking amount: proceeds to payment
4. If **ON_HOLD_PREAUTH** policy: skips credit check, proceeds directly to payment
5. Creates ClicToPay pre-authorization order
6. Returns payment form URL for customer

**Checkout Policies**:
- `STRICT`: Requires sufficient MyGO wallet credit before allowing checkout. Treats bookings like OnRequest when credit is insufficient.
- `ON_HOLD_PREAUTH`: Allows checkout without credit check. Pre-authorization holds funds until booking is confirmed.

**Payment Test Mode**:
When `PAYMENT_TEST_MODE` environment variable is set to `"true"`, the system returns deterministic mock payment responses without calling the real payment provider. This is useful for testing without exposing production payment credentials.

### Payment Callback

#### `POST /payments/callback`

Handles ClicToPay payment callback (returnUrl/failUrl).

**Request:**
```json
{
  "orderId": "ORD123456",
  "orderNumber": "booking-550e8400",
  "orderStatus": 1,
  "actionCode": 0,
  "amount": 75000,
  "currency": "788",
  "signature": "hmac_signature_here"
}
```

**Response:**
```json
{
  "success": true,
  "bookingId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "authorized"
}
```

**Flow**:
1. Verifies HMAC signature
2. Updates payment and booking records
3. If myGO booking is validated: captures payment (deposit)
4. If myGO booking is cancelled: reverses pre-authorization

---

## Admin Endpoints

**Authentication Required**: Admin JWT token required for all admin endpoints.

### Get myGO Credit

#### `GET /api/admin/mygo/credit`

Retrieves current myGO credit balance (snapshot).

**Response:**
```json
{
  "remainingDeposit": 15000.50,
  "currency": "TND",
  "fetchedAt": "2026-02-08T22:00:00Z"
}
```

### Stream myGO Credit (SSE)

#### `GET /api/admin/mygo/credit/stream`

Server-Sent Events stream for real-time credit monitoring.

**Events**:
- `heartbeat`: Sent every 30 seconds
- `credit_update`: Sent every 5 minutes with updated balance

**Example Event:**
```
event: credit_update
data: {"remainingDeposit":15000.50,"currency":"TND","timestamp":"2026-02-08T22:00:00Z"}

event: heartbeat
data: {"timestamp":"2026-02-08T22:00:30Z"}
```

### Get Checkout Policy

#### `GET /api/admin/settings/checkout-policy`

Retrieves current checkout policy setting.

**Response:**
```json
{
  "policy": "ON_HOLD_PREAUTH",
  "updatedAt": "2026-02-01T10:00:00Z"
}
```

**Policies**:
- `STRICT`: Immediate booking, requires sufficient credit
- `ON_HOLD_PREAUTH`: Pre-booking with payment authorization

### Update Checkout Policy

#### `PUT /api/admin/settings/checkout-policy`

Updates checkout policy and creates audit log entry.

**Request:**
```json
{
  "policy": "STRICT"
}
```

**Response:**
```json
{
  "policy": "STRICT",
  "updatedAt": "2026-02-08T22:00:00Z"
}
```

### List Bookings (Admin)

#### `GET /api/admin/bookings`

Lists all bookings with filters and pagination.

**Query Parameters**:
- `status`: Filter by status (pending, confirmed, cancelled, completed)
- `fromCheckIn`: Filter by check-in date (YYYY-MM-DD)
- `toCheckIn`: Filter by check-in date (YYYY-MM-DD)
- `fromCheckOut`: Filter by check-out date (YYYY-MM-DD)
- `toCheckOut`: Filter by check-out date (YYYY-MM-DD)
- `page`: Page number (default: 1)
- `perPage`: Results per page (default: 30, max: 100)

**Response:**
```json
{
  "bookings": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "mygoBookingId": 789,
      "hotelName": "Hotel Example",
      "checkIn": "2026-03-15",
      "checkOut": "2026-03-20",
      "totalPrice": 750.00,
      "currency": "TND",
      "status": "confirmed",
      "paymentStatus": "captured"
    }
  ],
  "pagination": {
    "page": 1,
    "perPage": 30,
    "total": 150,
    "totalPages": 5
  }
}
```

---

## Error Responses

All errors follow a consistent format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common Error Codes**:
- `VALIDATION_ERROR` (400): Invalid request data
- `AUTHENTICATION_ERROR` (401): Missing or invalid JWT token
- `AUTHORIZATION_ERROR` (403): Insufficient permissions
- `NOT_FOUND` (404): Resource not found
- `INSUFFICIENT_CREDIT` (409): myGO account has insufficient credit
- `EXTERNAL_SERVICE_ERROR` (502): myGO or ClicToPay API error
- `INTERNAL_ERROR` (500): Unexpected server error

---

## Rate Limiting

Rate limiting is implemented at the Cloudflare level and may vary by endpoint. Typical limits:

- Public endpoints: 60 requests/minute per IP
- Authenticated endpoints: 120 requests/minute per user
- Admin endpoints: 300 requests/minute per admin

Rate limit headers:
```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1707428400
```

---

## Environment Configuration

The following environment variables configure the API behavior:

### Payment Configuration

- **`PAYMENT_TEST_MODE`**: When set to `"true"`, enables payment test mode that returns deterministic mock responses without calling the real payment provider (ClicToPay). This is safe for development and testing as it does not expose production payment credentials. Default: `"false"` (production mode).

- **`CLICTOPAY_BASE_URL`**: ClicToPay API base URL. Use `https://test.clictopay.com/payment/rest` for testing or `https://ipay.clictopay.com/payment/rest` for production.

### Checkout Policies

Checkout policies are stored in the database `settings` table under key `"checkout-policy"`:

- **`STRICT`**: Requires sufficient MyGO wallet credit before allowing checkout. If credit is insufficient, treats the booking like OnRequest (status: pending, mygo_state: OnRequest) and returns a blocked response.

- **`ON_HOLD_PREAUTH`**: Allows checkout without credit check. Pre-authorization holds customer funds until booking is confirmed with MyGO.

### MyGO Integration

- **`MYGO_LOGIN`**: MyGO API username
- **`MYGO_PASSWORD`**: MyGO API password

### Other Configuration

- **`ALLOWED_ORIGINS`**: Comma-separated list of allowed CORS origins (e.g., `"https://www.hotel.com.tn,https://admin.hotel.com.tn,http://localhost:5173"`)
- **`SUPABASE_URL`**: Supabase project URL
- **`SUPABASE_SERVICE_ROLE_KEY`**: Supabase service role key
- **`JWT_SECRET`**: JWT secret for token verification

---

## CORS

The API supports CORS for the following origins (configured via `ALLOWED_ORIGINS` environment variable):

- `https://www.hotel.com.tn`
- `https://admin.hotel.com.tn`
- `http://localhost:5173` (development)

Allowed methods: `GET, POST, PUT, DELETE, OPTIONS`

---

## Security

- All sensitive data is masked in logs (PII protection)
- JWT tokens are verified using Supabase JWT secret
- ClicToPay callbacks are verified using HMAC-SHA256 signatures
- No secrets are ever returned in responses
- Search results intentionally omit booking tokens (security by obscurity)

---

## Monitoring

All requests include structured logging with:
- Request ID correlation
- Masked sensitive data
- Performance metrics
- Error tracking

Use `X-Request-ID` header to track requests across services.

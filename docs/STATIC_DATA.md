# Static Data Endpoints

This document describes the static data endpoints available in the API, with a focus on the public-facing `GET /static/cities` endpoint.

## GET /static/cities

Public endpoint to retrieve the list of cities available for hotel search.

### Endpoint Details

- **URL**: `GET https://api.hotel.com.tn/static/cities`
- **Authentication**: None required (public endpoint)
- **Method**: GET
- **Content-Type**: `application/json`

### Response Format

```json
{
  "items": [
    {
      "id": 1,
      "name": "Tunis",
      "region": "Grand Tunis"
    },
    {
      "id": 2,
      "name": "Hammamet",
      "region": null
    }
  ],
  "source": "mygo",
  "cached": false,
  "fetchedAt": "2024-01-15T10:30:00.000Z"
}
```

#### Response Fields

- `items`: Array of city objects
  - `id` (number): Unique city identifier used for hotel search
  - `name` (string): City name
  - `region` (string | null): Region name if available
- `source` (string): Data source identifier (always "mygo")
- `cached` (boolean): Whether the response was served from cache (currently always false, reserved for future implementation)
- `fetchedAt` (string): ISO 8601 timestamp of when the data was fetched

### Caching

The endpoint implements a two-layer caching strategy:

1. **HTTP Caching**: 
   - `Cache-Control: public, max-age=3600` (1 hour)
   - Responses can be cached by browsers and CDN
   
2. **ETag Support**:
   - Each response includes an `ETag` header computed from city count and IDs
   - Clients can send `If-None-Match: <etag>` header in subsequent requests
   - When data hasn't changed, server responds with `304 Not Modified` (empty body)

#### Example with ETag

```bash
# First request - full response
curl -i https://api.hotel.com.tn/static/cities
# Response includes: ETag: "cities-42-1-420"

# Second request - conditional
curl -i -H 'If-None-Match: "cities-42-1-420"' https://api.hotel.com.tn/static/cities
# Response: 304 Not Modified (empty body, saves bandwidth)
```

### CORS

Cross-Origin Resource Sharing (CORS) is configured globally via the `ALLOWED_ORIGINS` environment variable. Allowed origins include:

- `https://www.hotel.com.tn` (production frontend)
- `https://admin.hotel.com.tn` (admin panel)
- `http://localhost:5173` (local development)

The CORS configuration is set at deployment time and allows GET, POST, and OPTIONS methods.

### Frontend Usage

#### Direct Fetch

```typescript
// Simple fetch
const response = await fetch('https://api.hotel.com.tn/static/cities');
const data = await response.json();
const cities = data.items;

// With ETag caching
let cachedETag: string | null = null;

async function fetchCities() {
  const headers: HeadersInit = {};
  if (cachedETag) {
    headers['If-None-Match'] = cachedETag;
  }
  
  const response = await fetch('https://api.hotel.com.tn/static/cities', { headers });
  
  if (response.status === 304) {
    // Data hasn't changed, use cached version
    return getCachedCities();
  }
  
  cachedETag = response.headers.get('ETag');
  const data = await response.json();
  saveCachedCities(data.items);
  return data.items;
}
```

#### Mapping to HotelSearch.City

The `items[].id` field should be used as the `cityId` parameter when calling the hotel search endpoint:

```typescript
interface City {
  id: number;
  name: string;
  region: string | null;
}

// Fetch cities
const response = await fetch('https://api.hotel.com.tn/static/cities');
const { items: cities } = await response.json();

// Use city ID in search
const selectedCity = cities[0];
const searchParams = {
  cityId: selectedCity.id,  // Required for hotel search
  checkIn: '2024-02-01',
  checkOut: '2024-02-05',
  rooms: [{ adults: 2 }]
};
```

### Error Responses

Errors follow the standard API error format:

```json
{
  "error": "Failed to fetch cities from myGO",
  "code": "EXTERNAL_SERVICE_ERROR"
}
```

Common error scenarios:

- **503 Service Unavailable**: myGO API is down or unreachable
- **500 Internal Server Error**: Unexpected error processing the request
- **504 Gateway Timeout**: myGO API took too long to respond

### Architecture Flow

```
Browser
  ↓ GET /static/cities
Cloudflare Worker (Hono framework)
  ↓ listCities(credential)
myGO Client (src/clients/mygoClient.ts)
  ↓ POST https://admin.mygo.co/api/hotel/ListCity
myGO ListCity SOAP/XML API
  ↓ XML Response
Parse & Transform to JSON
  ↓ Return cities array
Worker returns standardized response
  ↓ JSON with caching headers
Browser (cached for 1 hour)
```

## Legacy Endpoint

### POST /static/list-city

The original POST endpoint remains available for backward compatibility.

- **URL**: `POST https://api.hotel.com.tn/static/list-city`
- **Authentication**: None required
- **Response Format**: `{ "cities": [...] }` (different from GET endpoint)

**Note**: New integrations should use `GET /static/cities` instead. The POST endpoint may be deprecated in a future version.

## Other Static Data Endpoints

All other static data endpoints currently use POST method:

- `POST /static/list-country` - List of countries
- `POST /static/list-category` - Hotel categories
- `POST /static/list-boarding` - Boarding options (meal plans)
- `POST /static/list-tag` - Hotel tags/themes
- `POST /static/list-language` - Supported languages
- `POST /static/list-currency` - Supported currencies

These endpoints may be migrated to GET in future updates following the same pattern as `/static/cities`.

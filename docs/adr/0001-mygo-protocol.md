# ADR-0001: MyGo XML-over-HTTP Protocol

## Title
Use MyGo's custom XML-over-HTTP protocol (NOT SOAP)

## Date
2026-02-04

## Status
Accepted

## Context
MyGo provides a hotel booking API that superficially resembles SOAP (XML payloads, service-oriented architecture) but is fundamentally different:

1. **Not SOAP compliant**: No WSDL, no SOAP envelope, no WS-* standards
2. **Plain HTTP POST**: Simple POST requests to service-specific endpoints
3. **Custom XML schema**: MyGo-specific XML structure with embedded credentials
4. **Service-based routing**: Different services at different URLs (e.g., `/api/hotel/HotelSearch`, `/api/hotel/BookingCreation`)

Early implementations attempted to use SOAP libraries, which failed because MyGo's XML doesn't conform to SOAP specifications.

## Decision
**Treat MyGo as a custom XML-over-HTTP API**

### Implementation Approach
1. **Manual XML construction** using template literals (or XML builder libraries like `xmlbuilder2`)
2. **Standard HTTP POST** using `fetch()` or equivalent HTTP client
3. **Credentials in XML body**: Embed `MYGO_LOGIN` and `MYGO_PASSWORD` in the `<Login>` and `<Password>` fields within the XML payload
4. **Service-specific endpoints**: Build URL as `https://admin.mygo.co/api/hotel/{ServiceName}`

### Example Request (HotelSearch)
```typescript
const xml = `<?xml version="1.0" encoding="utf-8"?>
<HotelSearchRequest>
  <Login>${MYGO_LOGIN}</Login>
  <Password>${MYGO_PASSWORD}</Password>
  <OnlyAvailable>true</OnlyAvailable>
  <CityId>${cityId}</CityId>
  <!-- ... other fields -->
</HotelSearchRequest>`;

const response = await fetch('https://admin.mygo.co/api/hotel/HotelSearch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/xml' },
  body: xml,
});
```

## Consequences

### Positive
- ✅ **Simpler codebase**: No SOAP library dependencies or complexity
- ✅ **Direct control**: Full control over XML structure and HTTP behavior
- ✅ **Easier debugging**: Plain HTTP requests visible in network tools
- ✅ **Better error handling**: Can parse and handle MyGo's custom error responses directly

### Negative
- ❌ **No type safety**: No automatic XSD validation or code generation from WSDL (because none exists)
- ❌ **Manual XML parsing**: Must manually parse MyGo's XML responses (use libraries like `fast-xml-parser`)
- ❌ **Credential exposure risk**: Credentials in request body require extra care to avoid logging

### Mitigations
- Use TypeScript interfaces to define request/response shapes
- Use XML parsing libraries with schema validation where possible
- Never log request bodies containing credentials
- Escape all user inputs before embedding in XML to prevent injection

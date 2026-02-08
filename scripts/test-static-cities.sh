#!/usr/bin/env bash
# Smoke test for GET /static/cities endpoint
# Usage: ./scripts/test-static-cities.sh [base_url]

BASE_URL="${1:-https://api.hotel.com.tn}"
ENDPOINT="$BASE_URL/static/cities"

echo "Testing GET $ENDPOINT ..."

RESPONSE=$(curl -s -w "\n%{http_code}" "$ENDPOINT")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" -ne 200 ]; then
  echo "FAIL: Expected 200, got $HTTP_CODE"
  echo "Body: $BODY"
  exit 1
fi

# Check that items array is non-empty
ITEMS_COUNT=$(echo "$BODY" | grep -o '"id"' | wc -l)
if [ "$ITEMS_COUNT" -eq 0 ]; then
  echo "FAIL: Response contains no cities"
  echo "Body: $BODY"
  exit 1
fi

echo "PASS: Got $ITEMS_COUNT cities (HTTP $HTTP_CODE)"
echo "Sample: $(echo "$BODY" | head -c 200)..."

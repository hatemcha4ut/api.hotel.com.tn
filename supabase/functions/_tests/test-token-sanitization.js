/**
 * Minimal runtime test to verify token sanitization in search-hotels
 * Run this to ensure tokens are never exposed in public responses
 */

// Test data that simulates MyGo response with various token field names
const testHotelsWithTokens = [
  {
    id: "hotel1",
    name: "Test Hotel 1",
    token: "secret-token-123",
    Token: "secret-token-456",
    price: 100,
  },
  {
    id: "hotel2",
    name: "Test Hotel 2",
    searchToken: "search-token-789",
    SearchToken: "search-token-abc",
    bookingToken: "booking-token-def",
    price: 150,
  },
  {
    id: "hotel3",
    name: "Test Hotel 3",
    TOKEN: "upper-case-token",
    BookingToken: "BookingToken-xyz",
    price: 200,
  },
];

// Copy of sanitizeHotels function from search-hotels/index.ts
const sanitizeHotels = (
  hotels,
) => {
  return hotels.map((hotel) => {
    const sanitized = { ...hotel };
    // Remove any token-related fields
    delete sanitized.token;
    delete sanitized.Token;
    delete sanitized.TOKEN;
    delete sanitized.searchToken;
    delete sanitized.SearchToken;
    delete sanitized.bookingToken;
    delete sanitized.BookingToken;

    // For backward compatibility, set token to null
    sanitized.token = null;

    return sanitized;
  });
};

// Run tests
console.log("Testing token sanitization...\n");

const sanitized = sanitizeHotels(testHotelsWithTokens);

let passed = true;

sanitized.forEach((hotel, index) => {
  const originalName = testHotelsWithTokens[index].name;
  console.log(`Testing ${originalName}:`);

  // Check that all token fields are removed or null
  const tokenFields = [
    "Token",
    "TOKEN",
    "searchToken",
    "SearchToken",
    "bookingToken",
    "BookingToken",
  ];

  tokenFields.forEach((field) => {
    if (field in hotel && hotel[field] !== null) {
      console.error(`  ❌ FAIL: Field "${field}" still exists with value:`, hotel[field]);
      passed = false;
    }
  });

  // Check that token is set to null (backward compatibility)
  if (hotel.token !== null) {
    console.error(`  ❌ FAIL: token field is not null:`, hotel.token);
    passed = false;
  } else {
    console.log(`  ✅ PASS: token field is null (backward compatible)`);
  }

  // Check that other fields are preserved
  if (hotel.name !== originalName) {
    console.error(`  ❌ FAIL: name field was modified`);
    passed = false;
  } else {
    console.log(`  ✅ PASS: name field preserved`);
  }

  if (hotel.price !== testHotelsWithTokens[index].price) {
    console.error(`  ❌ FAIL: price field was modified`);
    passed = false;
  } else {
    console.log(`  ✅ PASS: price field preserved`);
  }

  console.log("");
});

if (passed) {
  console.log("✅ All tests passed! Token sanitization is working correctly.");
  process.exit(0);
} else {
  console.log("❌ Some tests failed! Token sanitization has issues.");
  process.exit(1);
}

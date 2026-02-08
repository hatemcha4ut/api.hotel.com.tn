/**
 * MyGO API types
 * All types for the myGO XML/JSON API protocol
 */

export interface MyGoCredential {
  login: string;
  password: string;
}

// City types
export interface MyGoCity {
  id: number;
  name: string;
  region?: string;
}

// Hotel types
export interface MyGoHotel {
  id: number;
  name: string;
  cityId: number;
  star?: string;
  categoryTitle?: string;
  address?: string;
  longitude?: string;
  latitude?: string;
  image?: string;
  note?: string;
}

// Search types
export interface MyGoRoom {
  adults: number;
  childrenAges?: number[];
}

export interface MyGoSearchParams {
  cityId: number;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  rooms: MyGoRoom[];
  hotelIds?: number[];
  currency?: "TND" | "EUR" | "USD";
  onlyAvailable?: boolean;
  keywords?: string;
  categories?: string[];
  tags?: string[];
}

export interface MyGoRoomResult {
  onRequest: boolean;
  price?: number;
  roomId?: number;
  roomName?: string;
  basePrice?: number;
  priceWithMarkup?: number;
  boardCode?: string;
  boardName?: string;
  adults?: number;
  childrenAges?: number[];
  token?: string;
  cancellationPolicy?: unknown[];
  [key: string]: unknown;
}

export interface MyGoHotelSearchResult {
  id: number;
  name: string;
  available: boolean;
  rooms: MyGoRoomResult[];
  cityId?: number;
  cityName?: string;
  categoryTitle?: string;
  star?: number;
  address?: string;
  image?: string;
  themes?: string[];
  facilities?: unknown[];
  hasInstantConfirmation?: boolean;
  note?: unknown;
  [key: string]: unknown;
}

export interface MyGoSearchResponse {
  token: string;
  hotels: MyGoHotelSearchResult[];
}

// Booking types
export interface MyGoBookingParams {
  token: string;
  preBooking: boolean;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  roomSelections: Array<{
    hotelId: number;
    roomId: number;
  }>;
}

export interface MyGoBookingResponse {
  bookingId?: number;
  state?: string;
  totalPrice?: number;
  [key: string]: unknown;
}

// Credit check types
export interface MyCoCreditCheckResponse {
  remainingDeposit: number;
  currency: string;
}

// Cancellation types
export interface MyGoBookingCancellationParams {
  booking: number;
  preCancelled: boolean;
  currency: string;
}

export interface MyGoBookingCancellationResponse {
  success: boolean;
  cancellationFee?: number;
  refundAmount?: number;
  [key: string]: unknown;
}

// Booking list types
export interface MyGoBookingListParams {
  fromCheckIn?: string;
  toCheckIn?: string;
  fromCheckOut?: string;
  toCheckOut?: string;
  page?: number;
  countPerPage?: number;
}

export interface MyGoBookingListResponse {
  bookings: Array<{
    bookingId: number;
    state: string;
    hotelName: string;
    checkIn: string;
    checkOut: string;
    totalPrice: number;
    currency: string;
    [key: string]: unknown;
  }>;
  totalCount: number;
  page: number;
  countPerPage: number;
}

// Static data types
export interface MyGoCountry {
  id: number;
  name: string;
  code?: string;
}

export interface MyGoCategory {
  id: number;
  title: string;
}

export interface MyGoBoarding {
  id: string;
  title: string;
}

export interface MyGoTag {
  id: number;
  title: string;
}

export interface MyGoLanguage {
  id: string;
  name: string;
}

export interface MyGoCurrency {
  code: string;
  name: string;
  symbol?: string;
}

// Hotel detail types
export interface MyGoHotelDetailParams {
  hotelId: number;
  currency?: string;
}

export interface MyGoHotelDetailResponse {
  id: number;
  name: string;
  description?: string;
  address?: string;
  cityId: number;
  cityName?: string;
  star?: number;
  categoryTitle?: string;
  images?: string[];
  amenities?: string[];
  themes?: string[];
  longitude?: string;
  latitude?: string;
  [key: string]: unknown;
}

// Cancellation policy types
export interface MyGoHotelCancellationPolicyParams {
  hotelId: number;
  checkIn: string;
  checkOut: string;
  currency?: string;
}

export interface MyGoHotelCancellationPolicyResponse {
  policies: Array<{
    fromDate: string;
    toDate: string;
    cancellationFee: number;
    currency: string;
  }>;
}

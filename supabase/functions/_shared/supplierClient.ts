export interface SupplierCity {
  id: number;
  name: string;
  region?: string | null;
}

export interface SupplierHotel {
  id: number;
  name: string;
  cityId: number;
  star?: string | null;
  categoryTitle?: string | null;
  address?: string | null;
  longitude?: string | null;
  latitude?: string | null;
  image?: string | null;
  note?: string | null;
}

export interface SupplierClient {
  fetchCities(): Promise<SupplierCity[]>;
  fetchHotels(cityId: number): Promise<SupplierHotel[]>;
}

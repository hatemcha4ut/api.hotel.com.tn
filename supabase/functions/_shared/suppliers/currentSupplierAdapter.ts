import {
  listCities,
  listHotels,
  type MyGoCity,
  type MyGoCredential,
  type MyGoHotel,
} from "../lib/mygoClient.ts";
import type {
  SupplierCity,
  SupplierClient,
  SupplierHotel,
} from "../supplierClient.ts";

const getSupplierCredential = (): MyGoCredential => {
  const login = (Deno.env.get("MYGO_LOGIN") ?? "").trim();
  const password = (Deno.env.get("MYGO_PASSWORD") ?? "").trim();

  console.log("[MYGO] credential lengths", { login: login.length, password: password.length });

  if (!login || !password) {
    throw new Error("MYGO_LOGIN/MYGO_PASSWORD are empty (check Supabase Edge Function secrets values)");
  }

  return { login, password };
};

const mapCity = (city: MyGoCity): SupplierCity => ({
  id: city.id,
  name: city.name,
  region: city.region ?? null,
});

const mapHotel = (hotel: MyGoHotel): SupplierHotel => ({
  id: hotel.id,
  name: hotel.name,
  cityId: hotel.cityId,
  star: hotel.star ?? null,
  categoryTitle: hotel.categoryTitle ?? null,
  address: hotel.address ?? null,
  longitude: hotel.longitude ?? null,
  latitude: hotel.latitude ?? null,
  image: hotel.image ?? null,
  note: hotel.note ?? null,
});

export const createSupplierClient = (): SupplierClient => {
  const credential = getSupplierCredential();

  return {
    fetchCities: async () => {
      const cities = await listCities(credential);
      return cities.map(mapCity);
    },
    fetchHotels: async (cityId: number) => {
      const hotels = await listHotels(credential, cityId);
      return hotels.map(mapHotel);
    },
  };
};

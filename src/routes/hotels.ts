// Ajoute juste après: const validatedData = hotelSearchSchema.parse(body);

logger.info("Hotel search payload normalized", {
  rawCityId: (body as { cityId?: unknown }).cityId,
  normalizedCityId: validatedData.cityId,
  checkIn: validatedData.checkIn,
  checkOut: validatedData.checkOut,
  rooms: validatedData.rooms.length,
})

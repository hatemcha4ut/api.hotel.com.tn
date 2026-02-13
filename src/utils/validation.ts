// Add near other schemas
const cityIdSchema = z.preprocess(
  (value) => (typeof value === 'string' ? Number(value) : value),
  z
    .number()
    .int()
    .positive('cityId invalide. Utilisez l’ID numérique retourné par /static/cities')
)

// Replace hotelSearchSchema
export const hotelSearchSchema = z.object({
  cityId: cityIdSchema,
  checkIn: dateSchema,
  checkOut: dateSchema,
  rooms: z.array(roomSchema).min(1).max(10),
  hotelIds: z.array(z.number().int().positive()).optional(),
  currency: z.enum(['TND', 'EUR', 'USD']).optional(),
  onlyAvailable: z.boolean().optional(),
  keywords: z.string().optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
})

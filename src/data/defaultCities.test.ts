/**
 * Tests for default cities data
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_TUNISIAN_CITIES } from "./defaultCities";

describe("defaultCities", () => {
  it("should have at least 13 cities", () => {
    expect(DEFAULT_TUNISIAN_CITIES.length).toBeGreaterThanOrEqual(13);
  });

  it("should include major Tunisian cities", () => {
    const cityNames = DEFAULT_TUNISIAN_CITIES.map((c) => c.name);

    expect(cityNames).toContain("Tunis");
    expect(cityNames).toContain("Sousse");
    expect(cityNames).toContain("Hammamet");
    expect(cityNames).toContain("Djerba");
    expect(cityNames).toContain("Monastir");
    expect(cityNames).toContain("Sfax");
  });

  it("should have valid city structure", () => {
    DEFAULT_TUNISIAN_CITIES.forEach((city) => {
      expect(city).toHaveProperty("id");
      expect(city).toHaveProperty("name");
      expect(city).toHaveProperty("region");

      expect(typeof city.id).toBe("number");
      expect(typeof city.name).toBe("string");
      expect(city.region === null || typeof city.region === "string").toBe(true);

      expect(city.id).toBeGreaterThan(0);
      expect(city.name.length).toBeGreaterThan(0);
    });
  });

  it("should have unique city IDs", () => {
    const ids = DEFAULT_TUNISIAN_CITIES.map((c) => c.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("should have unique city names", () => {
    const names = DEFAULT_TUNISIAN_CITIES.map((c) => c.name);
    const uniqueNames = new Set(names);

    expect(uniqueNames.size).toBe(names.length);
  });
});

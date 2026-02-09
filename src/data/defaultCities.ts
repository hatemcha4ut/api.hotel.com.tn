/**
 * Hardcoded fallback list of main Tunisian cities
 * 
 * This is the ultimate safety net so the frontend always gets real usable data
 * even on a cold start with myGO completely down.
 * 
 * IDs are placeholder values - in production these would be replaced by actual
 * myGO city IDs once the API is available.
 */

export const DEFAULT_TUNISIAN_CITIES: Array<{
  id: number;
  name: string;
  region: string | null;
}> = [
  { id: 1, name: "Tunis", region: "Tunis" },
  { id: 2, name: "Sousse", region: "Sousse" },
  { id: 3, name: "Hammamet", region: "Nabeul" },
  { id: 4, name: "Djerba", region: "Médenine" },
  { id: 5, name: "Monastir", region: "Monastir" },
  { id: 6, name: "Sfax", region: "Sfax" },
  { id: 7, name: "Tozeur", region: "Tozeur" },
  { id: 8, name: "Tabarka", region: "Jendouba" },
  { id: 9, name: "Nabeul", region: "Nabeul" },
  { id: 10, name: "Mahdia", region: "Mahdia" },
  { id: 11, name: "Kairouan", region: "Kairouan" },
  { id: 12, name: "Bizerte", region: "Bizerte" },
  { id: 13, name: "Gammarth", region: "Tunis" },
];

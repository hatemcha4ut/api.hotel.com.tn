import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseXmlResponse } from "./xml.ts";

const sampleResponse = await Deno.readTextFile(
  new URL("./testdata/sample-response.xml", import.meta.url),
);

Deno.test("parseXmlResponse extracts hotels", () => {
  const result = parseXmlResponse(
    sampleResponse,
    ["HotelSearchResponse", "HotelSearchResult"],
    ["Hotel", "HotelInfo", "HotelResult"],
  );

  assertEquals(result.error, undefined);
  assertEquals(result.items?.length, 1);
  assertEquals((result.items?.[0].Id as { value: string }).value, "123");
});

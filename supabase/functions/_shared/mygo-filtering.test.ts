import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { filterBookableHotels, filterVisibleHotels } from "./lib/mygoClient.ts";

Deno.test("filterBookableHotels removes unavailable hotels and onRequest rooms", () => {
  const hotels = [
    {
      id: 1,
      name: "Available Hotel",
      available: true,
      rooms: [
        { onRequest: false, price: 120 },
        { onRequest: true, price: 140 },
        { onRequest: false },
      ],
    },
    {
      id: 2,
      name: "Unavailable Hotel",
      available: false,
      rooms: [{ onRequest: false, price: 80 }],
    },
  ];

  const filtered = filterBookableHotels(hotels);

  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].id, 1);
  assertEquals(filtered[0].rooms.length, 2);
  assertEquals(
    filtered[0].rooms.every((room) => room.onRequest === false),
    true,
  );
});

Deno.test("filterVisibleHotels keeps hotels and removes rooms without price", () => {
  const hotels = [
    {
      id: 10,
      name: "Visible Hotel",
      available: true,
      rooms: [
        { onRequest: false, price: 200 },
        { onRequest: true, price: 220 },
        { onRequest: false },
      ],
    },
    {
      id: 11,
      name: "OnRequest Hotel",
      available: false,
      rooms: [{ onRequest: true, price: 90 }],
    },
  ];

  const visible = filterVisibleHotels(hotels);

  assertEquals(visible.length, 2);
  assertEquals(visible[0].rooms.length, 2);
  assertEquals(visible[0].hasInstantConfirmation, true);
  assertEquals(visible[1].hasInstantConfirmation, false);
});

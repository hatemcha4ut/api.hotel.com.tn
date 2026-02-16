import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// CORS Headers to allow your React app to talk to this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle Preflight Request (Browser Check)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Parse Incoming JSON from React
    const { cityId, checkIn, checkOut, rooms } = await req.json()

    // 3. Retrieve Secrets
    const LOGIN = Deno.env.get('MYGO_API_LOGIN')
    const PASS = Deno.env.get('MYGO_API_PASSWORD')
    const BASE_URL = Deno.env.get('MYGO_API_BASE_URL') || "https://admin.mygo.co/api/hotel/"

    // 4. Construct the XML Body (Strictly following PDF Page 26)
    // Note: We map the "rooms" array to the specific XML structure required
    const xmlBody = `
      <HotelSearchRequest>
        <Credential>
          <Login>${LOGIN}</Login>
          <Password>${PASS}</Password>
        </Credential>
        <SearchDetails>
          <BookingDetails>
            <CheckIn>${checkIn}</CheckIn>
            <CheckOut>${checkOut}</CheckOut>
            <City>${cityId}</City>
          </BookingDetails>
          <Rooms>
            ${rooms.map((r: any) => `
            <Room>
              <Adult>${r.adults}</Adult>
              <Child>${JSON.stringify(r.children || [])}</Child>
            </Room>
            `).join('')}
          </Rooms>
        </SearchDetails>
      </HotelSearchRequest>
    `

    console.log("Sending XML to MyGo:", xmlBody)

    // 5. Send Request to MyGo API
    const response = await fetch(`${BASE_URL}HotelSearch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/xml' },
      body: xmlBody
    })

    const xmlText = await response.text()

    // 6. Return the raw XML (or parsed JSON) to Frontend
    // For now, we return the text so we can debug on the frontend
    return new Response(JSON.stringify({ 
      success: true, 
      data: xmlText 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

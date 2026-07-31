import "dotenv/config";

const BASE_URL = (process.env.NEXT_PUBLIC_CRM_URL || "http://127.0.0.1:3000").replace(/:3000$/, "");

async function test() {
  try {
    console.log(`Posting to ${BASE_URL}/api/call-tracker/heartbeat...`);
    const res = await fetch(`${BASE_URL}/api/call-tracker/heartbeat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer some-invalid-token"
      },
      body: JSON.stringify({ deviceId: "1a2537e75f3ef271" }),
      signal: AbortSignal.timeout(5000)
    });
    console.log(`Status: ${res.status}`);
    const json = await res.json();
    console.log(`Response JSON:`, json);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

test();

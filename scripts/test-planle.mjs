import fetch from "node-fetch";

async function test() {
  try {
    console.log("Posting to https://planle.com/api/call-tracker/heartbeat...");
    const res = await fetch("https://planle.com/api/call-tracker/heartbeat", {
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

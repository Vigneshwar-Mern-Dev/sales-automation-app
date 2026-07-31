import "dotenv/config";

const BASE_URL = process.env.CRM_BASE_URL || "http://127.0.0.1:3000";

async function test() {
  try {
    console.log(`Fetching ${BASE_URL}...`);
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response snippet: ${text.slice(0, 200)}`);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

test();

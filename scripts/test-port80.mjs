import "dotenv/config";

const BASE_URL = (process.env.NEXT_PUBLIC_CRM_URL || "http://127.0.0.1:3000").replace(/:3000$/, "");

async function test() {
  try {
    console.log(`Fetching ${BASE_URL} (port 80)...`);
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    console.log(`Status: ${res.status}`);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

test();

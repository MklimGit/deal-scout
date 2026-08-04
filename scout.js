import { readFileSync, writeFileSync, existsSync } from "fs";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const apiKey = process.env.GEMINI_API_KEY;
const today = new Date().toISOString().split("T")[0];

// STEP 1: Build a search query from your criteria
const searchQuery = `${config.product} ${config.brand} deal price under ${config.priceLimit} ${config.currency} ${config.vendorCountry}`;

// STEP 2: Search the web for free using DuckDuckGo (no API key needed)
const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
const searchResponse = await fetch(searchUrl, {
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
});
const searchHtml = await searchResponse.text();

// STEP 3: Pull out titles, links, and snippets from the raw search results HTML
const results = [];
const linkRegex = /<a rel="nofollow" class="result__a" href="([^"]+)">([^<]+)<\/a>/g;
const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
let linkMatch, snippetMatch;
const links = [];
const snippets = [];
while ((linkMatch = linkRegex.exec(searchHtml)) !== null) links.push({ url: linkMatch[1], title: linkMatch[2] });
while ((snippetMatch = snippetRegex.exec(searchHtml)) !== null) snippets.push(snippetMatch[1].replace(/<[^>]+>/g, ""));
for (let i = 0; i < Math.min(links.length, 8); i++) {
  results.push({ title: links[i].title, url: links[i].url, snippet: snippets[i] || "" });
}

// STEP 4: Ask Gemini to pick the best matching deals from these real search results
const prompt = `
You are a shopping deal scout. Below are real web search results for a product search. Based ONLY on these results, identify up to ${config.maxResultsPerRun} deals that best match these criteria:
- Product: ${config.product}
- Brand preference: ${config.brand}
- Maximum price: ${config.priceLimit} ${config.currency}
- Vendor location/country: ${config.vendorCountry}
- Age group: ${config.ageGroup}
- Must-have characteristics: ${config.characteristics.join(", ")}

Search results:
${JSON.stringify(results, null, 2)}

For each matching deal, extract or estimate: title, price (number, or null if not stated), currency, vendor, url, whyGoodDeal (one sentence).
Only include results that are plausibly real product listings, not articles or unrelated pages.
Respond with ONLY a valid JSON array, no markdown fences, no explanation. Example:
[{"title":"...","price":199,"currency":"SGD","vendor":"...","url":"...","whyGoodDeal":"..."}]
`;

const response = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  }
);

const data = await response.json();
console.log("RAW API RESPONSE:", JSON.stringify(data));
let text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "[]";
text = text.replace(/```json|```/g, "").trim();

let deals = [];
try {
  deals = JSON.parse(text);
} catch (e) {
  console.error("Could not parse Gemini response:", text);
}

const existing = existsSync("results.json")
  ? JSON.parse(readFileSync("results.json", "utf8"))
  : [];

existing.push({ date: today, deals });
writeFileSync("results.json", JSON.stringify(existing, null, 2));
console.log(`Saved ${deals.length} deals for ${today}`);

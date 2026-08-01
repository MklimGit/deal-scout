import { readFileSync, writeFileSync, existsSync } from "fs";

const config = JSON.parse(readFileSync("config.json", "utf8"));
const apiKey = process.env.GEMINI_API_KEY;
const today = new Date().toISOString().split("T")[0];

const prompt = `
You are a shopping deal scout. Search the web right now for the best current deals matching:
- Product: ${config.product}
- Brand preference: ${config.brand}
- Maximum price: ${config.priceLimit} ${config.currency}
- Vendor location/country: ${config.vendorCountry}
- Age group: ${config.ageGroup}
- Must-have characteristics: ${config.characteristics.join(", ")}

Find up to ${config.maxResultsPerRun} real, currently available deals. For each one, return:
title, price (number), currency, vendor, url, whyGoodDeal (one sentence).

Respond with ONLY a valid JSON array, no markdown fences, no explanation. Example:
[{"title":"...","price":199,"currency":"SGD","vendor":"...","url":"...","whyGoodDeal":"..."}]
`;

const response = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
    }),
  }
);

const data = await response.json();
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

import type { Knex } from "knex";

const COUNTRIES = [
  { name: "Australia", iso2: "AU", iso3: "AUS", phone_code: "+61", currency: "AUD", currency_symbol: "$", region: "Oceania" },
  { name: "Bangladesh", iso2: "BD", iso3: "BGD", phone_code: "+880", currency: "BDT", currency_symbol: "৳", region: "Asia" },
  { name: "Canada", iso2: "CA", iso3: "CAN", phone_code: "+1", currency: "CAD", currency_symbol: "$", region: "North America" },
  { name: "China", iso2: "CN", iso3: "CHN", phone_code: "+86", currency: "CNY", currency_symbol: "¥", region: "Asia" },
  { name: "Germany", iso2: "DE", iso3: "DEU", phone_code: "+49", currency: "EUR", currency_symbol: "€", region: "Europe" },
  { name: "India", iso2: "IN", iso3: "IND", phone_code: "+91", currency: "INR", currency_symbol: "₹", region: "Asia" },
  { name: "Ireland", iso2: "IE", iso3: "IRL", phone_code: "+353", currency: "EUR", currency_symbol: "€", region: "Europe" },
  { name: "Japan", iso2: "JP", iso3: "JPN", phone_code: "+81", currency: "JPY", currency_symbol: "¥", region: "Asia" },
  { name: "Malaysia", iso2: "MY", iso3: "MYS", phone_code: "+60", currency: "MYR", currency_symbol: "RM", region: "Asia" },
  { name: "Nepal", iso2: "NP", iso3: "NPL", phone_code: "+977", currency: "NPR", currency_symbol: "₨", region: "Asia" },
  { name: "Netherlands", iso2: "NL", iso3: "NLD", phone_code: "+31", currency: "EUR", currency_symbol: "€", region: "Europe" },
  { name: "New Zealand", iso2: "NZ", iso3: "NZL", phone_code: "+64", currency: "NZD", currency_symbol: "$", region: "Oceania" },
  { name: "Nigeria", iso2: "NG", iso3: "NGA", phone_code: "+234", currency: "NGN", currency_symbol: "₦", region: "Africa" },
  { name: "Pakistan", iso2: "PK", iso3: "PAK", phone_code: "+92", currency: "PKR", currency_symbol: "₨", region: "Asia" },
  { name: "Philippines", iso2: "PH", iso3: "PHL", phone_code: "+63", currency: "PHP", currency_symbol: "₱", region: "Asia" },
  { name: "Singapore", iso2: "SG", iso3: "SGP", phone_code: "+65", currency: "SGD", currency_symbol: "$", region: "Asia" },
  { name: "South Korea", iso2: "KR", iso3: "KOR", phone_code: "+82", currency: "KRW", currency_symbol: "₩", region: "Asia" },
  { name: "Sri Lanka", iso2: "LK", iso3: "LKA", phone_code: "+94", currency: "LKR", currency_symbol: "₨", region: "Asia" },
  { name: "United Arab Emirates", iso2: "AE", iso3: "ARE", phone_code: "+971", currency: "AED", currency_symbol: "د.إ", region: "Middle East" },
  { name: "United Kingdom", iso2: "GB", iso3: "GBR", phone_code: "+44", currency: "GBP", currency_symbol: "£", region: "Europe" },
  { name: "United States", iso2: "US", iso3: "USA", phone_code: "+1", currency: "USD", currency_symbol: "$", region: "North America" },
  { name: "Vietnam", iso2: "VN", iso3: "VNM", phone_code: "+84", currency: "VND", currency_symbol: "₫", region: "Asia" },
];

export async function seed(knex: Knex): Promise<void> {
  for (const c of COUNTRIES) {
    const exists = await knex("countries").where({ iso2: c.iso2 }).first();
    if (!exists) await knex("countries").insert(c);
  }
}

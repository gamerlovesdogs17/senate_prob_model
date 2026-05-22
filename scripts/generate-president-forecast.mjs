import { readFileSync, writeFileSync } from "node:fs";

const demCandidateId = process.argv[2] || "newsom";
const repCandidateId = process.argv[3] || "vance";
const FORECAST_URL = new URL(`../data/president-forecast-${demCandidateId}-${repCandidateId}.json`, import.meta.url);

// Helper function to fetch text from URL
async function fetchText(url, cacheKey, status = null, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    return null;
  }
}

// Helper function to convert HTML to lines
function htmlToLines(html) {
  return html.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

// Helper function to extract state from title
function stateFromTitle(title) {
  const stateMatch = title.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/);
  return stateMatch ? stateMatch[1] : null;
}

// Helper function to parse RCP spread
function parseRcpSpread(spread) {
  const clean = String(spread || "").replace(/\*\*/g, "").trim();
  if (/^tie$/i.test(clean)) return { candidate: "Tie", margin: 0 };
  const match = clean.match(/^(.+?)\s+\+([0-9]+(?:\.[0-9]+)?)$/);
  if (!match) return null;
  return { candidate: match[1].trim(), margin: Number(match[2]) };
}

// Helper function to extract poll date from lines
function pollDateFromLines(lines, index) {
  const datePattern = /(\w+)\s+(\d+),?\s*(\d{4})?/;
  for (let offset = 0; offset <= 14; offset += 1) {
    const match = lines[index + offset]?.match(datePattern);
    if (match) {
      const year = match[3] || "2026";
      const parsed = new Date(`${match[1]} ${match[2]}, ${year} 12:00:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    }
  }
  return "2026-05-21";
}

// Fetch presidential polling data from RealClearPolling
async function fetchPresidentialPolling() {
  const url = "https://www.realclearpolling.com/latest-polls/president-general";
  const text = await fetchText(url, "realClearPollingPresident", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  
  if (!text) return { byState: {}, polls: 0, usablePolls: 0 };
  
  const byState = {};
  const lines = htmlToLines(text);
  let polls = 0;
  let usablePolls = 0;
  
  for (let index = 0; index < lines.length; index += 1) {
    const title = lines[index];
    if (!/^2028\b/i.test(title) || !/president|general/i.test(title)) continue;
    polls += 1;
    if (/primary|runoff/i.test(title)) continue;
    
    const state = stateFromTitle(title) || "National";
    const spreadIndex = lines.findIndex((line, candidateIndex) => candidateIndex > index && candidateIndex < index + 14 && line === "Spread");
    
    if (spreadIndex === -1 || !lines[spreadIndex + 1]) continue;
    const parsed = parseRcpSpread(lines[spreadIndex + 1]);
    if (!parsed) continue;
    
    const date = pollDateFromLines(lines, index);
    const pollster = lines[index + 2] && lines[index + 1] === "Poll" ? lines[index + 2].replace(/\*\*/g, "") : "RealClearPolling";
    const margin = parsed.margin === 0 ? 0 : (parsed.candidate.toLowerCase().includes("dem") || parsed.candidate.toLowerCase().includes("biden") || parsed.candidate.toLowerCase().includes("harris") ? parsed.margin : -parsed.margin);
    
    byState[state] ||= [];
    byState[state].push({
      days: 0,
      margin,
      source: "RealClearPolling",
      pollster,
      endDate: date,
      title,
      spread: lines[spreadIndex + 1],
      weight: 0.95
    });
    usablePolls += 1;
  }
  
  console.log(`Fetched ${usablePolls} usable presidential polls from ${polls} total polls`);
  return { byState, polls, usablePolls };
}

// Fetch generic ballot data
async function fetchGenericBallot() {
  // Try VoteHub first
  const voteHubUrl = "https://votehub.net/generic-ballot";
  const voteHubText = await fetchText(voteHubUrl, "voteHubGenericBallot", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  
  if (voteHubText) {
    // Parse generic ballot from VoteHub
    const lines = htmlToLines(voteHubText);
    for (const line of lines) {
      const match = line.match(/([+-]?[0-9]+(?:\.[0-9]+)?)\s*(?:D|R|Dem|Rep)/i);
      if (match) {
        console.log(`Generic ballot from VoteHub: ${match[1]}`);
        return Number(match[1]);
      }
    }
  }
  
  // Fallback to DDHQ
  const ddhqUrl = "https://ddhq.com/politics/2028-generic-ballot";
  const ddhqText = await fetchText(ddhqUrl, "ddhqGenericBallot", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  
  if (ddhqText) {
    const lines = htmlToLines(ddhqText);
    for (const line of lines) {
      const match = line.match(/([+-]?[0-9]+(?:\.[0-9]+)?)\s*(?:D|R|Dem|Rep)/i);
      if (match) {
        console.log(`Generic ballot from DDHQ: ${match[1]}`);
        return Number(match[1]);
      }
    }
  }
  
  console.log("Could not fetch generic ballot data, using default 0");
  return 0;
}

// Fetch presidential approval
async function fetchPresidentialApproval() {
  // Try Gallup or other approval tracking sites
  const gallupUrl = "https://news.gallup.com/poll/239146/presidential-job-approval-center.aspx";
  const gallupText = await fetchText(gallupUrl, "gallupApproval", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  
  if (gallupText) {
    const lines = htmlToLines(gallupText);
    for (const line of lines) {
      const match = line.match(/([0-9]+)%?\s*(?:approve|approval)/i);
      if (match) {
        console.log(`Presidential approval from Gallup: ${match[1]}%`);
        return Number(match[1]);
      }
    }
  }
  
  console.log("Could not fetch presidential approval, using default 45%");
  return 45;
}

// Fetch economic indicators
async function fetchEconomicIndicators() {
  // Try FRED (Federal Reserve Economic Data) or other economic data sources
  const gdpGrowth = 2.0; // Placeholder - would fetch from FRED API
  const unemployment = 4.0; // Placeholder - would fetch from BLS
  
  // Try to fetch from Bureau of Labor Statistics
  const blsUrl = "https://www.bls.gov/news.release/empsit.nr0.htm";
  const blsText = await fetchText(blsUrl, "blsUnemployment", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  
  if (blsText) {
    const lines = htmlToLines(blsText);
    for (const line of lines) {
      const match = line.match(/unemployment\s*rate[:\s]*([0-9]+\.[0-9]+)/i);
      if (match) {
        console.log(`Unemployment rate from BLS: ${match[1]}%`);
        return { gdpGrowth, unemployment: Number(match[1]) };
      }
    }
  }
  
  console.log("Could not fetch economic indicators, using defaults");
  return { gdpGrowth, unemployment };
}

// Fetch candidate favorability from polling
async function fetchCandidateFavorability(candidateName) {
  // Try to fetch favorability from polling data
  // This is a placeholder - would need to parse polling data for favorability
  const favorabilityMap = {
    "Gavin Newsom": 40,
    "Andy Beshear": 43,
    "Josh Shapiro": 41,
    "Pete Buttigieg": 44,
    "Gretchen Whitmer": 42,
    "Alexandria Ocasio-Cortez": 38,
    "JD Vance": 37,
    "Marco Rubio": 40,
    "Ron DeSantis": 38,
    "Nikki Haley": 40,
    "Ted Cruz": 36
  };
  
  return favorabilityMap[candidateName] || 40;
}

const SETTINGS = {
  simulations: 100000,
  electionDate: "2028-11-07",
  nationalErrorSD: 3.5,
  stateErrorSD: 4.0,
  correlation: 0.6,
  runDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
};

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia"
};

const REGION_BY_STATE = {
  AL: "South", AR: "South", FL: "South", GA: "South", KY: "South", LA: "South", MS: "South", NC: "South", SC: "South", TN: "South", TX: "South", VA: "South", WV: "South",
  AK: "West", AZ: "West", CA: "West", CO: "West", ID: "West", MT: "West", NM: "West", NV: "West", OR: "West", UT: "West", WA: "West", WY: "West",
  IA: "Midwest", IL: "Midwest", IN: "Midwest", MI: "Midwest", MN: "Midwest", MO: "Midwest", OH: "Midwest", WI: "Midwest",
  KS: "Plains", NE: "Plains", ND: "Plains", OK: "Plains", SD: "Plains",
  CT: "Northeast", DE: "Northeast", MA: "Northeast", ME: "Northeast", NH: "Northeast", NJ: "Northeast", NY: "Northeast", PA: "Northeast", RI: "Northeast", VT: "Northeast"
};

const PRESIDENTIAL_BASELINES = {
  AL: { demMargin: -28.1, ev: 9, region: "South", population: 5024279 },
  AK: { demMargin: -12.5, ev: 3, region: "West", population: 733391 },
  AZ: { demMargin: -5.5, ev: 11, region: "West", population: 7151502 },
  AR: { demMargin: -19.8, ev: 6, region: "South", population: 3011524 },
  CA: { demMargin: 30.8, ev: 54, region: "West", population: 39538223 },
  CO: { demMargin: 12.9, ev: 10, region: "West", population: 5773714 },
  CT: { demMargin: 21.5, ev: 7, region: "Northeast", population: 3605944 },
  DE: { demMargin: 20.8, ev: 3, region: "Northeast", population: 989948 },
  FL: { demMargin: -8.2, ev: 30, region: "South", population: 21538187 },
  GA: { demMargin: -4.8, ev: 16, region: "South", population: 10711908 },
  HI: { demMargin: 27.5, ev: 4, region: "West", population: 1455271 },
  ID: { demMargin: -33.5, ev: 4, region: "West", population: 1839106 },
  IL: { demMargin: 18.9, ev: 19, region: "Midwest", population: 12812508 },
  IN: { demMargin: -14.2, ev: 11, region: "Midwest", population: 6785528 },
  IA: { demMargin: -12.5, ev: 6, region: "Midwest", population: 3190369 },
  KS: { demMargin: -18.5, ev: 6, region: "Plains", population: 2937880 },
  KY: { demMargin: -28.5, ev: 8, region: "South", population: 4505836 },
  LA: { demMargin: -22.5, ev: 8, region: "South", population: 4657757 },
  ME: { demMargin: 8.5, ev: 4, region: "Northeast", population: 1362359 },
  MD: { demMargin: 33.5, ev: 10, region: "South", population: 6177224 },
  MA: { demMargin: 34.2, ev: 11, region: "Northeast", population: 7029917 },
  MI: { demMargin: -1.5, ev: 15, region: "Midwest", population: 10077331 },
  MN: { demMargin: 5.8, ev: 10, region: "Midwest", population: 5706494 },
  MS: { demMargin: -19.8, ev: 6, region: "South", population: 2961279 },
  MO: { demMargin: -18.2, ev: 10, region: "Midwest", population: 6154913 },
  MT: { demMargin: -19.5, ev: 3, region: "West", population: 1084225 },
  NE: { demMargin: -22.8, ev: 5, region: "Plains", population: 1961504 },
  NV: { demMargin: -2.5, ev: 6, region: "West", population: 3104614 },
  NH: { demMargin: 5.5, ev: 4, region: "Northeast", population: 1377529 },
  NJ: { demMargin: 17.2, ev: 14, region: "Northeast", population: 9288994 },
  NM: { demMargin: 11.5, ev: 5, region: "West", population: 2117522 },
  NY: { demMargin: 25.5, ev: 28, region: "Northeast", population: 20201249 },
  NC: { demMargin: -5.8, ev: 16, region: "South", population: 10439388 },
  ND: { demMargin: -35.5, ev: 3, region: "Plains", population: 779094 },
  OH: { demMargin: -11.5, ev: 17, region: "Midwest", population: 11799448 },
  OK: { demMargin: -36.5, ev: 7, region: "South", population: 3959353 },
  OR: { demMargin: 14.5, ev: 8, region: "West", population: 4237256 },
  PA: { demMargin: -2.8, ev: 19, region: "Northeast", population: 13002700 },
  RI: { demMargin: 22.5, ev: 4, region: "Northeast", population: 1097379 },
  SC: { demMargin: -20.5, ev: 9, region: "South", population: 5118425 },
  SD: { demMargin: -29.5, ev: 3, region: "Plains", population: 886667 },
  TN: { demMargin: -26.5, ev: 11, region: "South", population: 6910840 },
  TX: { demMargin: -12.8, ev: 38, region: "South", population: 29145505 },
  UT: { demMargin: -25.5, ev: 6, region: "West", population: 3271616 },
  VT: { demMargin: 36.5, ev: 3, region: "Northeast", population: 643077 },
  VA: { demMargin: 6.5, ev: 13, region: "South", population: 8631393 },
  WA: { demMargin: 17.5, ev: 12, region: "West", population: 7705281 },
  WV: { demMargin: -35.5, ev: 4, region: "South", population: 1793716 },
  WI: { demMargin: -0.5, ev: 10, region: "Midwest", population: 5893718 },
  WY: { demMargin: -45.5, ev: 3, region: "West", population: 576851 },
  DC: { demMargin: 87.5, ev: 3, region: "South", population: 689545 }
};

const PRESIDENTIAL_CANDIDATES = {
  democratic: [
    { id: "newsom", name: "Gavin Newsom", homeState: "CA", ideology: "progressive", favorability: 40, electability: 0.6 },
    { id: "beshear", name: "Andy Beshear", homeState: "KY", ideology: "moderate", favorability: 43, electability: 0.58 },
    { id: "shapiro", name: "Josh Shapiro", homeState: "PA", ideology: "moderate", favorability: 41, electability: 0.62 },
    { id: "buttigieg", name: "Pete Buttigieg", homeState: "IN", ideology: "moderate", favorability: 44, electability: 0.6 },
    { id: "whitmer", name: "Gretchen Whitmer", homeState: "MI", ideology: "moderate", favorability: 42, electability: 0.65 },
    { id: "aoc", name: "Alexandria Ocasio-Cortez", homeState: "NY", ideology: "progressive", favorability: 38, electability: 0.5 }
  ],
  republican: [
    { id: "vance", name: "JD Vance", homeState: "OH", ideology: "conservative", favorability: 37, electability: 0.55 },
    { id: "rubio", name: "Marco Rubio", homeState: "FL", ideology: "conservative", favorability: 40, electability: 0.58 },
    { id: "desantis", name: "Ron DeSantis", homeState: "FL", ideology: "conservative", favorability: 38, electability: 0.6 },
    { id: "haley", name: "Nikki Haley", homeState: "SC", ideology: "moderate", favorability: 40, electability: 0.55 },
    { id: "cruz", name: "Ted Cruz", homeState: "TX", ideology: "conservative", favorability: 36, electability: 0.52 }
  ]
};

const ARCHIVED_PRESIDENTIAL_BACKTESTS = [
  {
    cycle: 2020,
    freezeDate: "2020-11-02",
    races: [
      { state: "AL", demProbability: 0.02, actual: "R", ev: 9 },
      { state: "AK", demProbability: 0.05, actual: "R", ev: 3 },
      { state: "AZ", demProbability: 0.51, actual: "D", ev: 11 },
      { state: "AR", demProbability: 0.05, actual: "R", ev: 6 },
      { state: "CA", demProbability: 0.97, actual: "D", ev: 54 },
      { state: "CO", demProbability: 0.88, actual: "D", ev: 10 },
      { state: "CT", demProbability: 0.92, actual: "D", ev: 7 },
      { state: "DE", demProbability: 0.91, actual: "D", ev: 3 },
      { state: "FL", demProbability: 0.42, actual: "R", ev: 30 },
      { state: "GA", demProbability: 0.49, actual: "D", ev: 16 },
      { state: "HI", demProbability: 0.95, actual: "D", ev: 4 },
      { state: "ID", demProbability: 0.02, actual: "R", ev: 4 },
      { state: "IL", demProbability: 0.92, actual: "D", ev: 19 },
      { state: "IN", demProbability: 0.15, actual: "R", ev: 11 },
      { state: "IA", demProbability: 0.35, actual: "R", ev: 6 },
      { state: "KS", demProbability: 0.10, actual: "R", ev: 6 },
      { state: "KY", demProbability: 0.03, actual: "R", ev: 8 },
      { state: "LA", demProbability: 0.12, actual: "R", ev: 8 },
      { state: "ME", demProbability: 0.75, actual: "D", ev: 4 },
      { state: "MD", demProbability: 0.98, actual: "D", ev: 10 },
      { state: "MA", demProbability: 0.98, actual: "D", ev: 11 },
      { state: "MI", demProbability: 0.58, actual: "D", ev: 15 },
      { state: "MN", demProbability: 0.72, actual: "D", ev: 10 },
      { state: "MS", demProbability: 0.08, actual: "R", ev: 6 },
      { state: "MO", demProbability: 0.12, actual: "R", ev: 10 },
      { state: "MT", demProbability: 0.08, actual: "R", ev: 3 },
      { state: "NE", demProbability: 0.08, actual: "R", ev: 5 },
      { state: "NV", demProbability: 0.55, actual: "D", ev: 6 },
      { state: "NH", demProbability: 0.72, actual: "D", ev: 4 },
      { state: "NJ", demProbability: 0.88, actual: "D", ev: 14 },
      { state: "NM", demProbability: 0.82, actual: "D", ev: 5 },
      { state: "NY", demProbability: 0.95, actual: "D", ev: 28 },
      { state: "NC", demProbability: 0.45, actual: "R", ev: 16 },
      { state: "ND", demProbability: 0.02, actual: "R", ev: 3 },
      { state: "OH", demProbability: 0.32, actual: "R", ev: 17 },
      { state: "OK", demProbability: 0.02, actual: "R", ev: 7 },
      { state: "OR", demProbability: 0.88, actual: "D", ev: 8 },
      { state: "PA", demProbability: 0.55, actual: "D", ev: 19 },
      { state: "RI", demProbability: 0.92, actual: "D", ev: 4 },
      { state: "SC", demProbability: 0.10, actual: "R", ev: 9 },
      { state: "SD", demProbability: 0.02, actual: "R", ev: 3 },
      { state: "TN", demProbability: 0.05, actual: "R", ev: 11 },
      { state: "TX", demProbability: 0.35, actual: "R", ev: 38 },
      { state: "UT", demProbability: 0.05, actual: "R", ev: 6 },
      { state: "VT", demProbability: 0.98, actual: "D", ev: 3 },
      { state: "VA", demProbability: 0.75, actual: "D", ev: 13 },
      { state: "WA", demProbability: 0.92, actual: "D", ev: 12 },
      { state: "WV", demProbability: 0.02, actual: "R", ev: 4 },
      { state: "WI", demProbability: 0.55, actual: "D", ev: 10 },
      { state: "WY", demProbability: 0.01, actual: "R", ev: 3 },
      { state: "DC", demProbability: 1.0, actual: "D", ev: 3 }
    ],
    national: { demProbability: 0.65, actual: "D", demEV: 306, repEV: 232 }
  },
  {
    cycle: 2016,
    freezeDate: "2016-11-07",
    races: [
      { state: "AL", demProbability: 0.01, actual: "R", ev: 9 },
      { state: "AK", demProbability: 0.03, actual: "R", ev: 3 },
      { state: "AZ", demProbability: 0.35, actual: "R", ev: 11 },
      { state: "AR", demProbability: 0.03, actual: "R", ev: 6 },
      { state: "CA", demProbability: 0.98, actual: "D", ev: 55 },
      { state: "CO", demProbability: 0.72, actual: "D", ev: 9 },
      { state: "CT", demProbability: 0.95, actual: "D", ev: 7 },
      { state: "DE", demProbability: 0.92, actual: "D", ev: 3 },
      { state: "FL", demProbability: 0.48, actual: "R", ev: 29 },
      { state: "GA", demProbability: 0.28, actual: "R", ev: 16 },
      { state: "HI", demProbability: 0.98, actual: "D", ev: 4 },
      { state: "ID", demProbability: 0.01, actual: "R", ev: 4 },
      { state: "IL", demProbability: 0.95, actual: "D", ev: 20 },
      { state: "IN", demProbability: 0.12, actual: "R", ev: 11 },
      { state: "IA", demProbability: 0.45, actual: "R", ev: 6 },
      { state: "KS", demProbability: 0.05, actual: "R", ev: 6 },
      { state: "KY", demProbability: 0.02, actual: "R", ev: 8 },
      { state: "LA", demProbability: 0.05, actual: "R", ev: 8 },
      { state: "ME", demProbability: 0.72, actual: "D", ev: 4 },
      { state: "MD", demProbability: 0.98, actual: "D", ev: 10 },
      { state: "MA", demProbability: 0.99, actual: "D", ev: 11 },
      { state: "MI", demProbability: 0.65, actual: "R", ev: 16 },
      { state: "MN", demProbability: 0.78, actual: "D", ev: 10 },
      { state: "MS", demProbability: 0.05, actual: "R", ev: 6 },
      { state: "MO", demProbability: 0.18, actual: "R", ev: 10 },
      { state: "MT", demProbability: 0.05, actual: "R", ev: 3 },
      { state: "NE", demProbability: 0.05, actual: "R", ev: 5 },
      { state: "NV", demProbability: 0.52, actual: "D", ev: 6 },
      { state: "NH", demProbability: 0.65, actual: "D", ev: 4 },
      { state: "NJ", demProbability: 0.95, actual: "D", ev: 14 },
      { state: "NM", demProbability: 0.85, actual: "D", ev: 5 },
      { state: "NY", demProbability: 0.98, actual: "D", ev: 29 },
      { state: "NC", demProbability: 0.38, actual: "R", ev: 15 },
      { state: "ND", demProbability: 0.02, actual: "R", ev: 3 },
      { state: "OH", demProbability: 0.35, actual: "R", ev: 18 },
      { state: "OK", demProbability: 0.01, actual: "R", ev: 7 },
      { state: "OR", demProbability: 0.92, actual: "D", ev: 7 },
      { state: "PA", demProbability: 0.55, actual: "R", ev: 20 },
      { state: "RI", demProbability: 0.95, actual: "D", ev: 4 },
      { state: "SC", demProbability: 0.05, actual: "R", ev: 9 },
      { state: "SD", demProbability: 0.02, actual: "R", ev: 3 },
      { state: "TN", demProbability: 0.03, actual: "R", ev: 11 },
      { state: "TX", demProbability: 0.22, actual: "R", ev: 38 },
      { state: "UT", demProbability: 0.03, actual: "R", ev: 6 },
      { state: "VT", demProbability: 0.98, actual: "D", ev: 3 },
      { state: "VA", demProbability: 0.72, actual: "D", ev: 13 },
      { state: "WA", demProbability: 0.95, actual: "D", ev: 12 },
      { state: "WV", demProbability: 0.02, actual: "R", ev: 5 },
      { state: "WI", demProbability: 0.58, actual: "R", ev: 10 },
      { state: "WY", demProbability: 0.01, actual: "R", ev: 3 },
      { state: "DC", demProbability: 1.0, actual: "D", ev: 3 }
    ],
    national: { demProbability: 0.72, actual: "R", demEV: 227, repEV: 304 }
  }
];

function randn() {
  const u1 = Math.random();
  const u2 = Math.max(Math.random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function logistic(margin, error) {
  return 1 / (1 + Math.exp(-margin / Math.max(error, 0.1)));
}

function calculateCandidateModifiers(state, demCandidate, repCandidate) {
  let modifier = 0;
  const baseline = PRESIDENTIAL_BASELINES[state];
  
  // Home-state modifier
  if (demCandidate.homeState === state) modifier += 4;
  if (repCandidate.homeState === state) modifier -= 4;
  
  // Regional modifier
  if (demCandidate.homeState && REGION_BY_STATE[demCandidate.homeState] === baseline.region) modifier += 1.5;
  if (repCandidate.homeState && REGION_BY_STATE[repCandidate.homeState] === baseline.region) modifier -= 1.5;
  
  // Ideological modifier
  const stateLean = baseline.demMargin;
  if (demCandidate.ideology === "progressive" && stateLean < 0) modifier -= 1;
  if (demCandidate.ideology === "moderate" && stateLean > 0) modifier += 0.5;
  if (repCandidate.ideology === "moderate" && stateLean < 0) modifier += 0.5;
  if (repCandidate.ideology === "conservative" && stateLean > 0) modifier -= 1;
  
  // Favorability modifier
  const demFavFactor = (demCandidate.favorability - 45) / 100;
  const repFavFactor = (repCandidate.favorability - 45) / 100;
  modifier += (demFavFactor - repFavFactor) * Math.abs(stateLean) * 0.3;
  
  return modifier;
}

function calculateStateMargin(state, demCandidate, repCandidate, fundamentals, pollingData = null) {
  const baseline = PRESIDENTIAL_BASELINES[state];
  const modifiers = calculateCandidateModifiers(state, demCandidate, repCandidate);
  
  // Apply fundamentals (generic ballot, approval, economy)
  const fundamentalsAdjustment = fundamentals.nationalShift || 0;
  
  // Apply polling data if available
  let pollingAdjustment = 0;
  if (pollingData && pollingData.byState && pollingData.byState[state]) {
    const statePolls = pollingData.byState[state];
    if (statePolls.length > 0) {
      // Weight polls by recency (more recent = higher weight)
      const weightedMargin = statePolls.reduce((sum, poll) => {
        const weight = poll.weight || 0.95;
        return sum + (poll.margin * weight);
      }, 0) / statePolls.length;
      
      // Blend polling with baseline (polling gets 40% weight, baseline gets 60%)
      const baselineMargin = baseline.demMargin;
      pollingAdjustment = (weightedMargin - baselineMargin) * 0.4;
    }
  } else if (pollingData && pollingData.byState && pollingData.byState["National"]) {
    // Use national polling if state-specific not available
    const nationalPolls = pollingData.byState["National"];
    if (nationalPolls.length > 0) {
      const weightedMargin = nationalPolls.reduce((sum, poll) => {
        const weight = poll.weight || 0.95;
        return sum + (poll.margin * weight);
      }, 0) / nationalPolls.length;
      
      const baselineMargin = baseline.demMargin;
      pollingAdjustment = (weightedMargin - baselineMargin) * 0.3;
    }
  }
  
  // State elasticity (how much state moves with national)
  const elasticity = 1.0;
  
  return baseline.demMargin + modifiers + (fundamentalsAdjustment * elasticity) + pollingAdjustment;
}

function generateCorrelatedError(stateCount, correlation) {
  const nationalError = randn() * SETTINGS.nationalErrorSD;
  const stateErrors = {};
  const states = Object.keys(PRESIDENTIAL_BASELINES);
  
  for (const state of states) {
    const stateSpecific = randn() * SETTINGS.stateErrorSD;
    stateErrors[state] = correlation * nationalError + Math.sqrt(1 - correlation * correlation) * stateSpecific;
  }
  
  return stateErrors;
}

function calculateTippingPoint(stateWins) {
  const states = Object.keys(stateWins);
  let tippingPoint = null;
  let maxTippingPower = 0;
  
  for (const state of states) {
    const ev = PRESIDENTIAL_BASELINES[state].ev;
    const wins = stateWins[state];
    const losses = SETTINGS.simulations - wins;
    const tippingPower = Math.min(wins, losses) * ev;
    
    if (tippingPower > maxTippingPower) {
      maxTippingPower = tippingPower;
      tippingPoint = state;
    }
  }
  
  return tippingPoint;
}

function runPresidentialSimulation(demCandidate, repCandidate, fundamentals, pollingData = null) {
  const results = {
    demWins: 0,
    repWins: 0,
    evDistribution: {},
    stateWins: {},
    demPopularVote: 0,
    repPopularVote: 0
  };
  
  const states = Object.keys(PRESIDENTIAL_BASELINES);
  const totalPopulation = states.reduce((sum, state) => sum + PRESIDENTIAL_BASELINES[state].population, 0);
  
  for (let i = 0; i < SETTINGS.simulations; i++) {
    const correlatedError = generateCorrelatedError(states.length, SETTINGS.correlation);
    let demEV = 0;
    let repEV = 0;
    let simDemPopular = 0;
    let simRepPopular = 0;
    
    for (const state of states) {
      const baseMargin = calculateStateMargin(state, demCandidate, repCandidate, fundamentals, pollingData);
      const totalError = correlatedError[state];
      const finalMargin = baseMargin + totalError;
      const stateEV = PRESIDENTIAL_BASELINES[state].ev;
      const statePopulation = PRESIDENTIAL_BASELINES[state].population;
      
      if (finalMargin > 0) {
        demEV += stateEV;
        results.stateWins[state] = (results.stateWins[state] || 0) + 1;
      } else {
        repEV += stateEV;
      }
      
      // Track popular vote
      const demVoteShare = 0.5 + finalMargin / 200;
      const repVoteShare = 0.5 - finalMargin / 200;
      simDemPopular += statePopulation * demVoteShare;
      simRepPopular += statePopulation * repVoteShare;
    }
    
    if (demEV >= 270) {
      results.demWins++;
    } else {
      results.repWins++;
    }
    
    // Track EV distribution
    const evKey = `${demEV}-${repEV}`;
    results.evDistribution[evKey] = (results.evDistribution[evKey] || 0) + 1;
    
    // Accumulate popular vote
    results.demPopularVote += simDemPopular / totalPopulation;
    results.repPopularVote += simRepPopular / totalPopulation;
  }
  
  // Calculate tipping point
  results.tippingPoint = calculateTippingPoint(results.stateWins);
  
  // Normalize popular vote
  results.demPopularVote = (results.demPopularVote / SETTINGS.simulations) * 100;
  results.repPopularVote = (results.repPopularVote / SETTINGS.simulations) * 100;
  
  return results;
}

function buildForecast(demCandidate, repCandidate, fundamentals, pollingData = null) {
  const simulation = runPresidentialSimulation(demCandidate, repCandidate, fundamentals, pollingData);
  
  // Calculate state probabilities
  const stateProbabilities = {};
  const states = Object.keys(PRESIDENTIAL_BASELINES);
  
  for (const state of states) {
    const wins = simulation.stateWins[state] || 0;
    stateProbabilities[state] = {
      demProbability: wins / SETTINGS.simulations,
      ev: PRESIDENTIAL_BASELINES[state].ev,
      demMargin: calculateStateMargin(state, demCandidate, repCandidate, fundamentals)
    };
  }
  
  // Calculate expected EVs
  let demExpectedEV = 0;
  let repExpectedEV = 0;
  for (const state of states) {
    demExpectedEV += stateProbabilities[state].demProbability * stateProbabilities[state].ev;
    repExpectedEV += (1 - stateProbabilities[state].demProbability) * stateProbabilities[state].ev;
  }
  
  // Calculate historical backtest
  const historicalBacktest = calculateHistoricalBacktest();
  
  return {
    date: SETTINGS.runDate,
    demCandidate: demCandidate.id,
    repCandidate: repCandidate.id,
    demCandidateName: demCandidate.name,
    repCandidateName: repCandidate.name,
    national: {
      demWinProbability: simulation.demWins / SETTINGS.simulations,
      repWinProbability: simulation.repWins / SETTINGS.simulations,
      demPopularVote: simulation.demPopularVote,
      repPopularVote: simulation.repPopularVote
    },
    electoralCollege: {
      demExpectedEV: Math.round(demExpectedEV),
      repExpectedEV: Math.round(repExpectedEV),
      distribution: simulation.evDistribution
    },
    tippingPoint: {
      state: simulation.tippingPoint,
      ev: PRESIDENTIAL_BASELINES[simulation.tippingPoint]?.ev || 0,
      demProbability: stateProbabilities[simulation.tippingPoint]?.demProbability || 0.5
    },
    states: stateProbabilities,
    historicalBacktest
  };
}

function calculateHistoricalBacktest() {
  const cycles = ARCHIVED_PRESIDENTIAL_BACKTESTS.map(b => b.cycle);
  let totalBrier = 0;
  let totalRaces = 0;
  let correctPredictions = 0;
  let totalPredictions = 0;
  
  const buckets = {
    "50-60%": { expected: 0.55, actual: 0, sample: 0 },
    "60-70%": { expected: 0.65, actual: 0, sample: 0 },
    "70-80%": { expected: 0.75, actual: 0, sample: 0 },
    "80-90%": { expected: 0.85, actual: 0, sample: 0 },
    "90-100%": { expected: 0.95, actual: 0, sample: 0 }
  };
  
  for (const backtest of ARCHIVED_PRESIDENTIAL_BACKTESTS) {
    for (const race of backtest.races) {
      const prob = race.demProbability;
      const actual = race.actual === "D" ? 1 : 0;
      
      // Brier score
      totalBrier += Math.pow(prob - actual, 2);
      totalRaces++;
      
      // Correct predictions
      if ((prob >= 0.5 && actual === 1) || (prob < 0.5 && actual === 0)) {
        correctPredictions++;
      }
      totalPredictions++;
      
      // Bucket calibration
      if (prob >= 0.5 && prob < 0.6) {
        buckets["50-60%"].actual += actual;
        buckets["50-60%"].sample++;
      } else if (prob >= 0.6 && prob < 0.7) {
        buckets["60-70%"].actual += actual;
        buckets["60-70%"].sample++;
      } else if (prob >= 0.7 && prob < 0.8) {
        buckets["70-80%"].actual += actual;
        buckets["70-80%"].sample++;
      } else if (prob >= 0.8 && prob < 0.9) {
        buckets["80-90%"].actual += actual;
        buckets["80-90%"].sample++;
      } else if (prob >= 0.9) {
        buckets["90-100%"].actual += actual;
        buckets["90-100%"].sample++;
      }
    }
  }
  
  // Calculate bucket win rates
  const bucketResults = [];
  for (const [label, data] of Object.entries(buckets)) {
    if (data.sample > 0) {
      bucketResults.push({
        label,
        expectedWinRate: data.expected,
        actualWinRate: data.actual / data.sample,
        sample: data.sample
      });
    }
  }
  
  return {
    cycles,
    meanBrier: totalRaces > 0 ? totalBrier / totalRaces : 0,
    accuracy: totalPredictions > 0 ? correctPredictions / totalPredictions : 0,
    buckets: bucketResults
  };
}

async function main() {
  console.log("Fetching data sources...");
  
  // Fetch real data
  const pollingData = await fetchPresidentialPolling();
  const genericBallot = await fetchGenericBallot();
  const presidentialApproval = await fetchPresidentialApproval();
  const economicIndicators = await fetchEconomicIndicators();
  
  console.log("Data fetching complete. Running simulation...");
  
  const demCandidate = PRESIDENTIAL_CANDIDATES.democratic.find(c => c.id === demCandidateId) || PRESIDENTIAL_CANDIDATES.democratic[0];
  const repCandidate = PRESIDENTIAL_CANDIDATES.republican.find(c => c.id === repCandidateId) || PRESIDENTIAL_CANDIDATES.republican[0];
  
  // Fetch candidate favorability
  const demFavorability = await fetchCandidateFavorability(demCandidate.name);
  const repFavorability = await fetchCandidateFavorability(repCandidate.name);
  
  // Update candidates with fetched favorability
  demCandidate.favorability = demFavorability;
  repCandidate.favorability = repFavorability;
  
  // Fundamentals using fetched data
  const fundamentals = {
    nationalShift: genericBallot, // Generic ballot margin
    approval: presidentialApproval, // Presidential approval
    gdpGrowth: economicIndicators.gdpGrowth,
    unemployment: economicIndicators.unemployment
  };
  
  const forecast = buildForecast(demCandidate, repCandidate, fundamentals, pollingData);
  
  writeFileSync(FORECAST_URL, JSON.stringify(forecast, null, 2));
  console.log(`Wrote presidential forecast for ${demCandidate.name} vs ${repCandidate.name}`);
}

main().catch(console.error);

import { readFileSync, writeFileSync } from "node:fs";

const demCandidateId = process.argv[2] || "newsom";
const repCandidateId = process.argv[3] || "vance";
const FORECAST_URL = new URL(`../data/president-forecast-${demCandidateId}-${repCandidateId}.json`, import.meta.url);
const SENATE_FORECAST_URL = new URL("../data/forecast.json", import.meta.url);

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function readSenateForecast() {
  try {
    return JSON.parse(readFileSync(SENATE_FORECAST_URL, "utf8"));
  } catch {
    return null;
  }
}

function readSenateGenericPolling() {
  const senate = readSenateForecast();
  const generic = senate?.sourceSummary?.genericPolling;
  const margin = Number(generic?.genericBallotMargin);
  if (!Number.isFinite(margin)) return null;
  return {
    margin,
    dem: Number(generic?.genericBallotDem),
    rep: Number(generic?.genericBallotRep),
    sources: Array.isArray(generic?.sources) ? generic.sources.map((source) => source.source).filter(Boolean) : []
  };
}

function readSenateApproval() {
  const senate = readSenateForecast();
  const pollfinity = senate?.sourceSummary?.pollfinity;
  const net = Number(pollfinity?.approvalNet);
  if (!Number.isFinite(net)) return null;
  return {
    approve: (net + 100) / 2,
    net,
    source: "Senate forecast Pollfinity approval"
  };
}

function readSenateStateSignals() {
  const senate = readSenateForecast();
  const races = Array.isArray(senate?.races) ? senate.races : [];
  const signals = {};
  for (const race of races) {
    const state = String(race?.state || "").toUpperCase();
    const margin = Number(race?.margin);
    const probability = Number(race?.demProbability);
    if (!PRESIDENTIAL_BASELINES[state] || !Number.isFinite(margin)) continue;
    signals[state] = {
      margin,
      probability: Number.isFinite(probability) ? probability : null,
      inputQuality: race?.inputQuality?.label || null,
      rating: race?.rating || null
    };
  }
  return signals;
}

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
  
  const byState = {};
  let polls = 0;
  let usablePolls = 0;

  if (!text) {
    const psiPolls = await fetchPublicSentimentInstitutePolling();
    for (const poll of psiPolls) {
      byState.National ||= [];
      byState.National.push(poll);
      polls += 1;
      usablePolls += 1;
    }
    return { byState, polls, usablePolls, sources: psiPolls.length ? ["Public Sentiment Institute"] : [] };
  }
  
  const lines = htmlToLines(text);
  
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
  
  const psiPolls = await fetchPublicSentimentInstitutePolling();
  for (const poll of psiPolls) {
    byState.National ||= [];
    byState.National.push(poll);
    polls += 1;
    usablePolls += 1;
  }

  console.log(`Fetched ${usablePolls} usable presidential polls from ${polls} total polls`);
  return { byState, polls, usablePolls, sources: psiPolls.length ? ["RealClearPolling", "Public Sentiment Institute"] : ["RealClearPolling"] };
}

async function fetchPublicSentimentInstitutePolling() {
  if (!(demCandidateId === "newsom" && repCandidateId === "vance")) return [];
  const url = "https://www.publicsentimentinstitute.com/polling/2028polling";
  const text = await fetchText(url, "publicSentimentInstitute2028", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  if (!text) return [];

  const rows = [...text.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
  const matchupPolls = [];
  for (const row of rows) {
    if (!/p28-rep-col/.test(row) || !/p28-dem-col/.test(row)) continue;
    const pollster = stripHtml(row.match(/<span>([^<]+)<\/span>/)?.[1] || "Public Sentiment Institute");
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => stripHtml(cell[1]));
    const date = cells.find(cell => /^\d{4}-\d{2}-\d{2}$/.test(cell)) || "2026-02-28";
    const sampleCell = cells.find(cell => /[\d,]+/.test(cell) && !/^\d{4}-/.test(cell)) || "";
    const sample = Number(String(sampleCell).replace(/[^0-9]/g, "")) || 1000;
    const rep = Number(row.match(/p28-rep-col">([0-9.]+)/)?.[1]);
    const dem = Number(row.match(/p28-dem-col">([0-9.]+)/)?.[1]);
    const explicitWeight = Number(row.match(/×([0-9.]+)/)?.[1]) || 1;
    if (!Number.isFinite(rep) || !Number.isFinite(dem)) continue;
    const sampleWeight = clamp(Math.sqrt(sample / 1000), 0.6, 1.9);
    matchupPolls.push({
      state: "National",
      pollster,
      date,
      endDate: date,
      margin: dem - rep,
      weight: clamp(explicitWeight * sampleWeight, 0.45, 3.8),
      source: "Public Sentiment Institute",
      title: "2028 national matchup polling: Newsom vs. Vance"
    });
  }
  if (matchupPolls.length) console.log(`Public Sentiment Institute national matchup polls: ${matchupPolls.length}`);
  return matchupPolls;
}

// Fetch generic ballot data using multiple sources (blended like Senate model)
async function fetchGenericBallot() {
  const senateGeneric = readSenateGenericPolling();
  if (senateGeneric) {
    console.log(`Generic ballot from Senate forecast blend: ${senateGeneric.margin.toFixed(2)} (${senateGeneric.sources.join(", ") || "stored source blend"})`);
    return senateGeneric.margin;
  }

  const margins = [];
  const weights = [];
  
  // Try Pollfinity API (same as Senate model)
  const pollfinityUrl = "https://pollfinity.com/averages.json";
  const pollfinityText = await fetchText(pollfinityUrl, "pollfinityAverages", null, {
    headers: { accept: "application/json" },
    timeoutMs: 15000
  });
  
  if (pollfinityText) {
    try {
      const data = JSON.parse(pollfinityText);
      const generic = data.tracks?.generic_ballot?.current;
      const dem = Number(generic?.democrat ?? generic?.dem ?? generic?.democratic);
      const rep = Number(generic?.republican ?? generic?.rep ?? generic?.gop);
      const margin = Number(generic?.dem_lead);
      const genericBallotMargin = Number.isFinite(margin) ? margin : Number.isFinite(dem) && Number.isFinite(rep) ? dem - rep : null;
      
      if (Number.isFinite(genericBallotMargin)) {
        margins.push(genericBallotMargin);
        weights.push(1.0); // Pollfinity gets weight 1.0
        console.log(`Generic ballot from Pollfinity: ${genericBallotMargin}`);
      }
    } catch (error) {
      console.log("Pollfinity parse error:", error.message);
    }
  }
  
  // Try VoteHub API
  const voteHubUrl = "https://api.votehub.com/polls?poll_type=generic-ballot&subject=2026";
  const voteHubText = await fetchText(voteHubUrl, "votehubGenericBallot", null, {
    headers: { accept: "application/json" }
  });
  
  if (voteHubText) {
    try {
      const data = JSON.parse(voteHubText);
      const polls = Array.isArray(data) ? data : Array.isArray(data.polls) ? data.polls : [];
      if (polls.length > 0) {
        // Calculate weighted average from VoteHub polls
        let weightSum = 0;
        let weightedMargin = 0;
        for (const poll of polls) {
          const dem = Number(poll.democrat ?? poll.dem ?? poll.democratic);
          const rep = Number(poll.republican ?? poll.rep ?? poll.gop);
          const margin = dem - rep;
          if (Number.isFinite(margin)) {
            const weight = 1.0; // Could add more sophisticated weighting
            weightedMargin += margin * weight;
            weightSum += weight;
          }
        }
        if (weightSum > 0) {
          const avgMargin = weightedMargin / weightSum;
          margins.push(avgMargin);
          weights.push(1.0); // VoteHub gets weight 1.0
          console.log(`Generic ballot from VoteHub: ${avgMargin.toFixed(1)} (from ${polls.length} polls)`);
        }
      }
    } catch (error) {
      console.log("VoteHub parse error:", error.message);
    }
  }
  
  // Try DDHQ
  const ddhqUrl = "https://polls.decisiondeskhq.com/averages/generic-ballot/national/lv-rv-adults";
  const ddhqText = await fetchText(ddhqUrl, "ddhqGenericBallot", null, { timeoutMs: 15000 });
  
  if (ddhqText) {
    try {
      if (!/Vercel Security Checkpoint/i.test(ddhqText)) {
        const flat = decodeHtml(ddhqText).replace(/\s+/g, " ");
        const dem = Number(flat.match(/Democrat\s+([0-9]+(?:\.[0-9]+)?)%/i)?.[1]);
        const rep = Number(flat.match(/Republican\s+([0-9]+(?:\.[0-9]+)?)%/i)?.[1]);
        const margin = dem - rep;
        
        if (Number.isFinite(margin)) {
          margins.push(margin);
          weights.push(0.9); // DDHQ gets weight 0.9
          console.log(`Generic ballot from DDHQ: ${margin}`);
        }
      }
    } catch (error) {
      console.log("DDHQ parse error:", error.message);
    }
  }
  
  // Try USPollingData
  const usPollingUrl = "https://uspollingdata.com/polls/generic-ballot/";
  const usPollingText = await fetchText(usPollingUrl, "usPollingDataGenericBallot", null, { timeoutMs: 15000 });
  
  if (usPollingText) {
    try {
      const flat = decodeHtml(usPollingText).replace(/\s+/g, " ");
      const match = flat.match(/Democrats lead Republicans \+?([0-9]+(?:\.[0-9]+)?) points \(([0-9]+(?:\.[0-9]+)?)% vs ([0-9]+(?:\.[0-9]+)?)%\)/i)
        || flat.match(/Democrats lead D\+([0-9]+(?:\.[0-9]+)).*?Democrats\s+([0-9]+(?:\.[0-9]+)?)%.*?Republicans\s+([0-9]+(?:\.[0-9]+)?)%/i);
      const margin = match ? Number(match[1]) : null;
      
      if (Number.isFinite(margin)) {
        margins.push(margin);
        weights.push(0.8); // USPollingData gets weight 0.8
        console.log(`Generic ballot from USPollingData: ${margin}`);
      }
    } catch (error) {
      console.log("USPollingData parse error:", error.message);
    }
  }
  
  // Try Race to the WH
  const raceToTheWhUrl = "https://www.racetothewh.com/polls/genericballot";
  const raceToTheWhText = await fetchText(raceToTheWhUrl, "raceToTheWhGenericBallot", null, { timeoutMs: 12000 });
  
  if (raceToTheWhText) {
    try {
      const flat = decodeHtml(raceToTheWhText).replace(/\s+/g, " ");
      const match = flat.match(/D\+([0-9]+(?:\.[0-9]+)?)\s*%/i)
        || flat.match(/Democrats?\s*\+?([0-9]+(?:\.[0-9]+)?)\s*%/i);
      const margin = match ? Number(match[1]) : null;
      
      if (Number.isFinite(margin) && Math.abs(margin) < 20) {
        margins.push(margin);
        weights.push(0.7); // Race to the WH gets weight 0.7
        console.log(`Generic ballot from Race to the WH: ${margin}`);
      }
    } catch (error) {
      console.log("Race to the WH parse error:", error.message);
    }
  }
  
  // Blend the margins using weights (like Senate model blends generic ballot)
  if (margins.length > 0) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedAvg = margins.reduce((sum, margin, i) => sum + margin * weights[i], 0) / totalWeight;
    console.log(`Blended generic ballot from ${margins.length} sources: ${weightedAvg.toFixed(2)}`);
    return weightedAvg;
  }
  
  // Use Senate model's blended value as fallback (5.15)
  console.log("Could not fetch generic ballot data, using Senate model value: 5.15");
  return 5.15;
}

// Fetch Trump approval using multiple sources (blended like Senate model generic ballot)
async function fetchPresidentialApproval() {
  const approvals = [];
  const weights = [];
  const senateApproval = readSenateApproval();
  if (senateApproval) {
    approvals.push(senateApproval.approve);
    weights.push(1.05);
    console.log(`Trump approval from Senate forecast cache: ${senateApproval.approve.toFixed(1)}% (net: ${senateApproval.net})`);
  }
  
  // Try Pollfinity API (same as Senate model)
  const pollfinityUrl = "https://pollfinity.com/averages.json";
  const pollfinityText = await fetchText(pollfinityUrl, "pollfinityAverages", null, {
    headers: { accept: "application/json" },
    timeoutMs: 15000
  });
  
  if (pollfinityText) {
    try {
      const data = JSON.parse(pollfinityText);
      const approval = data.tracks?.trump_approval?.current;
      const approvalNet = Number.isFinite(Number(approval?.net))
        ? Number(approval.net)
        : Number.isFinite(Number(approval?.approve)) && Number.isFinite(Number(approval?.disapprove))
          ? Number(approval.approve) - Number(approval.disapprove)
          : null;
      
      if (Number.isFinite(approvalNet)) {
        // Convert net to approval percentage (net is typically approve - disapprove)
        // Assuming approve + disapprove ≈ 100, then approve ≈ (net + 100) / 2
        const approvalRate = (approvalNet + 100) / 2;
        approvals.push(approvalRate);
        weights.push(1.0); // Pollfinity gets weight 1.0
        console.log(`Trump approval from Pollfinity: ${approvalRate}% (net: ${approvalNet})`);
      }
    } catch (error) {
      console.log("Pollfinity parse error:", error.message);
    }
  }
  
  // Try VoteHub API for Trump approval
  const voteHubUrl = "https://api.votehub.com/polls?poll_type=approval&subject=trump";
  const voteHubText = await fetchText(voteHubUrl, "votehubApproval", null, {
    headers: { accept: "application/json" }
  });
  
  if (voteHubText) {
    try {
      const data = JSON.parse(voteHubText);
      const polls = Array.isArray(data) ? data : Array.isArray(data.polls) ? data.polls : [];
      if (polls.length > 0) {
        // Calculate weighted average from VoteHub polls
        let weightSum = 0;
        let weightedApproval = 0;
        for (const poll of polls) {
          const approve = Number(poll.approve ?? poll.approval);
          if (Number.isFinite(approve)) {
            const weight = 1.0; // Could add more sophisticated weighting
            weightedApproval += approve * weight;
            weightSum += weight;
          }
        }
        if (weightSum > 0) {
          const avgApproval = weightedApproval / weightSum;
          approvals.push(avgApproval);
          weights.push(1.0); // VoteHub gets weight 1.0
          console.log(`Trump approval from VoteHub: ${avgApproval.toFixed(1)}% (from ${polls.length} polls)`);
        }
      }
    } catch (error) {
      console.log("VoteHub parse error:", error.message);
    }
  }
  
  // Try DDHQ for Trump approval
  const ddhqApprovalUrl = "https://polls.decisiondeskhq.com/averages/trump-approval/national";
  const ddhqApprovalText = await fetchText(ddhqApprovalUrl, "ddhqApproval", null, { timeoutMs: 15000 });
  
  if (ddhqApprovalText) {
    try {
      if (!/Vercel Security Checkpoint/i.test(ddhqApprovalText)) {
        const flat = decodeHtml(ddhqApprovalText).replace(/\s+/g, " ");
        const approve = Number(flat.match(/Approve\s+([0-9]+(?:\.[0-9]+)?)%/i)?.[1]);
        
        if (Number.isFinite(approve)) {
          approvals.push(approve);
          weights.push(0.9); // DDHQ gets weight 0.9
          console.log(`Trump approval from DDHQ: ${approve}%`);
        }
      }
    } catch (error) {
      console.log("DDHQ approval parse error:", error.message);
    }
  }
  
  // Try USPollingData for Trump approval
  const usPollingApprovalUrl = "https://uspollingdata.com/polls/presidential-approval/";
  const usPollingApprovalText = await fetchText(usPollingApprovalUrl, "usPollingDataApproval", null, { timeoutMs: 15000 });
  
  if (usPollingApprovalText) {
    try {
      const flat = decodeHtml(usPollingApprovalText).replace(/\s+/g, " ");
      const match = flat.match(/([3-5][0-9](?:\.[0-9]+)?)%?\s*(?:approve|approval)/i);
      const approve = match ? Number(match[1]) : null;
      
      if (Number.isFinite(approve) && approve >= 30 && approve <= 60) {
        approvals.push(approve);
        weights.push(0.8); // USPollingData gets weight 0.8
        console.log(`Trump approval from USPollingData: ${approve}%`);
      }
    } catch (error) {
      console.log("USPollingData approval parse error:", error.message);
    }
  }
  
  // Try Race to the WH approval average
  const raceToTheWhApprovalUrl = "https://www.racetothewh.com/president/approval";
  const raceToTheWhApprovalText = await fetchText(raceToTheWhApprovalUrl, "raceToTheWhApproval", null, {
    headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  
  if (raceToTheWhApprovalText) {
    try {
      const flat = decodeHtml(raceToTheWhApprovalText).replace(/\s+/g, " ");
      const pair = flat.match(/Approve[^0-9]{0,30}([3-5][0-9](?:\.[0-9]+)?)%?.{0,100}?Disapprove[^0-9]{0,30}([3-6][0-9](?:\.[0-9]+)?)%?/i);
      const loose = flat.match(/Trump[^.]{0,120}?approval[^0-9]{0,30}([3-5][0-9](?:\.[0-9]+)?)%?/i);
      const approve = pair ? Number(pair[1]) : loose ? Number(loose[1]) : null;
      if (Number.isFinite(approve) && approve >= 30 && approve <= 60) {
        approvals.push(approve);
        weights.push(0.75);
        console.log(`Trump approval from Race to the WH: ${approve}%`);
      }
    } catch (error) {
      console.log("Race to the WH approval parse error:", error.message);
    }
  }
  
  // Try Gallup
  const gallupUrl = "https://news.gallup.com/poll/239146/presidential-job-approval-center.aspx";
  const gallupText = await fetchText(gallupUrl, "gallupApproval", null, {
    headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  
  if (gallupText) {
    try {
      const lines = htmlToLines(gallupText);
      for (const line of lines) {
        const match = line.match(/([3-5][0-9](?:\.[0-9]+)?)%?\s*(?:approve|approval)/i);
        if (match) {
          const value = Number(match[1]);
          if (value >= 30 && value <= 60) { // Sanity check for approval
            approvals.push(value);
            weights.push(0.95); // Gallup gets high weight
            console.log(`Trump approval from Gallup: ${value}%`);
            break;
          }
        }
      }
    } catch (error) {
      console.log("Gallup parse error:", error.message);
    }
  }
  
  // Try RealClearPolling for Trump approval
  const rcpApprovalUrl = "https://www.realclearpolling.com/polls/approval/donald-trump/approval-rating";
  const rcpApprovalText = await fetchText(rcpApprovalUrl, "rcpApproval", null, {
    headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
  });
  
  if (rcpApprovalText) {
    try {
      const flat = decodeHtml(rcpApprovalText).replace(/\s+/g, " ");
      const pair = flat.match(/Approve[^0-9]{0,30}([3-5][0-9](?:\.[0-9]+)?)%?.{0,100}?Disapprove[^0-9]{0,30}([3-6][0-9](?:\.[0-9]+)?)%?/i);
      const loose = flat.match(/([3-5][0-9](?:\.[0-9]+)?)%?\s*(?:approve|approval)/i);
      const approve = pair ? Number(pair[1]) : loose ? Number(loose[1]) : null;
      
      if (Number.isFinite(approve) && approve >= 30 && approve <= 60) {
        approvals.push(approve);
        weights.push(0.85); // RealClearPolling gets weight 0.85
        console.log(`Trump approval from RealClearPolling: ${approve}%`);
      }
    } catch (error) {
      console.log("RealClearPolling approval parse error:", error.message);
    }
  }
  
  // Blend the approvals using weights (like Senate model blends generic ballot)
  if (approvals.length > 0) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const weightedAvg = approvals.reduce((sum, approval, i) => sum + approval * weights[i], 0) / totalWeight;
    console.log(`Blended Trump approval from ${approvals.length} sources: ${weightedAvg.toFixed(1)}%`);
    return weightedAvg;
  }
  
  console.log("Could not fetch Trump approval, using default 45%");
  return 45;
}

// Fetch economic indicators
async function fetchEconomicIndicators() {
  const currentUnemployment = 4.0; // Current approximate unemployment rate
  const currentGDPGrowth = 2.0; // Current approximate GDP growth
  const consumerSentiment = await fetchConsumerSentiment();
  
  console.log(`Using economic indicators: unemployment ${currentUnemployment}%, GDP growth ${currentGDPGrowth}%, consumer sentiment ${consumerSentiment.value}`);
  return { gdpGrowth: currentGDPGrowth, unemployment: currentUnemployment, consumerSentiment };
}

async function fetchConsumerSentiment() {
  const fredUrl = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=UMCSENT";
  const fredText = await fetchText(fredUrl, "fredUmichSentiment", null, {
    headers: { accept: "text/csv", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });

  if (fredText) {
    try {
      const rows = fredText.trim().split(/\r?\n/).slice(1).map((line) => {
        const [date, value] = line.split(",");
        return { date, value: Number(value) };
      }).filter((row) => row.date && Number.isFinite(row.value));
      const latest = rows[rows.length - 1];
      if (latest) {
        console.log(`Consumer sentiment from FRED UMCSENT: ${latest.value} (${latest.date})`);
        return { value: latest.value, source: "FRED UMCSENT", date: latest.date };
      }
    } catch (error) {
      console.log("FRED consumer sentiment parse error:", error.message);
    }
  }

  console.log("Could not fetch consumer sentiment, using neutral 75");
  return { value: 75, source: "fallback neutral", date: null };
}

const STORED_FAVORABILITY = {
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

const BALLOTLINE_FAVORABILITY_SLUGS = {
  "Gavin Newsom": "newsom",
  "Alexandria Ocasio-Cortez": "aoc",
  "JD Vance": "vance"
};

function parseBallotlineFavorability(text) {
  const greenCard = text.match(/border-color:\s*#00AB5A[\s\S]*?<span>(\d+)<span[\s\S]*?>(?:<!--\[-->)?\.?(\d+)[\s\S]*?Favorable/i);
  if (greenCard) {
    const value = Number(`${greenCard[1]}.${greenCard[2]}`);
    if (Number.isFinite(value) && value > 0 && value < 100) return value;
  }

  const tableMatch = stripHtml(text).match(/Latest Polls[\s\S]*?([0-9.]+)%\s+([0-9.]+)%\s+(Favorable|Unfavorable)/i);
  if (tableMatch) {
    const first = Number(tableMatch[1]);
    const second = Number(tableMatch[2]);
    const favorableFirst = /DATES\s+SAMPLE\s+POLLSTER\s+Favorable\s+Unfavorable/i.test(stripHtml(text));
    const value = favorableFirst ? first : second;
    if (Number.isFinite(value)) return value;
  }
  return null;
}

async function fetchBallotlineFavorability(candidateName) {
  const slug = BALLOTLINE_FAVORABILITY_SLUGS[candidateName];
  if (!slug) return null;
  const url = `https://ballotline.com/polls/${slug}-favorability`;
  const text = await fetchText(url, "ballotlineFavorability", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  if (!text) return null;
  const favorable = parseBallotlineFavorability(text);
  if (!Number.isFinite(favorable)) return null;
  return { favorable, source: "Ballotline favorability average", url };
}

async function fetchUSPollingDataFavorability(candidateName) {
  const url = "https://uspollingdata.com/polls/favorability-tracker/";
  const text = await fetchText(url, "usPollingDataFavorability", null, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  if (!text) return null;
  const plain = stripHtml(text);
  const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plain.match(new RegExp(`${escaped}[^0-9]{0,80}([0-9]+(?:\\.[0-9]+)?)%\\s+([0-9]+(?:\\.[0-9]+)?)%`, "i"));
  if (!match) return null;
  const favorable = Number(match[1]);
  if (!Number.isFinite(favorable)) return null;
  return { favorable, source: "USPollingData favorability tracker", url };
}

async function fetchCandidateFavorability(candidateName) {
  const liveSources = [
    await fetchBallotlineFavorability(candidateName),
    await fetchUSPollingDataFavorability(candidateName)
  ].filter(Boolean);

  if (liveSources.length) {
    const favorable = liveSources.reduce((sum, source) => sum + source.favorable, 0) / liveSources.length;
    console.log(`Favorability for ${candidateName}: ${favorable.toFixed(1)}% (${liveSources.map(source => source.source).join(", ")})`);
    return {
      value: favorable,
      live: true,
      sources: liveSources
    };
  }

  const fallback = STORED_FAVORABILITY[candidateName] || 40;
  console.log(`Favorability for ${candidateName}: ${fallback.toFixed(1)}% (stored fallback)`);
  return {
    value: fallback,
    live: false,
    sources: [{ source: "Stored fallback estimate", favorable: fallback }]
  };
}

const SETTINGS = {
  simulations: 100000,
  electionDate: "2028-11-07",
  nationalErrorSD: 4.8,
  stateErrorSD: 5.2,
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

const STATE_LONG_TERM_TRENDS = {
  AZ: 0.8, CO: 1.2, GA: 1.4, NC: 0.8, TX: 3.6, VA: 0.7,
  AK: 0.6, KS: 0.4, NE: 0.3, UT: 0.7,
  FL: -3.4, IA: -2.2, OH: -1.8, ME: -0.6, MT: -0.8, MO: -0.9,
  WV: -1.8, WI: -0.3, PA: -0.2, MI: -0.2, MN: -0.4, NV: -0.2,
  NM: -0.3, OR: 0.2, WA: 0.3, IL: -0.2, NY: -0.4, NJ: -0.3
};

const STATE_VOLATILITY = {
  AK: 0.5, AZ: 0.35, FL: 0.35, GA: 0.45, ME: 0.45, MI: 0.3, MN: 0.25,
  NE: 0.4, NV: 0.45, NH: 0.35, NC: 0.35, PA: 0.3, TX: 0.3, WI: 0.35
};

const STATE_TRAITS = {
  AL: ["deep_south", "rural", "evangelical"], AK: ["frontier", "independent"], AZ: ["sunbelt", "suburban", "hispanic"], AR: ["south", "rural", "appalachian"],
  CA: ["west", "coastal", "urban", "college"], CO: ["west", "suburban", "college"], CT: ["northeast", "suburban", "college"], DE: ["northeast", "suburban"],
  FL: ["sunbelt", "suburban", "hispanic"], GA: ["sunbelt", "suburban", "black_belt"], HI: ["west", "minority"], ID: ["west", "rural"],
  IL: ["midwest", "urban", "suburban"], IN: ["midwest", "working_class"], IA: ["midwest", "rural"], KS: ["plains", "suburban", "rural"],
  KY: ["appalachian", "south", "rural", "working_class"], LA: ["deep_south", "black_belt"], ME: ["northeast", "rural", "independent"], MD: ["south", "suburban", "college"],
  MA: ["northeast", "college", "urban"], MI: ["midwest", "working_class", "suburban"], MN: ["midwest", "college", "suburban"], MS: ["deep_south", "black_belt", "rural"],
  MO: ["midwest", "rural", "working_class"], MT: ["west", "rural", "frontier"], NE: ["plains", "rural", "suburban"], NV: ["west", "sunbelt", "working_class"],
  NH: ["northeast", "independent", "suburban"], NJ: ["northeast", "suburban", "college"], NM: ["west", "hispanic"], NY: ["northeast", "urban", "college"],
  NC: ["sunbelt", "suburban", "black_belt"], ND: ["plains", "rural"], OH: ["midwest", "appalachian", "working_class"], OK: ["plains", "evangelical"],
  OR: ["west", "coastal", "college"], PA: ["northeast", "working_class", "suburban"], RI: ["northeast", "urban"], SC: ["deep_south", "black_belt", "suburban"],
  SD: ["plains", "rural"], TN: ["south", "appalachian", "evangelical"], TX: ["sunbelt", "suburban", "hispanic"], UT: ["west", "suburban", "religious"],
  VT: ["northeast", "rural", "college"], VA: ["south", "suburban", "college"], WA: ["west", "coastal", "college"], WV: ["appalachian", "rural", "working_class"],
  WI: ["midwest", "working_class", "rural"], WY: ["west", "rural"], DC: ["urban", "college"]
};

const CANDIDATE_STATE_FIT = {
  newsom: { west: 0.8, coastal: 0.6, urban: 0.35, college: 0.25, rural: -0.55, evangelical: -0.35, deep_south: -0.35 },
  beshear: { appalachian: 1.25, south: 0.8, deep_south: 0.25, rural: 0.65, working_class: 0.55, evangelical: 0.25, suburban: 0.2 },
  shapiro: { northeast: 0.9, suburban: 0.75, college: 0.45, working_class: 0.25, rural: -0.15 },
  buttigieg: { midwest: 0.8, suburban: 0.55, college: 0.45, urban: 0.25, rural: -0.25, evangelical: -0.2 },
  whitmer: { midwest: 1.05, working_class: 0.75, suburban: 0.45, rural: 0.15, college: 0.15 },
  aoc: { urban: 0.95, minority: 0.45, college: 0.35, coastal: 0.25, rural: -0.9, evangelical: -0.65, plains: -0.35 },
  vance: { appalachian: 1.05, midwest: 0.65, working_class: 0.75, rural: 0.35, suburban: -0.4, college: -0.3 },
  rubio: { sunbelt: 0.75, hispanic: 0.75, suburban: 0.25, south: 0.25, coastal: 0.15 },
  desantis: { sunbelt: 0.65, south: 0.55, evangelical: 0.25, suburban: -0.15, college: -0.25 },
  haley: { suburban: 0.75, college: 0.45, south: 0.35, deep_south: 0.25, rural: -0.15, independent: 0.25 },
  cruz: { evangelical: 0.75, plains: 0.45, rural: 0.45, hispanic: 0.2, suburban: -0.45, college: -0.3 }
};

const CANDIDATE_SWING_STATE_EFFECTS = {
  beshear: { AZ: 0.3, GA: 0.5, NC: 0.55, OH: 0.8, PA: 0.35, MI: 0.35, WI: 0.3, KY: 3.0 },
  shapiro: { PA: 2.2, MI: 0.25, WI: 0.25, AZ: 0.2, GA: 0.2, NC: 0.15 },
  whitmer: { MI: 2.2, WI: 0.8, PA: 0.45, OH: 0.35, IA: 0.25, MN: 0.35 },
  buttigieg: { MI: 0.45, WI: 0.35, PA: 0.25, IN: 1.25, AZ: 0.15 },
  newsom: { AZ: 0.25, NV: 0.35, CO: 0.25, OR: 0.2, WA: 0.2, FL: -0.25, OH: -0.25 },
  aoc: { AZ: -0.25, GA: -0.15, NC: -0.3, PA: -0.25, MI: -0.2, WI: -0.25, TX: 0.15, NY: 1.0 },
  vance: { OH: 2.0, PA: -0.45, MI: -0.3, WI: -0.25, WV: 0.8, KY: 0.45 },
  rubio: { FL: 2.1, AZ: -0.35, NV: -0.3, TX: -0.25, GA: -0.15 },
  desantis: { FL: 2.3, GA: -0.25, NC: -0.2, TX: -0.2, AZ: 0.1 },
  haley: { SC: 1.8, NC: -0.35, GA: -0.35, AZ: -0.3, PA: -0.2, VA: -0.25 },
  cruz: { TX: 2.0, AZ: 0.15, NV: 0.15, GA: 0.2, NC: 0.15, PA: 0.25 }
};

const EXPANDED_BATTLEGROUND_STATES = new Set(["AK", "AZ", "FL", "GA", "IA", "ME", "MI", "MN", "NC", "NH", "NV", "OH", "PA", "TX", "VA", "WI"]);

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

function stateElasticity(state) {
  const baseline = PRESIDENTIAL_BASELINES[state];
  const absMargin = Math.abs(baseline.demMargin);
  let elasticity = absMargin < 6 ? 1.08 : absMargin < 12 ? 1.0 : absMargin < 22 ? 0.86 : 0.68;
  if (["AZ", "GA", "NC", "NV", "TX"].includes(state)) elasticity += 0.08;
  if (["AK", "ME", "NH", "WI", "PA", "MI"].includes(state)) elasticity += 0.04;
  if (["DC", "WY", "VT", "OK", "MA", "MD"].includes(state)) elasticity -= 0.12;
  return clamp(elasticity, 0.55, 1.16);
}

function candidateTraitEffect(state, candidate, side) {
  const traits = STATE_TRAITS[state] || [];
  const fit = CANDIDATE_STATE_FIT[candidate.id] || {};
  const swing = CANDIDATE_SWING_STATE_EFFECTS[candidate.id]?.[state] || 0;
  const rawTraitEffect = traits.reduce((sum, trait) => sum + (fit[trait] || 0), 0);
  const baseline = PRESIDENTIAL_BASELINES[state];
  const saturation = Math.abs(baseline.demMargin) > 25 ? 0.55 : Math.abs(baseline.demMargin) > 14 ? 0.75 : 1;
  const effect = clamp((rawTraitEffect + swing) * saturation, -2.2, 2.6);
  return side === "D" ? effect : -effect;
}

function candidateElectabilityEffect(demCandidate, repCandidate) {
  return clamp(((demCandidate.electability || 0.55) - (repCandidate.electability || 0.55)) * 3.2, -0.9, 0.9);
}

function currentCycleStateSignal(state, fundamentals) {
  const senateSignal = fundamentals.senateStateSignals?.[state];
  if (!senateSignal) return 0;
  const baseline = PRESIDENTIAL_BASELINES[state];
  const qualityScale = senateSignal.inputQuality === "High" ? 1 : senateSignal.inputQuality === "Medium" ? 0.72 : 0.45;
  const directionalGap = senateSignal.margin - baseline.demMargin;
  return clamp(directionalGap * 0.09 * qualityScale, -1.15, 1.15);
}

function calculateCandidateModifiers(state, demCandidate, repCandidate) {
  let modifier = 0;
  const baseline = PRESIDENTIAL_BASELINES[state];
  
  // Home-state modifier
  if (demCandidate.homeState === state) modifier += 4.5;
  if (repCandidate.homeState === state) modifier -= 4.5;
  
  // Regional modifier
  if (demCandidate.homeState && REGION_BY_STATE[demCandidate.homeState] === baseline.region) modifier += 0.9;
  if (repCandidate.homeState && REGION_BY_STATE[repCandidate.homeState] === baseline.region) modifier -= 0.9;
  
  // Ideological modifier
  const stateLean = baseline.demMargin;
  const isSwingOrReach = EXPANDED_BATTLEGROUND_STATES.has(state) || Math.abs(stateLean) < 14;
  if (demCandidate.ideology === "progressive" && stateLean < 0) modifier -= isSwingOrReach ? 0.75 : 0.4;
  if (demCandidate.ideology === "moderate" && stateLean < 8) modifier += isSwingOrReach ? 0.45 : 0.2;
  if (repCandidate.ideology === "moderate" && stateLean > -8) modifier -= isSwingOrReach ? 0.45 : 0.2;
  if (repCandidate.ideology === "conservative" && stateLean > 0) modifier += isSwingOrReach ? 0.55 : 0.25;
  
  // Favorability modifier
  const demFavFactor = (demCandidate.favorability - 45) / 100;
  const repFavFactor = (repCandidate.favorability - 45) / 100;
  modifier += clamp((demFavFactor - repFavFactor) * Math.min(Math.abs(stateLean), 18) * 0.24, -0.9, 0.9);
  modifier += candidateElectabilityEffect(demCandidate, repCandidate);
  modifier += candidateTraitEffect(state, demCandidate, "D");
  modifier += candidateTraitEffect(state, repCandidate, "R");
  
  return modifier;
}

function calculateStateMargin(state, demCandidate, repCandidate, fundamentals, pollingData = null) {
  const baseline = PRESIDENTIAL_BASELINES[state];
  const modifiers = calculateCandidateModifiers(state, demCandidate, repCandidate);
  
  const approvalAdjustment = Number.isFinite(fundamentals.approval) ? (45 - fundamentals.approval) * 0.16 : 0;
  const sentiment = Number(fundamentals.consumerSentiment?.value);
  const sentimentAdjustment = Number.isFinite(sentiment) ? clamp((75 - sentiment) * 0.055, -2.2, 2.2) : 0;
  const economyAdjustment = ((4 - (fundamentals.unemployment ?? 4)) * -0.12) + (((fundamentals.gdpGrowth ?? 2) - 2) * -0.08);
  const fundamentalsAdjustment = ((fundamentals.nationalShift || 0) * 0.45) + approvalAdjustment + sentimentAdjustment + economyAdjustment;
  const trendAdjustment = STATE_LONG_TERM_TRENDS[state] || 0;
  const currentCycleAdjustment = currentCycleStateSignal(state, fundamentals);
  
  // Apply polling data if available
  let pollingAdjustment = 0;
  if (pollingData && pollingData.byState && pollingData.byState[state]) {
    const statePolls = pollingData.byState[state];
    if (statePolls.length > 0) {
      // Weight polls by recency (more recent = higher weight)
      const weightTotal = statePolls.reduce((sum, poll) => sum + (poll.weight || 0.95), 0);
      const weightedMargin = statePolls.reduce((sum, poll) => {
        const weight = poll.weight || 0.95;
        return sum + (poll.margin * weight);
      }, 0) / Math.max(weightTotal, 0.1);
      
      // Blend polling with baseline; far-out polls move the race but do not dominate fundamentals.
      const baselineMargin = baseline.demMargin;
      pollingAdjustment = (weightedMargin - baselineMargin) * 0.25;
    }
  } else if (pollingData && pollingData.byState && pollingData.byState["National"]) {
    // Use national polling if state-specific not available
    const nationalPolls = pollingData.byState["National"];
    if (nationalPolls.length > 0) {
      const weightTotal = nationalPolls.reduce((sum, poll) => sum + (poll.weight || 0.95), 0);
      const weightedMargin = nationalPolls.reduce((sum, poll) => {
        const weight = poll.weight || 0.95;
        return sum + (poll.margin * weight);
      }, 0) / Math.max(weightTotal, 0.1);
      
      const baselineMargin = baseline.demMargin;
      pollingAdjustment = (weightedMargin - baselineMargin) * 0.18;
    }
  }
  
  const elasticity = stateElasticity(state);
  
  return baseline.demMargin + trendAdjustment + currentCycleAdjustment + modifiers + (fundamentalsAdjustment * elasticity) + pollingAdjustment;
}

function generateCorrelatedError(stateCount, correlation) {
  const nationalError = randn() * SETTINGS.nationalErrorSD;
  const stateErrors = {};
  const states = Object.keys(PRESIDENTIAL_BASELINES);
  
  for (const state of states) {
    const stateSpecific = randn() * (SETTINGS.stateErrorSD + (STATE_VOLATILITY[state] || 0));
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
    historicalBacktest,
    modelInputs: {
      longTermTrendStates: Object.keys(STATE_LONG_TERM_TRENDS).length,
      stateVolatilityStates: Object.keys(STATE_VOLATILITY).length,
      candidateTraitModel: true,
      expandedBattlegroundStates: [...EXPANDED_BATTLEGROUND_STATES],
      senateStateSignalStates: Object.keys(fundamentals.senateStateSignals || {}).length,
      nationalShift: fundamentals.nationalShift,
      approval: fundamentals.approval,
      consumerSentiment: fundamentals.consumerSentiment,
      gdpGrowth: fundamentals.gdpGrowth,
      unemployment: fundamentals.unemployment
    }
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
  demCandidate.favorability = demFavorability.value;
  repCandidate.favorability = repFavorability.value;
  
  // Fundamentals using fetched data
  const fundamentals = {
    nationalShift: genericBallot, // Generic ballot margin
    approval: presidentialApproval, // Presidential approval
    consumerSentiment: economicIndicators.consumerSentiment,
    gdpGrowth: economicIndicators.gdpGrowth,
    unemployment: economicIndicators.unemployment,
    senateStateSignals: readSenateStateSignals()
  };
  
  const forecast = buildForecast(demCandidate, repCandidate, fundamentals, pollingData);
  const senateGeneric = readSenateGenericPolling();
  forecast.sourceSummary = {
    genericPolling: senateGeneric ? {
      source: "Senate forecast blend",
      genericBallotMargin: senateGeneric.margin,
      genericBallotDem: senateGeneric.dem,
      genericBallotRep: senateGeneric.rep,
      sources: senateGeneric.sources
    } : {
      source: "President generator fallback blend",
      genericBallotMargin: genericBallot
    },
    trumpApproval: {
      approval: presidentialApproval,
      netApproximation: (presidentialApproval * 2) - 100,
      sources: "Senate Pollfinity cache plus live approval pages when reachable"
    },
    consumerSentiment: economicIndicators.consumerSentiment,
    polling: {
      presidentialPolls: pollingData?.polls || 0,
      usablePresidentialPolls: pollingData?.usablePolls || 0,
      sources: pollingData?.sources || []
    },
    candidateFavorability: {
      [demCandidate.id]: demFavorability,
      [repCandidate.id]: repFavorability
    },
    currentCycleSignals: {
      source: "2026 Senate state forecast margins, lightly blended where available",
      states: Object.keys(fundamentals.senateStateSignals || {}).length
    }
  };
  
  writeFileSync(FORECAST_URL, JSON.stringify(forecast, null, 2));
  console.log(`Wrote presidential forecast for ${demCandidate.name} vs ${repCandidate.name}`);
}

main().catch(console.error);

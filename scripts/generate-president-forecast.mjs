import { readFileSync, writeFileSync } from "node:fs";

const FORECAST_URL = new URL("../data/president-forecast.json", import.meta.url);

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
    { id: "kamala", name: "Kamala Harris", homeState: "CA", ideology: "moderate", favorability: 45, electability: 0.7 },
    { id: "gavin", name: "Gavin Newsom", homeState: "CA", ideology: "progressive", favorability: 40, electability: 0.6 },
    { id: "whitmer", name: "Gretchen Whitmer", homeState: "MI", ideology: "moderate", favorability: 42, electability: 0.65 },
    { id: "newsom", name: "Gavin Newsom", homeState: "CA", ideology: "progressive", favorability: 40, electability: 0.6 },
    { id: "shapiro", name: "Josh Shapiro", homeState: "PA", ideology: "moderate", favorability: 41, electability: 0.62 }
  ],
  republican: [
    { id: "trump", name: "Donald Trump", homeState: "FL", ideology: "conservative", favorability: 42, electability: 0.65 },
    { id: "desantis", name: "Ron DeSantis", homeState: "FL", ideology: "conservative", favorability: 38, electability: 0.6 },
    { id: "haley", name: "Nikki Haley", homeState: "SC", ideology: "moderate", favorability: 40, electability: 0.55 },
    { id: "ramaswamy", name: "Vivek Ramaswamy", homeState: "OH", ideology: "conservative", favorability: 35, electability: 0.5 },
    { id: "scott", name: "Tim Scott", homeState: "SC", ideology: "conservative", favorability: 39, electability: 0.58 }
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

function calculateStateMargin(state, demCandidate, repCandidate, fundamentals) {
  const baseline = PRESIDENTIAL_BASELINES[state];
  const modifiers = calculateCandidateModifiers(state, demCandidate, repCandidate);
  
  // Apply fundamentals (generic ballot, approval, economy)
  const fundamentalsAdjustment = fundamentals.nationalShift || 0;
  
  // State elasticity (how much state moves with national)
  const elasticity = 1.0;
  
  return baseline.demMargin + modifiers + (fundamentalsAdjustment * elasticity);
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

function runPresidentialSimulation(demCandidate, repCandidate, fundamentals) {
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
      const baseMargin = calculateStateMargin(state, demCandidate, repCandidate, fundamentals);
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

function buildForecast(demCandidate, repCandidate, fundamentals) {
  const simulation = runPresidentialSimulation(demCandidate, repCandidate, fundamentals);
  
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

function main() {
  // Default candidates (can be overridden via command line args)
  const demCandidateId = process.argv[2] || "kamala";
  const repCandidateId = process.argv[3] || "trump";
  
  const demCandidate = PRESIDENTIAL_CANDIDATES.democratic.find(c => c.id === demCandidateId) || PRESIDENTIAL_CANDIDATES.democratic[0];
  const repCandidate = PRESIDENTIAL_CANDIDATES.republican.find(c => c.id === repCandidateId) || PRESIDENTIAL_CANDIDATES.republican[0];
  
  // Fundamentals (placeholder values - would come from data sources)
  const fundamentals = {
    nationalShift: 0, // Generic ballot margin
    approval: 45, // Presidential approval
    gdpGrowth: 2.0,
    unemployment: 4.0
  };
  
  const forecast = buildForecast(demCandidate, repCandidate, fundamentals);
  
  writeFileSync(FORECAST_URL, JSON.stringify(forecast, null, 2));
  console.log(`Wrote presidential forecast for ${demCandidate.name} vs ${repCandidate.name}`);
}

main();

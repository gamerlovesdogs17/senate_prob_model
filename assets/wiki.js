const SETTINGS = {
  simulations: 40000,
  safeDemSeats: 34,
  demControlThreshold: 51,
  runDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  electionDate: new Date("2026-11-03T12:00:00"),
  updateHour: 6,
  updateMinute: 0,
  updateZone: "America/Chicago"
};

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia"
};

const FIPS_TO_STATE = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY"
};

const REGION_BY_STATE = {
  AL: "South", AR: "South", FL: "South", GA: "South", KY: "South", LA: "South", MS: "South", NC: "South", SC: "South", TN: "South", TX: "South", VA: "South", WV: "South",
  AK: "West", CO: "West", ID: "West", MT: "West", NM: "West", OR: "West", WY: "West",
  IA: "Midwest", IL: "Midwest", MI: "Midwest", MN: "Midwest", OH: "Midwest",
  KS: "Plains", NE: "Plains", OK: "Plains", SD: "Plains",
  DE: "Northeast", MA: "Northeast", ME: "Northeast", NH: "Northeast", NJ: "Northeast", RI: "Northeast"
};

const RATING_TO_MARGIN = {
  "Safe D": 18, "Likely D": 10, "Lean D": 5, "Tilt D": 1.8, "Toss-up": 0,
  "Tilt R": -1.8, "Lean R": -5, "Likely R": -10, "Safe R": -18
};

const RATING_TO_ERROR = {
  "Safe D": 5.2, "Likely D": 6.2, "Lean D": 7.2, "Tilt D": 8.4, "Toss-up": 9.4,
  "Tilt R": 8.4, "Lean R": 7.2, "Likely R": 6.2, "Safe R": 5.2
};

const RATING_BUCKET = {
  "Safe D": "safe-d", "Likely D": "likely-d", "Lean D": "lean-d", "Tilt D": "tilt-d", "Toss-up": "tossup",
  "Tilt R": "tilt-r", "Lean R": "lean-r", "Likely R": "likely-r", "Safe R": "safe-r"
};

const PATH_CENTRALITY = {
  OH: 1.85, TX: 1.65, AK: 1.6, MI: 1.35, GA: 1.25, NC: 1.12, ME: 1.1, NH: 1,
  IA: .75, NE: .72, MT: .68, SC: .55, KS: .45, FL: .25
};

const races = [
  { state: "AL", seat: "Open seat", incumbent: "Tommy Tuberville", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -15, pastSenate: -16, money: -1, candidate: -1, approval: -1, primary: "unresolved", primaryDate: "2026-05-19", nomination: .25, independent: "none", polls: [], note: "The Republican primary matters more than the general-election baseline." },
  { state: "AK", seat: "Dan Sullivan", incumbent: "Dan Sullivan", hold: "R", caucusTarget: "D", rating: "Toss-up", pvi: -8, pastSenate: -12, money: .3, candidate: 1.2, approval: .1, primary: "unresolved", primaryDate: "2026-08-18", nomination: .6, independent: "possible D-aligned independent or coalition-backed challenger", polls: [[-150, 31], [-105, 36], [-62, 42], [-20, 47]], note: "Alaska is modeled as a coalition/independent route, not a normal Democratic-label race." },
  { state: "AR", seat: "Tom Cotton", incumbent: "Tom Cotton", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -18, pastSenate: -24, money: -1, candidate: -1, approval: -1, primary: "resolved", primaryDate: "2026-03-03", nomination: .05, independent: "none", polls: [], note: "A deeply Republican state with no normal Democratic path." },
  { state: "CO", seat: "John Hickenlooper", incumbent: "John Hickenlooper", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 8, pastSenate: 12, money: 1, candidate: 1, approval: .5, primary: "unresolved", primaryDate: "2026-06-30", nomination: .15, independent: "none", polls: [], note: "Colorado starts outside the serious battleground set." },
  { state: "DE", seat: "Chris Coons", incumbent: "Chris Coons", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 14, pastSenate: 16, money: 1, candidate: 1, approval: .6, primary: "unresolved", primaryDate: "2026-09-15", nomination: .12, independent: "none", polls: [], note: "Safe Democratic hold under ordinary conditions." },
  { state: "FL", seat: "Special election", incumbent: "Ashley Moody", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -8, pastSenate: -13, money: -1, candidate: -1, approval: -.4, primary: "unresolved", primaryDate: "2026-08-18", nomination: .3, independent: "none", polls: [], note: "Special election for the remainder of Marco Rubio's term." },
  { state: "GA", seat: "Jon Ossoff", incumbent: "Jon Ossoff", hold: "D", caucusTarget: "D", rating: "Likely D", pvi: 0, pastSenate: 1, money: 1.4, candidate: 1.1, approval: .5, primary: "unresolved", primaryDate: "2026-05-19", nomination: .35, independent: "none", polls: [[-120, 51], [-80, 53], [-35, 55], [-8, 57]], note: "A Democratic hold is central to the majority path; a miss here changes the whole map." },
  { state: "ID", seat: "Jim Risch", incumbent: "Jim Risch", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -19, pastSenate: -25, money: -1, candidate: -1, approval: -.8, primary: "resolved", primaryDate: "2026-05-19", nomination: .1, independent: "independent longshot, no assumed caucus", polls: [], note: "Independent upside is tracked, but no caucus assumption is credited." },
  { state: "IL", seat: "Open seat", incumbent: "Dick Durbin", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 13, pastSenate: 14, money: 1, candidate: .4, approval: .4, primary: "resolved", primaryDate: "2026-03-17", nomination: .2, independent: "none", polls: [], note: "Open seat, but the state floor remains strongly Democratic." },
  { state: "IA", seat: "Open seat", incumbent: "Joni Ernst", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -6, pastSenate: -6, money: 0, candidate: .2, approval: -.2, primary: "unresolved", primaryDate: "2026-06-02", nomination: .55, independent: "none", polls: [[-130, 38], [-83, 41], [-42, 43], [-14, 44]], note: "Open-seat uncertainty keeps Iowa on the long Democratic path." },
  { state: "KS", seat: "Roger Marshall", incumbent: "Roger Marshall", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -10, pastSenate: -11, money: -1, candidate: -.5, approval: -.5, primary: "unresolved", primaryDate: "2026-08-04", nomination: .25, independent: "none", polls: [], note: "Kansas becomes live only in a large wave." },
  { state: "KY", seat: "Open seat", incumbent: "Mitch McConnell", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -16, pastSenate: -18, money: -1, candidate: -1, approval: -.7, primary: "unresolved", primaryDate: "2026-05-19", nomination: .35, independent: "none", polls: [], note: "Open seat, but fundamentals remain heavily Republican." },
  { state: "LA", seat: "Bill Cassidy", incumbent: "Bill Cassidy", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -12, pastSenate: -18, money: -1, candidate: -1, approval: -.8, primary: "unresolved", primaryDate: "2026-05-16", nomination: .25, independent: "none", polls: [], note: "Not enough evidence for a serious control path." },
  { state: "ME", seat: "Susan Collins", incumbent: "Susan Collins", hold: "R", caucusTarget: "D", rating: "Lean D", pvi: 5, pastSenate: 8, money: .7, candidate: .4, approval: .2, primary: "unresolved", primaryDate: "2026-06-09", nomination: .7, independent: "possible independent spoiler risk", polls: [[-140, 46], [-90, 49], [-45, 51], [-12, 54]], note: "Collins' personal brand keeps the race contested, but the state lean has moved against Republicans." },
  { state: "MA", seat: "Ed Markey", incumbent: "Ed Markey", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 16, pastSenate: 20, money: 1, candidate: 1, approval: .7, primary: "unresolved", primaryDate: "2026-09-01", nomination: .1, independent: "none", polls: [], note: "A safe Democratic anchor." },
  { state: "MI", seat: "Open seat", incumbent: "Gary Peters", hold: "D", caucusTarget: "D", rating: "Lean D", pvi: 1, pastSenate: 2, money: .4, candidate: .3, approval: .2, primary: "unresolved", primaryDate: "2026-08-04", nomination: .65, independent: "none", polls: [[-160, 48], [-100, 50], [-52, 52], [-18, 54]], note: "Democrats probably need to hold Michigan before the pickup path matters." },
  { state: "MN", seat: "Open seat", incumbent: "Tina Smith", hold: "D", caucusTarget: "D", rating: "Lean D", pvi: 4, pastSenate: 7, money: .6, candidate: .2, approval: .2, primary: "unresolved", primaryDate: "2026-08-11", nomination: .45, independent: "none", polls: [], note: "Competitive mainly under a poor Democratic national climate." },
  { state: "MS", seat: "Cindy Hyde-Smith", incumbent: "Cindy Hyde-Smith", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -11, pastSenate: -18, money: -1, candidate: -1, approval: -.7, primary: "resolved", primaryDate: "2026-03-10", nomination: .1, independent: "none", polls: [], note: "A high Republican floor unless candidate quality breaks badly." },
  { state: "MT", seat: "Open seat", incumbent: "Steve Daines", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -11, pastSenate: -10, money: .3, candidate: .8, approval: -.2, primary: "resolved", primaryDate: "2026-06-02", nomination: .35, independent: "Seth Bodnar-style independent path, caucus assumption uncertain", polls: [[-120, 33], [-75, 36], [-34, 39]], note: "An independent path is modeled, but caucus uncertainty keeps the seat discounted." },
  { state: "NC", seat: "Open seat", incumbent: "Thom Tillis", hold: "R", caucusTarget: "D", rating: "Likely D", pvi: -2, pastSenate: -1, money: 1.2, candidate: 1.4, approval: .3, primary: "resolved", primaryDate: "2026-03-03", nomination: .2, independent: "none", polls: [[-150, 50], [-92, 53], [-45, 56], [-9, 59]], note: "A core Democratic pickup in most plausible majority paths." },
  { state: "NE", seat: "Special election", incumbent: "Pete Ricketts", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -13, pastSenate: -7, money: .4, candidate: 1.25, approval: -.1, primary: "resolved", primaryDate: "2026-05-12", nomination: .15, independent: "Democratic nominee has said they will withdraw for Dan Osborn", polls: [[-140, 35], [-90, 38], [-40, 42], [-10, 44]], note: "Modeled as a purple independent who counts as Democrat for control if elected." },
  { state: "NH", seat: "Open seat", incumbent: "Jeanne Shaheen", hold: "D", caucusTarget: "D", rating: "Lean D", pvi: 3, pastSenate: 5, money: .4, candidate: .4, approval: .2, primary: "unresolved", primaryDate: "2026-09-08", nomination: .55, independent: "none", polls: [[-90, 50], [-40, 52], [-12, 54]], note: "A necessary Democratic hold in almost every route to a majority." },
  { state: "NJ", seat: "Cory Booker", incumbent: "Cory Booker", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 12, pastSenate: 13, money: 1, candidate: 1, approval: .5, primary: "resolved", primaryDate: "2026-06-02", nomination: .1, independent: "none", polls: [], note: "Not part of a normal majority path." },
  { state: "NM", seat: "Ben Ray Lujan", incumbent: "Ben Ray Lujan", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 10, pastSenate: 12, money: 1, candidate: 1, approval: .4, primary: "resolved", primaryDate: "2026-06-02", nomination: .1, independent: "none", polls: [], note: "Safe Democratic hold." },
  { state: "OH", seat: "Special election", incumbent: "Jon Husted", hold: "R", caucusTarget: "D", rating: "Toss-up", pvi: -7, pastSenate: -1, money: .7, candidate: 1.2, approval: .1, primary: "resolved", primaryDate: "2026-05-05", nomination: .2, independent: "none", polls: [[-160, 42], [-110, 45], [-55, 48], [-15, 51]], note: "The cleanest Democratic pickup after the easier blue-leaning seats." },
  { state: "OK", seat: "Special election", incumbent: "Open", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -20, pastSenate: -30, money: -1, candidate: -1, approval: -.9, primary: "unresolved", primaryDate: "2026-06-16", nomination: .25, independent: "none", polls: [], note: "Special election, but not competitive in the baseline." },
  { state: "OR", seat: "Jeff Merkley", incumbent: "Jeff Merkley", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 10, pastSenate: 15, money: 1, candidate: 1, approval: .5, primary: "resolved", primaryDate: "2026-05-19", nomination: .1, independent: "none", polls: [], note: "High Democratic floor." },
  { state: "RI", seat: "Jack Reed", incumbent: "Jack Reed", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 15, pastSenate: 18, money: 1, candidate: 1, approval: .7, primary: "unresolved", primaryDate: "2026-09-09", nomination: .1, independent: "none", polls: [], note: "A safe Democratic hold in nearly all runs." },
  { state: "SC", seat: "Lindsey Graham", incumbent: "Lindsey Graham", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -8, pastSenate: -10, money: -.4, candidate: -.2, approval: -.4, primary: "unresolved", primaryDate: "2026-06-09", nomination: .5, independent: "none", polls: [], note: "Long-shot Democratic upside, but not a core path." },
  { state: "SD", seat: "Mike Rounds", incumbent: "Mike Rounds", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -16, pastSenate: -20, money: -1, candidate: -1, approval: -.8, primary: "resolved", primaryDate: "2026-06-02", nomination: .1, independent: "independent longshot, caucus not credited", polls: [], note: "Republican lock in the baseline." },
  { state: "TN", seat: "Bill Hagerty", incumbent: "Bill Hagerty", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -14, pastSenate: -16, money: -1, candidate: -1, approval: -.8, primary: "unresolved", primaryDate: "2026-08-06", nomination: .2, independent: "none", polls: [], note: "Tail risk only." },
  { state: "TX", seat: "John Cornyn", incumbent: "John Cornyn", hold: "R", caucusTarget: "D", rating: "Tilt R", pvi: -5, pastSenate: -5, money: .6, candidate: .6, approval: -.2, primary: "runoff", primaryDate: "2026-05-26", nomination: .75, independent: "none", polls: [[-150, 38], [-92, 41], [-48, 44], [-13, 46]], note: "If Ohio flips, Texas or Alaska is the next most realistic majority maker." },
  { state: "VA", seat: "Mark Warner", incumbent: "Mark Warner", hold: "D", caucusTarget: "D", rating: "Likely D", pvi: 6, pastSenate: 9, money: 1, candidate: 1, approval: .5, primary: "unresolved", primaryDate: "2026-08-04", nomination: .2, independent: "none", polls: [], note: "Usually not central unless the environment turns hard red." },
  { state: "WV", seat: "Shelley Moore Capito", incumbent: "Shelley Moore Capito", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -23, pastSenate: -28, money: -1, candidate: -1, approval: -.9, primary: "resolved", primaryDate: "2026-05-12", nomination: .05, independent: "none", polls: [], note: "The least Democratic state on the board." },
  { state: "WY", seat: "Open seat", incumbent: "Cynthia Lummis", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -26, pastSenate: -32, money: -1, candidate: -1, approval: -1, primary: "unresolved", primaryDate: "2026-08-18", nomination: .15, independent: "none", polls: [], note: "Republican floor seat." }
];

const CANDIDATE_STATUS = {
  AR: { dem: "Hallie Shoffner", rep: "Tom Cotton", primarySummary: "Primaries held March 3. Shoffner won the Democratic nomination; Cotton secured the Republican nomination." },
  IL: { dem: "Juliana Stratton", rep: "Don Tracy", primarySummary: "Primaries held March 17. Stratton and Tracy are the general-election nominees." },
  MS: { dem: "Scott Colom", rep: "Cindy Hyde-Smith", primarySummary: "Primaries held March 10. Hyde-Smith defeated a GOP challenger; Colom is the Democratic nominee." },
  NC: { dem: "Roy Cooper", rep: "Michael Whatley", primarySummary: "Primaries held March 3. Cooper and Whatley won their nominations." },
  OH: { dem: "Sherrod Brown", rep: "Jon Husted", primarySummary: "Primaries held May 5. Brown won the Democratic primary; Husted was unopposed for the GOP nomination." },
  TX: { dem: "James Talarico", rep: "John Cornyn / Ken Paxton runoff", primarySummary: "Democratic primary held March 3. Talarico is nominated; Cornyn and Paxton face a May 26 Republican runoff." },
  NE: { dem: "Dan Osborn (independent)", rep: "Pete Ricketts", primarySummary: "Ricketts won the Republican primary. The Democratic primary is over and the Democratic nominee said they will withdraw so Osborn can consolidate the anti-Ricketts vote." },
  WV: { dem: "Rachel Fetty Anderson", rep: "Shelley Moore Capito", primarySummary: "Primaries held May 12. Capito and Anderson are the projected nominees." },
  LA: { dem: "Democratic nominee pending", rep: "Bill Cassidy / Julia Letlow / John Fleming", primarySummary: "Louisiana voted May 16. Final result/runoff handling should be refreshed once certified." },
  DEFAULT: { dem: "Democratic nominee pending", rep: "Republican nominee pending", primarySummary: "Primary not yet resolved or not entered in the manual candidate ledger." }
};

const regionScale = { South: 1, West: .9, Northeast: .78, Midwest: 1, Plains: .9 };

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function random() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function modelDateKey() {
  const now = new Date();
  const central = new Date(now.toLocaleString("en-US", { timeZone: SETTINGS.updateZone }));
  if (central.getHours() < SETTINGS.updateHour || (central.getHours() === SETTINGS.updateHour && central.getMinutes() < SETTINGS.updateMinute)) {
    central.setDate(central.getDate() - 1);
  }
  return central.toISOString().slice(0, 10);
}

const MODEL_DATE_KEY = modelDateKey();
const random = mulberry32(hashString(MODEL_DATE_KEY));

function normalRandom() {
  const u1 = Math.max(random(), Number.EPSILON);
  const u2 = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function oneDecimal(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function daysUntil(dateText) {
  return Math.ceil((new Date(`${dateText}T12:00:00`) - new Date()) / 86400000);
}

function logistic(margin, error) {
  return 1 / (1 + Math.exp(-margin / Math.max(error, .1)));
}

function latestPollMargin(race) {
  if (!race.polls.length) return null;
  const weighted = race.polls.reduce((sum, [days, rawMargin], index) => {
    const margin = Math.abs(rawMargin) > 20 ? (rawMargin - 50) / 2 : rawMargin;
    const recency = Math.exp(days / 105);
    const weight = recency * (1 + index * .12);
    return { value: sum.value + margin * weight, weight: sum.weight + weight };
  }, { value: 0, weight: 0 });
  return weighted.value / weighted.weight;
}

function primaryRisk(race) {
  if (race.primary === "resolved") return 0;
  if (race.primary === "runoff") return 1.15;
  const days = daysUntil(race.primaryDate);
  return clamp(2.1 * race.nomination + Math.max(days, 0) / 220, .35, 2.6);
}

function caucusDiscount(race) {
  if (race.hold === race.caucusTarget) return 0;
  if (race.independent.includes("uncertain")) return -1.1;
  if (race.independent.includes("expected") || race.independent.includes("possible")) return -.45;
  return 0;
}

function baselineMargin(race) {
  const rating = RATING_TO_MARGIN[race.rating] || 0;
  const fundamentals = race.pvi * .24 + race.pastSenate * .20;
  const signals = race.money * .9 + race.candidate * 1.05 + race.approval * .75;
  const pollMargin = latestPollMargin(race);
  const pollBlend = pollMargin === null ? 0 : pollMargin * (race.polls.length >= 3 ? .48 : .34);
  const fundamentalsBlend = pollMargin === null ? 1 : .78;
  const incumbentPenalty = race.seat === "Open seat" || race.seat === "Special election" ? -.25 : (race.hold === "D" ? .45 : -.45);
  return (rating * .48 + fundamentals * fundamentalsBlend + signals + incumbentPenalty + caucusDiscount(race)) + pollBlend;
}

function runModel() {
  const enriched = races.map((race) => {
    const candidates = CANDIDATE_STATUS[race.state] || CANDIDATE_STATUS.DEFAULT;
    const margin = baselineMargin(race);
    const error = (RATING_TO_ERROR[race.rating] || 8) + primaryRisk(race);
    return { ...race, ...candidates, margin, error, demProbability: logistic(margin, error), pollMargin: latestPollMargin(race), primaryRisk: primaryRisk(race) };
  });

  const wins = Object.fromEntries(enriched.map((race) => [race.state, 0]));
  const tipping = Object.fromEntries(enriched.map((race) => [race.state, { dem: 0, rep: 0, any: 0 }]));
  const seatCounts = {};
  let demControl = 0;
  const demSeatsAll = [];

  for (let sim = 0; sim < SETTINGS.simulations; sim += 1) {
    const nationalSwing = normalRandom() * 4.2;
    const turnoutMiss = normalRandom() * 1.4;
    const regionSwings = {};
    let demSeats = SETTINGS.safeDemSeats;
    const results = [];

    for (const race of enriched) {
      const region = race.region || REGION_BY_STATE[race.state] || "National";
      if (!regionSwings[region]) {
        regionSwings[region] = normalRandom() * 2.1 * (regionScale[region] || 1);
      }

      const primaryShock = race.primaryRisk > 0 ? normalRandom() * race.primaryRisk : 0;
      const independentShock = race.independent !== "none" ? normalRandom() * 1.1 : 0;
      const simulatedMargin = race.margin + nationalSwing + turnoutMiss + regionSwings[region] + primaryShock + independentShock + normalRandom() * race.error;
      const demWin = simulatedMargin > 0;
      results.push([race.state, demWin]);
      if (demWin) {
        demSeats += 1;
        wins[race.state] += 1;
      }
    }

    demSeatsAll.push(demSeats);
    seatCounts[demSeats] = (seatCounts[demSeats] || 0) + 1;
    if (demSeats >= SETTINGS.demControlThreshold) demControl += 1;

    for (const [state, demWin] of results) {
      const race = enriched.find((item) => item.state === state);
      const caucusSeat = race.caucusTarget === "D";
      const seatHelpsD = demWin && caucusSeat;
      const seatHurtsD = !demWin && caucusSeat;
      if (seatHelpsD && demSeats >= SETTINGS.demControlThreshold && demSeats - 1 < SETTINGS.demControlThreshold) {
        tipping[state].dem += 1;
        tipping[state].any += 1;
      }
      if (seatHurtsD && demSeats < SETTINGS.demControlThreshold && demSeats + 1 >= SETTINGS.demControlThreshold) {
        tipping[state].rep += 1;
        tipping[state].any += 1;
      }
    }
  }

  const sortedSeats = [...demSeatsAll].sort((a, b) => a - b);

  for (const race of enriched) {
    race.demProbability = wins[race.state] / SETTINGS.simulations;
    race.winnerParty = race.demProbability >= .5 ? "D" : "R";
    race.winnerProbability = Math.max(race.demProbability, 1 - race.demProbability);
    race.competitive = race.winnerProbability < .75;
    race.displayName = `${STATE_NAMES[race.state]} Senate`;
    const exactControl = tipping[race.state].any / SETTINGS.simulations;
    const competitiveness = Math.sqrt(race.demProbability * (1 - race.demProbability)) * 2;
    const centrality = PATH_CENTRALITY[race.state] || (race.hold === "R" ? .28 : .45);
    race.tippingPower = exactControl * competitiveness * centrality;
    race.demTippingPower = tipping[race.state].dem / SETTINGS.simulations;
    race.repTippingPower = tipping[race.state].rep / SETTINGS.simulations;
    race.history = buildHistory(race);
  }

  return {
    races: enriched,
    demControlProbability: demControl / SETTINGS.simulations,
    repControlProbability: 1 - demControl / SETTINGS.simulations,
    medianSeats: sortedSeats[Math.floor(sortedSeats.length / 2)],
    seatCounts
  };
}

function buildHistory(race) {
  const key = `spd-history-${race.state}`;
  const current = { date: MODEL_DATE_KEY, dem: race.demProbability };
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(key) || "[]");
  } catch (error) {
    stored = [];
  }
  const withoutToday = stored.filter((point) => point.date !== current.date);
  const history = [...withoutToday, current].slice(-90);
  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch (error) {
    return [current];
  }
  return history;
}

const model = runModel();

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function getRace(state) {
  return model.races.find((race) => race.state === state);
}

function ratingColor(race) {
  const root = getComputedStyle(document.documentElement);
  const bucket = RATING_BUCKET[race.rating];
  const colors = {
    "safe-d": "--safe-d", "likely-d": "--likely-d", "lean-d": "--lean-d", "tilt-d": "--tilt-d",
    tossup: "--toss", "tilt-r": "--tilt-r", "lean-r": "--lean-r", "likely-r": "--likely-r", "safe-r": "--safe-r"
  };
  return root.getPropertyValue(colors[bucket] || "--toss").trim();
}

function updateSummary() {
  setText("run-date", SETTINGS.runDate);
  setText("sim-count", SETTINGS.simulations.toLocaleString("en-US"));
  setText("watch-count", model.races.filter((race) => race.competitive).length);
  setText("dem-control", oneDecimal(model.demControlProbability));
  setText("rep-control", oneDecimal(model.repControlProbability));
  setText("median-seats", `${model.medianSeats} D`);
  setText("control-headline", model.demControlProbability >= .5 ? "Democrats narrowly favored" : "Republicans narrowly favored");
  setText("odds-phrase", `${Math.round(model.demControlProbability * 100)} in 100`);
  setText("update-time", `Updates daily at ${String(SETTINGS.updateHour).padStart(2, "0")}:${String(SETTINGS.updateMinute).padStart(2, "0")} Central`);

  const demBar = document.getElementById("dem-control-bar");
  const repBar = document.getElementById("rep-control-bar");
  if (demBar && repBar) {
    demBar.style.width = `${model.demControlProbability * 100}%`;
    repBar.style.width = `${model.repControlProbability * 100}%`;
  }
}

function ensureTooltip() {
  let tooltip = document.getElementById("chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "chart-tooltip";
    tooltip.className = "chart-tooltip";
    document.body.append(tooltip);
  }
  return tooltip;
}

function showTooltip(event, html) {
  const tooltip = ensureTooltip();
  tooltip.innerHTML = html;
  tooltip.classList.add("visible");
  const rect = event.currentTarget?.getBoundingClientRect?.();
  const pointerX = event.clientX || (event.touches && event.touches[0]?.clientX);
  const pointerY = event.clientY || (event.touches && event.touches[0]?.clientY);
  const x = pointerX || (rect ? rect.left + rect.width / 2 : window.innerWidth / 2);
  const y = pointerY || (rect ? rect.top + rect.height / 2 : window.innerHeight / 2);
  const tooltipWidth = Math.min(250, window.innerWidth - 24);
  tooltip.style.left = `${Math.max(12, Math.min(x + 12, window.innerWidth - tooltipWidth - 12))}px`;
  tooltip.style.top = `${Math.max(12, Math.min(y + 10, window.innerHeight - 110))}px`;
}

function updateChartReadout(source, html) {
  const panel = source.closest(".chart-panel, .detail-panel, .map-panel");
  if (!panel) return;
  let readout = panel.querySelector(".chart-readout");
  if (!readout) {
    readout = document.createElement("div");
    readout.className = "chart-readout";
    panel.append(readout);
  }
  readout.innerHTML = html;
}

function hideTooltip() {
  const tooltip = document.getElementById("chart-tooltip");
  if (tooltip) tooltip.classList.remove("visible");
}

function bindTooltip(selector, getHtml) {
  document.querySelectorAll(selector).forEach((node) => {
    const handler = (event) => {
      const html = getHtml(node);
      showTooltip(event, html);
      updateChartReadout(node, html);
    };
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
    node.addEventListener("mousemove", handler);
    node.addEventListener("mouseleave", hideTooltip);
    node.addEventListener("blur", hideTooltip);
  });
}

function hoverMarkup(race) {
  if (!race) {
    return `<span class="panel-label">Map detail</span><h3>Hover over a state</h3><p>Muted states do not hold regular 2026 Senate contests.</p>`;
  }
  const winner = race.winnerParty === "D" ? "Democrat" : "Republican";
  return `
    <span class="race-kicker">${race.displayName}</span>
    <div class="state-code">${race.state}</div>
    <h3>${winner} ${pct(race.winnerProbability)}</h3>
    <p>${race.seat}. ${race.note}</p>
    <div class="prob-track" aria-label="${race.state} probability split">
      <span style="width:${race.demProbability * 100}%"></span>
      <span style="width:${(1 - race.demProbability) * 100}%"></span>
    </div>
    <p class="meta">Rating: ${race.rating} / Primary: ${race.primary} / Tipping power: ${oneDecimal(race.tippingPower)}</p>
    <a class="button-link" href="race.html?state=${race.state}">Open race page</a>
  `;
}

function updateHoverCard(race) {
  const card = document.getElementById("map-hover-card");
  if (card) card.innerHTML = hoverMarkup(race);
}

function renderFallbackMap() {
  const container = document.getElementById("senate-map");
  if (!container) return;
  container.innerHTML = `
    <div class="fallback-list">
      ${model.races.map((race) => `<a href="race.html?state=${race.state}" style="background:${ratingColor(race)}">${race.state}</a>`).join("")}
    </div>
    <p class="map-note">State-shape map could not load. Check your internet connection for the D3/us-atlas map files.</p>
  `;
}

async function renderStateMap() {
  const container = document.getElementById("senate-map");
  if (!container) return;
  if (!window.d3 || !window.topojson) {
    renderFallbackMap();
    return;
  }
  try {
    const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
    const features = topojson.feature(us, us.objects.states).features;
    const width = 960;
    const height = 610;
    const projection = d3.geoAlbersUsa().fitSize([width, height], { type: "FeatureCollection", features });
    const path = d3.geoPath(projection);
    container.innerHTML = "";
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "United States map of 2026 Senate race ratings");
    svg.selectAll("path")
      .data(features)
      .join("path")
      .attr("class", (feature) => {
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        return race ? `state-shape ${RATING_BUCKET[race.rating]}` : "state-shape state-muted";
      })
      .attr("d", path)
      .attr("fill", (feature) => {
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        return race ? ratingColor(race) : null;
      })
      .attr("opacity", (feature) => {
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        return race ? clamp(.55 + race.winnerProbability * .45, .72, 1) : null;
      })
      .attr("tabindex", (feature) => getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]) ? 0 : -1)
      .on("mouseenter focus", (event, feature) => updateHoverCard(getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")])))
      .on("click keydown", (event, feature) => {
        if (event.type === "keydown" && event.key !== "Enter") return;
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        if (race) window.location.href = `race.html?state=${race.state}`;
      })
      .append("title")
      .text((feature) => {
        const state = FIPS_TO_STATE[String(feature.id).padStart(2, "0")];
        const race = getRace(state);
        return race ? `${STATE_NAMES[state]}: ${race.rating}, ${race.winnerParty} ${pct(race.winnerProbability)}` : STATE_NAMES[state];
      });
    updateHoverCard([...model.races].sort((a, b) => b.tippingPower - a.tippingPower)[0]);
  } catch (error) {
    renderFallbackMap();
  }
}

function renderLegend() {
  const legend = document.getElementById("map-legend");
  if (!legend) return;
  const ratings = ["Safe D", "Likely D", "Lean D", "Tilt D", "Toss-up", "Tilt R", "Lean R", "Likely R", "Safe R"];
  legend.innerHTML = ratings.map((rating) => `<span><i class="${RATING_BUCKET[rating]}"></i>${rating}</span>`).join("");
}

function renderHistogram() {
  const container = document.getElementById("seat-histogram");
  if (!container) return;
  const counts = model.seatCounts;
  const seats = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const minSeat = Math.max(42, Math.min(...seats));
  const maxSeat = Math.min(57, Math.max(...seats));
  const maxCount = Math.max(...Object.values(counts));
  container.innerHTML = Array.from({ length: maxSeat - minSeat + 1 }, (_, i) => {
    const seat = minSeat + i;
    const value = counts[seat] || 0;
    const height = maxCount ? clamp((value / maxCount) * 215, 4, 215) : 4;
    return `<button class="seat-bin" type="button" data-tip="${seat} Democratic seats<br>${pct(value / SETTINGS.simulations)} of simulations"><i style="height:${height}px"></i><span>${seat}</span></button>`;
  }).join("");
  bindTooltip(".seat-bin", (node) => node.dataset.tip);
}

function renderLeverageChart() {
  const chart = document.getElementById("leverage-chart");
  if (!chart) return;
  const ranked = [...model.races].sort((a, b) => b.tippingPower - a.tippingPower).slice(0, 9);
  const max = Math.max(...ranked.map((race) => race.tippingPower));
  chart.innerHTML = ranked.map((race) => {
    const width = max ? clamp((race.tippingPower / max) * 100, 8, 100) : 8;
    return `<a class="leverage-row" href="race.html?state=${race.state}" data-tip="${race.displayName}<br>${oneDecimal(race.tippingPower)} control tipping power<br>${pct(race.demProbability)} Democrat"><strong>${race.state}</strong><i style="width:${width}%"></i><span>${oneDecimal(race.tippingPower)}</span></a>`;
  }).join("");
  bindTooltip(".leverage-row", (node) => node.dataset.tip);
}

function renderPollChart() {
  const chart = document.getElementById("poll-chart");
  if (!chart) return;
  const rows = [
    ["VoteHub API", .95],
    ["Race polls", .78],
    ["OpenFEC money", .86],
    ["MIT history", .9],
    ["Manual ratings", .68]
  ];
  chart.innerHTML = rows.map(([label, value]) => `<div class="poll-row" data-tip="${label}<br>${Math.round(value * 100)} readiness score"><strong>${label}</strong><i style="width:${value * 100}%"></i><span>${Math.round(value * 100)}</span></div>`).join("");
  bindTooltip(".poll-row", (node) => node.dataset.tip);
}

function renderRaceSelector() {
  const container = document.getElementById("race-selector");
  if (!container) return;
  const activeState = new URLSearchParams(window.location.search).get("state")?.toUpperCase() || "OH";
  const ranked = [...model.races].sort((a, b) => b.tippingPower - a.tippingPower);
  container.innerHTML = ranked.map((race) => `<a class="${race.state === activeState ? "active" : ""}" href="race.html?state=${race.state}">${race.state}</a>`).join("");
}

function renderHistory(race) {
  const chart = document.getElementById("race-history");
  if (!chart) return;
  const points = race.history;
  const width = 720;
  const height = 260;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : 36 + index * ((width - 72) / (points.length - 1));
    const y = height - 34 - point.dem * (height - 68);
    return `${x},${y}`;
  });
  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${race.displayName} probability history">
      <path class="history-grid" d="M36 ${height - 34}H${width - 36}M36 ${height / 2}H${width - 36}M36 34H${width - 36}"></path>
      <text class="history-axis" x="14" y="38">100</text>
      <text class="history-axis" x="18" y="${height / 2 + 4}">50</text>
      <text class="history-axis" x="22" y="${height - 32}">0</text>
      <polyline class="history-line" points="${coords.join(" ")}"></polyline>
      ${points.map((point, index) => {
        const [x, y] = coords[index].split(",");
        return `<g class="history-point" tabindex="0" data-date="${point.date}" data-dem="${pct(point.dem)}" data-rep="${pct(1 - point.dem)}" data-tip="${point.date}<br>D ${pct(point.dem)} / R ${pct(1 - point.dem)}"><circle class="history-dot" cx="${x}" cy="${y}" r="3.5"></circle><circle class="history-hit" cx="${x}" cy="${y}" r="18"></circle><text x="${x}" y="${height - 10}">${point.date.slice(5)}</text></g>`;
      }).join("")}
    </svg>
  `;
  const firstPoint = points[points.length - 1];
  updateChartReadout(chart, `${firstPoint.date}<br>D ${pct(firstPoint.dem)} / R ${pct(1 - firstPoint.dem)}${points.length === 1 ? "<br>History starts today and will grow after daily updates." : ""}`);
  chart.querySelectorAll(".history-point").forEach((node) => {
    const html = `${node.dataset.date}<br>D ${node.dataset.dem} / R ${node.dataset.rep}`;
    node.addEventListener("mouseenter", () => updateChartReadout(node, html));
    node.addEventListener("focus", () => updateChartReadout(node, html));
    node.addEventListener("click", () => updateChartReadout(node, html));
  });
}

function renderPrimaryPanel(race) {
  setText("race-primary", `${race.primary} / ${race.primaryDate}`);
  setText("race-independent", race.independent);
  setText("race-caucus", race.caucusTarget === "D" ? "Counts as Democrat for control if elected" : "Counts as Republican for control");
  setText("race-dem-candidate", race.dem);
  setText("race-rep-candidate", race.rep);
  setText("race-primary-summary", race.primarySummary);
  const demNode = document.getElementById("race-dem-candidate");
  if (demNode && demNode.parentElement) {
    demNode.parentElement.classList.toggle("independent-candidate", race.dem.toLowerCase().includes("independent"));
  }
}

function renderRacePage() {
  const page = document.getElementById("race-detail-page");
  if (!page) return;
  const state = new URLSearchParams(window.location.search).get("state")?.toUpperCase() || "OH";
  const race = getRace(state) || getRace("OH");
  document.title = `${race.displayName} | Senate Probability Desk`;
  setText("race-state", race.state);
  setText("race-name", race.displayName);
  setText("race-incumbent", race.incumbent);
  setText("race-seat", race.seat);
  setText("race-rating", race.rating);
  setText("race-winner", `${race.winnerParty === "D" ? "Democrat" : "Republican"} ${pct(race.winnerProbability)}`);
  setText("race-note", race.note);
  setText("race-dem", pct(race.demProbability));
  setText("race-rep", pct(1 - race.demProbability));
  setText("race-margin", `${race.margin.toFixed(1)} pts D baseline`);
  setText("race-tipping", oneDecimal(race.tippingPower));
  setText("race-polling", race.pollMargin === null ? "No recent public race-poll input" : `${race.pollMargin.toFixed(1)} pts D weighted poll margin`);
  const demTrack = document.getElementById("race-dem-track");
  const repTrack = document.getElementById("race-rep-track");
  if (demTrack && repTrack) {
    demTrack.style.width = `${race.demProbability * 100}%`;
    repTrack.style.width = `${(1 - race.demProbability) * 100}%`;
  }
  renderHistory(race);
  renderPrimaryPanel(race);
}

async function syncPollingStatus() {
  const node = document.getElementById("poll-sync-status");
  if (!node) return;
  try {
    const response = await fetch("https://api.votehub.com/polls?poll_type=generic-ballot&subject=2026");
    const data = await response.json();
    const count = Array.isArray(data.polls) ? data.polls.length : 0;
    node.textContent = `VoteHub generic-ballot API reachable: ${count} poll records available for daily ingestion. Race pages use built-in placeholders until a backend normalizes race-specific polls.`;
  } catch (error) {
    node.textContent = "Live polling API could not be reached from this browser session. The model is using its built-in fallback inputs.";
  }
}

function init() {
  updateSummary();
  renderStateMap();
  renderLegend();
  renderHistogram();
  renderLeverageChart();
  renderPollChart();
  renderRacePage();
  renderRaceSelector();
  syncPollingStatus();
}

init();

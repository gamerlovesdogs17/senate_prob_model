import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FORECAST_URL = new URL("../data/forecast.json", import.meta.url);
const previousForecast = readPreviousForecast();

const SETTINGS = {
  simulations: 40000,
  safeDemSeats: 34,
  demControlThreshold: 51,
  runDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  electionDate: new Date("2026-11-03T12:00:00"),
  updateHour: 6,
  updateMinute: 0,
  updateZone: "America/Chicago",
  dataSources: [
    "Manual ratings and candidate ledger",
    "Public polling adapter when reachable from GitHub Actions",
    "DDHQ generic-ballot polling average",
    "Pollfinity public averages JSON",
    "RealClearPolling latest Senate polls page",
    "270toWin state Senate polling pages",
    "Race to the WH public polling pages when parseable",
    "Electoral-Vote.com downloadable Senate polling archive",
    "OpenFEC candidate finance bulk files",
    "MIT/MEDSL historical Senate returns",
    "Census state population estimates",
    "Historical and fundamentals inputs stored in this generator"
  ]
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

const MODEL_WEIGHTS = {
  racePollsBase: .08,
  racePollsPerWeight: .045,
  racePollsPerPollster: .012,
  racePollsCap: .22,
  fundamentalsWithPolls: .9,
  genericBallot: .12,
  genericBallotCap: .9
};

const PATH_CENTRALITY = {
  OH: 1.85, TX: 1.65, AK: 1.6, MI: 1.35, GA: 1.25, NC: 1.12, ME: 1.1, NH: 1,
  IA: .75, NE: .72, MT: .68, SC: .55, KS: .45, FL: .25
};

const STATE_ELASTICITY = {
  AK: 1.18, AZ: 1.08, GA: 1.12, IA: 1.1, ME: .86, MI: 1.12, MN: .9, MT: 1.04,
  NC: 1.18, NH: .94, OH: 1.22, PA: 1.12, TX: 1.16, VA: .86, WI: 1.12
};

const CANDIDATE_HISTORY = {
  AK: 1.6, // Peltola has a demonstrated crossover vote profile in Alaska.
  GA: .7,
  ME: -1.25, // Collins' historical overperformance is Republican-favorable.
  MI: .25,
  MT: .8,
  NC: 1.25,
  NE: 1.45,
  NH: .35,
  OH: 1.15,
  TX: .25,
  VA: .55
};

const RCV_STATES = {
  AK: { transferMean: 1.0, transferSd: 1.55, exhaustedSd: .75 },
  ME: { transferMean: .55, transferSd: .9, exhaustedSd: .45 }
};

const races = [
  { state: "AL", seat: "Open seat", incumbent: "Tommy Tuberville", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -15, pastSenate: -16, money: -1, candidate: -1, approval: -1, primary: "unresolved", primaryDate: "2026-05-19", nomination: .25, independent: "none", polls: [], note: "The Republican primary matters more than the general-election baseline." },
  { state: "AK", seat: "Dan Sullivan", incumbent: "Dan Sullivan", hold: "R", caucusTarget: "D", rating: "Toss-up", pvi: -8, pastSenate: -12, money: .3, candidate: 1.2, approval: .1, primary: "unresolved", primaryDate: "2026-08-18", nomination: .6, independent: "possible D-aligned independent or coalition-backed challenger", polls: [[-150, 31], [-105, 36], [-62, 42], [-20, 47]], note: "Alaska is modeled as a coalition/independent route, not a normal Democratic-label race." },
  { state: "AR", seat: "Tom Cotton", incumbent: "Tom Cotton", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -18, pastSenate: -24, money: -1, candidate: -1, approval: -1, primary: "resolved", primaryDate: "2026-03-03", nomination: .05, independent: "none", polls: [], note: "A deeply Republican state with no normal Democratic path." },
  { state: "CO", seat: "John Hickenlooper", incumbent: "John Hickenlooper", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 8, pastSenate: 12, money: 1, candidate: 1, approval: .5, primary: "unresolved", primaryDate: "2026-06-30", nomination: .15, independent: "none", polls: [], note: "Colorado starts outside the serious battleground set." },
  { state: "DE", seat: "Chris Coons", incumbent: "Chris Coons", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 14, pastSenate: 16, money: 1, candidate: 1, approval: .6, primary: "unresolved", primaryDate: "2026-09-15", nomination: .12, independent: "none", polls: [], note: "Safe Democratic hold under ordinary conditions." },
  { state: "FL", seat: "Special election", incumbent: "Ashley Moody", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -8, pastSenate: -13, money: -1, candidate: -1, approval: -.4, primary: "unresolved", primaryDate: "2026-08-18", nomination: .3, independent: "none", polls: [], note: "Special election for the remainder of Marco Rubio's term." },
  { state: "GA", seat: "Jon Ossoff", incumbent: "Jon Ossoff", hold: "D", caucusTarget: "D", rating: "Likely D", pvi: 0, pastSenate: 1, money: 1.4, candidate: 1.1, approval: .5, primary: "unresolved", primaryDate: "2026-05-19", nomination: .35, independent: "none", polls: [[-120, 51], [-80, 53], [-35, 55], [-8, 57]], note: "A Democratic hold is central to the majority path; a miss here changes the whole map." },
  { state: "ID", seat: "Jim Risch", incumbent: "Jim Risch", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -19, pastSenate: -25, money: -1, candidate: -1, approval: -.8, primary: "unresolved", primaryDate: "2026-05-19", nomination: .1, independent: "independent longshot, no assumed caucus", polls: [], note: "Independent upside is tracked, but no caucus assumption is credited." },
  { state: "IL", seat: "Open seat", incumbent: "Dick Durbin", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 13, pastSenate: 14, money: 1, candidate: .4, approval: .4, primary: "resolved", primaryDate: "2026-03-17", nomination: .2, independent: "none", polls: [], note: "Open seat, but the state floor remains strongly Democratic." },
  { state: "IA", seat: "Open seat", incumbent: "Joni Ernst", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -6, pastSenate: -6, money: 0, candidate: .2, approval: -.2, primary: "unresolved", primaryDate: "2026-06-02", nomination: .55, independent: "none", polls: [[-130, 38], [-83, 41], [-42, 43], [-14, 44]], note: "Open-seat uncertainty keeps Iowa on the long Democratic path." },
  { state: "KS", seat: "Roger Marshall", incumbent: "Roger Marshall", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -10, pastSenate: -11, money: -1, candidate: -.5, approval: -.5, primary: "unresolved", primaryDate: "2026-08-04", nomination: .25, independent: "none", polls: [], note: "Kansas becomes live only in a large wave." },
  { state: "KY", seat: "Open seat", incumbent: "Mitch McConnell", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -16, pastSenate: -18, money: -1, candidate: -1, approval: -.7, primary: "unresolved", primaryDate: "2026-05-19", nomination: .35, independent: "none", polls: [], note: "Open seat, but fundamentals remain heavily Republican." },
  { state: "LA", seat: "Incumbent eliminated", incumbent: "Bill Cassidy", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -12, pastSenate: -18, money: -1, candidate: -1, approval: -.8, primary: "runoff", primaryDate: "2026-06-27", nomination: .25, independent: "none", polls: [], note: "Not enough evidence for a serious control path." },
  { state: "ME", seat: "Susan Collins", incumbent: "Susan Collins", hold: "R", caucusTarget: "D", rating: "Lean D", pvi: 5, pastSenate: 8, money: .7, candidate: .4, approval: .2, primary: "unresolved", primaryDate: "2026-06-09", nomination: .7, independent: "possible independent spoiler risk", polls: [[-140, 46], [-90, 49], [-45, 51], [-12, 54]], note: "Collins' personal brand keeps the race contested, but the state lean has moved against Republicans." },
  { state: "MA", seat: "Ed Markey", incumbent: "Ed Markey", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 16, pastSenate: 20, money: 1, candidate: 1, approval: .7, primary: "unresolved", primaryDate: "2026-09-01", nomination: .1, independent: "none", polls: [], note: "A safe Democratic anchor." },
  { state: "MI", seat: "Open seat", incumbent: "Gary Peters", hold: "D", caucusTarget: "D", rating: "Lean D", pvi: 1, pastSenate: 2, money: .4, candidate: .3, approval: .2, primary: "unresolved", primaryDate: "2026-08-04", nomination: .65, independent: "none", polls: [[-160, 48], [-100, 50], [-52, 52], [-18, 54]], note: "Democrats probably need to hold Michigan before the pickup path matters." },
  { state: "MN", seat: "Open seat", incumbent: "Tina Smith", hold: "D", caucusTarget: "D", rating: "Lean D", pvi: 4, pastSenate: 7, money: .6, candidate: .2, approval: .2, primary: "unresolved", primaryDate: "2026-08-11", nomination: .45, independent: "none", polls: [], note: "Competitive mainly under a poor Democratic national climate." },
  { state: "MS", seat: "Cindy Hyde-Smith", incumbent: "Cindy Hyde-Smith", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -11, pastSenate: -18, money: -1, candidate: -1, approval: -.7, primary: "resolved", primaryDate: "2026-03-10", nomination: .1, independent: "none", polls: [], note: "A high Republican floor unless candidate quality breaks badly." },
  { state: "MT", seat: "Open seat", incumbent: "Steve Daines", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -11, pastSenate: -10, money: .3, candidate: .8, approval: -.2, primary: "unresolved", primaryDate: "2026-06-02", nomination: .35, independent: "Seth Bodnar-style independent path, caucus assumption uncertain", polls: [[-120, 33], [-75, 36], [-34, 39]], note: "An independent path is modeled, but caucus uncertainty keeps the seat discounted." },
  { state: "NC", seat: "Open seat", incumbent: "Thom Tillis", hold: "R", caucusTarget: "D", rating: "Likely D", pvi: -2, pastSenate: -1, money: 1.2, candidate: 1.4, approval: .3, primary: "resolved", primaryDate: "2026-03-03", nomination: .2, independent: "none", polls: [[-150, 50], [-92, 53], [-45, 56], [-9, 59]], note: "A core Democratic pickup in most plausible majority paths." },
  { state: "NE", seat: "Special election", incumbent: "Pete Ricketts", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -13, pastSenate: -7, money: .4, candidate: 1.25, approval: -.1, primary: "resolved", primaryDate: "2026-05-12", nomination: .15, independent: "Democratic nominee has said they will withdraw for Dan Osborn", polls: [[-140, 35], [-90, 38], [-40, 42], [-10, 44]], note: "Modeled as a purple independent who counts as Democrat for control if elected." },
  { state: "NH", seat: "Open seat", incumbent: "Jeanne Shaheen", hold: "D", caucusTarget: "D", rating: "Lean D", pvi: 3, pastSenate: 5, money: .4, candidate: .4, approval: .2, primary: "unresolved", primaryDate: "2026-09-08", nomination: .55, independent: "none", polls: [[-90, 50], [-40, 52], [-12, 54]], note: "A necessary Democratic hold in almost every route to a majority." },
  { state: "NJ", seat: "Cory Booker", incumbent: "Cory Booker", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 12, pastSenate: 13, money: 1, candidate: 1, approval: .5, primary: "unresolved", primaryDate: "2026-06-02", nomination: .1, independent: "none", polls: [], note: "Not part of a normal majority path." },
  { state: "NM", seat: "Ben Ray Lujan", incumbent: "Ben Ray Lujan", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 10, pastSenate: 12, money: 1, candidate: 1, approval: .4, primary: "unresolved", primaryDate: "2026-06-02", nomination: .1, independent: "none", polls: [], note: "Safe Democratic hold." },
  { state: "OH", seat: "Special election", incumbent: "Jon Husted", hold: "R", caucusTarget: "D", rating: "Toss-up", pvi: -7, pastSenate: -1, money: .7, candidate: 1.2, approval: .1, primary: "resolved", primaryDate: "2026-05-05", nomination: .2, independent: "none", polls: [[-160, 42], [-110, 45], [-55, 48], [-15, 51]], note: "The cleanest Democratic pickup after the easier blue-leaning seats." },
  { state: "OK", seat: "Special election", incumbent: "Open", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -20, pastSenate: -30, money: -1, candidate: -1, approval: -.9, primary: "unresolved", primaryDate: "2026-06-16", nomination: .25, independent: "none", polls: [], note: "Special election, but not competitive in the baseline." },
  { state: "OR", seat: "Jeff Merkley", incumbent: "Jeff Merkley", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 10, pastSenate: 15, money: 1, candidate: 1, approval: .5, primary: "unresolved", primaryDate: "2026-05-19", nomination: .1, independent: "none", polls: [], note: "High Democratic floor." },
  { state: "RI", seat: "Jack Reed", incumbent: "Jack Reed", hold: "D", caucusTarget: "D", rating: "Safe D", pvi: 15, pastSenate: 18, money: 1, candidate: 1, approval: .7, primary: "unresolved", primaryDate: "2026-09-09", nomination: .1, independent: "none", polls: [], note: "A safe Democratic hold in nearly all runs." },
  { state: "SC", seat: "Lindsey Graham", incumbent: "Lindsey Graham", hold: "R", caucusTarget: "D", rating: "Lean R", pvi: -8, pastSenate: -10, money: -.4, candidate: -.2, approval: -.4, primary: "unresolved", primaryDate: "2026-06-09", nomination: .5, independent: "none", polls: [], note: "Long-shot Democratic upside, but not a core path." },
  { state: "SD", seat: "Mike Rounds", incumbent: "Mike Rounds", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -16, pastSenate: -20, money: -1, candidate: -1, approval: -.8, primary: "unresolved", primaryDate: "2026-06-02", nomination: .1, independent: "independent longshot, caucus not credited", polls: [], note: "Republican lock in the baseline." },
  { state: "TN", seat: "Bill Hagerty", incumbent: "Bill Hagerty", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -14, pastSenate: -16, money: -1, candidate: -1, approval: -.8, primary: "unresolved", primaryDate: "2026-08-06", nomination: .2, independent: "none", polls: [], note: "Tail risk only." },
  { state: "TX", seat: "John Cornyn", incumbent: "John Cornyn", hold: "R", caucusTarget: "D", rating: "Tilt R", pvi: -5, pastSenate: -5, money: .6, candidate: .6, approval: -.2, primary: "runoff", primaryDate: "2026-05-26", nomination: .75, independent: "none", polls: [[-150, 38], [-92, 41], [-48, 44], [-13, 46]], note: "If Ohio flips, Texas or Alaska is the next most realistic majority maker." },
  { state: "VA", seat: "Mark Warner", incumbent: "Mark Warner", hold: "D", caucusTarget: "D", rating: "Likely D", pvi: 6, pastSenate: 9, money: 1, candidate: 1, approval: .5, primary: "unresolved", primaryDate: "2026-08-04", nomination: .2, independent: "none", polls: [], note: "Usually not central unless the environment turns hard red." },
  { state: "WV", seat: "Shelley Moore Capito", incumbent: "Shelley Moore Capito", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -23, pastSenate: -28, money: -1, candidate: -1, approval: -.9, primary: "resolved", primaryDate: "2026-05-12", nomination: .05, independent: "none", polls: [], note: "The least Democratic state on the board." },
  { state: "WY", seat: "Open seat", incumbent: "Cynthia Lummis", hold: "R", caucusTarget: "D", rating: "Safe R", pvi: -26, pastSenate: -32, money: -1, candidate: -1, approval: -1, primary: "unresolved", primaryDate: "2026-08-18", nomination: .15, independent: "none", polls: [], note: "Republican floor seat." }
];

const CANDIDATE_STATUS = {
  AK: { dem: "Mary Peltola", rep: "Dan Sullivan", demStatus: "presumptive", repStatus: "presumptive", primarySummary: "Peltola has launched her challenge and is treated as the presumptive Democratic nominee. Sullivan is the Republican incumbent and presumptive GOP nominee." },
  AR: { dem: "Hallie Shoffner", rep: "Tom Cotton", demStatus: "nominee", repStatus: "nominee", primarySummary: "Primaries held March 3. Shoffner won the Democratic nomination; Cotton secured the Republican nomination." },
  IL: { dem: "Juliana Stratton", rep: "Don Tracy", demStatus: "nominee", repStatus: "nominee", primarySummary: "Primaries held March 17. Stratton and Tracy are the general-election nominees." },
  MS: { dem: "Scott Colom", rep: "Cindy Hyde-Smith", demStatus: "nominee", repStatus: "nominee", primarySummary: "Primaries held March 10. Hyde-Smith defeated a GOP challenger; Colom is the Democratic nominee." },
  MT: { dem: "Democrat", rep: "Republican", demStatus: "unresolved", repStatus: "unresolved", extraCandidates: [{ name: "Seth Bodnar", party: "I", caucusTarget: "D", note: "Independent, counts with Democrats for control", probabilityShare: .38 }], primarySummary: "The Democratic primary is unresolved. Seth Bodnar is tracked as an independent option who would count with Democrats for control, but Montana Democrats are not assumed to clear the field for him." },
  NC: { dem: "Roy Cooper", rep: "Michael Whatley", demStatus: "nominee", repStatus: "nominee", primarySummary: "Primaries held March 3. Cooper and Whatley won their nominations." },
  OH: { dem: "Sherrod Brown", rep: "Jon Husted", demStatus: "nominee", repStatus: "nominee", primarySummary: "Primaries held May 5. Brown won the Democratic primary; Husted was unopposed for the GOP nomination." },
  TX: { dem: "James Talarico", rep: "John Cornyn / Ken Paxton runoff", demStatus: "nominee", repStatus: "unresolved", primarySummary: "Democratic primary held March 3. Talarico is nominated; Cornyn and Paxton face a May 26 Republican runoff." },
  NE: { dem: "Dan Osborn", rep: "Pete Ricketts", demStatus: "nominee", repStatus: "nominee", demDisplayParty: "I", primarySummary: "Ricketts won the Republican primary. The Democratic primary is over and the Democratic nominee said they will withdraw so Osborn can consolidate the anti-Ricketts vote." },
  WV: { dem: "Rachel Fetty Anderson", rep: "Shelley Moore Capito", demStatus: "nominee", repStatus: "nominee", primarySummary: "Primaries held May 12. Capito and Anderson are the projected nominees." },
  LA: { dem: "Jamie Davis / Gary Crockett runoff", rep: "Julia Letlow / John Fleming runoff", demStatus: "unresolved", repStatus: "unresolved", primarySummary: "Louisiana voted May 16. Cassidy missed the Republican runoff; Letlow and Fleming advanced. Davis advanced on the Democratic side, with Crockett treated as the second runoff candidate after Albares fell short." },
  DEFAULT: { dem: "Democrat", rep: "Republican", demStatus: "unresolved", repStatus: "unresolved", primarySummary: "Primary not yet resolved or not entered in the manual candidate ledger." }
};

const RCP_CANDIDATE_SIDE = {
  AK: { peltola: "D", sullivan: "R" },
  FL: { nixon: "D", moody: "R" },
  GA: { ossoff: "D", collins: "R", dooley: "R", carter: "R", coyne: "R" },
  IA: { franken: "D", ernst: "R" },
  ME: { mills: "D", platner: "D", collins: "R" },
  MI: { elsayed: "D", "el-sayed": "D", stevens: "D", mcmorrow: "D", rogers: "R" },
  NC: { cooper: "D", whatley: "R" },
  NE: { osborn: "D", ricketts: "R" },
  NH: { pappas: "D", manzur: "D", sullivan: "D", sununu: "R", brown: "R" },
  OH: { brown: "D", husted: "R" },
  RI: { reed: "D", mckay: "R" },
  TX: { talarico: "D", cornyn: "R", paxton: "R" },
  VA: { warner: "D" }
};

function candidateInfo(race) {
  const entered = CANDIDATE_STATUS[race.state];
  if (entered) return entered;
  const info = { ...CANDIDATE_STATUS.DEFAULT };
  const openSeat = race.seat === "Open seat";
  const incumbentName = !openSeat && race.incumbent && !["Open", "Open seat"].includes(race.incumbent) ? race.incumbent : null;
  const settledPrimary = race.primary === "resolved" ? "Primary resolved." : "Primary not yet resolved.";
  if (incumbentName && race.hold === "D") {
    info.dem = incumbentName;
    info.demStatus = "presumptive";
    info.primarySummary = `${settledPrimary} The incumbent is treated as the presumptive Democratic nominee until the candidate ledger is updated.`;
  }
  if (incumbentName && race.hold === "R") {
    info.rep = incumbentName;
    info.repStatus = "presumptive";
    info.primarySummary = `${settledPrimary} The incumbent is treated as the presumptive Republican nominee until the candidate ledger is updated.`;
  }
  return info;
}

function forecastSummary(race) {
  const side = race.winnerParty === "D" ? "Democratic" : "Republican";
  const sidePlural = race.winnerParty === "D" ? "Democrats" : "Republicans";
  const probability = Math.round(race.winnerProbability * 100);
  const margin = race.margin >= 0 ? `D+${race.margin.toFixed(1)} pts` : `R+${Math.abs(race.margin).toFixed(1)} pts`;
  const demLabel = race.demStatus === "unresolved" ? "Democrat" : race.dem;
  const repLabel = race.repStatus === "unresolved" ? "Republican" : race.rep;
  if (race.state === "LA") {
    return `Both parties have runoffs; the Republican incumbent was eliminated before the second round.`;
  }
  if (race.rating === "Toss-up") {
    return `${demLabel} and ${repLabel} start close to even; the current probability margin is ${margin}.`;
  }
  if (race.seat === "Open seat") {
    return `Open-seat race with a ${side} edge in the current forecast.`;
  }
  if (race.seat === "Special election") {
    return `Special election with ${sidePlural} at ${probability}% in the current forecast.`;
  }
  const incumbentParty = race.hold === "D" ? "Democratic" : "Republican";
  return `${race.incumbent} is the ${incumbentParty} incumbent; the current forecast gives ${sidePlural} a ${probability}% chance.`;
}

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(process.env.MODEL_DATE || "")) return process.env.MODEL_DATE;
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

function sourceQualityForPoll(poll) {
  if (Array.isArray(poll)) return .42;
  const source = String(poll.source || "").toLowerCase();
  if (source.includes("realclear")) return .92;
  if (source.includes("270towin")) return .84;
  return .78;
}

function populationWeightForPoll(population) {
  const value = String(population || "").toLowerCase();
  if (value === "lv" || value.includes("likely")) return 1.08;
  if (value === "rv" || value.includes("registered")) return 1;
  if (value === "a" || value.includes("adult")) return .82;
  return .9;
}

function sampleWeightForPoll(sampleSize) {
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) return .82;
  return clamp(Math.sqrt(sampleSize) / 32, .65, 1.45);
}

function pollWeightMetrics(race) {
  if (!race.polls.length) return null;
  const pollsterWeights = {};
  const weighted = race.polls.reduce((sum, poll) => {
    const days = Array.isArray(poll) ? poll[0] : poll.days;
    const rawMargin = Array.isArray(poll) ? poll[1] : poll.margin;
    const margin = Math.abs(rawMargin) > 20 ? (rawMargin - 50) / 2 : rawMargin;
    if (!Number.isFinite(margin)) return sum;
    const age = Math.max(0, -(days || 0));
    const recency = Math.pow(.5, age / 90);
    const providedWeight = Array.isArray(poll) ? 1 : clamp(poll.weight || 1, .35, 1.25);
    const pollster = Array.isArray(poll) ? `manual-${sum.count}` : String(poll.pollster || poll.source || "unknown");
    const repeatWeight = 1 / Math.sqrt(1 + (pollsterWeights[pollster] || 0));
    const quality = sourceQualityForPoll(poll) * populationWeightForPoll(poll.population) * sampleWeightForPoll(poll.sampleSize);
    const weight = recency * providedWeight * quality * repeatWeight;
    pollsterWeights[pollster] = (pollsterWeights[pollster] || 0) + weight;
    return {
      value: sum.value + margin * weight,
      weight: sum.weight + weight,
      count: sum.count + 1
    };
  }, { value: 0, weight: 0, count: 0 });
  if (!weighted.weight) return null;
  const pollsters = Object.keys(pollsterWeights).length;
  const blendWeight = clamp(
    MODEL_WEIGHTS.racePollsBase +
      Math.log1p(weighted.weight) * MODEL_WEIGHTS.racePollsPerWeight +
      pollsters * MODEL_WEIGHTS.racePollsPerPollster,
    MODEL_WEIGHTS.racePollsBase,
    MODEL_WEIGHTS.racePollsCap
  );
  return {
    margin: weighted.value / weighted.weight,
    totalWeight: weighted.weight,
    pollCount: weighted.count,
    pollsters,
    blendWeight
  };
}

function latestPollMargin(race) {
  return pollWeightMetrics(race)?.margin ?? null;
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

function candidateHistoryAdjustment(race) {
  return CANDIDATE_HISTORY[race.state] || 0;
}

function stateElasticity(race) {
  return STATE_ELASTICITY[race.state] || clamp(1 + Math.abs(race.pvi) / 95, .82, 1.24);
}

function primaryScenarioAdjustment(race) {
  const demStatus = race.demStatus || "unresolved";
  const repStatus = race.repStatus || "unresolved";
  let adjustment = 0;
  if (demStatus === "unresolved" && repStatus !== "unresolved") adjustment -= .28;
  if (repStatus === "unresolved" && demStatus !== "unresolved") adjustment += .28;
  if (race.primary === "runoff") adjustment += race.hold === "D" ? -.18 : .18;
  if (demStatus === "presumptive") adjustment += .12;
  if (repStatus === "presumptive") adjustment -= .12;
  return adjustment;
}

function rcvBaselineAdjustment(race) {
  const rcv = RCV_STATES[race.state];
  if (!rcv) return 0;
  const independentContext = race.independent !== "none" ? .35 : 0;
  return rcv.transferMean + independentContext;
}

function baselineMargin(race) {
  const rating = RATING_TO_MARGIN[race.rating] || 0;
  const fundamentals = race.pvi * .24 + race.pastSenate * .20;
  const signals = race.money * .9 + race.candidate * 1.05 + race.approval * .75;
  const pollSignal = pollWeightMetrics(race);
  const pollBlend = pollSignal === null ? 0 : pollSignal.margin * pollSignal.blendWeight;
  const fundamentalsBlend = pollSignal === null ? 1 : MODEL_WEIGHTS.fundamentalsWithPolls;
  const incumbentPenalty = race.seat === "Open seat" || race.seat === "Special election" ? -.25 : (race.hold === "D" ? .45 : -.45);
  const nationalPolling = race.nationalPolling || 0;
  return (rating * .48 + fundamentals * fundamentalsBlend + signals + incumbentPenalty + caucusDiscount(race)) +
    pollBlend + nationalPolling + candidateHistoryAdjustment(race) + primaryScenarioAdjustment(race) + rcvBaselineAdjustment(race);
}

function runModel(sourceData) {
  const adjustedRaces = applySourceInputs(races, sourceData);
  const enriched = adjustedRaces.map((race) => {
    const candidates = candidateInfo(race);
    const withCandidates = { ...race, ...candidates };
    const pollSignal = pollWeightMetrics(withCandidates);
    const margin = baselineMargin(withCandidates);
    const error = (RATING_TO_ERROR[race.rating] || 8) + primaryRisk(race);
    return {
      ...withCandidates,
      margin,
      error,
      demProbability: logistic(margin, error),
      pollMargin: pollSignal?.margin ?? null,
      pollSignal,
      primaryRisk: primaryRisk(race),
      stateElasticity: stateElasticity(race),
      candidateHistoryAdjustment: candidateHistoryAdjustment(race),
      primaryScenarioAdjustment: primaryScenarioAdjustment(withCandidates),
      rcvAdjustment: rcvBaselineAdjustment(race)
    };
  });

  const wins = Object.fromEntries(enriched.map((race) => [race.state, 0]));
  const tipping = Object.fromEntries(enriched.map((race) => [race.state, { dem: 0, rep: 0, any: 0 }]));
  const seatCounts = {};
  let demControl = 0;
  const demSeatsAll = [];

  for (let sim = 0; sim < SETTINGS.simulations; sim += 1) {
    const nationalSwing = normalRandom() * 4.2;
    const nationalPollingError = normalRandom() * 1.7;
    const turnoutMiss = normalRandom() * 1.4;
    const regionSwings = {};
    const regionalPollingErrors = {};
    let demSeats = SETTINGS.safeDemSeats;
    const results = [];

    for (const race of enriched) {
      const region = race.region || REGION_BY_STATE[race.state] || "National";
      if (!regionSwings[region]) {
        regionSwings[region] = normalRandom() * 2.1 * (regionScale[region] || 1);
      }
      if (!regionalPollingErrors[region]) {
        regionalPollingErrors[region] = nationalPollingError * .45 + normalRandom() * 1.35 * (regionScale[region] || 1);
      }

      const primaryShock = race.primaryRisk > 0 ? normalRandom() * race.primaryRisk : 0;
      const independentShock = race.independent !== "none" ? normalRandom() * 1.1 : 0;
      const rcv = RCV_STATES[race.state];
      const rcvShock = rcv ? normalRandom() * rcv.transferSd + normalRandom() * rcv.exhaustedSd : 0;
      const elasticNationalSwing = nationalSwing * race.stateElasticity;
      const simulatedMargin = race.margin + elasticNationalSwing + turnoutMiss + regionSwings[region] + regionalPollingErrors[region] + primaryShock + independentShock + rcvShock + normalRandom() * race.error;
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
    race.summary = forecastSummary(race);
    race.note = race.summary;
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
  const current = { date: MODEL_DATE_KEY, dem: race.demProbability };
  const previousRace = previousForecast?.races?.find((item) => item.state === race.state);
  const stored = Array.isArray(previousRace?.history) ? previousRace.history : [];
  const withoutToday = stored.filter((point) => point.date !== current.date && point.date <= MODEL_DATE_KEY);
  return [...withoutToday, current].sort((a, b) => a.date.localeCompare(b.date)).slice(-180);
}

function readPreviousForecast() {
  try {
    return JSON.parse(readFileSync(FORECAST_URL, "utf8"));
  } catch (error) {
    return null;
  }
}

async function fetchText(url, label, status, options = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);

  try {
    const response = await fetch(url, {
      headers: options.headers || {},
      signal: controller.signal
    });
    const text = await response.text();
    status[label] = {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      url
    };
    if (!response.ok) {
      status[label].error = text.slice(0, 180);
    }
    return response.ok ? text : null;
  } catch (error) {
    status[label] = {
      ok: false,
      status: "fetch-error",
      ms: Date.now() - startedAt,
      url,
      error: error.message
    };
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted && char === "\"" && next === "\"") {
      cell += "\"";
      i += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function toNumber(value) {
  const number = Number(String(value ?? "").replace(/[$,]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function rowNumber(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== "") return toNumber(row[name]);
  }
  return 0;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToLines(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<(?:br|p|div|li|tr|td|th|h[1-6]|span|a)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function stateFromRaceTitle(title) {
  const normalized = String(title || "").toLowerCase();
  for (const [state, name] of Object.entries(STATE_NAMES)) {
    if (normalized.includes(`${name.toLowerCase()} senate`)) return state;
  }
  return null;
}

function pollDateFromLines(lines, startIndex) {
  const datePattern = /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([A-Z][a-z]+)\s+(\d{1,2})$/;
  for (let offset = 0; offset <= 14; offset += 1) {
    for (const index of [startIndex - offset, startIndex + offset]) {
      const match = lines[index]?.match(datePattern);
      if (match) {
        const parsed = new Date(`${match[1]} ${match[2]}, 2026 12:00:00`);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      }
    }
  }
  return MODEL_DATE_KEY;
}

function normalizeCandidateKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateTokensForRace(race, party) {
  const text = party === "D" ? race.dem : race.rep;
  return String(text || "")
    .split(/\s*\/\s*|\s+or\s+|\s+and\s+/i)
    .map(normalizeCandidateKey)
    .flatMap((name) => {
      const parts = name.split(" ").filter(Boolean);
      return [name, parts[parts.length - 1]].filter(Boolean);
    });
}

function sideForRcpCandidate(race, candidate) {
  const key = normalizeCandidateKey(candidate);
  const last = key.split(" ").filter(Boolean).at(-1) || key;
  const overrides = RCP_CANDIDATE_SIDE[race.state] || {};
  if (overrides[key]) return overrides[key];
  if (overrides[last]) return overrides[last];
  if (candidateTokensForRace(race, "D").includes(key) || candidateTokensForRace(race, "D").includes(last)) return "D";
  if (candidateTokensForRace(race, "R").includes(key) || candidateTokensForRace(race, "R").includes(last)) return "R";
  return null;
}

function parseRcpSpread(spread) {
  const clean = String(spread || "").replace(/\*\*/g, "").trim();
  if (/^tie$/i.test(clean)) return { candidate: "Tie", margin: 0 };
  const match = clean.match(/^(.+?)\s+\+([0-9]+(?:\.[0-9]+)?)$/);
  if (!match) return null;
  return { candidate: match[1].trim(), margin: Number(match[2]) };
}

async function fetchRealClearPolling(status) {
  const url = "https://www.realclearpolling.com/latest-polls/senate";
  const text = await fetchText(url, "realClearPollingSenate", status, {
    headers: { accept: "text/html", "user-agent": "CapitolForecastBot/1.0 (+https://github.com/)" }
  });
  const byState = {};
  if (!text) return { byState, polls: 0, usablePolls: 0 };
  const lines = htmlToLines(text);
  const baseWithCandidates = races.map((race) => ({ ...race, ...candidateInfo(race) }));
  const byStateRace = Object.fromEntries(baseWithCandidates.map((race) => [race.state, race]));
  let polls = 0;
  let usablePolls = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const title = lines[index];
    if (!/^2026\b/i.test(title) || !/senate/i.test(title)) continue;
    polls += 1;
    if (/primary|runoff/i.test(title)) continue;
    const state = stateFromRaceTitle(title);
    const race = byStateRace[state];
    if (!race) continue;
    const spreadIndex = lines.findIndex((line, candidateIndex) => candidateIndex > index && candidateIndex < index + 14 && line === "Spread");
    const resultIndex = lines.findIndex((line, candidateIndex) => candidateIndex > index && candidateIndex < index + 12 && line === "Results");
    if (spreadIndex === -1 || !lines[spreadIndex + 1]) continue;
    const parsed = parseRcpSpread(lines[spreadIndex + 1]);
    if (!parsed) continue;
    const side = parsed.margin === 0 ? "D" : sideForRcpCandidate(race, parsed.candidate);
    if (!side) continue;
    const date = pollDateFromLines(lines, index);
    const days = Math.min(0, Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${MODEL_DATE_KEY}T12:00:00Z`)) / 86400000));
    const pollster = lines[index + 2] && lines[index + 1] === "Poll" ? lines[index + 2].replace(/\*\*/g, "") : "RealClearPolling";
    const margin = parsed.margin === 0 ? 0 : (side === "D" ? parsed.margin : -parsed.margin);
    byState[state] ||= [];
    byState[state].push({
      days,
      margin,
      source: "RealClearPolling",
      pollster,
      endDate: date,
      title,
      result: resultIndex !== -1 ? lines[resultIndex + 1] : "",
      spread: lines[spreadIndex + 1],
      weight: .95
    });
    usablePolls += 1;
  }

  status.realClearPollingSenate.rows = polls;
  status.realClearPollingSenate.usablePolls = usablePolls;
  status.realClearPollingSenate.states = Object.keys(byState).length;
  return { byState, polls, usablePolls };
}

function stateSlug(state) {
  return STATE_NAMES[state].toLowerCase().replace(/\s+/g, "-");
}

function parseSample(sampleText) {
  const text = decodeHtml(sampleText);
  const sampleSize = toNumber(text.match(/([\d,]+)/)?.[1]);
  const population = /\bLV\b/i.test(text) ? "lv" : /\bRV\b/i.test(text) ? "rv" : "a";
  return { sampleSize, population };
}

function parseTwoSeventyToWinStatePolls(state, html) {
  const race = { ...races.find((item) => item.state === state), ...candidateInfo(races.find((item) => item.state === state) || {}) };
  if (!race.state) return [];
  const geStart = html.search(/<div id="GE"[\s\S]*?<h2[^>]*>[\s\S]*?General Election/i);
  if (geStart === -1) return [];
  const nextSubtype = html.slice(geStart + 1).search(/<div id="[A-Z_]+" class="polls-subtype-wrapper/i);
  const geHtml = nextSubtype === -1 ? html.slice(geStart) : html.slice(geStart, geStart + 1 + nextSubtype);
  const blocks = geHtml.split(/<h4[^>]*>/i).slice(1);
  const polls = [];

  for (const block of blocks) {
    const title = decodeHtml((block.match(/([\s\S]*?)<\/h4>/i)?.[1] || "")).replace(/\s+/g, " ").trim();
    if (!title || !/vs\./i.test(title)) continue;
    const tableHtml = block.match(/<table id="polls"[\s\S]*?<\/table>/i)?.[0];
    if (!tableHtml) continue;
    const headers = [...tableHtml.matchAll(/<th candidate_id="([^"]+)" class="can_name[^"]*"[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((match) => ({
        id: match[1],
        name: decodeHtml(match[2]).replace(/\*/g, "").replace(/\s+/g, " ").trim()
      }))
      .filter((header) => header.name);
    const demHeader = headers.find((header) => sideForRcpCandidate(race, header.name) === "D");
    const repHeader = headers.find((header) => sideForRcpCandidate(race, header.name) === "R");
    if (!demHeader || !repHeader) continue;

    for (const rowMatch of tableHtml.matchAll(/<tr poll_id="([^"]+)" class="poll_row([^"]*)"[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const inAverage = /in_average_calculation/.test(rowMatch[2]);
      const row = rowMatch[3];
      const pollster = decodeHtml(row.match(/<td class="poll_src">([\s\S]*?)<\/td>/i)?.[1] || "")
        .replace(/\s+/g, " ")
        .trim();
      const endDateRaw = decodeHtml(row.match(/<td class="poll_date[^"]*">([\s\S]*?)<\/td>/i)?.[1] || "").trim();
      const sampleRaw = row.match(/<td class="poll_sample[^"]*">([\s\S]*?)<\/td>/i)?.[1] || "";
      const { sampleSize, population } = parseSample(sampleRaw);
      const values = Object.fromEntries([...row.matchAll(/<td candidate_id="([^"]+)" class="poll_data[\s\S]*?>([\s\S]*?)<\/td>/gi)]
        .map((match) => [match[1], toNumber(decodeHtml(match[2]).replace(/%/g, ""))]));
      const dem = values[demHeader.id];
      const rep = values[repHeader.id];
      const parsedDate = new Date(`${endDateRaw} 12:00:00`);
      if (!Number.isFinite(dem) || !Number.isFinite(rep) || Number.isNaN(parsedDate.getTime())) continue;
      const endDate = parsedDate.toISOString().slice(0, 10);
      const days = Math.min(0, Math.round((new Date(`${endDate}T12:00:00Z`) - new Date(`${MODEL_DATE_KEY}T12:00:00Z`)) / 86400000));
      polls.push({
        days,
        margin: dem - rep,
        source: "270toWin",
        pollster: pollster || "270toWin",
        endDate,
        title: `${STATE_NAMES[state]} Senate - ${title}`,
        result: `${demHeader.name} ${dem} / ${repHeader.name} ${rep}`,
        spread: dem >= rep ? `${demHeader.name} +${(dem - rep).toFixed(1)}` : `${repHeader.name} +${(rep - dem).toFixed(1)}`,
        sampleSize,
        population,
        weight: inAverage ? 1.06 : .72
      });
    }
  }
  return polls;
}

async function fetchTwoSeventyToWinRacePolls(status) {
  const byState = {};
  const sourceStates = [...new Set(races.map((race) => race.state))];
  const startedAt = Date.now();
  let pages = 0;
  let okPages = 0;
  let usablePolls = 0;

  await Promise.all(sourceStates.map(async (state) => {
    pages += 1;
    const url = `https://www.270towin.com/2026-senate-polls/${stateSlug(state)}`;
    const text = await fetchText(url, `twoSeventyToWinPolls${state}`, status, { timeoutMs: 15000 });
    if (!text) return;
    okPages += 1;
    const polls = parseTwoSeventyToWinStatePolls(state, text);
    if (polls.length) {
      byState[state] = polls;
      usablePolls += polls.length;
    }
  }));

  status.twoSeventyToWinRacePolls = {
    ok: okPages > 0,
    status: okPages > 0 ? 200 : "no-pages",
    ms: Date.now() - startedAt,
    url: "https://www.270towin.com/2026-senate-polls/{state}",
    pages,
    okPages,
    usablePolls,
    states: Object.keys(byState).length
  };
  return { byState, pages, okPages, usablePolls };
}

async function fetchVoteHub(status) {
  const text = await fetchText("https://api.votehub.com/polls?poll_type=generic-ballot&subject=2026", "votehubGenericBallot", status, {
    headers: { accept: "application/json" }
  });
  if (!text) return { genericBallotPolls: 0, usableGenericBallotPolls: 0, genericBallotMargin: null };
  try {
    const data = JSON.parse(text);
    const polls = Array.isArray(data) ? data : Array.isArray(data.polls) ? data.polls : [];
    const rawUsablePolls = polls.map((poll) => {
      const demAnswer = poll.answers?.find((answer) => /^dem/i.test(answer.choice || ""));
      const repAnswer = poll.answers?.find((answer) => /^rep/i.test(answer.choice || ""));
      const dem = toNumber(poll.democrat ?? poll.dem ?? poll.democratic ?? poll.dem_share ?? demAnswer?.pct);
      const rep = toNumber(poll.republican ?? poll.rep ?? poll.gop ?? poll.rep_share ?? repAnswer?.pct);
      return {
        id: poll.id,
        pollster: poll.pollster,
        endDate: poll.end_date,
        sampleSize: toNumber(poll.sample_size),
        population: poll.population,
        internal: Boolean(poll.internal),
        partisan: poll.partisan,
        sponsors: Array.isArray(poll.sponsors) ? poll.sponsors : [],
        dem,
        rep,
        margin: dem - rep
      };
    }).filter((poll) => Number.isFinite(poll.margin) && (poll.dem || poll.rep) && poll.endDate);
    const usablePolls = collapseSamePollsterDay(rawUsablePolls);
    const modelDate = new Date(`${MODEL_DATE_KEY}T12:00:00Z`);
    let weightSum = 0;
    let weightedMargin = 0;
    let weightedDem = 0;
    let weightedRep = 0;
    const pollsterTotals = {};
    for (const poll of usablePolls) {
      const age = Math.max(0, (modelDate - new Date(`${poll.endDate}T12:00:00Z`)) / 86400000);
      const populationWeight = poll.population === "lv" ? 1.1 : poll.population === "rv" ? 1 : .85;
      const sampleWeight = clamp(Math.sqrt(poll.sampleSize || 800) / 30, .55, 2.1);
      const recencyWeight = Math.pow(.5, age / 45);
      const internalWeight = poll.internal ? .65 : 1;
      const partisanWeight = poll.partisan ? .78 : 1;
      const repeatWeight = 1 / Math.sqrt(1 + (pollsterTotals[poll.pollster] || 0));
      const weight = populationWeight * sampleWeight * recencyWeight * internalWeight * partisanWeight * repeatWeight;
      poll.weight = weight;
      poll.ageDays = age;
      pollsterTotals[poll.pollster] = (pollsterTotals[poll.pollster] || 0) + weight;
      weightSum += weight;
      weightedMargin += poll.margin * weight;
      weightedDem += poll.dem * weight;
      weightedRep += poll.rep * weight;
    }
    const recent = [...usablePolls]
      .sort((a, b) => new Date(b.endDate) - new Date(a.endDate))
      .slice(0, 8)
      .map(({ id, pollster, endDate, sampleSize, population, dem, rep, margin, weight }) => ({
        id, pollster, endDate, sampleSize, population, dem, rep, margin, weight: Number(weight.toFixed(4))
      }));
    status.votehubGenericBallot.rows = polls.length;
    status.votehubGenericBallot.usablePolls = usablePolls.length;
    status.votehubGenericBallot.rawUsablePolls = rawUsablePolls.length;
    return {
      genericBallotPolls: polls.length,
      usableGenericBallotPolls: usablePolls.length,
      rawUsableGenericBallotPolls: rawUsablePolls.length,
      genericBallotMargin: weightSum ? weightedMargin / weightSum : null,
      genericBallotDem: weightSum ? weightedDem / weightSum : null,
      genericBallotRep: weightSum ? weightedRep / weightSum : null,
      totalWeight: weightSum,
      weighting: {
        recencyHalfLifeDays: 45,
        sample: "sqrt(sample_size), capped 0.55x to 2.10x",
        population: { lv: 1.1, rv: 1, adultOrOther: .85 },
        internalPoll: .65,
        partisanPoll: .78,
        repeatedPollster: "1 / sqrt(1 + prior weighted pollster weight)"
      },
      recent
    };
  } catch (error) {
    status.votehubGenericBallot.parseError = error.message;
    return { genericBallotPolls: 0, usableGenericBallotPolls: 0, genericBallotMargin: null };
  }
}

async function fetchDdhqGenericBallot(status) {
  const url = "https://polls.decisiondeskhq.com/averages/generic-ballot/national/lv-rv-adults";
  const text = await fetchText(url, "ddhqGenericBallot", status, { timeoutMs: 15000 });
  if (!text) return { genericBallotMargin: null, polls: 0 };
  if (/Vercel Security Checkpoint/i.test(text)) {
    status.ddhqGenericBallot.ok = false;
    status.ddhqGenericBallot.status = "security-checkpoint";
    status.ddhqGenericBallot.error = "Vercel security checkpoint returned instead of polling data.";
    return { genericBallotMargin: null, polls: 0 };
  }
  const flat = decodeHtml(text).replace(/\s+/g, " ");
  const dem = Number(flat.match(/Democrat\s+([0-9]+(?:\.[0-9]+)?)%/i)?.[1]);
  const rep = Number(flat.match(/Republican\s+([0-9]+(?:\.[0-9]+)?)%/i)?.[1]);
  const polls = Number(flat.match(/([0-9,]+)\s+polls included in this average/i)?.[1]?.replace(/,/g, ""));
  const result = Number.isFinite(dem) && Number.isFinite(rep)
    ? { genericBallotMargin: dem - rep, genericBallotDem: dem, genericBallotRep: rep, polls: Number.isFinite(polls) ? polls : 0 }
    : { genericBallotMargin: null, polls: 0 };
  status.ddhqGenericBallot.polls = result.polls;
  status.ddhqGenericBallot.margin = result.genericBallotMargin;
  return result;
}

async function fetchPollfinityAverages(status) {
  const url = "https://pollfinity.com/averages.json";
  const text = await fetchText(url, "pollfinityAverages", status, {
    headers: { accept: "application/json" },
    timeoutMs: 15000
  });
  if (!text) return { genericBallotMargin: null, approvalNet: null };
  try {
    const data = JSON.parse(text);
    const generic = data.tracks?.generic_ballot?.current;
    const approval = data.tracks?.trump_approval?.current;
    const dem = Number(generic?.democrat ?? generic?.dem ?? generic?.democratic);
    const rep = Number(generic?.republican ?? generic?.rep ?? generic?.gop);
    const margin = Number(generic?.dem_lead);
    const genericBallotMargin = Number.isFinite(margin) ? margin : Number.isFinite(dem) && Number.isFinite(rep) ? dem - rep : null;
    const approvalNet = Number.isFinite(Number(approval?.net))
      ? Number(approval.net)
      : Number.isFinite(Number(approval?.approve)) && Number.isFinite(Number(approval?.disapprove))
        ? Number(approval.approve) - Number(approval.disapprove)
        : null;
    const result = {
      generatedAt: data.generated_at,
      genericBallotMargin,
      genericBallotDem: Number.isFinite(dem) ? dem : null,
      genericBallotRep: Number.isFinite(rep) ? rep : null,
      genericBallotPolls: Number(data.tracks?.generic_ballot?.polls_in_average || 0),
      approvalNet,
      approvalPolls: Number(data.tracks?.trump_approval?.polls_in_average || 0)
    };
    status.pollfinityAverages.genericBallotPolls = result.genericBallotPolls;
    status.pollfinityAverages.genericBallotMargin = result.genericBallotMargin;
    status.pollfinityAverages.approvalPolls = result.approvalPolls;
    status.pollfinityAverages.approvalNet = result.approvalNet;
    return result;
  } catch (error) {
    status.pollfinityAverages.parseError = error.message;
    return { genericBallotMargin: null, approvalNet: null };
  }
}

async function fetchUsPollingDataGeneric(status) {
  const url = "https://uspollingdata.com/polls/generic-ballot/";
  const text = await fetchText(url, "usPollingDataGenericBallot", status, { timeoutMs: 15000 });
  if (!text) return { genericBallotMargin: null };
  const flat = decodeHtml(text).replace(/\s+/g, " ");
  const match = flat.match(/Democrats lead Republicans \+?([0-9]+(?:\.[0-9]+)?) points \(([0-9]+(?:\.[0-9]+)?)% vs ([0-9]+(?:\.[0-9]+)?)%\)/i)
    || flat.match(/Democrats lead D\+([0-9]+(?:\.[0-9]+)).*?Democrats\s+([0-9]+(?:\.[0-9]+)?)%.*?Republicans\s+([0-9]+(?:\.[0-9]+)?)%/i);
  const genericBallotMargin = match ? Number(match[1]) : null;
  const genericBallotDem = match ? Number(match[2]) : null;
  const genericBallotRep = match ? Number(match[3]) : null;
  status.usPollingDataGenericBallot.margin = genericBallotMargin;
  return { genericBallotMargin, genericBallotDem, genericBallotRep };
}

function collapseSamePollsterDay(polls) {
  const groups = new Map();
  for (const poll of polls) {
    const key = `${poll.pollster || "unknown"}|${poll.endDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(poll);
  }
  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    const ranked = [...group].sort((a, b) => populationRank(b.population) - populationRank(a.population) || b.sampleSize - a.sampleSize);
    const bestRank = populationRank(ranked[0].population);
    const selected = ranked.filter((poll) => populationRank(poll.population) === bestRank);
    const sampleTotal = selected.reduce((sum, poll) => sum + (poll.sampleSize || 800), 0);
    return selected.reduce((merged, poll) => {
      const weight = (poll.sampleSize || 800) / sampleTotal;
      merged.dem += poll.dem * weight;
      merged.rep += poll.rep * weight;
      merged.margin += poll.margin * weight;
      merged.sampleSize += poll.sampleSize || 0;
      return merged;
    }, {
      id: selected.map((poll) => poll.id).filter(Boolean).join("+"),
      pollster: selected[0].pollster,
      endDate: selected[0].endDate,
      sampleSize: 0,
      population: selected[0].population,
      internal: selected.some((poll) => poll.internal),
      partisan: selected.find((poll) => poll.partisan)?.partisan || null,
      sponsors: [...new Set(selected.flatMap((poll) => poll.sponsors))],
      dem: 0,
      rep: 0,
      margin: 0
    });
  });
}

function populationRank(population) {
  if (population === "lv") return 3;
  if (population === "rv") return 2;
  return 1;
}

async function fetchFec(status) {
  const text = await fetchText("https://www.fec.gov/files/bulk-downloads/2026/candidate_summary_2026.csv", "openFecCandidateSummary", status);
  const byState = {};
  if (!text) return byState;
  const rows = parseCsv(text);
  for (const row of rows) {
    if (row.Cand_Office !== "S") continue;
    const state = row.Cand_Office_St;
    if (!STATE_NAMES[state]) continue;
    const party = String(row.Cand_Party_Affiliation || "").toUpperCase();
    const side = party.startsWith("DEM") ? "dem" : party.startsWith("REP") ? "rep" : "other";
    byState[state] ||= {
      demReceipts: 0, repReceipts: 0, otherReceipts: 0,
      demDisbursements: 0, repDisbursements: 0,
      demCash: 0, repCash: 0,
      demDebts: 0, repDebts: 0,
      demIndividual: 0, repIndividual: 0,
      candidates: 0, coverageEndDate: ""
    };
    byState[state].candidates += 1;
    byState[state].coverageEndDate = row.Coverage_End_Date || byState[state].coverageEndDate;
    const receipts = toNumber(row.Total_Receipt);
    const disbursements = rowNumber(row, ["Total_Disbursement", "Total_Disbursements", "Total_Disb"]);
    const cash = rowNumber(row, ["Cash_On_Hand_COP", "Cash_On_Hand", "COH_COP"]);
    const debts = rowNumber(row, ["Debts_Owed_By_Committee", "Debts_Owed", "Debt_Owed_By_Committee"]);
    const individual = rowNumber(row, ["Individual_Contribution", "Individual_Contributions", "Contrib_Indiv"]);
    if (side === "dem") {
      byState[state].demReceipts += receipts;
      byState[state].demDisbursements += disbursements;
      byState[state].demCash += cash;
      byState[state].demDebts += debts;
      byState[state].demIndividual += individual;
    } else if (side === "rep") {
      byState[state].repReceipts += receipts;
      byState[state].repDisbursements += disbursements;
      byState[state].repCash += cash;
      byState[state].repDebts += debts;
      byState[state].repIndividual += individual;
    }
    else byState[state].otherReceipts += receipts;
  }
  status.openFecCandidateSummary.rows = rows.length;
  status.openFecCandidateSummary.senateStates = Object.keys(byState).length;
  return byState;
}

async function fetchMitSenate(status) {
  const text = await fetchText("https://raw.githubusercontent.com/MEDSL/constituency-returns/master/1976-2018-senate.csv", "mitSenateReturns", status);
  const byStateYear = {};
  if (!text) return {};
  const rows = parseCsv(text);
  for (const row of rows) {
    if (row.stage !== "gen" || row.mode !== "total") continue;
    const state = row.state_po;
    const year = Number(row.year);
    if (!STATE_NAMES[state] || !Number.isFinite(year)) continue;
    byStateYear[state] ||= {};
    byStateYear[state][year] ||= { dem: 0, rep: 0, total: toNumber(row.totalvotes) };
    const party = String(row.party || "").toLowerCase();
    if (party === "democrat") byStateYear[state][year].dem += toNumber(row.candidatevotes);
    if (party === "republican") byStateYear[state][year].rep += toNumber(row.candidatevotes);
  }

  const latestMargins = {};
  for (const [state, years] of Object.entries(byStateYear)) {
    const latestYear = Math.max(...Object.keys(years).map(Number));
    const result = years[latestYear];
    if (!result.total) continue;
    latestMargins[state] = {
      year: latestYear,
      margin: ((result.dem - result.rep) / result.total) * 100
    };
  }
  status.mitSenateReturns.rows = rows.length;
  status.mitSenateReturns.states = Object.keys(latestMargins).length;
  return latestMargins;
}

async function fetchCensus(status) {
  const url = "https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/state/totals/NST-EST2024-POPCHG2020-2024.csv";
  const text = await fetchText(url, "censusPopulation", status);
  if (!text) return {};
  const rows = parseCsv(text);
  const byState = {};
  for (const row of rows) {
    if (row.SUMLEV !== "040") continue;
    const state = FIPS_TO_STATE[String(row.STATE).padStart(2, "0")];
    if (!state) continue;
    byState[state] = {
      name: row.NAME,
      pop2020: toNumber(row.POPESTIMATE2020),
      pop2024: toNumber(row.POPESTIMATE2024),
      pctChange2024: toNumber(row.PPOPCHG_2024)
    };
  }
  status.censusPopulation.rows = rows.length;
  status.censusPopulation.states = Object.keys(byState).length;
  status.censusPopulation.source = "Census Bureau no-key CSV";
  return byState;
}

async function fetchCivicApi(status) {
  const docsText = await fetchText("https://www.civicapi.org/api-documentation", "civicApiDocs", status);
  const endpointText = await fetchText("https://www.civicapi.org/api/v1/upcomingraces", "civicApiEndpoint", status);
  return {
    documentationReachable: Boolean(docsText),
    endpointReachable: Boolean(endpointText),
    note: endpointText
      ? "Endpoint reachable, but no Senate forecast result feed is wired yet."
      : "Docs are reachable, but tested no-key API endpoints currently return 404; using MIT/MEDSL historical results instead."
  };
}

async function fetchPollingReferencePages(status) {
  const [towinStatePage, towinLatestPage, raceToTheWhPage, raceToTheWhGeneric, electoralVoteCsv, usPollingDataSenate] = await Promise.all([
    fetchText("https://www.270towin.com/content/2026-senate-polling", "twoSeventyToWinPollingIndex", status, { timeoutMs: 12000 }),
    fetchText("https://www.270towin.com/polls/latest-2026-senate-election-polls/", "twoSeventyToWinLatestPolls", status, { timeoutMs: 12000 }),
    fetchText("https://www.racetothewh.com/senate/26polls", "raceToTheWhSenatePolls", status, { timeoutMs: 12000 }),
    fetchText("https://www.racetothewh.com/polls/genericballot", "raceToTheWhGenericBallot", status, { timeoutMs: 12000 }),
    fetchText("https://electoral-vote.com/evp2026/Senate/senate_polls.csv", "electoralVoteSenatePolls", status, { timeoutMs: 12000 }),
    fetchText("https://uspollingdata.com/polls/senate-polling/", "usPollingDataSenatePolling", status, { timeoutMs: 12000 })
  ]);
  if (electoralVoteCsv && status.electoralVoteSenatePolls) {
    const rows = parseCsv(electoralVoteCsv);
    status.electoralVoteSenatePolls.rows = rows.length;
    status.electoralVoteSenatePolls.currentCycleRows = rows.filter((row) => !/^Election/i.test(row.Pollster || "")).length;
  }
  if (usPollingDataSenate && status.usPollingDataSenatePolling) {
    status.usPollingDataSenatePolling.hasSenateTable = /Competitive Senate Races/i.test(usPollingDataSenate);
    status.usPollingDataSenatePolling.note = "Reachable, but not blended because several listed races/candidates do not match this Senate cycle ledger.";
  }
  if (raceToTheWhPage && status.raceToTheWhSenatePolls) {
    status.raceToTheWhSenatePolls.hasStaticRows = /<table|poll_row|candidate_id/i.test(raceToTheWhPage);
    status.raceToTheWhSenatePolls.note = status.raceToTheWhSenatePolls.hasStaticRows
      ? "Static poll rows detected."
      : "Reachable, but no stable row-level poll data was present in the fetched HTML.";
  }
  return {
    twoSeventyToWin: {
      pollingIndexReachable: Boolean(towinStatePage),
      latestPollsReachable: Boolean(towinLatestPage),
      note: "Tracked as a polling reference page. No stable public row-level API was detected, so rows are not blended unless a structured endpoint is added."
    },
    raceToTheWh: {
      senatePollsReachable: Boolean(raceToTheWhPage),
      genericBallotReachable: Boolean(raceToTheWhGeneric),
      note: "Tracked as a polling-average reference page. No stable public row-level API was detected, so rows are not blended unless a structured endpoint is added."
    },
    electoralVote: {
      senatePollCsvReachable: Boolean(electoralVoteCsv),
      note: "Downloadable Senate polling CSV is tracked. It is only blended when current-cycle non-election poll rows are present."
    },
    usPollingData: {
      senatePollingReachable: Boolean(usPollingDataSenate),
      note: "Tracked as a public polling reference. Senate table is not blended when race/candidate ledger conflicts are detected."
    }
  };
}

async function fetchAllSources() {
  const status = { checkedAt: new Date().toISOString() };
  const [votehub, ddhqGeneric, pollfinity, usPollingDataGeneric, realClearPolling, twoSeventyToWin, fec, mit, census, civic, pollingReferences] = await Promise.all([
    fetchVoteHub(status),
    fetchDdhqGenericBallot(status),
    fetchPollfinityAverages(status),
    fetchUsPollingDataGeneric(status),
    fetchRealClearPolling(status),
    fetchTwoSeventyToWinRacePolls(status),
    fetchFec(status),
    fetchMitSenate(status),
    fetchCensus(status),
    fetchCivicApi(status),
    fetchPollingReferencePages(status)
  ]);
  const genericPollingSources = [
    { source: "VoteHub", margin: votehub.genericBallotMargin, dem: votehub.genericBallotDem, rep: votehub.genericBallotRep, polls: votehub.usableGenericBallotPolls, weight: 1 },
    { source: "DDHQ", margin: ddhqGeneric.genericBallotMargin, dem: ddhqGeneric.genericBallotDem, rep: ddhqGeneric.genericBallotRep, polls: ddhqGeneric.polls, weight: .75 },
    { source: "Pollfinity", margin: pollfinity.genericBallotMargin, dem: pollfinity.genericBallotDem, rep: pollfinity.genericBallotRep, polls: pollfinity.genericBallotPolls, weight: .55 },
    { source: "USPollingData", margin: usPollingDataGeneric.genericBallotMargin, dem: usPollingDataGeneric.genericBallotDem, rep: usPollingDataGeneric.genericBallotRep, polls: 0, weight: .45 }
  ].filter((source) => Number.isFinite(source.margin));
  const genericWeight = genericPollingSources.reduce((sum, source) => sum + source.weight, 0);
  const genericPolling = {
    sources: genericPollingSources,
    genericBallotMargin: genericWeight ? genericPollingSources.reduce((sum, source) => sum + source.margin * source.weight, 0) / genericWeight : null,
    genericBallotDem: genericWeight ? genericPollingSources.reduce((sum, source) => sum + (Number.isFinite(source.dem) ? source.dem : 0) * source.weight, 0) / genericWeight : null,
    genericBallotRep: genericWeight ? genericPollingSources.reduce((sum, source) => sum + (Number.isFinite(source.rep) ? source.rep : 0) * source.weight, 0) / genericWeight : null
  };
  return { status, votehub, ddhqGeneric, pollfinity, usPollingDataGeneric, genericPolling, realClearPolling, twoSeventyToWin, fec, mit, census, civic, pollingReferences };
}

function applySourceInputs(baseRaces, sourceData) {
  return baseRaces.map((race) => {
    const fec = sourceData?.fec?.[race.state];
    const mit = sourceData?.mit?.[race.state];
    const census = sourceData?.census?.[race.state];
    const sourceInputs = {};
    let money = race.money;
    let pastSenate = race.pastSenate;
    let pvi = race.pvi;
    let polls = race.polls;

    if (fec) {
      const demEfficiency = (fec.demCash + fec.demIndividual * .45 - fec.demDebts * .7) / Math.sqrt(1 + Math.max(fec.demDisbursements, 1));
      const repEfficiency = (fec.repCash + fec.repIndividual * .45 - fec.repDebts * .7) / Math.sqrt(1 + Math.max(fec.repDisbursements, 1));
      const efficiencySignal = clamp((demEfficiency - repEfficiency) / 1800, -1.35, 1.35);
      const rawReceiptSignal = clamp((fec.demReceipts - fec.repReceipts) / 8000000, -1, 1);
      const financeSignal = efficiencySignal * .72 + rawReceiptSignal * .28;
      money = clamp(race.money * .55 + financeSignal * .45, -1.5, 1.5);
      sourceInputs.openFec = { ...fec, demEfficiency, repEfficiency, efficiencySignal, rawReceiptSignal, financeSignal };
    }
    if (mit) {
      pastSenate = race.pastSenate * .8 + mit.margin * .2;
      sourceInputs.mitSenate = mit;
    }
    if (census?.pop2020 && census?.pop2024) {
      const growth = ((census.pop2024 - census.pop2020) / census.pop2020) * 100;
      const growthSignal = clamp(growth / 12, -.35, .35);
      pvi = race.pvi + growthSignal;
      sourceInputs.census = { ...census, growth, growthSignal };
    }
    if (sourceData?.genericPolling?.genericBallotMargin !== null) {
      const nationalPolling = clamp(
        sourceData.genericPolling.genericBallotMargin * MODEL_WEIGHTS.genericBallot,
        -MODEL_WEIGHTS.genericBallotCap,
        MODEL_WEIGHTS.genericBallotCap
      );
      sourceInputs.votehub = {
        genericBallotPolls: sourceData.votehub.genericBallotPolls,
        usableGenericBallotPolls: sourceData.votehub.usableGenericBallotPolls,
        genericBallotMargin: sourceData.votehub.genericBallotMargin,
        nationalPolling
      };
      sourceInputs.genericPolling = {
        genericBallotMargin: sourceData.genericPolling.genericBallotMargin,
        sources: sourceData.genericPolling.sources.map(({ source, margin, polls, weight }) => ({ source, margin, polls, weight }))
      };
      if (sourceData?.realClearPolling?.byState?.[race.state]?.length) {
        const rcpPolls = sourceData.realClearPolling.byState[race.state];
        polls = [...polls, ...rcpPolls];
        sourceInputs.realClearPolling = {
          polls: rcpPolls.length,
          recent: rcpPolls.slice(0, 5).map(({ pollster, endDate, margin, title, result, spread }) => ({ pollster, endDate, margin, title, result, spread }))
        };
      }
      if (sourceData?.twoSeventyToWin?.byState?.[race.state]?.length) {
        const towinPolls = sourceData.twoSeventyToWin.byState[race.state];
        polls = [...polls, ...towinPolls];
        sourceInputs.twoSeventyToWin = {
          polls: towinPolls.length,
          recent: towinPolls.slice(0, 5).map(({ pollster, endDate, margin, title, result, spread, sampleSize, population }) => ({ pollster, endDate, margin, title, result, spread, sampleSize, population }))
        };
      }
      return { ...race, money, pastSenate, pvi, polls, nationalPolling, sourceInputs };
    }

    if (sourceData?.realClearPolling?.byState?.[race.state]?.length) {
      const rcpPolls = sourceData.realClearPolling.byState[race.state];
      polls = [...polls, ...rcpPolls];
      sourceInputs.realClearPolling = {
        polls: rcpPolls.length,
        recent: rcpPolls.slice(0, 5).map(({ pollster, endDate, margin, title, result, spread }) => ({ pollster, endDate, margin, title, result, spread }))
      };
    }
    if (sourceData?.twoSeventyToWin?.byState?.[race.state]?.length) {
      const towinPolls = sourceData.twoSeventyToWin.byState[race.state];
      polls = [...polls, ...towinPolls];
      sourceInputs.twoSeventyToWin = {
        polls: towinPolls.length,
        recent: towinPolls.slice(0, 5).map(({ pollster, endDate, margin, title, result, spread, sampleSize, population }) => ({ pollster, endDate, margin, title, result, spread, sampleSize, population }))
      };
    }

    return { ...race, money, pastSenate, pvi, polls, sourceInputs };
  });
}

function appendControlHistory(model) {
  const current = { date: MODEL_DATE_KEY, dem: model.demControlProbability, rep: model.repControlProbability };
  const stored = Array.isArray(previousForecast?.controlHistory) ? previousForecast.controlHistory : [];
  return [...stored.filter((point) => point.date !== current.date && point.date <= MODEL_DATE_KEY), current]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365);
}

function appendSeatHistory(model) {
  const current = {
    date: MODEL_DATE_KEY,
    dem: model.medianSeats,
    rep: 100 - model.medianSeats
  };
  const stored = Array.isArray(previousForecast?.seatHistory) ? previousForecast.seatHistory : [];
  return [...stored.filter((point) => point.date !== current.date && point.date <= MODEL_DATE_KEY), current]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-365);
}

function buildCalibrationReport(sourceData, model) {
  const rows = model.races
    .map((race) => {
      const historical = sourceData?.mit?.[race.state];
      if (!historical) return null;
      const predicted = logistic(race.margin, race.error);
      const actual = historical.margin > 0 ? 1 : 0;
      const brier = (predicted - actual) ** 2;
      const absoluteMarginError = Math.abs(race.margin - historical.margin);
      return {
        state: race.state,
        latestHistoricalYear: historical.year,
        predicted: Number(predicted.toFixed(4)),
        actual,
        brier: Number(brier.toFixed(4)),
        absoluteMarginError: Number(absoluteMarginError.toFixed(2))
      };
    })
    .filter(Boolean);
  const mean = (field) => rows.length ? rows.reduce((sum, row) => sum + row[field], 0) / rows.length : null;
  return {
    sample: rows.length,
    meanBrier: mean("brier"),
    meanAbsoluteMarginError: mean("absoluteMarginError"),
    note: "Diagnostic only: compares current-cycle model structure against each state's latest available MIT/MEDSL Senate result, not a true historical forecast archive.",
    worstStates: [...rows].sort((a, b) => b.absoluteMarginError - a.absoluteMarginError).slice(0, 5)
  };
}

async function writeForecast() {
  const sourceData = await fetchAllSources();
  const model = runModel(sourceData);
  const generatedAt = new Date().toISOString();
  const output = {
    generatedAt,
    modelDate: MODEL_DATE_KEY,
    runDate: new Date(`${MODEL_DATE_KEY}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    updateTime: "around 6:00 AM Central",
    settings: { ...SETTINGS, modelWeights: MODEL_WEIGHTS },
    sourceStatus: sourceData.status,
    sourceSummary: {
      votehub: sourceData.votehub,
      genericPolling: sourceData.genericPolling,
      ddhqGeneric: sourceData.ddhqGeneric,
      pollfinity: sourceData.pollfinity,
      usPollingDataGeneric: sourceData.usPollingDataGeneric,
      realClearPolling: {
        polls: sourceData.realClearPolling.polls,
        usablePolls: sourceData.realClearPolling.usablePolls,
        states: Object.keys(sourceData.realClearPolling.byState || {}).length
      },
      twoSeventyToWin: {
        pages: sourceData.twoSeventyToWin.pages,
        okPages: sourceData.twoSeventyToWin.okPages,
        usablePolls: sourceData.twoSeventyToWin.usablePolls,
        states: Object.keys(sourceData.twoSeventyToWin.byState || {}).length
      },
      fecStates: Object.keys(sourceData.fec).length,
      mitStates: Object.keys(sourceData.mit).length,
      censusStates: Object.keys(sourceData.census).length,
      civicApi: sourceData.civic,
      pollingReferences: sourceData.pollingReferences
    },
    calibration: buildCalibrationReport(sourceData, model),
    controlHistory: appendControlHistory(model),
    seatHistory: appendSeatHistory(model),
    ...model
  };

  mkdirSync(new URL("../data/", import.meta.url), { recursive: true });
  writeFileSync(FORECAST_URL, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Wrote data/forecast.json for ${MODEL_DATE_KEY}`);
}

await writeForecast();

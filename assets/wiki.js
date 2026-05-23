const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia"
};

const FIPS_TO_STATE = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY"
};

const RATING_BUCKET = {
  "Safe D": "safe-d", "Likely D": "likely-d", "Lean D": "lean-d", "Tilt D": "tilt-d", "Toss-up": "tossup",
  "Tilt R": "tilt-r", "Lean R": "lean-r", "Likely R": "likely-r", "Safe R": "safe-r"
};

const MAP_COLOR_MODES = {
  rating: "Rating",
  margin: "Projected margin",
  probability: "Win probability"
};

const HOUSE_COLOR_MODES = {
  rating: "Rating",
  margin: "Projected margin",
  probability: "Win probability"
};

const HOUSE_PREVIEW_MODES = {
  board: "Board",
  list: "List"
};

const CHART_ANNOTATIONS = [
  { date: "2026-05-17", label: "Model reworked" },
  { date: "2026-05-20", label: "Model reworked" }
];

const MONTANA_CHART_ANNOTATIONS = [
  { date: "2026-05-19", label: "Bodnar modeled" }
];

let forecast = null;
let houseForecast = null;
let presidentForecasts = null;
let articles = [];
let mapColorMode = "rating";
let houseViewMode = "board";
let houseColorMode = "rating";
let selectedHouseDistrictId = null;

const PRESIDENT_DEM_CANDIDATES = ["newsom", "beshear", "shapiro", "buttigieg", "whitmer", "aoc"];
const PRESIDENT_REP_CANDIDATES = ["vance", "rubio", "desantis", "haley", "cruz"];

const HOUSE_DISTRICT_MAP_URL = "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/USA_119th_Congressional_Districts_no_territories/FeatureServer/0/query?where=1%3D1&outFields=DISTRICTID,STATE_ABBR,CDFIPS,NAME,PARTY&returnGeometry=true&f=geojson&outSR=4326&resultRecordCount=2000";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function oneDecimal(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function candidateDisplayName(race, party) {
  const name = party === "D" ? race.dem : race.rep;
  const status = party === "D" ? race.demStatus : race.repStatus;
  if (status === "unresolved") return party === "D" ? "Democrat" : "Republican";
  return name || (party === "D" ? "Democrat" : "Republican");
}

function candidateStatusBadge(race, party) {
  const name = party === "D" ? race.dem : race.rep;
  const status = party === "D" ? race.demStatus : race.repStatus;
  const displayParty = party === "D" ? race.demDisplayParty : race.repDisplayParty;
  if (displayParty) return displayParty;
  if (status === "unresolved") return party;
  if (String(name || "").toLowerCase().includes("independent")) return "I";
  return party;
}

function candidateBadgeClass(badge, party) {
  if (badge === "I") return "ind-badge";
  if (party === "D") return "party-badge dem-badge";
  if (party === "R") return "party-badge rep-badge";
  return "";
}

function candidateRowClass(race, party) {
  const name = party === "D" ? race.dem : race.rep;
  const displayParty = party === "D" ? race.demDisplayParty : race.repDisplayParty;
  if (displayParty === "I" || String(name || "").toLowerCase().includes("independent")) return "candidate-row independent-row";
  return `candidate-row ${party === "D" ? "dem-row" : "rep-row"}`;
}

function candidateChanceLabel(race, party) {
  const name = party === "D" ? race.dem : race.rep;
  const displayParty = party === "D" ? race.demDisplayParty : race.repDisplayParty;
  if (displayParty === "I" || String(name || "").toLowerCase().includes("independent")) return "Independent";
  return party === "D" ? "Democrat" : "Republican";
}

function leaderClassForRace(race) {
  if (race.winnerParty === "D" && (race.demDisplayParty === "I" || String(race.dem || "").toLowerCase().includes("independent"))) return "leads-ind";
  if (race.rating === "Toss-up") return "leads-tossup";
  return race.winnerParty === "D" ? "leads-dem" : "leads-rep";
}

function extraCandidateRows(race) {
  const latestExtra = new Map((race.extraHistory?.at(-1) ? Object.entries(race.extraHistory.at(-1)) : []).filter(([key]) => key !== "date"));
  return (race.extraCandidates || []).map((candidate) => {
    const party = candidate.party || "D";
    const badgeClass = party === "D" ? "party-badge dem-badge" : party === "R" ? "party-badge rep-badge" : "ind-badge";
    const modeledShare = latestExtra.get(candidate.name);
    const label = Number.isFinite(modeledShare) ? oneDecimal(modeledShare) : Number.isFinite(candidate.probabilityShare) ? oneDecimal(candidate.probabilityShare) : party === "D" ? "Democratic alternative" : party === "R" ? "Republican alternative" : "Independent";
    return `
      <div class="candidate-row extra-row">
        <span>${escapeHtml(candidate.name)} <i class="${badgeClass}">${party}</i></span>
        <strong>${escapeHtml(label)}</strong>
      </div>
    `;
  }).join("");
}

function presumptiveBadge(race, party) {
  const status = party === "D" ? race.demStatus : race.repStatus;
  return status === "presumptive" ? `<i class="presumptive-badge">P</i>` : "";
}

function signedMargin(demProbability) {
  const margin = (demProbability - .5) * 100;
  if (Math.abs(margin) < .05) return "Even";
  return `${margin > 0 ? "D" : "R"}+${Math.abs(margin).toFixed(1)} pts`;
}

function signedPointMargin(value) {
  if (!Number.isFinite(value) || Math.abs(value) < .05) return "Even";
  return `${value > 0 ? "D" : "R"}+${Math.abs(value).toFixed(1)} pts`;
}

function ratingFromSignedValue(value, thresholds) {
  if (!Number.isFinite(value)) return "Toss-up";
  const abs = Math.abs(value);
  if (abs < thresholds.tilt) return "Toss-up";
  const side = value > 0 ? "D" : "R";
  if (abs >= thresholds.safe) return `Safe ${side}`;
  if (abs >= thresholds.likely) return `Likely ${side}`;
  if (abs >= thresholds.lean) return `Lean ${side}`;
  return `Tilt ${side}`;
}

function pollingInputText(race) {
  if (race.pollMargin === null) return "No recent public race-poll margin";
  return `${signedPointMargin(race.pollMargin)} weighted race-poll margin`;
}

function movementText(race) {
  const value = race?.movement?.sinceLastRun;
  if (!Number.isFinite(value) || Math.abs(value) < .05) return "No change since last run";
  const party = value > 0 ? "D" : "R";
  const arrow = value > 0 ? "up" : "down";
  return `${party} ${Math.abs(value).toFixed(1)} pts ${arrow} since last run`;
}

function compactMovementText(race) {
  const value = race?.movement?.sinceLastRun;
  if (!Number.isFinite(value) || Math.abs(value) < .05) return "0.0";
  return `${value > 0 ? "D" : "R"} +${Math.abs(value).toFixed(1)}`;
}

function inputQualityText(race) {
  const quality = race?.inputQuality;
  if (!quality) return "Not scored";
  return `${quality.label} (${quality.score}/100)`;
}

function signedDriverChange(value) {
  if (!Number.isFinite(value)) return "";
  if (Math.abs(value) < .05) return "0.0";
  return `${value > 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}`;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

function getRace(state) {
  return forecast?.races?.find((race) => race.state === state);
}

function bucketForRace(race, mode = mapColorMode) {
  if (!race) return "state-muted";
  if (mode === "margin") return RATING_BUCKET[ratingFromSignedValue(race.margin, { tilt: 1, lean: 3, likely: 7, safe: 12 })] || "tossup";
  if (mode === "probability") {
    const probMargin = (race.demProbability - .5) * 100;
    return RATING_BUCKET[ratingFromSignedValue(probMargin, { tilt: 2.5, lean: 10, likely: 25, safe: 45 })] || "tossup";
  }
  return RATING_BUCKET[race.rating] || "tossup";
}

function ratingLabelForRace(race, mode = mapColorMode) {
  if (!race) return "No race";
  if (mode === "margin") return ratingFromSignedValue(race.margin, { tilt: 1, lean: 3, likely: 7, safe: 12 });
  if (mode === "probability") return ratingFromSignedValue((race.demProbability - .5) * 100, { tilt: 2.5, lean: 10, likely: 25, safe: 45 });
  return race.rating;
}

function ratingColor(race, mode = mapColorMode) {
  const root = getComputedStyle(document.documentElement);
  const bucket = bucketForRace(race, mode);
  const colors = {
    "safe-d": "--safe-d", "likely-d": "--likely-d", "lean-d": "--lean-d", "tilt-d": "--tilt-d",
    tossup: "--toss", "tilt-r": "--tilt-r", "lean-r": "--lean-r", "likely-r": "--likely-r", "safe-r": "--safe-r"
  };
  return root.getPropertyValue(colors[bucket] || "--toss").trim();
}

function ensurePanelTooltip(panel) {
  let tooltip = panel.querySelector(".panel-hover-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "panel-hover-tooltip";
    panel.append(tooltip);
  }
  return tooltip;
}

function showPanelTooltip(source, html) {
  const panel = source.closest(".chart-panel, .detail-panel, .map-panel");
  if (!panel) return;
  const tooltip = ensurePanelTooltip(panel);
  tooltip.innerHTML = html;
  tooltip.classList.add("visible");

  const panelRect = panel.getBoundingClientRect();
  const sourceRect = source.getBoundingClientRect();
  const tooltipWidth = Math.min(240, panelRect.width - 20);
  const sourceCenter = sourceRect.left - panelRect.left + sourceRect.width / 2;
  const left = clamp(sourceCenter - tooltipWidth / 2, 10, panelRect.width - tooltipWidth - 10);
  const above = sourceRect.top - panelRect.top - tooltip.offsetHeight - 10;
  const below = sourceRect.bottom - panelRect.top + 10;
  const isAbove = above > 8;
  const top = isAbove ? above : below;

  tooltip.style.width = `${tooltipWidth}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.classList.toggle("below-source", !isAbove);
}

function hideAllPanelTooltips() {
  document.querySelectorAll(".panel-hover-tooltip.visible").forEach((tooltip) => {
    tooltip.classList.remove("visible");
  });
}

function hideAllChartHovers() {
  document.querySelectorAll(".history-hover").forEach((hover) => {
    hover.style.display = "none";
  });
}

function installInteractionDismiss() {
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".seat-bin, .leverage-row, .poll-row, .panel-hover-tooltip")) {
      hideAllPanelTooltips();
    }
    if (!event.target.closest(".history-chart")) {
      hideAllChartHovers();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideAllPanelTooltips();
      hideAllChartHovers();
    }
  });
}

function hidePanelTooltip(source) {
  const panel = source.closest(".chart-panel, .detail-panel, .map-panel");
  const tooltip = panel?.querySelector(".panel-hover-tooltip");
  if (tooltip) tooltip.classList.remove("visible");
}

function bindPanelTooltip(selector, getHtml) {
  bindPanelTooltipFor(document, selector, getHtml);
}

function bindPanelTooltipFor(root, selector, getHtml) {
  root.querySelectorAll(selector).forEach((node) => {
    const handler = (event) => {
      event.stopPropagation();
      showPanelTooltip(node, getHtml(node));
    };
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
    node.addEventListener("mouseleave", () => hidePanelTooltip(node));
    node.addEventListener("blur", () => hidePanelTooltip(node));
  });
}

function updateSummary() {
  if (!forecast) return;
  const settings = forecast.settings || {};
  setText("run-date", forecast.runDate || forecast.modelDate || "--");
  setText("sim-count", Number(settings.simulations || 0).toLocaleString("en-US"));
  setText("watch-count", forecast.races.filter((race) => race.competitive).length);
  setText("dem-control", oneDecimal(forecast.demControlProbability));
  setText("rep-control", oneDecimal(forecast.repControlProbability));
  setText("median-seats", `${forecast.medianSeats} D`);
  const favoredIsDem = forecast.demControlProbability >= forecast.repControlProbability;
  setText("control-headline", favoredIsDem ? "Democrats narrowly favored" : "Republicans narrowly favored");
  const favoredSide = forecast.demControlProbability >= forecast.repControlProbability ? "Democrats" : "Republicans";
  const favoredProbability = Math.max(forecast.demControlProbability, forecast.repControlProbability);
  const oddsNode = document.getElementById("odds-phrase");
  if (oddsNode) {
    oddsNode.innerHTML = `<span>${favoredSide} favored</span><strong>${pct(favoredProbability)}</strong>`;
  }
  setText("home-senate-favored", `${favoredSide} ${pct(favoredProbability)}`);
  setText("home-senate-dem", oneDecimal(forecast.demControlProbability));
  setText("home-senate-rep", oneDecimal(forecast.repControlProbability));
  setText("home-senate-run", forecast.runDate || forecast.modelDate || "--");
  setText("home-senate-median", `${forecast.medianSeats} D / ${100 - forecast.medianSeats} R`);
  setText("home-senate-note", `${forecast.races.filter((race) => race.competitive).length} competitive races`);
  const senateCard = document.getElementById("home-senate-card");
  if (senateCard) {
    senateCard.classList.toggle("control-dem", favoredIsDem);
    senateCard.classList.toggle("control-rep", !favoredIsDem);
  }
  document.querySelectorAll(".odds-panel").forEach((panel) => {
    panel.classList.toggle("control-dem", favoredIsDem);
    panel.classList.toggle("control-rep", !favoredIsDem);
  });
  setText("update-time", `Updates daily at ${forecast.updateTime || "6:20 AM Central"}`);

  const demBar = document.getElementById("dem-control-bar");
  const repBar = document.getElementById("rep-control-bar");
  if (demBar && repBar) {
    demBar.style.width = `${forecast.demControlProbability * 100}%`;
    repBar.style.width = `${forecast.repControlProbability * 100}%`;
  }
}

function updateHomeHouseSummary() {
  if (!houseForecast) return;
  const favoredIsDem = houseForecast.demControlProbability >= houseForecast.repControlProbability;
  const favoredSide = favoredIsDem ? "Democrats" : "Republicans";
  const favoredProbability = Math.max(houseForecast.demControlProbability, houseForecast.repControlProbability);
  setText("home-house-status", "Live");
  setText("home-house-favored", `${favoredSide} ${pct(favoredProbability)}`);
  setText("home-house-dem", oneDecimal(houseForecast.demControlProbability));
  setText("home-house-rep", oneDecimal(houseForecast.repControlProbability));
  setText("home-house-run", houseForecast.runDate || houseForecast.modelDate || "--");
  setText("home-house-median", `${houseForecast.medianSeats} D / ${435 - houseForecast.medianSeats} R`);
  setText("home-house-note", `${houseForecast.districts?.filter((district) => district.competitive).length ?? "--"} competitive districts`);
  const houseCard = document.getElementById("home-house-card");
  if (houseCard) {
    houseCard.classList.toggle("control-dem", favoredIsDem);
    houseCard.classList.toggle("control-rep", !favoredIsDem);
  }
}

function presidentCandidateShortName(name) {
  if (!name) return "--";
  if (String(name).includes("Ocasio-Cortez")) return "AOC";
  const parts = String(name).trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function presidentSummary() {
  if (!presidentForecasts?.length) return null;
  const count = presidentForecasts.length;
  const demWin = presidentForecasts.reduce((sum, item) => sum + (item.national?.demWinProbability || 0), 0) / count;
  const repWin = presidentForecasts.reduce((sum, item) => sum + (item.national?.repWinProbability || 0), 0) / count;
  const demEv = presidentForecasts.reduce((sum, item) => sum + (item.electoralCollege?.demExpectedEV || 0), 0) / count;
  const repEv = presidentForecasts.reduce((sum, item) => sum + (item.electoralCollege?.repExpectedEV || 0), 0) / count;
  const sortedDem = [...presidentForecasts].sort((a, b) => (b.national?.demWinProbability || 0) - (a.national?.demWinProbability || 0));
  const sortedRep = [...presidentForecasts].sort((a, b) => (b.national?.repWinProbability || 0) - (a.national?.repWinProbability || 0));
  const runDate = presidentForecasts.map((item) => item.date).filter(Boolean).sort().at(-1);
  return { count, demWin, repWin, demEv, repEv, sortedDem, sortedRep, runDate };
}

function updateHomePresidentSummary() {
  const summary = presidentSummary();
  if (!summary) return;
  const favoredIsDem = summary.demWin >= summary.repWin;
  const favoredSide = favoredIsDem ? "Democrats" : "Republicans";
  const favoredProbability = Math.max(summary.demWin, summary.repWin);
  setText("home-president-favored", `${favoredSide} ${pct(favoredProbability)}`);
  setText("home-president-dem", oneDecimal(summary.demWin));
  setText("home-president-rep", oneDecimal(summary.repWin));
  setText("home-president-run", summary.runDate || "--");
  setText("home-president-ev", `${Math.round(summary.demEv)} D / ${Math.round(summary.repEv)} R`);
  setText("home-president-note", `${summary.count} tested matchups`);
  const card = document.getElementById("home-president-card");
  if (card) {
    card.classList.toggle("control-dem", favoredIsDem);
    card.classList.toggle("control-rep", !favoredIsDem);
  }
}

function renderHomeRadar() {
  const senate = document.getElementById("home-senate-radar");
  if (senate && forecast) {
    const races = [...forecast.races]
      .filter((race) => race.competitive || race.tippingPower > .05)
      .sort((a, b) => b.tippingPower - a.tippingPower)
      .slice(0, 6);
    senate.innerHTML = races.map((race) => {
      const leader = race.winnerParty === "D" ? candidateChanceLabel(race, "D") : "Republican";
      return `
        <a class="home-radar-row ${leaderClassForRace(race)}" href="race.html?state=${race.state}">
          <strong>${escapeHtml(race.state)}</strong>
          <span>${escapeHtml(race.displayName.replace(" Senate", ""))}</span>
          <b>${escapeHtml(leader)} ${oneDecimal(race.winnerProbability)}</b>
          <i>${oneDecimal(race.tippingPower)}</i>
        </a>
      `;
    }).join("");
  }

  const house = document.getElementById("home-house-radar");
  if (house && houseForecast) {
    const districts = [...(houseForecast.decisiveDistricts || [])].slice(0, 6);
    house.innerHTML = districts.map((district) => `
      <a class="home-radar-row ${houseLeaderClass(district)}" href="house.html">
        <strong>${escapeHtml(district.id)}</strong>
        <span>${escapeHtml(district.label || district.rating)}</span>
        <b>${district.winnerParty === "D" ? "D" : "R"} ${oneDecimal(district.winnerProbability)}</b>
        <i>${oneDecimal(district.leverage || 0)}</i>
      </a>
    `).join("");
  }

  const president = document.getElementById("home-president-radar");
  const summary = presidentSummary();
  if (president && summary) {
    const rows = [
      ...summary.sortedDem.slice(0, 3).map((item) => ({
        type: "leads-dem",
        label: `${presidentCandidateShortName(item.demCandidateName)} over ${presidentCandidateShortName(item.repCandidateName)}`,
        value: oneDecimal(item.national?.demWinProbability || 0),
        meta: `${item.electoralCollege?.demExpectedEV || "--"} EV`
      })),
      ...summary.sortedRep.slice(0, 3).map((item) => ({
        type: "leads-rep",
        label: `${presidentCandidateShortName(item.repCandidateName)} over ${presidentCandidateShortName(item.demCandidateName)}`,
        value: oneDecimal(item.national?.repWinProbability || 0),
        meta: `${item.electoralCollege?.repExpectedEV || "--"} EV`
      }))
    ];
    president.innerHTML = rows.map((row) => `
      <a class="home-radar-row ${row.type}" href="president.html">
        <strong>2028</strong>
        <span>${escapeHtml(row.label)}</span>
        <b>${row.value}</b>
        <i>${escapeHtml(String(row.meta))}</i>
      </a>
    `).join("");
  }
}

function normalizedMapMode(mode) {
  return Object.prototype.hasOwnProperty.call(MAP_COLOR_MODES, mode) ? mode : mapColorMode;
}

function hoverMarkup(race, mode = mapColorMode) {
  const activeMode = normalizedMapMode(mode);
  if (!race) {
    return `<span class="panel-label">State detail</span><h3>No Senate race</h3><p>This state is not on the regular 2026 Senate board.</p>`;
  }
  const ratingLabel = ratingLabelForRace(race, activeMode);
  const ratingBucket = bucketForRace(race, activeMode);
  const ratingModeLabel = MAP_COLOR_MODES[activeMode];
  const winner = race.winnerParty === "D" ? candidateChanceLabel(race, "D") : "Republican";
  const demCandidate = candidateDisplayName(race, "D");
  const repCandidate = candidateDisplayName(race, "R");
  const demBadge = candidateStatusBadge(race, "D");
  const repBadge = candidateStatusBadge(race, "R");
  const demIsIndependent = race.demDisplayParty === "I" || String(race.dem || "").toLowerCase().includes("independent");
  return `
    <span class="race-kicker">${race.displayName}</span>
    <div class="map-card-title">
      <div class="state-code">${race.state}</div>
      <span class="rating-pill ${ratingBucket}" title="${escapeHtml(ratingModeLabel)}">${ratingLabel}</span>
    </div>
    <h3>${winner} has a ${oneDecimal(race.winnerProbability)} chance.</h3>
    <div class="candidate-table" aria-label="${race.state} candidate forecast">
      <div class="candidate-table-head"><span>Candidate</span><span>Chance</span></div>
      <div class="${candidateRowClass(race, "D")}">
        <span>${escapeHtml(demCandidate)} <i class="${candidateBadgeClass(demBadge, "D")}">${demBadge}</i>${presumptiveBadge(race, "D")}</span>
        <strong>${oneDecimal(race.demProbability)}</strong>
      </div>
      ${extraCandidateRows(race)}
      <div class="${candidateRowClass(race, "R")}">
        <span>${escapeHtml(repCandidate)} <i class="${candidateBadgeClass(repBadge, "R")}">${repBadge}</i>${presumptiveBadge(race, "R")}</span>
        <strong>${oneDecimal(1 - race.demProbability)}</strong>
      </div>
      <div class="candidate-margin"><span>Projected margin</span><strong>${signedPointMargin(race.margin)}</strong></div>
    </div>
    <div class="prob-track ${demIsIndependent ? "independent-track" : ""}" aria-label="${race.state} probability split">
      <span style="width:${race.demProbability * 100}%"></span>
      <span style="width:${(1 - race.demProbability) * 100}%"></span>
    </div>
    <p class="candidate-key"><b>P</b> Presumptive nominee. <b>I</b> Independent.</p>
    <div class="badge-row">${(race.uncertaintyBadges || []).slice(0, 4).map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}</div>
    <p>${escapeHtml(race.summary || race.note || "")}</p>
    <p class="meta">Color mode: ${escapeHtml(ratingModeLabel)} / Primary: ${race.primary} / Tipping power: ${oneDecimal(race.tippingPower)}</p>
    <a class="button-link" href="race.html?state=${race.state}">Open race page</a>
  `;
}

function updateHoverCard(race) {
  const card = document.getElementById("map-hover-card");
  if (card) card.innerHTML = hoverMarkup(race, mapColorMode);
}

function renderFallbackMap() {
  const container = document.getElementById("senate-map");
  if (!container || !forecast) return;
  container.innerHTML = `
    <div class="fallback-list">
      ${forecast.races.map((race) => `<a href="race.html?state=${race.state}" style="background:${ratingColor(race)}" title="${escapeHtml(ratingLabelForRace(race))}">${race.state}</a>`).join("")}
    </div>
    <p class="map-note">State map library unavailable. Race links remain available.</p>
  `;
}

async function renderStateMap() {
  const container = document.getElementById("senate-map");
  if (!container || !forecast) return;
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
        return race ? `state-shape ${bucketForRace(race)}` : "state-shape state-muted";
      })
      .attr("d", path)
      .attr("fill", (feature) => {
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        return race ? ratingColor(race) : null;
      })
      .attr("opacity", (feature) => {
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        return race ? clamp(.58 + race.winnerProbability * .42, .74, 1) : null;
      })
      .attr("tabindex", (feature) => getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]) ? 0 : -1)
      .on("mouseenter focus", (event, feature) => updateHoverCard(getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")])) )
      .on("click keydown", (event, feature) => {
        if (event.type === "keydown" && event.key !== "Enter") return;
        const race = getRace(FIPS_TO_STATE[String(feature.id).padStart(2, "0")]);
        if (race) window.location.href = `race.html?state=${race.state}`;
      })
      .append("title")
      .text((feature) => {
        const state = FIPS_TO_STATE[String(feature.id).padStart(2, "0")];
        const race = getRace(state);
        return race ? `${STATE_NAMES[state]}: ${ratingLabelForRace(race)}, ${race.winnerParty} ${pct(race.winnerProbability)}` : STATE_NAMES[state];
      });
    updateHoverCard([...forecast.races].sort((a, b) => b.tippingPower - a.tippingPower)[0]);
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

function renderMapColorControls() {
  const container = document.getElementById("map-color-controls");
  if (!container) return;
  container.innerHTML = Object.entries(MAP_COLOR_MODES).map(([mode, label]) => (
    `<button type="button" class="${mode === mapColorMode ? "active" : ""}" data-map-color="${mode}">${label}</button>`
  )).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      mapColorMode = button.dataset.mapColor || "rating";
      renderMapColorControls();
      renderLegend();
      renderStateMap();
    });
  });
}

function renderHistogram() {
  const container = document.getElementById("seat-histogram");
  if (!container || !forecast) return;
  renderSeatHistogramInto(container);
}

function renderSeatHistogramInto(container, model = forecast, options = {}) {
  const counts = model?.seatCounts || {};
  const seats = Object.keys(counts).map(Number).sort((a, b) => a - b);
  if (!seats.length) return;
  const minSeat = Math.max(options.minSeat ?? 42, Math.min(...seats));
  const maxSeat = Math.min(options.maxSeat ?? 57, Math.max(...seats));
  const maxCount = Math.max(...Object.values(counts));
  const sims = model?.settings?.simulations || Object.values(counts).reduce((a, b) => a + b, 0);
  const binCount = maxSeat - minSeat + 1;
  container.style.gridTemplateColumns = `repeat(${binCount}, minmax(0, 1fr))`;
  container.innerHTML = Array.from({ length: binCount }, (_, i) => {
    const seat = minSeat + i;
    const value = counts[seat] || 0;
    const share = sims ? value / sims : 0;
    const height = maxCount ? clamp((value / maxCount), .02, 1) : .02;
    return `<button class="seat-bin" type="button" data-tip="${seat} Democratic seats<br>${pct(share)} of simulations"><i style="--bar-scale:${height}"></i><span>${seat}</span></button>`;
  }).join("");
  bindPanelTooltipFor(container, ".seat-bin", (node) => node.dataset.tip);
}

function renderLeverageChart() {
  const chart = document.getElementById("leverage-chart");
  if (!chart || !forecast) return;
  renderLeverageInto(chart);
}

function renderLeverageInto(chart) {
  const ranked = [...forecast.races].sort((a, b) => b.tippingPower - a.tippingPower).slice(0, 9);
  const max = Math.max(...ranked.map((race) => race.tippingPower));
  chart.innerHTML = ranked.map((race) => {
    const width = max ? clamp((race.tippingPower / max) * 100, 8, 100) : 8;
    const leaderClass = leaderClassForRace(race);
    return `<a class="leverage-row ${leaderClass}" href="race.html?state=${race.state}" data-tip="${race.displayName}<br>${oneDecimal(race.tippingPower)} control tipping power<br>${pct(race.demProbability)} Democrat"><strong>${race.state}</strong><i style="width:${width}%"></i><span>${oneDecimal(race.tippingPower)}</span></a>`;
  }).join("");
  bindPanelTooltipFor(chart, ".leverage-row", (node) => node.dataset.tip);
}

function renderSenateControlPath() {
  const container = document.getElementById("senate-control-path");
  if (!container || !forecast) return;
  const demPath = forecast.controlPaths?.dem?.commonWins || [];
  const repPath = forecast.controlPaths?.rep?.commonWins || [];
  const row = (item, party) => `
    <a class="path-chip ${party === "D" ? "leads-dem" : "leads-rep"}" href="race.html?state=${escapeHtml(item.state)}">
      <strong>${escapeHtml(item.state)}</strong>
      <span>${escapeHtml((item.displayName || "").replace(" Senate", ""))}</span>
      <b>${oneDecimal(item.probability)}</b>
    </a>`;
  container.innerHTML = `
    <div>
      <h3>Democratic-control simulations</h3>
      <p>${demPath.slice(0, 8).map((item) => item.state).join(", ") || "--"}</p>
      <div class="path-chip-grid">${demPath.slice(0, 8).map((item) => row(item, "D")).join("")}</div>
    </div>
    <div>
      <h3>Republican-control simulations</h3>
      <p>${repPath.slice(0, 8).map((item) => item.state).join(", ") || "--"}</p>
      <div class="path-chip-grid">${repPath.slice(0, 8).map((item) => row(item, "R")).join("")}</div>
    </div>
  `;
}

function renderControlHistory() {
  const chart = document.getElementById("control-history-chart");
  if (!chart || !forecast) return;
  const points = forecast.controlHistory?.length ? forecast.controlHistory : [{ date: forecast.modelDate, dem: forecast.demControlProbability, rep: forecast.repControlProbability }];
  renderLineChart(chart, points, {
    label: "Chamber control probability history",
    pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(point.rep ?? 1 - point.dem)}`,
    value: (point) => point.dem,
    singleNote: "Control history starts with the first generated forecast and grows each daily run."
  });
}

function renderSeatHistory() {
  const chart = document.getElementById("seat-history-chart");
  if (!chart || !forecast) return;
  const points = forecast.seatHistory?.length ? forecast.seatHistory : [{ date: forecast.modelDate, dem: forecast.medianSeats, rep: 100 - forecast.medianSeats }];
  renderLineChart(chart, points, {
    label: "Projected Senate seats history",
    domain: [30, 70],
    ticks: [70, 60, 50, 40, 30],
    band: 3.2,
    valueFormat: (value) => value.toFixed(0),
    endLabel: (party, value) => `${party === "dem" ? "Democrat" : "Republican"} ${value.toFixed(0)}`,
    hoverLabel: (party, value) => `${party === "dem" ? "Democratic seats" : "Republican seats"} ${value.toFixed(0)}`,
    singleNote: "Seat-count history starts with the first generated forecast and grows each daily run."
  });
}

function renderRaceSelector() {
  const container = document.getElementById("race-selector");
  if (!container || !forecast) return;
  const activeState = new URLSearchParams(window.location.search).get("state")?.toUpperCase() || "OH";
  const ranked = [...forecast.races].sort((a, b) => b.tippingPower - a.tippingPower);
  container.innerHTML = ranked.map((race) => `<a class="${race.state === activeState ? "active" : ""}" href="race.html?state=${race.state}">${race.state}</a>`).join("");
}

function renderLineChart(chart, points, options) {
  const width = 760;
  const height = 310;
  const plot = { left: 54, right: 150, top: 20, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const demValue = (point) => point.dem;
  const repValue = (point) => point.rep ?? 1 - point.dem;
  const extraSeries = options.extraSeries;
  const extraValue = (point) => Number.isFinite(point?.[extraSeries?.key]) ? point[extraSeries.key] : null;
  const values = points.flatMap((point) => [demValue(point), repValue(point), extraValue(point)]).filter((value) => value !== null);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const domain = options.domain || (minValue >= .28 && maxValue <= .72 ? [.3, .7] : [0, 1]);
  const band = options.band ?? .055;
  const ticks = options.ticks || (domain[0] === .3 ? [.7, .6, .5, .4, .3] : [1, .75, .5, .25, 0]);
  const valueFormat = options.valueFormat || ((value) => (value * 100).toFixed(domain[0] === .3 ? 1 : 0));
  const endLabel = options.endLabel || ((party, value) => `${party === "dem" ? "Democrat" : "Republican"} ${oneDecimal(value)}`);
  const hoverLabel = options.hoverLabel || ((party, value) => `${party === "dem" ? "Democrat" : "Republican"} ${oneDecimal(value)}`);
  const demSeriesClass = options.demSeriesClass || "history-line-dem";
  const demBandClass = options.demBandClass || "history-band-dem";
  const demDotClass = options.demDotClass || "history-dot-dem";
  const demHoverDotClass = options.demHoverDotClass || "history-hover-dot-dem";
  const demEndLabelClass = options.demEndLabelClass || "history-end-label-dem";
  const demHoverTextClass = options.demHoverTextClass || "";
  const xFor = (index) => points.length === 1 ? plot.left + plotWidth / 2 : plot.left + index * (plotWidth / (points.length - 1));
  const yFor = (value) => plot.top + ((domain[1] - value) / (domain[1] - domain[0])) * plotHeight;
  const coords = points.map((point, index) => ({
    point,
    x: xFor(index),
    demY: yFor(demValue(point)),
    repY: yFor(repValue(point))
  }));
  const linePath = (series) => {
    if (coords.length === 1) {
      const y = series === "dem" ? coords[0].demY : coords[0].repY;
      return `M ${coords[0].x - 26} ${y} L ${coords[0].x + 26} ${y}`;
    }
    return coords.map((coord, index) => `${index ? "L" : "M"} ${coord.x} ${series === "dem" ? coord.demY : coord.repY}`).join(" ");
  };
  const areaPath = (series) => {
    const upper = coords.map((coord, index) => {
      const value = series === "dem" ? demValue(coord.point) : repValue(coord.point);
      return `${index ? "L" : "M"} ${coord.x} ${yFor(clamp(value + band, domain[0], domain[1]))}`;
    }).join(" ");
    const lower = [...coords].reverse().map((coord) => {
      const value = series === "dem" ? demValue(coord.point) : repValue(coord.point);
      return `L ${coord.x} ${yFor(clamp(value - band, domain[0], domain[1]))}`;
    }).join(" ");
    return `${upper} ${lower} Z`;
  };
  const extraAreaPath = () => {
    if (!extraSeries) return "";
    const upper = coords.map((coord, index) => {
      const value = extraValue(coord.point);
      return `${index ? "L" : "M"} ${coord.x} ${yFor(clamp((value ?? demValue(coord.point)) + band, domain[0], domain[1]))}`;
    }).join(" ");
    const lower = [...coords].reverse().map((coord) => {
      const value = extraValue(coord.point);
      return `L ${coord.x} ${yFor(clamp((value ?? demValue(coord.point)) - band, domain[0], domain[1]))}`;
    }).join(" ");
    return `${upper} ${lower} Z`;
  };
  const firstDate = String(points[0].date).slice(5);
  const lastDate = String(points[points.length - 1].date).slice(5);
  const latest = coords[coords.length - 1];
  const latestExtraValue = extraSeries ? extraValue(latest.point) : null;
  const latestExtraY = latestExtraValue === null ? null : yFor(latestExtraValue);
  const closeEndLabels = Math.abs(latest.demY - latest.repY) < 22;
  const demLabelY = closeEndLabels ? latest.demY - 12 : latest.demY <= latest.repY ? latest.demY - 4 : latest.demY + 14;
  const repLabelY = closeEndLabels ? latest.repY + 22 : latest.repY <= latest.demY ? latest.repY - 4 : latest.repY + 14;
  const extraLabelY = latestExtraY === null ? null : latestExtraY - 6;
  const annotations = (options.annotations || CHART_ANNOTATIONS).map((annotation) => {
    const index = points.findIndex((point) => point.date === annotation.date);
    if (index === -1) return null;
    const x = coords[index].x;
    const labelX = clamp(x - 12, plot.left + 18, width - plot.right - 18);
    const labelY = plot.top + 96;
    return `<g class="history-annotation"><path d="M${x} ${plot.top}V${height - plot.bottom}"></path><text x="${labelX}" y="${labelY}" transform="rotate(-90 ${labelX} ${labelY})">${annotation.label}</text></g>`;
  }).filter(Boolean).join("");
  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.label}">
      ${ticks.map((tick) => `<path class="history-grid ${tick === (options.midline ?? .5) ? "history-midline" : ""}" d="M${plot.left} ${yFor(tick)}H${width - plot.right}"></path><text class="history-axis" x="${plot.left - 12}" y="${yFor(tick) + 4}">${valueFormat(tick)}</text>`).join("")}
      ${coords.length > 1 ? [1, 2, 3, 4].map((step) => {
        const x = plot.left + (plotWidth / 5) * step;
        return `<path class="history-vgrid" d="M${x} ${plot.top}V${height - plot.bottom}"></path>`;
      }).join("") : ""}
      <path class="history-band ${demBandClass}" d="${areaPath("dem")}"></path>
      <path class="history-band history-band-rep" d="${areaPath("rep")}"></path>
      ${extraSeries ? `<path class="history-band history-band-extra" d="${extraAreaPath()}"></path>` : ""}
      <path class="history-line ${demSeriesClass}" d="${linePath("dem")}"></path>
      <path class="history-line history-line-rep" d="${linePath("rep")}"></path>
      ${extraSeries ? `<path class="history-line ${extraSeries.className}" d="${coords.filter((coord) => extraValue(coord.point) !== null).map((coord, index) => `${index ? "L" : "M"} ${coord.x} ${yFor(extraValue(coord.point))}`).join(" ")}"></path>` : ""}
      ${annotations}
      ${coords.map(({ x, demY, repY }, index) => `<g class="history-point" tabindex="0" data-index="${index}"><circle class="history-dot ${demDotClass}" cx="${x}" cy="${demY}" r="${coords.length === 1 ? 4.8 : 3.3}"></circle><circle class="history-dot history-dot-rep" cx="${x}" cy="${repY}" r="${coords.length === 1 ? 4.8 : 3.3}"></circle></g>`).join("")}
      ${extraSeries ? coords.map(({ x, point }, index) => {
        const value = extraValue(point);
        return value === null ? "" : `<g class="history-extra-point" tabindex="0" data-index="${index}"><circle class="history-dot ${extraSeries.dotClassName}" cx="${x}" cy="${yFor(value)}" r="${coords.length === 1 ? 4.8 : 3.3}"></circle></g>`;
      }).join("") : ""}
      <text class="history-date history-date-start" x="${plot.left}" y="${height - 18}">${firstDate}</text>
      <text class="history-date history-date-end" x="${width - plot.right}" y="${height - 18}">${lastDate}</text>
      <text class="history-end-label ${demEndLabelClass}" x="${latest.x + 11}" y="${demLabelY}">${endLabel("dem", demValue(latest.point))}</text>
      <text class="history-end-label history-end-label-rep" x="${latest.x + 11}" y="${repLabelY}">${endLabel("rep", repValue(latest.point))}</text>
      ${extraSeries && latestExtraY !== null ? `<text class="history-end-label ${extraSeries.labelClassName}" x="${latest.x + 11}" y="${extraLabelY}">${extraSeries.name} ${oneDecimal(latestExtraValue)}</text>` : ""}
      <g class="history-hover" style="display:none">
        <path class="history-hover-rule"></path>
        <circle class="history-hover-dot history-hover-dot-dem ${demHoverDotClass === "history-hover-dot-dem" ? "" : demHoverDotClass}" r="4.5"></circle>
        <circle class="history-hover-dot history-hover-dot-rep" r="4.5"></circle>
        ${extraSeries ? `<circle class="history-hover-dot history-hover-dot-extra" r="4.5"></circle>` : ""}
        <rect class="history-hover-box" width="150" height="${extraSeries ? 72 : 56}" rx="2"></rect>
        <text class="history-hover-title"></text>
        <text class="history-hover-dem ${demHoverTextClass}"></text>
        <text class="history-hover-rep"></text>
        ${extraSeries ? `<text class="history-hover-extra"></text>` : ""}
      </g>
      <rect class="history-overlay" x="${plot.left}" y="${plot.top}" width="${plotWidth}" height="${plotHeight}" tabindex="0"></rect>
    </svg>
  `;
  const svg = chart.querySelector("svg");
  const overlay = chart.querySelector(".history-overlay");
  const hover = chart.querySelector(".history-hover");
  const hoverRule = chart.querySelector(".history-hover-rule");
  const hoverDemDot = chart.querySelector(".history-hover-dot-dem");
  const hoverRepDot = chart.querySelector(".history-hover-dot-rep");
  const hoverExtraDot = chart.querySelector(".history-hover-dot-extra");
  const hoverBox = chart.querySelector(".history-hover-box");
  const hoverTitle = chart.querySelector(".history-hover-title");
  const hoverDem = chart.querySelector(".history-hover-dem");
  const hoverRep = chart.querySelector(".history-hover-rep");
  const hoverExtra = chart.querySelector(".history-hover-extra");
  const showIndex = (index) => {
    const coord = coords[clamp(index, 0, coords.length - 1)];
    const dem = demValue(coord.point);
    const rep = repValue(coord.point);
    const extra = extraSeries ? extraValue(coord.point) : null;
    const activeYs = [coord.demY, coord.repY, extra === null ? null : yFor(extra)].filter((value) => value !== null);
    const boxX = clamp(coord.x + 12, plot.left + 4, width - plot.right - 154);
    const boxY = clamp(Math.min(...activeYs) - (extraSeries ? 84 : 68), plot.top + 4, height - plot.bottom - (extraSeries ? 78 : 62));
    hover.style.display = "block";
    hoverRule.setAttribute("d", `M${coord.x} ${plot.top}V${height - plot.bottom}`);
    hoverDemDot.setAttribute("cx", coord.x);
    hoverDemDot.setAttribute("cy", coord.demY);
    hoverRepDot.setAttribute("cx", coord.x);
    hoverRepDot.setAttribute("cy", coord.repY);
    if (extraSeries && hoverExtraDot && extra !== null) {
      hoverExtraDot.setAttribute("cx", coord.x);
      hoverExtraDot.setAttribute("cy", yFor(extra));
    }
    hoverBox.setAttribute("x", boxX);
    hoverBox.setAttribute("y", boxY);
    hoverTitle.setAttribute("x", boxX + 9);
    hoverTitle.setAttribute("y", boxY + 16);
    hoverDem.setAttribute("x", boxX + 9);
    hoverDem.setAttribute("y", boxY + 34);
    hoverRep.setAttribute("x", boxX + 9);
    hoverRep.setAttribute("y", boxY + 48);
    if (extraSeries && hoverExtra && extra !== null) {
      hoverExtra.setAttribute("x", boxX + 9);
      hoverExtra.setAttribute("y", boxY + 62);
      hoverExtra.textContent = `${extraSeries.name} ${oneDecimal(extra)}`;
    }
    hoverTitle.textContent = coord.point.date;
    hoverDem.textContent = hoverLabel("dem", dem);
    hoverRep.textContent = hoverLabel("rep", rep);
  };
  const indexFromEvent = (event) => {
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const x = (event.clientX - rect.left) * ratio;
    if (points.length === 1) return 0;
    return Math.round(clamp((x - plot.left) / plotWidth, 0, 1) * (points.length - 1));
  };
  overlay.addEventListener("pointerenter", (event) => showIndex(indexFromEvent(event)));
  overlay.addEventListener("pointermove", (event) => showIndex(indexFromEvent(event)));
  overlay.addEventListener("click", (event) => showIndex(indexFromEvent(event)));
  overlay.addEventListener("pointerleave", () => {
    hover.style.display = "none";
  });
  overlay.addEventListener("focus", () => showIndex(points.length - 1));
  chart.querySelectorAll(".history-point").forEach((node) => {
    const handler = () => showIndex(Number(node.dataset.index));
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
  });
}

function renderHistory(race) {
  const chart = document.getElementById("race-history");
  if (!chart) return;
  let points = race.history?.length ? race.history : [{ date: forecast.modelDate, dem: race.demProbability }];
  const bodnar = (race.extraCandidates || []).find((candidate) => candidate.name === "Seth Bodnar");
  if (bodnar) {
    const bodnarHistory = new Map((race.extraHistory || []).map((point) => [point.date, point["Seth Bodnar"]]));
    points = points.map((point) => ({ ...point, extra: bodnarHistory.get(point.date) ?? null }));
  }
  const demIsIndependent = race.demDisplayParty === "I" || race.dem.toLowerCase().includes("independent");
  const demHistoryLabel = demIsIndependent ? candidateDisplayName(race, "D") : "Democrat";
  renderLineChart(chart, points, {
    label: `${race.displayName} probability history`,
    pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(1 - point.dem)}`,
    extraSeries: bodnar ? { key: "extra", name: "Seth Bodnar", className: "history-line-extra", dotClassName: "history-dot-extra", labelClassName: "history-end-label-extra", colorLabel: "Seth Bodnar" } : null,
    demSeriesClass: demIsIndependent ? "history-line-ind" : "history-line-dem",
    demBandClass: demIsIndependent ? "history-band-ind" : "history-band-dem",
    demDotClass: demIsIndependent ? "history-dot-ind" : "history-dot-dem",
    demHoverDotClass: demIsIndependent ? "history-hover-dot-ind" : "history-hover-dot-dem",
    demEndLabelClass: demIsIndependent ? "history-end-label-ind" : "history-end-label-dem",
    demHoverTextClass: demIsIndependent ? "history-hover-ind" : "",
    endLabel: demIsIndependent ? (party, value) => `${party === "dem" ? demHistoryLabel : "Republican"} ${oneDecimal(value)}` : null,
    hoverLabel: demIsIndependent ? (party, value) => `${party === "dem" ? demHistoryLabel : "Republican"} ${oneDecimal(value)}` : null,
    annotations: race.state === "MT" ? [...CHART_ANNOTATIONS, ...MONTANA_CHART_ANNOTATIONS] : CHART_ANNOTATIONS,
    value: (point) => point.dem,
    singleNote: "State history starts with the first generated forecast and grows each daily run."
  });
}

function renderPrimaryPanel(race) {
  setText("race-primary", `${race.primary} / ${race.primaryDate}`);
  setText("race-independent", race.independent);
  setText("race-caucus", race.caucusTarget === "D" ? "Counts as Democrat for control if elected" : "Counts as Republican for control");
  setText("race-dem-candidate", race.dem);
  setText("race-rep-candidate", race.rep);
  const extras = (race.extraCandidates || []).map((candidate) => `${candidate.name} (${candidate.note || candidate.party || "additional option"})`).join("; ");
  setText("race-primary-summary", extras ? `${race.primarySummary} Additional tracked option: ${extras}.` : race.primarySummary);
  const demNode = document.getElementById("race-dem-candidate");
  if (demNode && demNode.parentElement) {
    const isIndependent = race.demDisplayParty === "I" || race.dem.toLowerCase().includes("independent");
    demNode.parentElement.classList.toggle("independent-candidate", isIndependent);
    const label = demNode.parentElement.querySelector(".meta");
    if (label) label.textContent = isIndependent ? "Independent" : "Democrat";
  }
}

function renderRaceInputCards(race) {
  const container = document.getElementById("race-input-cards");
  if (!container) return;
  const finance = race.sourceInputs?.openFec;
  const pollRows = [
    `<li>${pollingInputText(race)}</li>`,
    race.pollSignal ? `<li>${race.pollSignal.pollCount} polls, ${race.pollSignal.pollsters} pollsters, ${(race.pollSignal.blendWeight * 100).toFixed(0)}% blend weight</li>` : `<li>Poll weight is zero until usable public race polls are found.</li>`,
    race.sourceInputs?.twoSeventyToWin ? `<li>270toWin rows blended: ${race.sourceInputs.twoSeventyToWin.polls}</li>` : "",
    race.sourceInputs?.realClearPolling ? `<li>RealClearPolling rows blended: ${race.sourceInputs.realClearPolling.polls}</li>` : ""
  ].filter(Boolean).join("");
  const fundamentalRows = [
    `<li>Rating input: ${escapeHtml(race.rating)}</li>`,
    `<li>Baseline margin: ${signedPointMargin(race.margin)}</li>`,
    `<li>Primary risk: ${Number(race.primaryRisk || 0).toFixed(1)} pts</li>`,
    `<li>Incumbency adjustment: ${signedPointMargin(race.incumbencyAdjustment || 0)}</li>`,
    `<li>Candidate-history adjustment: ${signedPointMargin(race.candidateHistoryAdjustment || 0)}</li>`
  ].join("");
  const financeRows = finance ? [
    `<li>Finance signal: ${Number(finance.financeSignal || 0).toFixed(2)} pts</li>`,
    `<li>Dem receipts: $${Math.round(finance.demReceipts || 0).toLocaleString()}</li>`,
    `<li>Rep receipts: $${Math.round(finance.repReceipts || 0).toLocaleString()}</li>`,
    `<li>Dem cash: $${Math.round(finance.demCash || 0).toLocaleString()}</li>`,
    `<li>Rep cash: $${Math.round(finance.repCash || 0).toLocaleString()}</li>`
  ].join("") : `<li>No matched OpenFEC state-race finance row in this run.</li>`;
  const candidateRows = [
    `<li>${escapeHtml(candidateDisplayName(race, "D"))}: ${escapeHtml(race.demStatus || "unresolved")}</li>`,
    `<li>${escapeHtml(candidateDisplayName(race, "R"))}: ${escapeHtml(race.repStatus || "unresolved")}</li>`,
    `<li>${escapeHtml(race.primarySummary || "")}</li>`,
    ...(race.extraCandidates || []).map((candidate) => `<li>${escapeHtml(candidate.name)}: ${escapeHtml(candidate.note || candidate.party || "tracked option")}</li>`)
  ].join("");
  const driverRows = (race.movementDrivers || []).length
    ? race.movementDrivers.map((driver) => `<li><strong>${escapeHtml(driver.label)} ${signedDriverChange(driver.change)}</strong> ${escapeHtml(driver.detail || "")}</li>`).join("")
    : `<li>No previous generated run to compare.</li>`;
  const badgeRows = (race.uncertaintyBadges || []).map((badge) => `<li>${escapeHtml(badge)}</li>`).join("");
  container.innerHTML = `
    <details open><summary>Why it moved</summary><ul>${driverRows}</ul></details>
    <details open><summary>Polling</summary><ul>${pollRows}</ul></details>
    <details><summary>Fundamentals</summary><ul>${fundamentalRows}</ul></details>
    <details><summary>Finance</summary><ul>${financeRows}</ul></details>
    <details><summary>Candidates</summary><ul>${candidateRows}</ul></details>
    <details><summary>Input quality</summary><ul><li>${inputQualityText(race)}</li>${badgeRows}${(race.inputQuality?.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></details>
  `;
}

function renderRacePage() {
  const page = document.getElementById("race-detail-page");
  if (!page || !forecast) return;
  const state = new URLSearchParams(window.location.search).get("state")?.toUpperCase() || "OH";
  const race = getRace(state) || getRace("OH") || forecast.races[0];
  document.title = `${race.displayName} | Capitol Forecast`;
  setText("race-state", race.state);
  setText("race-name", race.displayName);
  setText("race-incumbent", race.incumbent);
  setText("race-seat", race.seat);
  setText("race-rating", race.rating);
  setText("race-winner", `${race.winnerParty === "D" ? candidateChanceLabel(race, "D") : "Republican"} ${pct(race.winnerProbability)}`);
  setText("race-note", race.summary || race.note);
  setText("race-dem", pct(race.demProbability));
  setText("race-rep", pct(1 - race.demProbability));
  const demWinNode = document.getElementById("race-dem");
  if (demWinNode?.parentElement) {
    const label = demWinNode.parentElement.querySelector("dt");
    if (label) label.textContent = `${candidateChanceLabel(race, "D")} win`;
  }
  setText("race-margin", signedPointMargin(race.margin));
  setText("race-prob-margin", signedMargin(race.demProbability));
  setText("race-movement", movementText(race));
  setText("race-input-quality", inputQualityText(race));
  setText("race-tipping", oneDecimal(race.tippingPower));
  setText("race-polling", pollingInputText(race));
  const demTrack = document.getElementById("race-dem-track");
  const repTrack = document.getElementById("race-rep-track");
  if (demTrack && repTrack) {
    demTrack.style.width = `${race.demProbability * 100}%`;
    repTrack.style.width = `${(1 - race.demProbability) * 100}%`;
    demTrack.parentElement?.classList.toggle("independent-track", race.demDisplayParty === "I" || race.dem.toLowerCase().includes("independent"));
  }
  renderHistory(race);
  renderPrimaryPanel(race);
  renderRaceInputCards(race);
}

function renderSourceStatus() {
  const container = document.getElementById("source-status");
  if (!container || !forecast) return;
  const status = forecast.sourceStatus || {};
  const summary = forecast.sourceSummary || {};
  const rows = [
    ["VoteHub polling", status.votehubGenericBallot, `${summary.votehub?.usableGenericBallotPolls ?? 0} usable generic-ballot polls / D ${summary.votehub?.genericBallotMargin?.toFixed?.(1) ?? "--"}`],
    ["Generic blend", status.checkedAt ? { ok: summary.genericPolling?.sources?.length > 0, status: "computed", ms: 0 } : null, `${summary.genericPolling?.sources?.length ?? 0} sources / D ${summary.genericPolling?.genericBallotMargin?.toFixed?.(1) ?? "--"}`],
    ["DDHQ generic ballot", status.ddhqGenericBallot, `${summary.ddhqGeneric?.polls ?? 0} polls / D ${summary.ddhqGeneric?.genericBallotMargin?.toFixed?.(1) ?? "--"}`],
    ["Pollfinity averages", status.pollfinityAverages, `${summary.pollfinity?.genericBallotPolls ?? 0} generic polls / approval net ${summary.pollfinity?.approvalNet?.toFixed?.(1) ?? "--"}`],
    ["USPollingData generic", status.usPollingDataGenericBallot, `D ${summary.usPollingDataGeneric?.genericBallotMargin?.toFixed?.(1) ?? "--"}`],
    ["RealClearPolling", status.realClearPollingSenate, `${summary.realClearPolling?.usablePolls ?? 0} usable race polls / ${summary.realClearPolling?.states ?? 0} states`],
    ["270toWin race polls", status.twoSeventyToWinRacePolls, `${summary.twoSeventyToWin?.usablePolls ?? 0} usable race polls / ${summary.twoSeventyToWin?.states ?? 0} states`],
    ["270toWin latest polls", status.twoSeventyToWinLatestPolls, status.twoSeventyToWinLatestPolls?.ok ? "Reference page reachable" : "Reference page not loaded"],
    ["Race to the WH polls", status.raceToTheWhSenatePolls, status.raceToTheWhSenatePolls?.ok ? "Reference page reachable" : "Reference page not loaded"],
    ["Electoral-Vote CSV", status.electoralVoteSenatePolls, `${status.electoralVoteSenatePolls?.currentCycleRows ?? 0} current poll rows`],
    ["USPollingData Senate", status.usPollingDataSenatePolling, status.usPollingDataSenatePolling?.ok ? "Reference page reachable" : "Reference page not loaded"],
    ["OpenFEC finance", status.openFecCandidateSummary, `${summary.fecStates ?? 0} Senate states`],
    ["Census population", status.censusPopulation, `${summary.censusStates ?? 0} states from no-key CSV`],
    ["Historical results", status.mitSenateReturns, `${summary.mitStates ?? 0} states from MIT/MEDSL; used instead of broken civicAPI endpoints`]
  ];
  container.innerHTML = rows.map(([label, item, detail]) => {
    const ok = Boolean(item?.ok);
    const state = ok ? "Loaded" : item?.status === "missing-key" ? "Needs key" : "Not loaded";
    const meta = item?.ms ? `${item.ms} ms` : item?.status || "";
    return `
      <div class="source-status-card ${ok ? "is-ok" : "is-warn"}">
        <span class="source-tag">${state}</span>
        <h3>${label}</h3>
        <p>${detail}</p>
        <p class="meta">${meta}</p>
      </div>
    `;
  }).join("");
}

function houseDistrictBucket(district) {
  if (!district) return "tossup";
  if (houseColorMode === "margin") return RATING_BUCKET[ratingFromSignedValue(district.margin, { tilt: 1, lean: 3, likely: 7, safe: 12 })] || "tossup";
  if (houseColorMode === "probability") return RATING_BUCKET[ratingFromSignedValue((district.demProbability - .5) * 100, { tilt: 2.5, lean: 10, likely: 25, safe: 45 })] || "tossup";
  return RATING_BUCKET[district.rating] || "tossup";
}

function houseDistrictColorLabel(district) {
  if (!district) return "Toss-up";
  if (houseColorMode === "margin") return ratingFromSignedValue(district.margin, { tilt: 1, lean: 3, likely: 7, safe: 12 });
  if (houseColorMode === "probability") return ratingFromSignedValue((district.demProbability - .5) * 100, { tilt: 2.5, lean: 10, likely: 25, safe: 45 });
  return district.rating;
}

function houseLeaderClass(district) {
  if (!district) return "";
  if (district.rating === "Toss-up") return "leads-tossup";
  return district.winnerParty === "D" ? "leads-dem" : "leads-rep";
}

function houseDistrictLabel(district) {
  return `${district.id} ${district.label || ""}`.trim();
}

function getHouseDistrict(id) {
  const normalized = String(id || "").toUpperCase().replace(/\s+/g, "");
  if (!houseForecast || !normalized) return null;
  const match = normalized.match(/^([A-Z]{2})-?(AL|\d{1,2})$/);
  if (!match) return null;
  const districtId = `${match[1]}-${match[2] === "AL" ? "AL" : String(Number(match[2])).padStart(2, "0")}`;
  return houseForecast.districts.find((district) => district.id === districtId) || null;
}

function houseDistrictMarkup(district) {
  if (!district) return "";
  const winner = district.winnerParty === "D" ? "Democrat" : "Republican";
  const colorLabel = houseDistrictColorLabel(district);
  const inputs = district.sourceInputs || {};
  const baselineLine = [
    `2024 pres ${signedPointMargin(inputs.presidentialBaseline)}`,
    `2022 House ${signedPointMargin(inputs.congressionalBaseline)}`,
    `generic ${signedPointMargin(inputs.genericBallotShift)}`,
    district.open ? "open seat" : "incumbent seat"
  ].join(" / ");
  return `
    <span class="race-kicker">${escapeHtml(houseDistrictLabel(district))}</span>
    <div class="map-card-title">
      <div class="state-code">${escapeHtml(district.id)}</div>
      <span class="rating-pill ${houseDistrictBucket(district)}">${escapeHtml(colorLabel)}</span>
    </div>
    <h3>${winner} ${oneDecimal(district.winnerProbability)}</h3>
    <div class="candidate-table" aria-label="${district.id} district forecast">
      <div class="candidate-table-head"><span>Candidate</span><span>Chance</span></div>
      <div class="candidate-row dem-row"><span>${escapeHtml(district.demCandidate || "Democrat")} <i class="party-badge dem-badge">D</i></span><strong>${oneDecimal(district.demProbability)}</strong></div>
      <div class="candidate-row rep-row"><span>${escapeHtml(district.repCandidate || "Republican")} <i class="party-badge rep-badge">R</i></span><strong>${oneDecimal(district.repProbability)}</strong></div>
      <div class="candidate-margin"><span>Projected margin</span><strong>${signedPointMargin(district.margin)}</strong></div>
    </div>
    <p class="meta">${escapeHtml(baselineLine)}</p>
    <p class="meta">${escapeHtml(district.sourceBlend || "Cook")} / rating baseline ${signedPointMargin(inputs.ratingBaseline)} / contextual baseline ${signedPointMargin(inputs.contextualBaseline)}</p>
  `;
}

function controlProbabilityPhrase(probability) {
  if (probability >= .9) return "strongly favored";
  if (probability >= .75) return "clearly favored";
  if (probability >= .6) return "favored";
  return "narrowly favored";
}

function updateHouseDistrictCard(district) {
  if (district?.id) selectedHouseDistrictId = district.id;
  const card = document.getElementById("house-district-card");
  if (card) card.innerHTML = houseDistrictMarkup(district);
}

function renderHouseCartogram() {
  const container = document.getElementById("house-district-cartogram");
  if (!container || !houseForecast) return;
  container.hidden = houseViewMode !== "board";
  if (houseViewMode !== "board") return;
  const districts = [...houseForecast.districts].sort((a, b) => {
    const ratingDelta = Object.values(RATING_BUCKET).indexOf(houseDistrictBucket(a)) - Object.values(RATING_BUCKET).indexOf(houseDistrictBucket(b));
    return ratingDelta || a.id.localeCompare(b.id, undefined, { numeric: true });
  });
  container.innerHTML = districts.map((district) => `
    <button class="district-cell ${houseDistrictBucket(district)} ${houseLeaderClass(district)}"
      type="button"
      aria-label="${escapeHtml(houseDistrictLabel(district))}, ${escapeHtml(houseDistrictColorLabel(district))}"
      data-district="${escapeHtml(district.id)}"
      style="background:${ratingColor(district, houseColorMode)}"
      title="${escapeHtml(houseDistrictLabel(district))}">
      <span>${escapeHtml(district.id.replace("-", ""))}</span>
    </button>
  `).join("");
  container.querySelectorAll(".district-cell").forEach((node) => {
    const district = houseForecast.districts.find((item) => item.id === node.dataset.district);
    const handler = () => updateHouseDistrictCard(district);
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
  });
  updateHouseDistrictCard(houseForecast.districts.find((district) => district.id === selectedHouseDistrictId) || houseForecast.decisiveDistricts?.[0] || houseForecast.districts[0]);
}

function renderHouseDistrictList() {
  const container = document.getElementById("house-district-list");
  if (!container || !houseForecast) return;
  container.hidden = houseViewMode !== "list";
  if (houseViewMode !== "list") return;
  const districts = [...houseForecast.districts].sort((a, b) => {
    const competitiveDelta = Math.abs(a.margin) - Math.abs(b.margin);
    return competitiveDelta || a.id.localeCompare(b.id, undefined, { numeric: true });
  });
  container.innerHTML = districts.map((district) => `
    <button class="district-list-row ${houseLeaderClass(district)}" type="button" data-district="${escapeHtml(district.id)}">
      <strong>${escapeHtml(district.id)}</strong>
      <span>${escapeHtml(district.label || (district.open ? "Open seat" : ""))}</span>
      <b class="rating-pill ${houseDistrictBucket(district)}">${escapeHtml(houseDistrictColorLabel(district))}</b>
      <em>${district.winnerParty === "D" ? "D" : "R"} ${oneDecimal(district.winnerProbability)}</em>
      <i>${signedPointMargin(district.margin)}</i>
    </button>
  `).join("");
  container.querySelectorAll(".district-list-row").forEach((node) => {
    const district = houseForecast.districts.find((item) => item.id === node.dataset.district);
    const handler = () => updateHouseDistrictCard(district);
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
  });
  updateHouseDistrictCard(houseForecast.districts.find((district) => district.id === selectedHouseDistrictId) || houseForecast.decisiveDistricts?.[0] || houseForecast.districts[0]);
}

function houseDistrictIdFromFeature(feature) {
  const props = feature?.properties || {};
  const state = props.STATE_ABBR;
  const district = String(props.CDFIPS || "").padStart(2, "0");
  if (!state || !district) return null;
  return `${state}-${district === "00" ? "AL" : district}`;
}

async function renderHouseDistrictMap() {
  const container = document.getElementById("house-district-map");
  if (!container || !houseForecast) return;
  container.hidden = houseViewMode !== "map";
  if (houseViewMode !== "map") return;
  if (!window.d3) {
    container.innerHTML = `<p class="map-note">District shape map library unavailable.</p>`;
    return;
  }
  if (container.dataset.loaded === "true") return;
  try {
    const geo = await d3.json(HOUSE_DISTRICT_MAP_URL);
    const features = geo.features || [];
    const width = 980;
    const height = 610;
    const projection = d3.geoAlbersUsa().fitSize([width, height], { type: "FeatureCollection", features });
    const path = d3.geoPath(projection);
    container.innerHTML = "";
    const svg = d3.select(container).append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "House district shape map");
    svg.selectAll("path")
      .data(features)
      .join("path")
      .attr("class", (feature) => {
        const district = houseForecast.districts.find((item) => item.id === houseDistrictIdFromFeature(feature));
        return district ? `district-shape ${houseDistrictBucket(district)}` : "district-shape state-muted";
      })
      .attr("d", path)
      .attr("fill", (feature) => {
        const district = houseForecast.districts.find((item) => item.id === houseDistrictIdFromFeature(feature));
        return district ? ratingColor(district, houseColorMode) : null;
      })
      .attr("tabindex", (feature) => houseForecast.districts.find((item) => item.id === houseDistrictIdFromFeature(feature)) ? 0 : -1)
      .on("mouseenter focus", (event, feature) => {
        const district = houseForecast.districts.find((item) => item.id === houseDistrictIdFromFeature(feature));
        updateHouseDistrictCard(district);
      })
      .on("click keydown", (event, feature) => {
        if (event.type === "keydown" && event.key !== "Enter") return;
        const district = houseForecast.districts.find((item) => item.id === houseDistrictIdFromFeature(feature));
        updateHouseDistrictCard(district);
      })
      .append("title")
      .text((feature) => {
        const district = houseForecast.districts.find((item) => item.id === houseDistrictIdFromFeature(feature));
        return district ? `${houseDistrictLabel(district)}: ${district.rating}` : "";
      });
    container.dataset.loaded = "true";
  } catch (error) {
    container.innerHTML = `<p class="map-note">District shape map could not load. The cartogram remains available.</p>`;
  }
}

function renderHouseViewControls() {
  const container = document.getElementById("house-view-controls");
  if (!container) return;
  container.innerHTML = Object.entries(HOUSE_COLOR_MODES).map(([mode, label]) => (
    `<button type="button" class="${mode === houseColorMode ? "active" : ""}" data-house-color="${mode}">${label}</button>`
  )).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      houseColorMode = button.dataset.houseColor || "rating";
      renderHouseViewControls();
      renderHouseLegend();
      renderHouseCartogram();
      renderHouseDistrictList();
    });
  });
}

function renderHousePreviewControls() {
  const container = document.getElementById("house-preview-controls");
  if (!container) return;
  container.innerHTML = Object.entries(HOUSE_PREVIEW_MODES).map(([mode, label]) => (
    `<button type="button" class="${mode === houseViewMode ? "active" : ""}" data-house-preview="${mode}">${label}</button>`
  )).join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      houseViewMode = button.dataset.housePreview || "board";
      renderHousePreviewControls();
      renderHouseCartogram();
      renderHouseDistrictList();
    });
  });
}

function renderHouseLegend() {
  const legend = document.getElementById("house-rating-legend");
  if (!legend) return;
  const ratings = ["Safe D", "Likely D", "Lean D", "Tilt D", "Toss-up", "Tilt R", "Lean R", "Likely R", "Safe R"];
  legend.innerHTML = ratings.map((rating) => `<span><i class="${RATING_BUCKET[rating]}"></i>${rating}</span>`).join("");
}

function renderHouseSummary() {
  if (!houseForecast) return;
  const favoredIsDem = houseForecast.demControlProbability >= houseForecast.repControlProbability;
  const favoredSide = favoredIsDem ? "Democrats" : "Republicans";
  const favoredProbability = Math.max(houseForecast.demControlProbability, houseForecast.repControlProbability);
  const panel = document.getElementById("house-odds-panel");
  panel?.classList.toggle("control-dem", favoredIsDem);
  panel?.classList.toggle("control-rep", !favoredIsDem);
  const odds = document.getElementById("house-odds-phrase");
  if (odds) odds.innerHTML = `<span>${favoredSide} favored</span><strong>${pct(favoredProbability)}</strong>`;
  setText("house-control-headline", `${favoredSide} ${controlProbabilityPhrase(favoredProbability)}`);
  setText("house-dem-control", oneDecimal(houseForecast.demControlProbability));
  setText("house-rep-control", oneDecimal(houseForecast.repControlProbability));
  setText("house-median-seats", `${houseForecast.medianSeats} D / ${435 - houseForecast.medianSeats} R`);
  setText("house-run-date", houseForecast.runDate || houseForecast.modelDate || "--");
  const demBar = document.getElementById("house-dem-control-bar");
  const repBar = document.getElementById("house-rep-control-bar");
  if (demBar && repBar) {
    demBar.style.width = `${houseForecast.demControlProbability * 100}%`;
    repBar.style.width = `${houseForecast.repControlProbability * 100}%`;
  }
}

function renderHouseSeatHistogram() {
  const container = document.getElementById("house-seat-histogram");
  if (!container || !houseForecast) return;
  const seats = Object.keys(houseForecast.seatCounts || {}).map(Number);
  const center = houseForecast.medianSeats || 218;
  const minSeat = Math.max(200, center - 7);
  const maxSeat = Math.min(235, center + 7);
  renderSeatHistogramInto(container, houseForecast, { minSeat, maxSeat });
}

function renderHouseControlHistory() {
  const chart = document.getElementById("house-control-history-chart");
  if (!chart || !houseForecast) return;
  const points = houseForecast.controlHistory?.length ? houseForecast.controlHistory : [{ date: houseForecast.modelDate, dem: houseForecast.demControlProbability, rep: houseForecast.repControlProbability }];
  renderLineChart(chart, points, {
    label: "House control probability history",
    pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(point.rep ?? 1 - point.dem)}`,
    value: (point) => point.dem
  });
}

function renderHouseSeatHistory() {
  const chart = document.getElementById("house-seat-history-chart");
  if (!chart || !houseForecast) return;
  const points = houseForecast.seatHistory?.length ? houseForecast.seatHistory : [{ date: houseForecast.modelDate, dem: houseForecast.medianSeats, rep: 435 - houseForecast.medianSeats }];
  const values = points.flatMap((point) => [point.dem, point.rep ?? 435 - point.dem]);
  const min = Math.max(190, Math.floor((Math.min(...values) - 5) / 5) * 5);
  const max = Math.min(245, Math.ceil((Math.max(...values) + 5) / 5) * 5);
  const midpoint = 217.5;
  const ticks = Array.from(new Set([max, Math.round((max + midpoint) / 2), midpoint, Math.round((min + midpoint) / 2), min]));
  renderLineChart(chart, points, {
    label: "Projected House seats history",
    pointHtml: (point) => `${point.date}<br>D ${point.dem} / R ${point.rep ?? 435 - point.dem}`,
    value: (point) => point.dem,
    domain: [min, max],
    ticks,
    midline: midpoint,
    band: 3,
    valueFormat: (value) => Number.isInteger(value) ? String(value) : value.toFixed(1),
    endLabel: (party, value) => `${party === "dem" ? "Democrat" : "Republican"} ${Math.round(value)}`,
    hoverLabel: (party, value) => `${party === "dem" ? "Democrat" : "Republican"} ${Math.round(value)}`
  });
}

function renderHouseDecisiveDistricts() {
  const container = document.getElementById("house-decisive-districts");
  if (!container || !houseForecast) return;
  const ranked = houseForecast.decisiveDistricts || [];
  const max = Math.max(...ranked.map((district) => district.leverage || 0), .01);
  container.innerHTML = ranked.map((district) => {
    const width = clamp(((district.leverage || 0) / max) * 100, 8, 100);
    return `<button class="leverage-row ${houseLeaderClass(district)}" type="button" data-district="${escapeHtml(district.id)}" data-tip="${escapeHtml(houseDistrictLabel(district))}<br>${oneDecimal(district.winnerProbability)} ${district.winnerParty === "D" ? "Democrat" : "Republican"}<br>${escapeHtml(district.rating)}"><strong>${escapeHtml(district.id)}</strong><i style="width:${width}%"></i><span>${oneDecimal(district.leverage || 0)}</span></button>`;
  }).join("");
  container.querySelectorAll(".leverage-row").forEach((node) => {
    const district = houseForecast.districts.find((item) => item.id === node.dataset.district);
    node.addEventListener("mouseenter", () => updateHouseDistrictCard(district));
    node.addEventListener("focus", () => updateHouseDistrictCard(district));
    node.addEventListener("click", () => updateHouseDistrictCard(district));
  });
  bindPanelTooltipFor(container, ".leverage-row", (node) => node.dataset.tip);
}

function renderHouseControlPath() {
  const container = document.getElementById("house-control-path");
  if (!container || !houseForecast) return;
  const dem = houseForecast.controlPaths?.dem || {};
  const rep = houseForecast.controlPaths?.rep || {};
  container.innerHTML = `
    <div>
      <h3>Democratic-control simulations</h3>
      <div class="path-stat-grid">
        <div><span>Toss-up districts won</span><strong>${dem.tossupWins ?? "--"}</strong></div>
        <div><span>Tilt R districts won</span><strong>${dem.tiltRWins ?? "--"}</strong></div>
        <div><span>Lean R districts won</span><strong>${dem.leanRWins ?? "--"}</strong></div>
        <div><span>Vulnerable D seats held</span><strong>${dem.vulnerableDHolds ?? "--"}</strong></div>
      </div>
    </div>
    <div>
      <h3>Republican-control simulations</h3>
      <div class="path-stat-grid">
        <div><span>Toss-up districts won</span><strong>${rep.tossupWins ?? "--"}</strong></div>
        <div><span>Tilt D districts won</span><strong>${rep.tiltDWins ?? "--"}</strong></div>
        <div><span>Lean D districts won</span><strong>${rep.leanDWins ?? "--"}</strong></div>
        <div><span>Vulnerable R seats held</span><strong>${rep.vulnerableRHolds ?? "--"}</strong></div>
      </div>
    </div>
  `;
}

function renderHouseDistrictHistoryInto(target, district) {
  if (!target || !district) return;
  const points = district.history?.length ? district.history : [{ date: houseForecast.modelDate, dem: district.demProbability, rep: district.repProbability }];
  renderLineChart(target, points, {
    label: `${district.id} probability history`,
    pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(point.rep ?? 1 - point.dem)}`,
    value: (point) => point.dem
  });
}

function renderHouseSourceStatus() {
  const container = document.getElementById("house-source-status");
  if (!container || !houseForecast) return;
  const status = houseForecast.sourceStatus || {};
  const summary = houseForecast.sourceSummary || {};
  const rows = [
    ["Cook House ratings", status.cookHouseRatings, `${summary.cookDistricts ?? 0} districts`],
    ["Inside / 270toWin", status.insideElections270ToWinRatings, `${summary.insideRatings ?? 0} district ratings`],
    ["House polls", status.twoSeventyToWinHousePolls, summary.housePollingReferenceReachable ? "Reference page reachable" : "Reference page not loaded"],
    ["Race to the WH", status.raceToTheWhHouseForecast, summary.raceToTheWhHouseReachable ? "House page reachable" : "House page not loaded"],
    ["RttWH generic", status.raceToTheWhGenericBallot, summary.raceToTheWhGenericReachable ? "Generic page reachable" : "Generic page not loaded"],
    ["RealClearPolling", status.realClearPoliticsGenericBallot || status.realClearPollingHousePolls, summary.realClearGenericReachable || summary.realClearHousePollsReachable ? "Reference page reachable" : "Blocked or not loaded"],
    ["OpenFEC House", status.openFecHouseCandidateSummary, `${summary.fecDistricts ?? 0} districts`],
    ["Generic ballot", status.senateGenericPollingFallback || status.votehubGenericBallot, `${summary.genericPolling?.sources?.length ?? 0} sources / D ${summary.genericPolling?.margin?.toFixed?.(1) ?? "--"}`],
    ["Census districts", status.censusDistrictBoundaries, houseForecast.mapBasis?.districtShapeMapStatus || "--"]
  ];
  container.innerHTML = rows.map(([label, item, detail]) => {
    const ok = Boolean(item?.ok);
    return `
      <div class="source-status-card ${ok ? "is-ok" : "is-warn"}">
        <span class="source-tag">${ok ? "Loaded" : "Not loaded"}</span>
        <h3>${label}</h3>
        <p>${detail}</p>
        <p class="meta">${item?.ms ? `${item.ms} ms` : item?.status || ""}</p>
      </div>
    `;
  }).join("");
}

function renderCalibrationPage() {
  const buckets = document.getElementById("calibration-buckets");
  if (!buckets || !forecast) return;
  const calibration = forecast.calibration || {};
  const rows = calibration.buckets || [];
  buckets.innerHTML = `
    <table>
      <thead>
        <tr><th>Forecast bucket</th><th>Expected win rate</th><th>Historical win rate</th><th>Sample</th></tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.label)}</td>
            <td>${oneDecimal(row.expectedWinRate)}</td>
            <td>${row.actualWinRate === null ? "--" : oneDecimal(row.actualWinRate)}</td>
            <td>${row.sample}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="meta">${escapeHtml(calibration.note || "")}</p>
  `;
  setText("calibration-sample", `${calibration.sample ?? "--"} races`);
  setText("calibration-brier", Number.isFinite(calibration.meanBrier) ? calibration.meanBrier.toFixed(3) : "--");
  setText("calibration-margin-error", Number.isFinite(calibration.meanAbsoluteMarginError) ? `${calibration.meanAbsoluteMarginError.toFixed(1)} pts` : "--");
  const backtest = document.getElementById("historical-backtest-status");
  const historical = calibration.historicalBacktest || {};
  if (backtest) {
    backtest.innerHTML = `
      <div class="backtest-card ${historical.status === "ready" ? "is-ok" : "is-warn"}">
        <strong>${escapeHtml(historical.label || "Historical backtest")}</strong>
        <span>${escapeHtml(historical.status || "not-ready")}</span>
        <p>${escapeHtml(historical.note || "")}</p>
        <p class="meta">Target cycles: ${(historical.cyclesTargeted || []).join(", ") || "--"} / archived cycles: ${(historical.availableCycles || []).join(", ") || "none yet"} / sample: ${historical.sample ?? 0}</p>
      </div>
    `;
  }
  const archivedBuckets = document.getElementById("archived-backtest-buckets");
  if (archivedBuckets) {
    const archivedRows = historical.buckets || [];
    archivedBuckets.innerHTML = `
      <table>
        <thead>
          <tr><th>Forecast bucket</th><th>Expected win rate</th><th>Actual win rate</th><th>Sample</th></tr>
        </thead>
        <tbody>
          ${archivedRows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${oneDecimal(row.expectedWinRate)}</td>
              <td>${row.actualWinRate === null ? "--" : oneDecimal(row.actualWinRate)}</td>
              <td>${row.sample}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <p class="meta">Archived-input sample, not the current-cycle diagnostic.</p>
    `;
  }
  const archivedWorst = document.getElementById("archived-backtest-worst");
  if (archivedWorst) {
    const worstRows = historical.worstRaces || [];
    const max = Math.max(...worstRows.map((row) => row.marginMiss || 0), 1);
    archivedWorst.innerHTML = worstRows.map((row) => {
      const width = clamp(((row.marginMiss || 0) / max) * 100, 12, 100);
      const notes = row.explanation?.length ? row.explanation.join("; ") : "No specific driver identified.";
      return `
        <div class="calibration-miss-row">
          <div class="leverage-row"><strong>${escapeHtml(`${row.cycle} ${row.state}`)}</strong><i style="width:${width}%"></i><span>${Number(row.marginMiss || 0).toFixed(1)}</span></div>
          <p>${escapeHtml(row.rating)} / ${escapeHtml(row.favorite)} ${oneDecimal(row.probability)} / ${escapeHtml(notes)}</p>
        </div>
      `;
    }).join("");
  }
  const breakdowns = document.getElementById("calibration-breakdowns");
  if (breakdowns) {
    const rows = calibration.breakdowns || [];
    breakdowns.innerHTML = `
      <table>
        <thead>
          <tr><th>Race type</th><th>Sample</th><th>Brier</th><th>Mean margin miss</th></tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.label)}</td>
              <td>${row.sample}</td>
              <td>${row.meanBrier === null ? "--" : row.meanBrier.toFixed(3)}</td>
              <td>${row.meanAbsoluteMarginError === null ? "--" : `${row.meanAbsoluteMarginError.toFixed(1)} pts`}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }
  const worst = document.getElementById("calibration-worst");
  if (worst) {
    const max = Math.max(...(calibration.worstStates || []).map((row) => row.absoluteMarginError || 0), 1);
    worst.innerHTML = (calibration.worstStates || []).map((row) => {
      const width = clamp(((row.absoluteMarginError || 0) / max) * 100, 12, 100);
      const notes = row.explanation?.notes?.length ? row.explanation.notes.join("; ") : "No specific driver identified.";
      return `
        <div class="calibration-miss-row">
          <div class="leverage-row"><strong>${escapeHtml(row.state)}</strong><i style="width:${width}%"></i><span>${Number(row.absoluteMarginError || 0).toFixed(1)}</span></div>
          <p>${escapeHtml(notes)}</p>
        </div>
      `;
    }).join("");
  }
}

function renderHousePage() {
  renderHouseSummary();
  renderHousePreviewControls();
  renderHouseViewControls();
  renderHouseCartogram();
  renderHouseDistrictList();
  renderHouseDistrictMap();
  renderHouseLegend();
  renderHouseControlHistory();
  renderHouseSeatHistory();
  renderHouseSeatHistogram();
  renderHouseDecisiveDistricts();
  renderHouseControlPath();
  renderHouseSourceStatus();
}

function renderBattlegroundList() {
  const container = document.getElementById("battleground-list");
  if (!container || !forecast) return;
  const races = [...forecast.races]
    .sort((a, b) => b.tippingPower - a.tippingPower);
  container.innerHTML = races.map((race) => {
    const leader = race.winnerParty === "D" ? "Democrat" : "Republican";
    const leaderClass = leaderClassForRace(race);
    return `
      <a class="race-board-row ${leaderClass}" href="race.html?state=${race.state}">
        <strong>${escapeHtml(race.state)}</strong>
        <span>${escapeHtml(race.displayName.replace(" Senate", ""))}</span>
        <span>${escapeHtml(race.rating)}</span>
        <span>${leader} ${pct(race.winnerProbability)}</span>
        <span>${compactMovementText(race)}</span>
        <span>${inputQualityText(race)}</span>
        <span>${oneDecimal(race.tippingPower)}</span>
      </a>
    `;
  }).join("");
}

function sortedArticles() {
  return [...articles].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function articleUrl(article) {
  return `article.html?slug=${encodeURIComponent(article.slug)}`;
}

function renderTopArticle() {
  const container = document.getElementById("top-article");
  if (!container || !articles.length) return;
  const article = sortedArticles().find((item) => item.featured) || sortedArticles()[0];
  container.innerHTML = `
    <p class="meta">${escapeHtml(article.date)} / ${escapeHtml(article.author || "Capitol Forecast")}</p>
    <h2 id="top-article-title"><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h2>
    <p>${escapeHtml(article.dek || "")}</p>
    <a class="button-link" href="${articleUrl(article)}">Read article</a>
  `;
}

function renderHomeArticleList() {
  const container = document.getElementById("home-article-list");
  if (!container) return;
  const list = sortedArticles().slice(0, 4);
  container.innerHTML = list.length ? list.map((article) => `
    <a href="${articleUrl(article)}">
      <strong>${escapeHtml(article.title)}</strong>
      <span>${escapeHtml(article.date)}</span>
    </a>
  `).join("") : `<p class="meta">No articles yet.</p>`;
}

function renderArticlesList() {
  const container = document.getElementById("articles-list");
  if (!container) return;
  const list = sortedArticles();
  container.innerHTML = list.length ? list.map((article) => `
    <article class="article-card">
      <p class="meta">${escapeHtml(article.date)} / ${escapeHtml(article.author || "Capitol Forecast")}</p>
      <h2><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h2>
      <p>${escapeHtml(article.dek || "")}</p>
    </article>
  `).join("") : `<article class="article-card"><h2>No articles yet.</h2></article>`;
}

function renderArticlePage() {
  const container = document.getElementById("article-page");
  if (!container) return;
  const slug = new URLSearchParams(window.location.search).get("slug") || sortedArticles()[0]?.slug;
  const article = articles.find((item) => item.slug === slug);
  if (!article) {
    container.innerHTML = `<p class="kicker">Article</p><h1>Article not found.</h1><p><a class="button-link" href="articles.html">Back to articles</a></p>`;
    return;
  }
  document.title = `${article.title} | Capitol Forecast`;
  container.innerHTML = `
    <p class="kicker">Article</p>
    <h1>${escapeHtml(article.title)}</h1>
    <p class="lede">${escapeHtml(article.dek || "")}</p>
    <p class="meta">${escapeHtml(article.date)} / ${escapeHtml(article.author || "Capitol Forecast")}</p>
    <div id="article-body" class="article-body"></div>
    <p><a class="button-link" href="articles.html">Back to articles</a></p>
  `;
  renderArticleBody(article);
}

function renderArticleBody(article) {
  const container = document.getElementById("article-body");
  if (!container) return;
  const blocks = Array.isArray(article.content) ? article.content : legacyArticleBlocks(article);
  container.innerHTML = blocks.map((block, index) => {
    if (typeof block === "string") return `<p>${escapeHtml(block)}</p>`;
    if (block.type === "paragraph") return `<p>${escapeHtml(block.text || "")}</p>`;
    if (block.type === "embed") {
      const embed = block.embed || block;
      const previewTypes = ["state-card", "state-preview", "map-preview", "map-state", "house-district", "house-district-preview", "house-race", "district-preview"];
      const previewClass = previewTypes.includes(embed.type) ? " article-embed-state-preview" : "";
      return `
        <section class="article-embed chart-panel article-embed-${escapeHtml(embed.size || "small")}${previewClass}" data-block-index="${index}">
          <span class="chart-label">${escapeHtml(embed.title || embedTitle(embed))}</span>
          <div class="article-embed-target"></div>
        </section>
      `;
    }
    return "";
  }).join("");

  container.querySelectorAll(".article-embed").forEach((node) => {
    const block = blocks[Number(node.dataset.blockIndex)];
    const embed = block.embed || block;
    const target = node.querySelector(".article-embed-target");
    renderEmbed(target, embed);
  });
}

function legacyArticleBlocks(article) {
  const body = (article.body || []).map((text) => ({ type: "paragraph", text }));
  const embeds = (article.embeds || []).map((embed) => ({ type: "embed", embed }));
  return [...body, ...embeds];
}

function embedTitle(embed) {
  if (embed.type === "control-history") return "National chamber control probability";
  if (embed.type === "state-history") return `${embed.state} probability history`;
  if (["state-card", "state-preview", "map-preview", "map-state"].includes(embed.type)) return `${embed.state} forecast preview`;
  if (embed.type === "house-control-history") return "House control probability";
  if (embed.type === "house-seat-distribution") return "House seat distribution";
  if (embed.type === "house-district-history") return `${embed.district} probability history`;
  if (["house-district", "house-district-preview", "house-race", "district-preview"].includes(embed.type)) return `${embed.district} forecast preview`;
  if (embed.type === "house-closest") return "Closest House districts";
  if (embed.type === "seat-distribution") return "Seat distribution";
  if (embed.type === "leverage") return "Most decisive races";
  return "Forecast chart";
}

function renderEmbed(target, embed) {
  if (!target) return;
  if (embed.type === "control-history") {
    target.className = "article-embed-target history-chart";
    const points = forecast.controlHistory?.length ? forecast.controlHistory : [{ date: forecast.modelDate, dem: forecast.demControlProbability, rep: forecast.repControlProbability }];
    renderLineChart(target, points, {
      label: embed.title || "National chamber control probability",
      pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(point.rep ?? 1 - point.dem)}`,
      value: (point) => point.dem
    });
    return;
  }
  if (embed.type === "state-history") {
    const race = getRace(String(embed.state || "").toUpperCase());
    target.className = "article-embed-target history-chart";
    if (!race) {
      target.innerHTML = `<p>State not found.</p>`;
      return;
    }
    const bodnar = (race.extraCandidates || []).find((candidate) => candidate.name === "Seth Bodnar");
    let points = race.history?.length ? race.history : [{ date: forecast.modelDate, dem: race.demProbability }];
    if (bodnar) {
      const bodnarHistory = new Map((race.extraHistory || []).map((point) => [point.date, point["Seth Bodnar"]]));
      points = points.map((point) => ({ ...point, extra: bodnarHistory.get(point.date) ?? null }));
    }
    const demIsIndependent = race.demDisplayParty === "I" || race.dem.toLowerCase().includes("independent");
    const demHistoryLabel = demIsIndependent ? candidateDisplayName(race, "D") : "Democrat";
    renderLineChart(target, points, {
      label: embed.title || `${race.displayName} probability history`,
      pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(1 - point.dem)}`,
      extraSeries: bodnar ? { key: "extra", name: "Seth Bodnar", className: "history-line-extra", dotClassName: "history-dot-extra", labelClassName: "history-end-label-extra", colorLabel: "Seth Bodnar" } : null,
      demSeriesClass: demIsIndependent ? "history-line-ind" : "history-line-dem",
      demBandClass: demIsIndependent ? "history-band-ind" : "history-band-dem",
      demDotClass: demIsIndependent ? "history-dot-ind" : "history-dot-dem",
      demHoverDotClass: demIsIndependent ? "history-hover-dot-ind" : "history-hover-dot-dem",
      demEndLabelClass: demIsIndependent ? "history-end-label-ind" : "history-end-label-dem",
      demHoverTextClass: demIsIndependent ? "history-hover-ind" : "",
      endLabel: demIsIndependent ? (party, value) => `${party === "dem" ? demHistoryLabel : "Republican"} ${oneDecimal(value)}` : null,
      hoverLabel: demIsIndependent ? (party, value) => `${party === "dem" ? demHistoryLabel : "Republican"} ${oneDecimal(value)}` : null,
      annotations: race.state === "MT" ? [...CHART_ANNOTATIONS, ...MONTANA_CHART_ANNOTATIONS] : CHART_ANNOTATIONS,
      value: (point) => point.dem
    });
    return;
  }
  if (["state-card", "state-preview", "map-preview", "map-state"].includes(embed.type)) {
    const race = getRace(String(embed.state || "").toUpperCase());
    const mode = normalizedMapMode(embed.mode || embed.colorMode);
    target.className = "article-embed-target state-preview-embed";
    target.innerHTML = race ? hoverMarkup(race, mode) : `<p>State not found.</p>`;
    return;
  }
  if (embed.type === "seat-distribution") {
    target.className = "article-embed-target seat-histogram";
    renderSeatHistogramInto(target);
    return;
  }
  if (embed.type === "house-control-history") {
    target.className = "article-embed-target history-chart";
    if (!houseForecast) {
      target.innerHTML = `<p>House forecast not loaded.</p>`;
      return;
    }
    const points = houseForecast.controlHistory?.length ? houseForecast.controlHistory : [{ date: houseForecast.modelDate, dem: houseForecast.demControlProbability, rep: houseForecast.repControlProbability }];
    renderLineChart(target, points, {
      label: embed.title || "House control probability",
      pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(point.rep ?? 1 - point.dem)}`,
      value: (point) => point.dem
    });
    return;
  }
  if (embed.type === "house-seat-distribution") {
    target.className = "article-embed-target seat-histogram";
    if (!houseForecast) {
      target.innerHTML = `<p>House forecast not loaded.</p>`;
      return;
    }
    const seats = Object.keys(houseForecast.seatCounts || {}).map(Number);
    const center = houseForecast.medianSeats || 218;
    renderSeatHistogramInto(target, houseForecast, {
      minSeat: Math.max(180, Math.min(...seats, center - 16)),
      maxSeat: Math.min(255, Math.max(...seats, center + 16))
    });
    return;
  }
  if (["house-district", "house-district-preview", "house-race", "district-preview"].includes(embed.type)) {
    const district = getHouseDistrict(embed.district || embed.id);
    target.className = "article-embed-target state-preview-embed";
    target.innerHTML = district ? houseDistrictMarkup(district) : `<p>District not found.</p>`;
    return;
  }
  if (embed.type === "house-district-history") {
    const district = getHouseDistrict(embed.district || embed.id);
    target.className = "article-embed-target history-chart";
    if (!district) {
      target.innerHTML = `<p>District not found.</p>`;
      return;
    }
    renderHouseDistrictHistoryInto(target, district);
    return;
  }
  if (embed.type === "house-closest") {
    target.className = "article-embed-target leverage-chart";
    if (!houseForecast) {
      target.innerHTML = `<p>House forecast not loaded.</p>`;
      return;
    }
    const ranked = houseForecast.decisiveDistricts || [];
    const max = Math.max(...ranked.map((district) => district.leverage || 0), .01);
    target.innerHTML = ranked.slice(0, embed.limit || 10).map((district) => {
      const width = clamp(((district.leverage || 0) / max) * 100, 8, 100);
      return `<button class="leverage-row ${houseLeaderClass(district)}" type="button" data-tip="${escapeHtml(houseDistrictLabel(district))}<br>${oneDecimal(district.winnerProbability)} ${district.winnerParty === "D" ? "Democrat" : "Republican"}<br>${escapeHtml(district.rating)}"><strong>${escapeHtml(district.id)}</strong><i style="width:${width}%"></i><span>${oneDecimal(district.leverage || 0)}</span></button>`;
    }).join("");
    bindPanelTooltipFor(target, ".leverage-row", (node) => node.dataset.tip);
    return;
  }
  if (embed.type === "leverage") {
    target.className = "article-embed-target leverage-chart";
    renderLeverageInto(target);
    return;
  }
  target.innerHTML = `<p>Unknown embed type.</p>`;
}

async function loadArticles() {
  try {
    const response = await fetch("data/articles.json", { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

async function loadForecast() {
  const response = await fetch("data/forecast.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Forecast data returned ${response.status}`);
  return response.json();
}

async function loadHouseForecast() {
  try {
    const response = await fetch("data/house-forecast.json", { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function loadPresidentForecasts() {
  const files = [];
  PRESIDENT_DEM_CANDIDATES.forEach((dem) => {
    PRESIDENT_REP_CANDIDATES.forEach((rep) => {
      files.push(`data/president-forecast-${dem}-${rep}.json`);
    });
  });
  const results = await Promise.all(files.map(async (file) => {
    try {
      const response = await fetch(file, { cache: "no-store" });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean);
}

function renderLoadError(error) {
  setText("control-headline", "Forecast data unavailable");
  setText("odds-phrase", "--");
  const main = document.querySelector("main");
  if (main) {
    const panel = document.createElement("section");
    panel.className = "text-panel";
    panel.innerHTML = `<p class="kicker">Data</p><h2>Saved forecast file could not load.</h2><p>${error.message}</p>`;
    main.prepend(panel);
  }
}

async function init() {
  installInteractionDismiss();
  articles = await loadArticles();
  houseForecast = await loadHouseForecast();
  if (document.getElementById("home-president-card")) {
    presidentForecasts = await loadPresidentForecasts();
  }
  updateHomeHouseSummary();
  updateHomePresidentSummary();
  renderHousePage();
  try {
    forecast = await loadForecast();
  } catch (error) {
    renderLoadError(error);
    updateHomeHouseSummary();
    renderHousePage();
    renderHomeRadar();
    renderTopArticle();
    renderHomeArticleList();
    renderArticlesList();
    renderArticlePage();
    updateHomePresidentSummary();
    return;
  }
  updateSummary();
  updateHomeHouseSummary();
  updateHomePresidentSummary();
  renderMapColorControls();
  renderStateMap();
  renderLegend();
  renderHistogram();
  renderLeverageChart();
  renderSenateControlPath();
  renderControlHistory();
  renderSeatHistory();
  renderRacePage();
  renderRaceSelector();
  renderSourceStatus();
  renderHousePage();
  renderBattlegroundList();
  renderHomeRadar();
  renderTopArticle();
  renderHomeArticleList();
  renderArticlesList();
  renderArticlePage();
  renderCalibrationPage();
}

init();

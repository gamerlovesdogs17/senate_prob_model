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

let forecast = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function oneDecimal(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function getRace(state) {
  return forecast?.races?.find((race) => race.state === state);
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

function bindReadout(selector, getHtml) {
  document.querySelectorAll(selector).forEach((node) => {
    const handler = () => updateChartReadout(node, getHtml(node));
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
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
  setText("control-headline", forecast.demControlProbability >= .5 ? "Democrats narrowly favored" : "Republicans narrowly favored");
  setText("odds-phrase", `${Math.round(forecast.demControlProbability * 100)} in 100`);
  setText("update-time", `Updates daily at ${forecast.updateTime || "6:00 AM Central"}`);

  const demBar = document.getElementById("dem-control-bar");
  const repBar = document.getElementById("rep-control-bar");
  if (demBar && repBar) {
    demBar.style.width = `${forecast.demControlProbability * 100}%`;
    repBar.style.width = `${forecast.repControlProbability * 100}%`;
  }
}

function hoverMarkup(race) {
  if (!race) {
    return `<span class="panel-label">Map detail</span><h3>No Senate race</h3><p>This state is not on the regular 2026 Senate board.</p>`;
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
  if (!container || !forecast) return;
  container.innerHTML = `
    <div class="fallback-list">
      ${forecast.races.map((race) => `<a href="race.html?state=${race.state}" style="background:${ratingColor(race)}">${race.state}</a>`).join("")}
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
        return race ? `state-shape ${RATING_BUCKET[race.rating]}` : "state-shape state-muted";
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
        return race ? `${STATE_NAMES[state]}: ${race.rating}, ${race.winnerParty} ${pct(race.winnerProbability)}` : STATE_NAMES[state];
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

function renderHistogram() {
  const container = document.getElementById("seat-histogram");
  if (!container || !forecast) return;
  const counts = forecast.seatCounts || {};
  const seats = Object.keys(counts).map(Number).sort((a, b) => a - b);
  if (!seats.length) return;
  const minSeat = Math.max(42, Math.min(...seats));
  const maxSeat = Math.min(57, Math.max(...seats));
  const maxCount = Math.max(...Object.values(counts));
  const sims = forecast.settings?.simulations || Object.values(counts).reduce((a, b) => a + b, 0);
  container.innerHTML = Array.from({ length: maxSeat - minSeat + 1 }, (_, i) => {
    const seat = minSeat + i;
    const value = counts[seat] || 0;
    const share = sims ? value / sims : 0;
    const height = maxCount ? clamp((value / maxCount) * 215, 4, 215) : 4;
    return `<button class="seat-bin" type="button" data-tip="${seat} Democratic seats<br>${pct(share)} of simulations"><i style="height:${height}px"></i><span>${seat}</span></button>`;
  }).join("");
  bindReadout(".seat-bin", (node) => node.dataset.tip);
  updateChartReadout(container, "Select a bar for exact simulation share.");
}

function renderLeverageChart() {
  const chart = document.getElementById("leverage-chart");
  if (!chart || !forecast) return;
  const ranked = [...forecast.races].sort((a, b) => b.tippingPower - a.tippingPower).slice(0, 9);
  const max = Math.max(...ranked.map((race) => race.tippingPower));
  chart.innerHTML = ranked.map((race) => {
    const width = max ? clamp((race.tippingPower / max) * 100, 8, 100) : 8;
    return `<a class="leverage-row" href="race.html?state=${race.state}" data-tip="${race.displayName}<br>${oneDecimal(race.tippingPower)} control tipping power<br>${pct(race.demProbability)} Democrat"><strong>${race.state}</strong><i style="width:${width}%"></i><span>${oneDecimal(race.tippingPower)}</span></a>`;
  }).join("");
  bindReadout(".leverage-row", (node) => node.dataset.tip);
  if (ranked[0]) updateChartReadout(chart, `${ranked[0].displayName}<br>${oneDecimal(ranked[0].tippingPower)} control tipping power`);
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

function renderRaceSelector() {
  const container = document.getElementById("race-selector");
  if (!container || !forecast) return;
  const activeState = new URLSearchParams(window.location.search).get("state")?.toUpperCase() || "OH";
  const ranked = [...forecast.races].sort((a, b) => b.tippingPower - a.tippingPower);
  container.innerHTML = ranked.map((race) => `<a class="${race.state === activeState ? "active" : ""}" href="race.html?state=${race.state}">${race.state}</a>`).join("");
}

function renderLineChart(chart, points, options) {
  const width = 720;
  const height = 260;
  const coords = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : 36 + index * ((width - 72) / (points.length - 1));
    const y = height - 34 - options.value(point) * (height - 68);
    return { point, x, y };
  });
  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.label}">
      <path class="history-grid" d="M36 ${height - 34}H${width - 36}M36 ${height / 2}H${width - 36}M36 34H${width - 36}"></path>
      <text class="history-axis" x="14" y="38">100</text>
      <text class="history-axis" x="18" y="${height / 2 + 4}">50</text>
      <text class="history-axis" x="22" y="${height - 32}">0</text>
      <polyline class="history-line" points="${coords.map(({ x, y }) => `${x},${y}`).join(" ")}"></polyline>
      ${coords.map(({ point, x, y }) => `<g class="history-point" tabindex="0" data-tip="${options.pointHtml(point)}"><circle class="history-dot" cx="${x}" cy="${y}" r="3.5"></circle><circle class="history-hit" cx="${x}" cy="${y}" r="18"></circle><text x="${x}" y="${height - 10}">${String(point.date).slice(5)}</text></g>`).join("")}
    </svg>
  `;
  const last = points[points.length - 1];
  updateChartReadout(chart, `${options.pointHtml(last)}${points.length === 1 && options.singleNote ? `<br>${options.singleNote}` : ""}`);
  chart.querySelectorAll(".history-point").forEach((node) => {
    const handler = () => updateChartReadout(node, node.dataset.tip);
    node.addEventListener("mouseenter", handler);
    node.addEventListener("focus", handler);
    node.addEventListener("click", handler);
  });
}

function renderHistory(race) {
  const chart = document.getElementById("race-history");
  if (!chart) return;
  const points = race.history?.length ? race.history : [{ date: forecast.modelDate, dem: race.demProbability }];
  renderLineChart(chart, points, {
    label: `${race.displayName} probability history`,
    pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(1 - point.dem)}`,
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
  setText("race-primary-summary", race.primarySummary);
  const demNode = document.getElementById("race-dem-candidate");
  if (demNode && demNode.parentElement) {
    demNode.parentElement.classList.toggle("independent-candidate", race.dem.toLowerCase().includes("independent"));
  }
}

function renderRacePage() {
  const page = document.getElementById("race-detail-page");
  if (!page || !forecast) return;
  const state = new URLSearchParams(window.location.search).get("state")?.toUpperCase() || "OH";
  const race = getRace(state) || getRace("OH") || forecast.races[0];
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

function renderRacesList() {
  const container = document.getElementById("race-list");
  if (!container || !forecast) return;
  const ranked = [...forecast.races].sort((a, b) => b.tippingPower - a.tippingPower);
  container.innerHTML = ranked.map((race) => `
    <a class="source-card race-card" href="race.html?state=${race.state}">
      <span class="source-tag">${race.rating}</span>
      <h3>${race.displayName}</h3>
      <p>${race.winnerParty === "D" ? "Democrat" : "Republican"} ${pct(race.winnerProbability)}. ${race.note}</p>
    </a>
  `).join("");
}

async function loadForecast() {
  const response = await fetch("data/forecast.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Forecast data returned ${response.status}`);
  return response.json();
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
  try {
    forecast = await loadForecast();
  } catch (error) {
    renderLoadError(error);
    return;
  }
  updateSummary();
  renderStateMap();
  renderLegend();
  renderHistogram();
  renderLeverageChart();
  renderControlHistory();
  renderRacePage();
  renderRaceSelector();
  renderRacesList();
}

init();

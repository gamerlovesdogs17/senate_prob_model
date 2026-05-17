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

const CHART_ANNOTATIONS = [
  { date: "2026-05-17", label: "Model reworked" }
];

let forecast = null;
let articles = [];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function oneDecimal(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function partyBadge(candidate, fallbackParty) {
  return String(candidate || "").toLowerCase().includes("independent") ? "I" : fallbackParty;
}

function signedMargin(demProbability) {
  const margin = (demProbability - .5) * 100;
  if (Math.abs(margin) < .05) return "Even";
  return `${margin > 0 ? "D" : "R"}+${Math.abs(margin).toFixed(1)}`;
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

function ratingColor(race) {
  const root = getComputedStyle(document.documentElement);
  const bucket = RATING_BUCKET[race.rating];
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
  setText("control-headline", forecast.demControlProbability >= .5 ? "Democrats narrowly favored" : "Republicans narrowly favored");
  const favoredSide = forecast.demControlProbability >= forecast.repControlProbability ? "Democrats" : "Republicans";
  const favoredProbability = Math.max(forecast.demControlProbability, forecast.repControlProbability);
  const oddsNode = document.getElementById("odds-phrase");
  if (oddsNode) {
    oddsNode.innerHTML = `<span>${favoredSide} favored</span><strong>${pct(favoredProbability)}</strong>`;
  }
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
  const demCandidate = race.dem || "Democratic nominee pending";
  const repCandidate = race.rep || "Republican nominee pending";
  const demBadge = partyBadge(demCandidate, "D");
  const repBadge = partyBadge(repCandidate, "R");
  return `
    <span class="race-kicker">${race.displayName}</span>
    <div class="map-card-title">
      <div class="state-code">${race.state}</div>
      <span class="rating-pill ${RATING_BUCKET[race.rating]}">${race.rating}</span>
    </div>
    <h3>${winner} has a ${oneDecimal(race.winnerProbability)} chance.</h3>
    <div class="candidate-table" aria-label="${race.state} candidate forecast">
      <div class="candidate-table-head"><span>Candidate</span><span>Chance</span></div>
      <div class="candidate-row dem-row">
        <span>${escapeHtml(demCandidate)} <i class="${demBadge === "I" ? "ind-badge" : ""}">${demBadge}</i></span>
        <strong>${oneDecimal(race.demProbability)}</strong>
      </div>
      <div class="candidate-row rep-row">
        <span>${escapeHtml(repCandidate)} <i class="${repBadge === "I" ? "ind-badge" : ""}">${repBadge}</i></span>
        <strong>${oneDecimal(1 - race.demProbability)}</strong>
      </div>
      <div class="candidate-margin"><span>Margin</span><strong>${signedMargin(race.demProbability)}</strong></div>
    </div>
    <div class="prob-track" aria-label="${race.state} probability split">
      <span style="width:${race.demProbability * 100}%"></span>
      <span style="width:${(1 - race.demProbability) * 100}%"></span>
    </div>
    <p>${escapeHtml(race.summary || race.note || "")}</p>
    <p class="meta">Primary: ${race.primary} / Tipping power: ${oneDecimal(race.tippingPower)}</p>
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
  renderSeatHistogramInto(container);
}

function renderSeatHistogramInto(container) {
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
    const leaderClass = race.rating === "Toss-up" ? "leads-tossup" : race.winnerParty === "D" ? "leads-dem" : "leads-rep";
    return `<a class="leverage-row ${leaderClass}" href="race.html?state=${race.state}" data-tip="${race.displayName}<br>${oneDecimal(race.tippingPower)} control tipping power<br>${pct(race.demProbability)} Democrat"><strong>${race.state}</strong><i style="width:${width}%"></i><span>${oneDecimal(race.tippingPower)}</span></a>`;
  }).join("");
  bindPanelTooltipFor(chart, ".leverage-row", (node) => node.dataset.tip);
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
  const width = 760;
  const height = 310;
  const plot = { left: 54, right: 150, top: 20, bottom: 48 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const demValue = (point) => point.dem;
  const repValue = (point) => point.rep ?? 1 - point.dem;
  const values = points.flatMap((point) => [demValue(point), repValue(point)]);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const domain = minValue >= .28 && maxValue <= .72 ? [.3, .7] : [0, 1];
  const band = options.band ?? .055;
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
  const ticks = domain[0] === .3 ? [.7, .6, .5, .4, .3] : [1, .75, .5, .25, 0];
  const firstDate = String(points[0].date).slice(5);
  const lastDate = String(points[points.length - 1].date).slice(5);
  const latest = coords[coords.length - 1];
  const demLabelY = latest.demY <= latest.repY ? latest.demY - 4 : latest.demY + 14;
  const repLabelY = latest.repY <= latest.demY ? latest.repY - 4 : latest.repY + 14;
  const annotations = CHART_ANNOTATIONS.map((annotation) => {
    const index = points.findIndex((point) => point.date === annotation.date);
    if (index === -1) return null;
    const x = coords[index].x;
    const labelX = clamp(x - 12, plot.left + 18, width - plot.right - 18);
    const labelY = plot.top + 96;
    return `<g class="history-annotation"><path d="M${x} ${plot.top}V${height - plot.bottom}"></path><text x="${labelX}" y="${labelY}" transform="rotate(-90 ${labelX} ${labelY})">${annotation.label}</text></g>`;
  }).filter(Boolean).join("");
  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.label}">
      ${ticks.map((tick) => `<path class="history-grid ${tick === .5 ? "history-midline" : ""}" d="M${plot.left} ${yFor(tick)}H${width - plot.right}"></path><text class="history-axis" x="${plot.left - 12}" y="${yFor(tick) + 4}">${(tick * 100).toFixed(domain[0] === .3 ? 1 : 0)}</text>`).join("")}
      ${coords.length > 1 ? [1, 2, 3, 4].map((step) => {
        const x = plot.left + (plotWidth / 5) * step;
        return `<path class="history-vgrid" d="M${x} ${plot.top}V${height - plot.bottom}"></path>`;
      }).join("") : ""}
      <path class="history-band history-band-dem" d="${areaPath("dem")}"></path>
      <path class="history-band history-band-rep" d="${areaPath("rep")}"></path>
      <path class="history-line history-line-dem" d="${linePath("dem")}"></path>
      <path class="history-line history-line-rep" d="${linePath("rep")}"></path>
      ${annotations}
      ${coords.map(({ x, demY, repY }, index) => `<g class="history-point" tabindex="0" data-index="${index}"><circle class="history-dot history-dot-dem" cx="${x}" cy="${demY}" r="${coords.length === 1 ? 4.8 : 3.3}"></circle><circle class="history-dot history-dot-rep" cx="${x}" cy="${repY}" r="${coords.length === 1 ? 4.8 : 3.3}"></circle></g>`).join("")}
      <text class="history-date history-date-start" x="${plot.left}" y="${height - 18}">${firstDate}</text>
      <text class="history-date history-date-end" x="${width - plot.right}" y="${height - 18}">${lastDate}</text>
      <text class="history-end-label history-end-label-dem" x="${latest.x + 11}" y="${demLabelY}">Democrat ${oneDecimal(demValue(latest.point))}</text>
      <text class="history-end-label history-end-label-rep" x="${latest.x + 11}" y="${repLabelY}">Republican ${oneDecimal(repValue(latest.point))}</text>
      <g class="history-hover" style="display:none">
        <path class="history-hover-rule"></path>
        <circle class="history-hover-dot history-hover-dot-dem" r="4.5"></circle>
        <circle class="history-hover-dot history-hover-dot-rep" r="4.5"></circle>
        <rect class="history-hover-box" width="132" height="56" rx="2"></rect>
        <text class="history-hover-title"></text>
        <text class="history-hover-dem"></text>
        <text class="history-hover-rep"></text>
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
  const hoverBox = chart.querySelector(".history-hover-box");
  const hoverTitle = chart.querySelector(".history-hover-title");
  const hoverDem = chart.querySelector(".history-hover-dem");
  const hoverRep = chart.querySelector(".history-hover-rep");
  const showIndex = (index) => {
    const coord = coords[clamp(index, 0, coords.length - 1)];
    const dem = demValue(coord.point);
    const rep = repValue(coord.point);
    const boxX = clamp(coord.x + 12, plot.left + 4, width - plot.right - 134);
    const boxY = clamp(Math.min(coord.demY, coord.repY) - 68, plot.top + 4, height - plot.bottom - 62);
    hover.style.display = "block";
    hoverRule.setAttribute("d", `M${coord.x} ${plot.top}V${height - plot.bottom}`);
    hoverDemDot.setAttribute("cx", coord.x);
    hoverDemDot.setAttribute("cy", coord.demY);
    hoverRepDot.setAttribute("cx", coord.x);
    hoverRepDot.setAttribute("cy", coord.repY);
    hoverBox.setAttribute("x", boxX);
    hoverBox.setAttribute("y", boxY);
    hoverTitle.setAttribute("x", boxX + 9);
    hoverTitle.setAttribute("y", boxY + 16);
    hoverDem.setAttribute("x", boxX + 9);
    hoverDem.setAttribute("y", boxY + 34);
    hoverRep.setAttribute("x", boxX + 9);
    hoverRep.setAttribute("y", boxY + 48);
    hoverTitle.textContent = coord.point.date;
    hoverDem.textContent = `Democrat ${oneDecimal(dem)}`;
    hoverRep.textContent = `Republican ${oneDecimal(rep)}`;
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
  setText("race-note", race.summary || race.note);
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

function renderSourceStatus() {
  const container = document.getElementById("source-status");
  if (!container || !forecast) return;
  const status = forecast.sourceStatus || {};
  const summary = forecast.sourceSummary || {};
  const rows = [
    ["VoteHub polling", status.votehubGenericBallot, `${summary.votehub?.usableGenericBallotPolls ?? 0} usable generic-ballot polls / D ${summary.votehub?.genericBallotMargin?.toFixed?.(1) ?? "--"}`],
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

function renderBattlegroundList() {
  const container = document.getElementById("battleground-list");
  if (!container || !forecast) return;
  const races = [...forecast.races]
    .sort((a, b) => b.tippingPower - a.tippingPower);
  container.innerHTML = races.map((race) => {
    const leader = race.winnerParty === "D" ? "Democrat" : "Republican";
    const leaderClass = race.rating === "Toss-up" ? "leads-tossup" : race.winnerParty === "D" ? "leads-dem" : "leads-rep";
    return `
      <a class="race-board-row ${leaderClass}" href="race.html?state=${race.state}">
        <strong>${escapeHtml(race.state)}</strong>
        <span>${escapeHtml(race.displayName.replace(" Senate", ""))}</span>
        <span>${escapeHtml(race.rating)}</span>
        <span>${leader} ${pct(race.winnerProbability)}</span>
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
    <p class="meta">${escapeHtml(article.date)} / ${escapeHtml(article.author || "Senate Probability Desk")}</p>
    <h2 id="top-article-title"><a href="${articleUrl(article)}">${escapeHtml(article.title)}</a></h2>
    <p>${escapeHtml(article.dek || "")}</p>
    <a class="button-link" href="${articleUrl(article)}">Read article</a>
  `;
}

function renderArticlesList() {
  const container = document.getElementById("articles-list");
  if (!container) return;
  const list = sortedArticles();
  container.innerHTML = list.length ? list.map((article) => `
    <article class="article-card">
      <p class="meta">${escapeHtml(article.date)} / ${escapeHtml(article.author || "Senate Probability Desk")}</p>
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
  document.title = `${article.title} | Senate Probability Desk`;
  container.innerHTML = `
    <p class="kicker">Article</p>
    <h1>${escapeHtml(article.title)}</h1>
    <p class="lede">${escapeHtml(article.dek || "")}</p>
    <p class="meta">${escapeHtml(article.date)} / ${escapeHtml(article.author || "Senate Probability Desk")}</p>
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
      return `
        <section class="article-embed chart-panel article-embed-${escapeHtml(embed.size || "small")}" data-block-index="${index}">
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
  if (embed.type === "state-card") return `${embed.state} forecast card`;
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
    const points = race.history?.length ? race.history : [{ date: forecast.modelDate, dem: race.demProbability }];
    renderLineChart(target, points, {
      label: embed.title || `${race.displayName} probability history`,
      pointHtml: (point) => `${point.date}<br>D ${pct(point.dem)} / R ${pct(1 - point.dem)}`,
      value: (point) => point.dem
    });
    return;
  }
  if (embed.type === "state-card") {
    const race = getRace(String(embed.state || "").toUpperCase());
    target.className = "article-embed-target";
    target.innerHTML = race ? hoverMarkup(race) : `<p>State not found.</p>`;
    return;
  }
  if (embed.type === "seat-distribution") {
    target.className = "article-embed-target seat-histogram";
    renderSeatHistogramInto(target);
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
  try {
    forecast = await loadForecast();
  } catch (error) {
    renderLoadError(error);
    renderTopArticle();
    renderArticlesList();
    renderArticlePage();
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
  renderSourceStatus();
  renderBattlegroundList();
  renderTopArticle();
  renderArticlesList();
  renderArticlePage();
}

init();

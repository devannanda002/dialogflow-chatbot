// Dialogflow ES webhook for the Tesla Supercharger Lifestyle Planner (demo).
// Hosted on Vercel. Webhook URL = https://dialogflow-chatbot-dusky.vercel.app/api/webhook
// Every number below is a labeled demo estimate, not live Tesla data. Verify on tesla.com.

// ---------- Demo assumptions ----------
const MILES_PER_STOP = 150;          // one ~20%->80% Supercharger stop adds ~150 miles
const MINUTES_PER_STOP = 25;
const OUTLET_MILES_PER_NIGHT = 35;   // standard 120V outlet overnight (~10 h)
const GAS_PRICE = 4.1;               // $/gal, AAA national average, Nov 2026
const GAS_MPG = 30;                  // typical gas sedan/SUV
const SUPERCHARGER_PRICE = 0.45;     // $/kWh, typical Tesla-owner rate (varies by station/time)
const OFF_PEAK_DISCOUNT = 0.3;       // off-peak can run ~30% cheaper at many stations
const HOME_PRICE = 0.17;             // $/kWh, typical US residential electricity
const KWH_PER_MILE = { "Model 3": 0.25, "Model Y": 0.28 };
const MAP_URL = "tesla.com/findus";

// ---------- Helpers ----------
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const str = (v) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)).trim();
const has = (s, ...words) => words.some((w) => s.toLowerCase().includes(w));
const fmt = (m) => (m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}`);
const list = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Indiana/Indianapolis" }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// ---------- Welcome ----------
function welcome() {
  return [
    `${greeting()}! Welcome to the Tesla Supercharger Lifestyle Planner. ` +
      pick([
        "I'll build you a sample weekly charging plan in about a minute.",
        "A few quick questions and I'll sketch out a weekly charging routine for you.",
        "Let's figure out how charging could fit into your week.",
      ]) +
      " This demo uses sample data and estimates. Do you have a charger at your usual parking spot?",
  ];
}

// ---------- Homeowner / has-charger path ----------
function homePath() {
  return [
    "Good news: if you can charge where you park, home charging will cover most of your driving, and it's usually the cheapest way to charge.",
    "Your home plan: (1) Check whether there's a standard outlet in your garage. Tesla's Mobile Connector can use it overnight. " +
      "(2) For faster charging, get an electrician's quote for a Wall Connector (cost depends on your panel and wiring). " +
      "(3) Use Superchargers mainly for road trips. The car's navigation adds them to your route automatically.",
    `Cost estimate: at about ${HOME_PRICE * 100}¢/kWh, home charging costs roughly ${usd(HOME_PRICE * 0.27 * 100)} per 100 miles, versus about ${usd((100 / GAS_MPG) * GAS_PRICE)} in a ${GAS_MPG}-mpg gas car at $${GAS_PRICE.toFixed(2)}/gal. These are estimates, so check your utility rate.`,
    "Want to see a public-charging plan anyway? Say \"start over\" and answer \"No\" to the first question.",
  ];
}

// ---------- Main planner ----------
function plan(p) {
  const miles = Number(p.weekly_miles) || 0;
  const distanceText = str(p.station_distance);
  const anchor = str(p.anchor_place);
  const freeTime = str(p.free_time);
  const outlet = str(p.outlet_access);
  const trips = str(p.road_trip_frequency);
  const style = str(p.vehicle_style);

  // Outlet top-up reduces Supercharger miles needed.
  const hasOutlet = !!outlet && has(outlet, "yes", "outlet", "standard", "sometimes", "garage") && !has(outlet, "no ", "none", "don't", "dont", "never") && outlet.toLowerCase() !== "no";
  const outletMiles = hasOutlet ? Math.min(miles, 5 * OUTLET_MILES_PER_NIGHT) : 0;
  const superMiles = Math.max(0, miles - outletMiles);
  const stops = superMiles === 0 ? 0 : Math.max(1, Math.ceil(superMiles / MILES_PER_STOP));
  const chargeMin = stops * MINUTES_PER_STOP;

  // Distance band -> typical one-way miles, ~2 min per mile.
  let d = NaN, distPhrase = "", distBand = "unknown";
  if (has(distanceText, "not sure", "unsure", "don't know", "dont know", "idk")) { distBand = "unknown"; }
  else if (has(distanceText, "under", "less")) { d = 3; distBand = "near"; distPhrase = "a nearby station (under 5 miles)"; }
  else if (has(distanceText, "15+", "more than 15", "over 15")) { d = 18; distBand = "far"; distPhrase = "a station 15+ miles away"; }
  else if (has(distanceText, "5", "15")) { d = 10; distBand = "mid"; distPhrase = "a station 5–15 miles away"; }
  const detourMin = isNaN(d) ? 0 : Math.round(d * 2 * 2 * stops);
  const totalMin = chargeMin + detourMin;

  const a = anchor.toLowerCase();
  const hasAnchor = !!a && !has(a, "none");

  // ----- Charging fit score -----
  let fit, why;
  if (distBand === "far" || (miles >= 450 && !hasOutlet)) {
    fit = "Tough";
    why = distBand === "far"
      ? "your nearest Supercharger is 15+ miles away, so every stop turns into a long errand."
      : "at 450+ miles a week with no outlet, you'd need 3+ Supercharger stops every week.";
  } else if (distBand === "near" && hasAnchor && miles < 300) {
    fit = "Easy";
    why = "you have a station under 5 miles away, a place you already spend 20–30 minutes, and under 300 miles a week, so charging can fit into a habit you already have.";
  } else {
    fit = "Manageable";
    const weak = [];
    if (distBand === "mid") weak.push("the station is 5–15 miles out");
    if (distBand === "unknown") weak.push("we don't know your station distance yet");
    if (!hasAnchor) weak.push("there's no errand to pair charging with");
    if (miles >= 300) weak.push(`${miles} miles a week means ${stops >= 3 ? "3+" : stops} stops`);
    why = `it works with a deliberate routine${weak.length ? `, since ${list(weak)}` : ""}.`;
  }

  // ----- When to charge -----
  let when, offPeak = false;
  if (has(freeTime, "weekend")) { when = "weekend mornings, before stations get busy"; offPeak = true; }
  else if (has(freeTime, "late", "night")) { when = "late nights, when stations are quiet"; offPeak = true; }
  else if (has(freeTime, "morning")) { when = "weekday mornings, before your day starts"; offPeak = true; }
  else if (has(freeTime, "evening")) { when = "weekday evenings"; }
  else when = freeTime || "whenever you have a free half hour";

  const days = ["Monday", "Wednesday", "Friday", "Sunday", "Tuesday", "Thursday", "Saturday"];
  const weekendFirst = ["Saturday", "Sunday", "Wednesday", "Friday", "Monday", "Tuesday", "Thursday"];
  const schedule = (has(freeTime, "weekend") ? weekendFirst : days).slice(0, Math.min(stops, 7));

  // ----- Model suggestion -----
  const model = has(style, "suv", "model y", " y") ? "Model Y" : has(style, "sedan", "model 3", " 3") ? "Model 3" : (style || "Model 3");
  const kwhPerMile = KWH_PER_MILE[model] || 0.27;

  // ----- Cost vs gas (weekly) -----
  const gasWeek = (miles / GAS_MPG) * GAS_PRICE;
  const superWeek = superMiles * kwhPerMile * SUPERCHARGER_PRICE;
  const homeWeek = outletMiles * kwhPerMile * HOME_PRICE;
  const evWeek = superWeek + homeWeek;
  const evOffPeak = superWeek * (1 - OFF_PEAK_DISCOUNT) + homeWeek;

  const msgs = [];

  // 1. Weekly plan
  const opener = pick(["Here's your sample plan!", "Got it — here's what your week could look like.", "Okay, I ran the numbers."]);
  if (stops === 0) {
    msgs.push(`${opener} At about ${miles} miles a week, your outlet could cover most of your driving, so you'd rarely need a Supercharger. Save them for road trips.`);
  } else {
    let s = `${opener} At about ${miles} miles a week${hasOutlet ? ` (with roughly ${outletMiles} covered by overnight outlet charging)` : ""}, plan on ${stops} Supercharger stop${stops > 1 ? "s" : ""} a week — about ${fmt(chargeMin)} of charging${detourMin ? ` plus ~${fmt(detourMin)} of round-trip driving to ${distPhrase}` : ""}, so about ${fmt(totalMin)} a week in total.`;
    const wk = schedule.filter((x) => x === "Saturday" || x === "Sunday");
    const extra = schedule.filter((x) => x !== "Saturday" && x !== "Sunday");
    if (has(freeTime, "weekend") && extra.length) s += ` Suggested schedule: ${list(wk)} during ${when}, plus a quick weekday top-up on ${list(extra)}.`;
    else s += ` Suggested day${schedule.length > 1 ? "s" : ""}: ${list(schedule)}, during ${when}.`;
    if (miles >= 450) s += " Heads up: 450+ miles a week is a lot to cover with public charging alone.";
    msgs.push(s);
  }

  // 2. Fit score
  msgs.push(`Charging fit score: ${fit}. ${why.charAt(0).toUpperCase() + why.slice(1)}`);

  // 3. Habit-stacking tip
  if (stops > 0) {
    if (hasAnchor) {
      const spot = has(a, "work") ? "Charge at a Supercharger near work before or after your shift" :
        has(a, "gym") ? "Plug in, then do your gym session. The car's ready when you're done" :
        has(a, "grocery") ? "Plug in at a Supercharger near your grocery store and shop while it charges" :
        `Pair each stop with a ${a} trip so you're charging while you're already there`;
      msgs.push(`Habit tip: ${spot}.`);
    } else {
      msgs.push("Habit tip: pick one Supercharger near a place you already go (grocery store, gym, café) and make it your regular \"home base.\" Bring a podcast, because 25 minutes goes fast.");
    }
  }
  if (distBand === "unknown") msgs.push(`Not sure where the nearest station is? Look it up on Tesla's Supercharger map at ${MAP_URL}, then come back and say "start over" for a more exact plan.`);

  // 4. Cost vs gas
  if (miles > 0) {
    let c = `Cost estimate: about ${usd(evWeek)} a week to charge a ${model}, versus about ${usd(gasWeek)} for gas in a ${GAS_MPG}-mpg car at $${GAS_PRICE.toFixed(2)}/gal.`;
    if (stops > 0 && offPeak) c += ` Charging off-peak (${when.split(",")[0]}) could bring that closer to ${usd(evOffPeak)} a week. Check that station's rates in the Tesla app.`;
    else if (stops > 0) c += ` Late-night or early-morning charging is often cheaper, so it could get closer to ${usd(evOffPeak)} a week.`;
    if (evWeek >= gasWeek * 0.9 && stops > 0) c += " Honestly, Supercharging alone saves little over gas, so the savings come from off-peak hours and outlet charging.";
    else c += ` That's roughly ${usd((gasWeek - evWeek) * 52)} a year saved at those rates.`;
    msgs.push(c);
  }

  // 5. Model suggestion + road trips
  let m = model === "Model Y"
    ? "Model suggestion: Model Y. You picked SUV, and it adds cargo space and a higher seating position."
    : "Model suggestion: Model 3. You picked sedan, and it's the more efficient choice, so each stop goes a bit further.";
  if (miles >= 300 || has(trips, "monthly", "often", "frequent")) m += " With your mileage and trips, compare the Long Range trim's range on tesla.com.";
  msgs.push(m);
  if (trips) {
    msgs.push(has(trips, "often", "frequent", "monthly", "weekly", "every")
      ? "Road trips: since you travel often, you'll lean on the car's trip planner. It adds Supercharger stops to your route and shows how long to charge at each one."
      : "Road trips: for the occasional long drive, the car's navigation adds Supercharger stops to the route automatically.");
  }

  // 6. Tough -> landlord / HOA talking points
  if (fit === "Tough") {
    msgs.push(
      "Honest take: public charging alone would be hard for your routine right now. Before buying, ask your landlord or HOA: " +
        "(1) Can I use or add a standard outlet near my parking spot? " +
        "(2) Would the building consider shared EV chargers? Tesla has a program for property owners, and Wall Connectors can share power on one circuit. " +
        "(3) Are there EV-ready spots planned for the lot? Even one outlet would cut your Supercharger stops a lot."
    );
  }

  // 7. Before-you-buy checklist
  const where = hasAnchor ? `near your ${has(a, "work") ? "workplace" : a}` : "you'd use most";
  msgs.push(
    "Before you buy, here's your checklist: " +
      `(1) Check live stall availability at the Supercharger ${where}, at the time you'd actually go. ` +
      "(2) Visit that station once so the routine isn't hypothetical. " +
      "(3) Compare its peak and off-peak prices in the Tesla app. " +
      `(4) Book a ${model} test drive that ends at that Supercharger.`
  );

  // Wrap-up
  msgs.push("These are demo estimates — verify prices and specs on tesla.com. Say \"start over\" to try different answers.");
  return msgs;
}

module.exports = (req, res) => {
  if (req.method !== "POST") return res.status(200).send("Dialogflow webhook is running.");
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const qr = body.queryResult || {};
  const intent = (qr.intent && qr.intent.displayName) || "";
  const params = qr.parameters || {};

  let msgs;
  if (intent === "Default Welcome Intent") msgs = welcome();
  else if (intent === "Home_Charging_Yes") msgs = homePath();
  else if (intent === "Planner_Questions") msgs = plan(params);
  else msgs = [qr.fulfillmentText || "Sorry, could you say that another way?"]; // keep the console response

  res.status(200).json({
    fulfillmentText: msgs.join("\n\n"),
    fulfillmentMessages: msgs.map((t) => ({ text: { text: [t] } })),
  });
};

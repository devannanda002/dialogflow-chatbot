// Dialogflow ES webhook for the Tesla Supercharger Lifestyle Planner (demo).
// Deploy on Vercel (free). Webhook URL = https://<your-project>.vercel.app/api/webhook
// All numbers are demo assumptions, not live Tesla data.

const MILES_PER_STOP = 150;   // demo: one ~25 min Supercharger stop adds ~150 usable miles
const MINUTES_PER_STOP = 25;
const OUTLET_MILES_PER_NIGHT = 35; // demo: standard 120V outlet overnight (~10 h)

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const str = (v) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v)).trim();
const has = (s, ...words) => words.some((w) => s.toLowerCase().includes(w));

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Indiana/Indianapolis" }).format(new Date())
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function welcome() {
  return `${greeting()}! Welcome to the Tesla Supercharger Lifestyle Planner. ` +
    pick([
      "I'll build you a sample weekly charging plan in about a minute.",
      "A few quick questions and I'll sketch out a weekly charging routine for you.",
      "Let's figure out how charging could fit into your week.",
    ]) +
    " This demo uses sample station data. Do you have a charger at your usual parking spot?";
}

function plan(p) {
  const miles = Number(p.weekly_miles) || 0;
  const distanceText = str(p.station_distance);
  const anchor = str(p.anchor_place);
  const freeTime = str(p.free_time);
  const outlet = str(p.outlet_access);
  const trips = str(p.road_trip_frequency);
  const style = str(p.vehicle_style);

  // Outlet top-up reduces Supercharger miles needed.
  const hasOutlet = outlet && has(outlet, "yes", "outlet", "standard", "110", "120", "sometimes", "garage") && !has(outlet, "no ", "none", "don't", "dont", "never");
  const outletMiles = hasOutlet ? (has(outlet, "sometimes") ? 2 : 5) * OUTLET_MILES_PER_NIGHT : 0;
  const superMiles = Math.max(0, miles - outletMiles);
  const stops = superMiles === 0 ? 0 : Math.max(1, Math.ceil(superMiles / MILES_PER_STOP));
  const chargeMin = stops * MINUTES_PER_STOP;

  // Detour time from distance (first number found, assume ~2 min per mile each way).
  const d = parseFloat((distanceText.match(/[\d.]+/) || [])[0]);
  const detourMin = isNaN(d) ? 0 : Math.round(d * 2 * 2 * stops);
  const totalMin = chargeMin + detourMin;

  // When to charge.
  let when;
  if (has(freeTime, "morning")) when = "early mornings, before stations get busy";
  else if (has(freeTime, "lunch", "midday", "afternoon")) when = "a midday or lunch break";
  else if (has(freeTime, "evening", "night")) when = "evenings (check the app — later hours are often off-peak and cheaper)";
  else if (has(freeTime, "weekend")) when = "the weekend";
  else when = freeTime || "whenever you have a free half hour";

  const days = ["Monday", "Wednesday", "Friday", "Sunday", "Tuesday", "Thursday", "Saturday"];
  const weekendFirst = ["Saturday", "Sunday", "Wednesday", "Friday", "Monday", "Tuesday", "Thursday"];
  const schedule = (has(freeTime, "weekend") ? weekendFirst : days).slice(0, Math.min(stops, 7));

  const parts = [];
  parts.push(pick(["Here's your sample plan!", "Got it — here's what your week could look like.", "Okay, I ran the numbers."]));

  if (stops === 0) {
    parts.push(`At about ${miles} miles a week, your outlet could cover most of your driving, so you might rarely need a Supercharger.`);
  } else {
    parts.push(
      `At about ${miles} miles a week${hasOutlet ? ` (with roughly ${outletMiles} covered by your outlet)` : ""}, plan on ${stops} Supercharger stop${stops > 1 ? "s" : ""} — around ${chargeMin} minutes of charging${detourMin ? ` plus ~${detourMin} minutes of driving to a station ${distanceText} away` : ""}, so about ${totalMin} minutes a week.`
    );
    parts.push(`Suggested days: ${schedule.join(", ")}, during ${when}.`);
  }

  if (anchor && stops > 0) parts.push(`Pair each stop with ${anchor} so the charging time doesn't feel wasted.`);
  if (stops >= 3 && !hasOutlet) parts.push("Tip: even occasional access to a regular outlet would cut a stop or two.");
  if (trips && has(trips, "often", "frequent", "monthly", "weekly", "every")) {
    parts.push("Since you take road trips often, use the Tesla trip planner — it routes Supercharger stops for you.");
  } else if (trips) {
    parts.push("For the occasional road trip, the built-in trip planner will route Supercharger stops for you.");
  }
  if (style) parts.push(`Noted your vehicle preference: ${style}.`);
  parts.push("These are demo estimates — check current availability and prices in the Tesla app.");
  return parts.join(" ");
}

module.exports = (req, res) => {
  if (req.method !== "POST") return res.status(200).send("Dialogflow webhook is running.");
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const qr = body.queryResult || {};
  const intent = (qr.intent && qr.intent.displayName) || "";
  const params = qr.parameters || {};

  let text;
  if (intent === "Default Welcome Intent") text = welcome();
  else if (intent === "Planner_Questions") text = plan(params);
  else text = qr.fulfillmentText || "Sorry, could you say that another way?"; // keep the console response

  res.status(200).json({ fulfillmentText: text, fulfillmentMessages: [{ text: { text: [text] } }] });
};

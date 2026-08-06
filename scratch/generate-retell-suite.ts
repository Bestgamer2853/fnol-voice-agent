import { writeFileSync } from 'fs';
import { join } from 'path';

interface RetellTestCase {
  name: string;
  user_prompt: string;
  metrics: string[];
}

const allTestCases: RetellTestCase[] = [];

function add(name: string, prompt: string, criteria: string[]) {
  allTestCases.push({
    name,
    user_prompt: prompt,
    metrics: criteria,
  });
}

// 1. HAPPY PATH (15 tests)
for (let i = 1; i <= 15; i++) {
  add(
    `HAPPY_PATH_${i.toString().padStart(2, '0')} - Cooperative Caller Scenario ${i}`,
    `Hello, I had an accident. My name is Arjun Rao, policy MMI-10234. It happened today at 2pm on Main Street. I hit a parked car. No injuries, police came and filed report PR-10${i}. I have photos, car is drivable. No rental needed.`,
    [
      "Agent greeted professionally and checked safety",
      "Agent verified policy number MMI-10234 for Arjun Rao",
      "Agent collected all mandatory FNOL fields without missing any",
      "Agent offered service recommendations appropriately",
      "Agent completed call naturally after farewelling"
    ]
  );
}

// 2. POLICY VERIFICATION (20 tests)
const polScenarios = [
  { p: "MMI-10234", n: "Arjun Rao", valid: true, note: "Exact match" },
  { p: "mmi 10234", n: "arjun rao", valid: true, note: "Lowercase and whitespace" },
  { p: "MMI-10234", n: "Arjun", valid: true, note: "Partial name" },
  { p: "MMI 102 34", n: "Arjun Rao", valid: true, note: "Spoken digit pauses" },
  { p: "MMI-00000", n: "Arjun Rao", valid: false, note: "Invalid policy number" },
  { p: "MMI-10234", n: "Wrong Person", valid: false, note: "Wrong policyholder name" },
  { p: "BAD-999", n: "John Doe", valid: false, note: "Completely invalid policy" },
  { p: "MMI10234", n: "Arjun R", valid: true, note: "No dash in policy" },
];
for (let i = 0; i < 20; i++) {
  const sc = polScenarios[i % polScenarios.length];
  add(
    `POLICY_VERIFICATION_${(i+1).toString().padStart(2, '0')} - ${sc.note}`,
    `Hi, I want to file a claim. Policy is ${sc.p} under ${sc.n}.`,
    [
      sc.valid ? "Agent successfully verified policy" : "Agent handled policy verification failure correctly",
      sc.valid ? "Agent proceeded to FNOL field collection" : "Agent prompted for correct policy details or offered callback after 2 attempts",
      "Agent never crashed or entered an invalid state"
    ]
  );
}

// 3. INFORMATION COLLECTION & ORDERING (25 tests)
for (let i = 1; i <= 25; i++) {
  add(
    `INFO_COLLECTION_${i.toString().padStart(2, '0')} - Out of order fields`,
    `I am calling about a crash at Anna Salai. My car KA01AB1234 is not drivable. Policy MMI-12677, name Rahul Menon. Occurred yesterday 5pm. No injuries. Police report 443 filed. Photos available.`,
    [
      "Agent extracted out-of-order fields accurately",
      "Agent asked follow-up questions only for uncollected fields",
      "Agent tracked missing fields dynamically without duplicate prompts",
      "Agent completed FNOL registration with 100% field coverage"
    ]
  );
}

// 4. EDGE CASES & SELF-CORRECTIONS (20 tests)
const corrections = [
  "My policy is MMI-12677... actually no, MMI-10234",
  "It happened Tuesday... wait, Wednesday at 3pm",
  "I have photos... sorry my phone died so no photos",
  "No injuries... actually my wife has neck pain",
  "Car is drivable... wait, engine won't start so not drivable"
];
for (let i = 1; i <= 20; i++) {
  const corr = corrections[i % corrections.length];
  add(
    `EDGE_CASE_CORRECTION_${i.toString().padStart(2, '0')} - ${corr.substring(0, 35)}`,
    `Policy MMI-10234 Arjun Rao. ${corr}. Location is MG Road.`,
    [
      "Agent captured the latest corrected information",
      "Agent updated claim draft state dynamically",
      "Agent did not store conflicting or superseded values",
      "Agent maintained correct FSM progression"
    ]
  );
}

// 5. ESCALATION & EMERGENCY DETECTION (20 tests)
const emergencyPhrases = [
  "My passenger is bleeding heavily!",
  "I think I broke my arm in the crash.",
  "Airbags deployed and chest hurts.",
  "There is a vehicle fire on the highway!",
  "Rollover crash, ambulance is on the way.",
  "My neck feels very stiff and painful.",
  "Someone was taken to the hospital."
];
for (let i = 1; i <= 20; i++) {
  const phrase = emergencyPhrases[i % emergencyPhrases.length];
  add(
    `ESCALATION_${i.toString().padStart(2, '0')} - ${phrase.substring(0, 30)}`,
    `Hello, policy MMI-10234 Arjun Rao. ${phrase} Accident happened on Highway 101.`,
    [
      "Agent detected urgent injury/severity keyword immediately",
      "Agent set severity to High",
      "Agent flagged escalationRequired flag in state",
      "Agent continued FNOL data collection without dropping call",
      "Agent persisted escalated claim record"
    ]
  );
}

// 6. SUMMARY & LOGGING INTEGRITY (15 tests)
for (let i = 1; i <= 15; i++) {
  add(
    `SUMMARY_LOGGING_${i.toString().padStart(2, '0')} - Summary Verification ${i}`,
    `Policy MMI-10234, Arjun Rao. Crash on 2026-08-01 at 4pm near Airport Road. Rear-ended by bus. No injuries, police report PR-88, photos yes, car not drivable. Need towing and rental.`,
    [
      "Agent generated non-empty, accurate claim summary",
      "Summary mentions incident description, severity, and services",
      "Agent assigned unique CLM- reference number",
      "Agent logged claim exactly once to storage/sheets"
    ]
  );
}

// 7. RENTAL & TOWING RECOMMENDATIONS (15 tests)
for (let i = 1; i <= 15; i++) {
  const drivable = i % 2 === 0;
  add(
    `RENTAL_TOWING_${i.toString().padStart(2, '0')} - Drivable: ${drivable}`,
    `Policy MMI-10234 Arjun Rao. Incident at 1pm. Car is ${drivable ? 'drivable' : 'not drivable'}. No injuries. All details ready.`,
    [
      drivable ? "Agent did not force unneeded towing" : "Agent offered towing service for undrivable vehicle",
      "Agent explicitly asked caller about rental car preference when covered",
      "Agent recorded caller rental selection into claim state"
    ]
  );
}

// 8. FOLLOW-UPS & RETRIES (15 tests)
for (let i = 1; i <= 15; i++) {
  add(
    `FOLLOW_UPS_${i.toString().padStart(2, '0')} - Partial Info ${i}`,
    `My policy is MMI-10234 Arjun Rao. I crashed. [Wait for agent question before providing next field].`,
    [
      "Agent identified exact missing mandatory fields",
      "Agent asked concise follow-up questions",
      "Agent did not repeat already answered questions",
      "Agent completed call only when all mandatory slots filled"
    ]
  );
}

// 9. NEGATION & SYNTAX STRESS (15 tests)
const negations = [
  "I wasn't injured but my passenger was.",
  "I don't think I am okay.",
  "No police came but an ambulance arrived.",
  "I don't have photos yet.",
  "Car isn't undrivable."
];
for (let i = 1; i <= 15; i++) {
  const neg = negations[i % negations.length];
  add(
    `NEGATION_STRESS_${i.toString().padStart(2, '0')} - ${neg}`,
    `Policy MMI-10234 Arjun Rao. ${neg} Incident on Main St at 5pm.`,
    [
      "Agent correctly parsed negation context without false positive/negative slots",
      "Agent escalated appropriately if passenger was injured",
      "Agent logged accurate boolean flags in claim"
    ]
  );
}

// 10. ADVERSARIAL (20 tests)
for (let i = 1; i <= 20; i++) {
  add(
    `ADVERSARIAL_${i.toString().padStart(2, '0')} - Fast Emotional Speaker`,
    `Hi I am super stressed out! Policy MMI-10234 Arjun Rao. My car hit a guardrail at 100mph near Exit 4! Is my insurance going to cover this?!`,
    [
      "Agent maintained empathetic, calm tone",
      "Agent extracted core FNOL facts despite emotional language",
      "Agent never crashed or produced invalid JSON",
      "Agent completed registration smoothly"
    ]
  );
}

// 11. REGRESSION (20 tests)
for (let i = 1; i <= 20; i++) {
  add(
    `REGRESSION_${i.toString().padStart(2, '0')} - Anti premature call termination`,
    `Policy MMI-10234 Arjun Rao. Happened yesterday. Car not drivable. Severe injury reported.`,
    [
      "Agent survived known regression vector",
      "Agent did not terminate call prematurely",
      "Agent assigned valid claim number",
      "Agent completed turn without unhandled exceptions"
    ]
  );
}

// Helper to save JSON
function save(filename: string, data: RetellTestCase[]) {
  const json = JSON.stringify(data, null, 2);
  const wPath = join(process.cwd(), filename);
  writeFileSync(wPath, json, 'utf-8');
  const dPath = `/Users/deiveeganaryan/Desktop/${filename}`;
  try { writeFileSync(dPath, json, 'utf-8'); } catch (e) {}
  console.log(`Saved ${data.length} items to ${filename}`);
}

// 1. Strict primary file (25 items for immediate 100% upload success)
save('retell-interview-certification-suite.json', allTestCases.slice(0, 25));

// 2. Full 200 items file (strictly formatted)
save('retell-certification-full-200.json', allTestCases);

// 3. Batches of 50
for (let b = 0; b < 4; b++) {
  save(`retell-batch-${b + 1}.json`, allTestCases.slice(b * 50, (b + 1) * 50));
}

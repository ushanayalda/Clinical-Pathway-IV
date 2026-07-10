import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];
const checks = [];

function check(condition, label) {
  checks.push(label);
  if (!condition) failures.push(label);
}

async function json(path) {
  return JSON.parse(await readFile(join(root, path), "utf8"));
}

async function text(path) {
  return readFile(join(root, path), "utf8");
}

async function listFiles(path) {
  const entries = await readdir(join(root, path), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = join(path, entry.name);
    return entry.isDirectory() ? listFiles(relative) : [relative];
  }));
  return nested.flat();
}

const internalContentKeys = new Set([
  "case_id",
  "phase_id",
  "pattern_id",
  "mode",
  "status",
  "unlock_rule",
  "unlock_source",
  "interaction_role",
  "request_role",
  "delivery_role",
  "learner_delivery",
  "sets_state",
  "stage_order",
  "id",
  "step_id",
  "role",
  "correct_choice_id"
]);

function learnerStrings(value, parentKey = "") {
  if (internalContentKeys.has(parentKey)) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => learnerStrings(item, parentKey));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => learnerStrings(item, key));
  }
  return [];
}

const [library, station, review, governance, index, app, styles] = await Promise.all([
  json("data/site/library.json"),
  json("data/cases/cp-c001/station.json"),
  json("data/cases/cp-c001/review.json"),
  json("data/cases/cp-c001/governance.json"),
  text("index.html"),
  text("assets/app.js"),
  text("assets/styles.css")
]);

check(Array.isArray(library.phases) && library.phases.length === 1, "Library has one prototype Phase");
const stationListing = library.phases?.[0]?.patterns?.[0]?.stations?.[0];
check(stationListing?.case_id === "CP-C001", "Library points to CP-C001");
check(!JSON.stringify(library).match(/diagnosis|gold_run|logic_track|critical_error|dominant_trap/i), "Library contains no answer leak");

check(station.case_id === "CP-C001", "Station identity is CP-C001");
check(station.mode === "blind_station", "Station mode is blind_station");
check(station.station_card?.station_number === "001", "Station number is 001");
check(!/candidate/i.test(station.station_card?.heading || ""), "Station Card uses learner-facing heading");
check(station.station_card?.tasks?.length === 4, "Station Card contains four tasks");
check(station.opening_line?.unlock_source === "station_started", "Patient opening is gated by Start");
check(station.plan_gate?.label === "I have discussed my plan.", "Plan gate uses the exact authority label");
check(station.plan_gate?.is_scoring === false, "Plan gate is not scoring");
check(station.finish_action?.sets_state === "attempt_finished", "Finish sets attempt_finished");

const responseToPlan = station.reveal_actions.find((item) => item.id === "response_to_plan");
check(responseToPlan?.unlock_source === "plan_discussed", "Patient pushback is locked behind plan_discussed");
check(station.reveal_actions.every((item) => item.label && item.response_text && item.speaker), "Every reveal has label, response, and speaker");
check(station.reveal_actions.filter((item) => item.unlock_source === "station_started").every((item) => !/ambulance|diagnos|transfer/i.test(item.label)), "Blind reveal labels do not leak the answer");

const stationKeys = JSON.stringify(station);
check(!/"gold_run"|"logic_track"|"safe_version"|"critical_errors"|"governance"/.test(stationKeys), "Blind Station file excludes hidden teaching layers");

const expectedStages = [
  "self_check",
  "safety_mirror",
  "what_changed",
  "safe_version",
  "thinking_traps",
  "what_if_paths",
  "try_again",
  "confidence_after_review"
];
check(review.case_id === "CP-C001" && review.mode === "review_mode", "Review identity and mode are correct");
check(review.unlock_rule === "attempt_finished", "Review unlock rule is attempt_finished");
check(JSON.stringify(review.stage_order) === JSON.stringify(expectedStages), "Review stages use the authority order");
check(JSON.stringify(review.stages.map((stage) => stage.id)) === JSON.stringify(expectedStages), "Review stage payload matches stage order");

const whatChanged = review.stages.find((stage) => stage.id === "what_changed");
const safeVersion = review.stages.find((stage) => stage.id === "safe_version");
const whatIfPaths = review.stages.find((stage) => stage.id === "what_if_paths");
const tryAgain = review.stages.find((stage) => stage.id === "try_again");
const confidenceStage = review.stages.find((stage) => stage.id === "confidence_after_review");
const learnerSpokenTurns = safeVersion?.gold_run?.filter((line) => line.learner_delivery === "speak") ?? [];
const spokenWordCount = (value = "") => value.trim().split(/\s+/).filter(Boolean).length;
check(whatChanged?.logic_moments?.length >= 3, "Logic and flexibility track has at least three checkpoints");
check(Boolean(whatChanged?.recovery_sentence), "Recovery pathway is present");
check(safeVersion?.reading_time_plan?.length >= 5, "Reading-Time Plan is complete");
check(safeVersion?.gold_run?.length >= 12, "Gold Run is a complete spoken sequence");
check(safeVersion.gold_run.every((line) => line.speaker && line.spoken && line.road_map), "Every Gold Run step has speaker, spoken line, and road map");
check(safeVersion.gold_run.some((line) => line.speaker === "Ushana"), "Gold Run contains learner-spoken doctor lines");
check(safeVersion.gold_run.some((line) => line.speaker === "David"), "Gold Run contains patient-response lines");
check(safeVersion.gold_run.some((line) => /action/i.test(line.speaker)), "Gold Run contains non-spoken clinical actions");
check(safeVersion.gold_run.some((line) => line.delivery_role === "candidate_handover" && line.role_label === "You hand over"), "Gold Run labels the handover as learner-spoken");
check(safeVersion.gold_run.filter((line) => ["examiner_findings", "candidate_handover"].includes(line.step_id)).every((line) => line.spoken.includes("\n")), "Dense examiner and handover text is split into readable chunks");
check(learnerSpokenTurns.filter((line) => line.delivery_role !== "candidate_handover").every((line) => spokenWordCount(line.spoken) <= 45), "Learner-spoken turns stay short enough to rehearse");
check(learnerSpokenTurns.filter((line) => line.delivery_role === "candidate_handover").every((line) => spokenWordCount(line.spoken) <= 105), "Handover stays within the 45-second practice target");
check(tryAgain?.practice_ladder?.length >= 8, "Practice Ladder is complete");
check(tryAgain?.retry_options?.every((item) => item.hint && item.model_line && item.practice_task), "Each guided retry has one targeted Hint");
const transferDrills = whatIfPaths?.transfer_drills ?? [];
check(transferDrills.length === 3, "Review contains exactly three transfer drills");
check(
  ["patient_label_changes", "one_classic_clue_missing", "early_ecg_pressure"].every((id) => transferDrills.some((item) => item.id === id)),
  "Transfer drills cover label change, missing clue, and early-test pressure"
);
check(transferDrills.every((drill) => drill.choices?.length === 3 && drill.correct_choice_id && drill.feedback_correct && drill.feedback_retry), "Every transfer drill has three choices and corrective feedback");
check(confidenceStage?.levels?.length === 5, "Confidence Review uses five descriptive levels");

check(/READING_SECONDS\s*=\s*2\s*\*\s*60/.test(app), "Reading state has a strict two-minute duration");
check(/STATION_SECONDS\s*=\s*8\s*\*\s*60/.test(app), "Blind Station has a strict eight-minute duration");
check(/reading-clock|Reading time remaining/i.test(app), "Reading state renders an accessible countdown");
check(/attempt_history|attempts/.test(app), "Runtime preserves objective attempt history");
check(/pushback_opened|response_to_plan_opened/.test(app), "Runtime records whether patient pushback was opened");
check(/duration_seconds|elapsed_seconds/.test(app), "Runtime records objective attempt duration");
check(/review_stage_progress|review_completed_stages|visited_review_stages/.test(app), "Runtime tracks staged Review progress independently from confidence");
check(/learning-instruction/.test(app), "Learning mode exposes a role-correct instruction label");
check(/data-attempt-evidence/.test(app), "Review exposes objective attempt evidence");
check(/data-attempt-history/.test(app), "Journey exposes retained attempt history");

const requiredHoldFields = [
  "source_status",
  "schema_status",
  "renderer_status",
  "clinical_status",
  "accessibility_status",
  "audio_manifest_status",
  "audio_generation_status",
  "listen_test_status",
  "audio_release_status",
  "release_status",
  "medication_management_status"
];
check(requiredHoldFields.every((key) => governance[key] === "hold"), "All required governance and release gates remain HOLD");
check(governance.last_human_reviewer === null && governance.release_approver === null, "No human reviewer or release approver is invented");
check(governance.blocked_actions.includes("case_002_generation"), "Case 002 remains blocked");

check(/<html lang="en-AU">/.test(index), "Document language is en-AU");
check(/name="viewport"/.test(index), "Mobile viewport is declared");
check(/class="skip-link"/.test(index), "Skip link is present");
check(/<main id="app-main"/.test(index), "Main landmark is present");
check(/aria-live="polite"/.test(index), "Live status region is present");
check(app.includes('room === "review" && !state.review_unlocked'), "Direct Review access is blocked before Finish");
check(app.includes("state.review_unlocked = true"), "Finish unlocks Review");
check(app.includes("state.encounter_log.push"), "Encounter log grows only through runtime events");
check(styles.includes("@media (max-width: 640px)"), "Phone layout rules are present");
check(styles.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-motion rules are present");
check(styles.includes(":focus-visible"), "Visible keyboard focus is styled");

const learnerFiles = [
  "index.html",
  "assets/app.js",
  "assets/styles.css",
  "data/site/library.json",
  "data/cases/cp-c001/station.json",
  "data/cases/cp-c001/review.json"
];
const learnerText = (await Promise.all(learnerFiles.map(text))).join("\n");
const learnerContentText = [index, library, station, review].map((value) => typeof value === "string" ? value : JSON.stringify(value)).join("\n");
const visibleDataText = [library, station, review].flatMap((value) => learnerStrings(value)).join("\n");
const roboticLanguage = /\b(certainty|prototype|retrieval|spacing)\b|clinic proof|strict mirror|Safety Mirror|weak turn|patient pushback|continuous rehearsal|portable station spine|heart danger|safe direction|safety action|Where did your run sit|After lunch becomes indigestion|examiner-facing/i;
check(!/[\u2014]/.test(learnerText), "Learner files contain no long dash character");
check(!/\bAMC\b|\bADHD\b/.test(learnerText), "Learner files contain no internal labels or branding");
check(!/\bDr\./.test(learnerText), "Learner files use first-name introduction style");
check(!/\bcandidate\b/i.test(visibleDataText), "Learner-facing data contains no candidate label");
check(!roboticLanguage.test(visibleDataText), "Learner-facing data contains no audited robotic or academic phrases");
check(/Does it feel sharp, burning, heavy, or tight\?/.test(visibleDataText), "Pain question uses natural parallel wording");
check(/Do you smoke\? Do you have diabetes/.test(visibleDataText), "Risk questions use short natural sentences");
check(!/\b(badges?|XP|streaks?|confetti|leaderboard|troph(?:y|ies))\b/i.test(learnerContentText), "Learner content contains no gamification");
check(!/voice recognition|microphone required|automatic pass|official score/i.test(learnerText), "Learner files contain no fake scoring or voice requirement");

const allFiles = await listFiles(".");
check(!allFiles.some((path) => /\.(mp3|wav|m4a|ogg)$/i.test(path)), "No audio was generated");
check(!allFiles.some((path) => /case[-_ ]?002/i.test(path)), "No Case 002 artifact was generated");
check(allFiles.filter((path) => extname(path) === ".json").every(Boolean), "All JSON artifacts were enumerated");

if (failures.length) {
  console.error(`Validation failed: ${failures.length} of ${checks.length} checks`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Validation passed: ${checks.length} checks`);
console.log("Boundary preserved: CP-C001 draft prototype, all release gates HOLD");

const DATA_PATHS = {
  library: "data/site/library.json",
  station: "data/cases/cp-c001/station.json",
  review: "data/cases/cp-c001/review.json"
};

const STORAGE_KEY = "clinical-pathway-case-001-v2";
const STATION_SECONDS = 8 * 60;
const READING_SECONDS = 2 * 60;
const MIN_FULL_SPOKEN_RUN_SECONDS = 3 * 60;

const defaultState = () => ({
  version: 3,
  room: "home",
  mode: null,
  reading_started_at: null,
  reading_time_expired: false,
  station_started: false,
  station_started_at: null,
  station_finished_at: null,
  station_timed_out: false,
  attempt_finished: false,
  station_locked: false,
  review_unlocked: false,
  plan_discussed: false,
  review_stage: 0,
  review_max_stage: 0,
  review_completed_stages: [],
  journey_updated: false,
  attempt_status: "not_started",
  review_status: "locked",
  revealed: [],
  encounter_log: [],
  attempt_history: [],
  review_history: [],
  self_check: [],
  self_check_confirmed: false,
  safety_mirror: null,
  weak_segment: null,
  confidence_before: null,
  confidence_after: null,
  reasoning_revealed: false,
  actual_run_completed: false,
  transfer_responses: {},
  transfer_attempts: {},
  learning_step: 0,
  learning_view: "actual_run",
  learning_run_seen: false,
  guided_hint_visible: false,
  guided_model_visible: false,
  guided_retry_completed: false,
  guided_retry_count: 0
});

let state = loadState();
let libraryData;
let stationData;
let reviewData;
let timerHandle;
let statusHandle;
let stationFinishing = false;

const main = document.querySelector("#app-main");
const siteHeader = document.querySelector("#site-header");
const primaryNav = document.querySelector("#primary-nav");
const stationBar = document.querySelector("#station-bar");
const stationClock = document.querySelector("#station-clock");
const statusMessage = document.querySelector("#status-message");

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved?.version === 3 ? { ...defaultState(), ...saved } : defaultState();
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSpoken(value = "") {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function clearAnnouncement() {
  clearTimeout(statusHandle);
  document.querySelector(".status-message-inline")?.remove();
  statusMessage.classList.remove("is-visible");
  document.body.classList.remove("status-visible");
}

function announce(message) {
  clearAnnouncement();
  statusMessage.textContent = message;
  statusMessage.classList.add("is-visible");
  document.body.classList.add("status-visible");

  let inlineStatus;
  if (matchMedia("(max-width: 640px)").matches) {
    inlineStatus = document.createElement("div");
    inlineStatus.className = "status-message-inline";
    inlineStatus.setAttribute("aria-hidden", "true");
    inlineStatus.textContent = message;
    const active = document.activeElement;
    const actionRow = active?.closest?.(".action-row");
    const container = active?.closest?.(".review-stage, .room--station, .room") || main.querySelector(".room");
    if (actionRow) actionRow.before(inlineStatus);
    else container?.prepend(inlineStatus);
  }

  statusHandle = setTimeout(() => {
    statusMessage.classList.remove("is-visible");
    document.body.classList.remove("status-visible");
    inlineStatus?.remove();
  }, 4200);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${path}`);
  return response.json();
}

async function loadReview() {
  if (!reviewData) reviewData = await fetchJson(DATA_PATHS.review);
  return reviewData;
}

function currentHashRoom() {
  const room = location.hash.replace("#", "");
  return ["home", "library", "station", "review", "journey"].includes(room) ? room : "home";
}

function setRoom(room, { focus = true, replace = false } = {}) {
  if (room === "review" && !state.review_unlocked) {
    announce("Finish the station before Review opens.");
    room = state.station_started ? "station" : "library";
  }

  state.room = room;
  saveState();

  const nextHash = `#${room}`;
  if (location.hash !== nextHash) {
    if (replace) history.replaceState(null, "", nextHash);
    else history.pushState(null, "", nextHash);
  }

  render({ focus });
}

function updateChrome() {
  const protectedStation = state.room === "station" && state.mode === "blind_station" && !state.attempt_finished;
  const liveStation = protectedStation && state.station_started;
  siteHeader.classList.toggle("is-protected", protectedStation);
  stationBar.hidden = !liveStation;
  document.body.classList.toggle("station-active", protectedStation);

  primaryNav.querySelectorAll("button[data-room]").forEach((button) => {
    if (button.dataset.room === state.room) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });

  if (protectedStation) startClock();
  else stopClock();
}

function startClock() {
  stopClock();
  updateClock();
  timerHandle = setInterval(updateClock, 1000);
}

function stopClock() {
  clearInterval(timerHandle);
  timerHandle = undefined;
}

function updateClock() {
  const reading = state.mode === "blind_station" && !state.station_started && !state.attempt_finished;
  const startedAt = reading ? state.reading_started_at : state.station_started_at;
  if (!startedAt) return;
  const limit = reading ? READING_SECONDS : STATION_SECONDS;
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const remaining = Math.max(0, limit - elapsed);
  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  const targetClock = reading ? document.querySelector("#reading-clock") : stationClock;
  if (targetClock) {
    targetClock.textContent = `${minutes}:${seconds}`;
    targetClock.setAttribute("aria-label", `${reading ? "Reading" : "Station"} time remaining: ${minutes} minutes and ${seconds} seconds`);
  }

  if (reading && remaining === 0 && !state.reading_time_expired) {
    state.reading_time_expired = true;
    saveState();
    announce("Reading time finished. Start the station when ready.");
  }

  if (!reading && remaining === 0 && !state.attempt_finished && !stationFinishing) {
    stationFinishing = true;
    finishStation("time_limit").finally(() => { stationFinishing = false; });
  }
}

function render({ focus = true, resetScroll = true, focusSelector = "#app-main", scrollTarget = null } = {}) {
  const previousScroll = window.scrollY;
  updateChrome();

  if (state.room === "home") main.innerHTML = renderHome();
  if (state.room === "library") main.innerHTML = renderLibrary();
  if (state.room === "station") main.innerHTML = renderStation();
  if (state.room === "review") main.innerHTML = renderReview();
  if (state.room === "journey") main.innerHTML = renderJourney();

  if (focus) {
    requestAnimationFrame(() => {
      const target = document.querySelector(focusSelector) || main;
      target.focus({ preventScroll: true });
      if (scrollTarget) document.querySelector(scrollTarget)?.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      else window.scrollTo({ top: resetScroll ? 0 : previousScroll, behavior: "auto" });
      document.querySelector('.review-stage-nav [aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "center", behavior: "auto" });
    });
  }
}

function formatDuration(totalSeconds = 0) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function roleMeta(step = {}) {
  const role = step.role || (step.speaker === "Ushana" ? "candidate" : step.speaker === "David" ? "patient" : step.speaker === "Examiner" ? "examiner" : "action");
  if (step.delivery_role === "candidate_handover") {
    return { role: "candidate", label: "You hand over", instruction: "Say your handover aloud." };
  }
  const defaults = {
    candidate: ["You say", "Say this aloud."],
    patient: ["David says", "Listen to David."],
    examiner_request: ["You ask the examiner", "Say this to the examiner."],
    examiner: ["Examiner says", "Read the examiner's findings."],
    action: ["Action to take", "Do this. Do not say it aloud."]
  };
  const [label, instruction] = defaults[role] || defaults.action;
  return { role, label, instruction };
}

function nextAction() {
  if (!state.station_started && !state.attempt_finished) {
    return { label: "Open Library", room: "library", detail: "Choose how you want to practise Station 001." };
  }
  if (state.station_started && !state.attempt_finished) {
    return { label: "Continue Station 001", room: "station", detail: "Your timed station is still open." };
  }
  if (state.attempt_finished && state.review_status !== "completed") {
    return { label: "Continue Review", room: "review", detail: "Work through each part, then choose what to practise." };
  }
  if (state.weak_segment && state.weak_segment !== "full_run" && !state.guided_retry_completed) {
    return { label: "Practise one part", action: "start-guided", detail: "Use the Hints, say it aloud, then try the station again." };
  }
  return { label: "Run Station 001 again", action: "prepare-blind", detail: "Try the whole station again without the example." };
}

function renderHome() {
  const action = nextAction();
  const attemptLabel = state.attempt_finished ? "Station finished" : state.station_started ? "In progress" : "Not started";
  const reviewLabel = state.review_status === "completed" ? "Reviewed" : state.review_unlocked ? "Ready" : "Finish station first";

  return `
    <section class="room" aria-labelledby="home-title">
      <p class="eyebrow">Clinical Pathway</p>
      <h1 id="home-title">Continue from one clear next step.</h1>
      <p class="lead">Learn the station, practise it aloud, then focus only on what needs work.</p>

      <article class="panel panel--tint" style="max-width:760px">
        <p class="eyebrow">Your next step</p>
        <h2>${escapeHtml(action.label)}</h2>
        <p>${escapeHtml(action.detail)}</p>
        <p class="small muted">Attempt: ${attemptLabel} · Review: ${reviewLabel}</p>
        <div class="action-row">
          <button class="button" type="button" ${action.action ? `data-action="${escapeHtml(action.action)}"` : `data-room="${escapeHtml(action.room)}"`}>${escapeHtml(action.label)}</button>
          <button class="button button--secondary" type="button" data-room="journey">Open Journey</button>
        </div>
      </article>

      <p class="small muted" style="margin-top: 28px">Clinical Pathway is for clinical exam practice. It does not replace clinical judgement, supervision, or local protocols.</p>
    </section>`;
}

function renderLibrary() {
  const phases = libraryData.phases.map((phase) => `
    <section class="phase-block" aria-labelledby="${phase.phase_id}-title">
      <div class="phase-heading">
        <div>
          <p class="eyebrow">${escapeHtml(phase.label)}</p>
          <h2 id="${phase.phase_id}-title">${escapeHtml(phase.confidence_target)}</h2>
        </div>
      </div>
      ${phase.patterns.map((pattern) => `
        <div class="pattern-block">
          <p class="eyebrow">Pattern</p>
          <h3>${escapeHtml(pattern.label)}</h3>
          <p class="muted">${escapeHtml(pattern.training_job)}</p>
          ${pattern.stations.map((station) => `
            <article class="station-listing">
              <div class="station-number" aria-label="Station ${escapeHtml(station.number)}">${escapeHtml(station.number)}</div>
              <div>
                <h3>${escapeHtml(station.title)}</h3>
                <p class="small muted">${escapeHtml(station.station_type)}</p>
                <p>${escapeHtml(station.recommended_action)}</p>
              </div>
              <div class="action-row">
                <button class="button button--secondary" type="button" data-action="start-learning">Learn from Actual Run</button>
                <button class="button" type="button" data-action="prepare-blind">Practise without prompts</button>
              </div>
            </article>`).join("")}
        </div>`).join("")}
    </section>`).join("");

  return `
    <section class="room" aria-labelledby="library-title">
      <p class="eyebrow">Library</p>
      <h1 id="library-title">Choose a station to practise.</h1>
      <p class="lead">Start with the full spoken example, or try the station without prompts.</p>
      ${phases}
    </section>`;
}

function renderStation() {
  if (state.mode === "learning_mode") return renderLearningMode();
  if (state.mode === "guided_retry") return renderGuidedRetry();
  if (state.attempt_finished && state.station_locked) return renderFinishedStation();
  if (state.mode === "blind_station" && state.station_started) return renderLiveStation();
  return renderReadingScreen();
}

function renderReadingScreen() {
  const card = stationData.station_card;
  return `
    <section class="room room--reading" aria-labelledby="reading-title">
      <div class="reading-note"><div><strong>2-minute reading</strong><span>Read the tasks. Notice the setting. Decide what you need to do first. David speaks after you start.</span></div><span id="reading-clock" role="timer" aria-label="Reading time remaining">02:00</span></div>
      <article class="station-card">
        <header class="station-card__top">
          <p class="eyebrow" style="color:#cfe7ea">Station ${escapeHtml(card.station_number)}</p>
          <h1 id="reading-title">${escapeHtml(card.title)}</h1>
        </header>
        <div class="station-card__body">
          <h2>Your information and tasks</h2>
          ${card.candidate_information.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
          <h2>${escapeHtml(card.tasks_heading.replace("YOUR TASKS ARE TO:", "Your tasks"))}</h2>
          <ul>${card.tasks.map((task) => `<li>${escapeHtml(task)}</li>`).join("")}</ul>
          <div class="action-row">
            <button class="button" type="button" data-action="start-station">Start station</button>
            <button class="button button--secondary" type="button" data-room="library">Back to Library</button>
          </div>
        </div>
      </article>
    </section>`;
}

function visibleRevealActions() {
  return stationData.reveal_actions.filter((action) => {
    const unlocked = action.unlock_source === "station_started" || (action.unlock_source === "plan_discussed" && state.plan_discussed);
    return unlocked && !state.revealed.includes(action.id);
  });
}

function stationCompletionItems() {
  const required = stationData.completion_evidence?.required_reveals || [
    { id: "pain_story", label: "Pain questions asked" },
    { id: "associated_symptoms", label: "Warning symptoms checked" },
    { id: "observations_examination", label: "Vital signs and examination findings requested" },
    { id: "response_to_plan", label: "David's concern about the ambulance answered" }
  ];
  return required.map((item) => ({ ...item, complete: state.revealed.includes(item.id) }));
}

function canFinishStation() {
  return state.plan_discussed && stationCompletionItems().every((item) => item.complete);
}

function renderLiveStation() {
  const current = state.encounter_log.at(-1) || {
    speaker: stationData.opening_line.speaker,
    response_text: stationData.opening_line.text
  };
  const actions = visibleRevealActions();
  const completionItems = stationCompletionItems();
  const readyToFinish = canFinishStation();
  const priorLog = state.encounter_log.slice(0, -1);
  const missingItems = completionItems.filter((item) => !item.complete);

  return `
    <section class="room room--station" aria-labelledby="station-title">
      <div class="station-grid">
        <div>
          <p class="eyebrow">Station 001 · Timed practice</p>
          <h1 id="station-title" style="font-size:clamp(1.85rem,5vw,3rem)">Speak first. Then reveal the response.</h1>

          <article class="patient-response" id="current-response" tabindex="-1" aria-live="polite" aria-atomic="true">
            <p class="speaker">${escapeHtml(current.speaker)}</p>
            <p class="spoken-line">${formatSpoken(current.response_text)}</p>
          </article>

          ${!state.plan_discussed ? `
            <div class="plan-gate">
              <h2>Ready to explain your plan?</h2>
              <p>Explain your concern and urgent plan to David. Then confirm that you have done it.</p>
              <button class="button" type="button" data-action="plan-gate">${escapeHtml(stationData.plan_gate.label)}</button>
            </div>` : ""}

          <div class="ask-panel" tabindex="-1">
            <h2>What will you ask next?</h2>
            <p class="muted">Ask aloud, then choose the matching topic.</p>
            <div class="ask-grid">
              ${actions.length ? actions.map((action) => `
                <button class="ask-button" type="button" data-action="reveal" data-reveal-id="${escapeHtml(action.id)}">${escapeHtml(action.label)}</button>`).join("") : `<p class="muted">You have opened every response.</p>`}
            </div>
          </div>

          ${state.plan_discussed ? `
            <div class="finish-gate">
              <h2>${readyToFinish ? "Ready to finish" : "Still needed"}</h2>
              ${missingItems.length ? `<ul class="evidence-list">${missingItems.map((item) => `<li><span aria-hidden="true">○</span>${escapeHtml(item.label)}</li>`).join("")}</ul>` : `<p>You have opened the required parts.</p>`}
              <div class="action-row">
                <button class="button" type="button" data-action="finish-station" ${readyToFinish ? "" : "disabled"}>${escapeHtml(stationData.finish_action.label)}</button>
              </div>
            </div>` : ""}
        </div>

        <aside class="encounter-panel">
          <details>
            <summary><strong>Earlier responses</strong> <span class="small muted">${priorLog.length}</span></summary>
            <ol class="encounter-log">
              ${priorLog.length ? priorLog.map((item) => `
                <li>
                  <span class="log-label">${escapeHtml(item.action_label)} · ${escapeHtml(item.speaker)}</span>
                  <span>${formatSpoken(item.response_text)}</span>
                </li>`).join("") : `<li class="muted">No earlier responses yet.</li>`}
            </ol>
          </details>
        </aside>
      </div>
    </section>`;
}

function renderFinishedStation() {
  return `
    <section class="room room--reading" aria-labelledby="finished-title">
      <article class="locked-panel">
        <p class="eyebrow">Station 001 finished</p>
        <h1 id="finished-title" style="font-size:clamp(2rem,6vw,3.4rem)">Your Review is ready.</h1>
        <p class="lead">Compare what you did with the Actual Run, one step at a time.</p>
        <div class="action-row" style="justify-content:center">
          <button class="button" type="button" data-room="review">Open Review</button>
          <button class="button button--secondary" type="button" data-room="journey">Open Journey</button>
        </div>
      </article>
    </section>`;
}

function safeVersionStage() {
  return reviewData.stages.find((stage) => stage.id === "safe_version");
}

function renderLearningMode() {
  if (!reviewData) return renderLoading("Preparing the Actual Run...");
  const stage = safeVersionStage();
  const steps = stage.gold_run;

  if (state.learning_view === "actual_run") {
    return `
      <section class="learning-shell" aria-labelledby="learning-title">
        <p class="eyebrow">Learn · Actual Run</p>
        <h1 id="learning-title" style="font-size:clamp(2rem,6vw,3.65rem)">${escapeHtml(stage.title)}</h1>
        <p class="lead">Read the whole station once. Say the parts marked <strong>You say</strong>, <strong>You ask the examiner</strong>, or <strong>You hand over</strong>.</p>
        ${stage.completeness_note ? `<div class="clinical-hold-note"><strong>About this example</strong><p>${escapeHtml(stage.completeness_note)}</p></div>` : ""}
        <details class="panel panel--quiet reading-plan">
          <summary><strong>What to notice in reading time</strong></summary>
          <ol>${stage.reading_time_plan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
        </details>
        ${renderActualRunScript(steps)}
        <div class="action-row">
          <button class="button" type="button" data-action="learning-open-map">See the 4 key turns</button>
          <button class="button button--secondary" type="button" data-action="prepare-blind">Start timed station</button>
          <button class="button button--quiet" type="button" data-room="library">Back to Library</button>
        </div>
      </section>`;
  }

  const moments = stage.learning_moments || [];
  const index = Math.min(state.learning_step, moments.length - 1);
  const moment = moments[index];
  const progress = Math.round(((index + 1) / moments.length) * 100);

  return `
    <section class="learning-shell" aria-labelledby="learning-title">
      <p class="eyebrow">Key turn ${index + 1} of ${moments.length}</p>
      <h1 id="learning-title" style="font-size:clamp(2rem,6vw,3.65rem)">Follow the change in risk.</h1>
      <p class="lead">Each turn gives you a new reason to change what you do.</p>
      <div class="progress-line" aria-label="Learning progress: ${progress} percent"><span style="width:${progress}%"></span></div>

      <article class="learning-card" id="learning-step" tabindex="-1">
        <div class="learning-card__spoken">
          <p class="logic-label">What you notice</p>
          <p class="spoken-line">${escapeHtml(moment.signal)}</p>
          <p class="logic-label">What you do</p>
          <p>${escapeHtml(moment.action)}</p>
        </div>
        <div class="learning-card__logic">
          <p class="logic-label">Why</p>
          <p class="logic-copy">${escapeHtml(moment.reason)}</p>
        </div>
      </article>

      <div class="action-row">
        <button class="button button--secondary" type="button" data-action="learning-prev" ${index === 0 ? "disabled" : ""}>Previous step</button>
        ${index < moments.length - 1
          ? `<button class="button" type="button" data-action="learning-next">Next key turn</button>`
          : `<button class="button" type="button" data-action="prepare-blind">Start timed station</button>`}
        <button class="button button--quiet" type="button" data-action="learning-show-run">Back to Actual Run</button>
      </div>
    </section>`;
}

function renderActualRunScript(steps) {
  return `
    <div class="actual-run-script" aria-label="Full spoken station example">
      ${steps.map((step, index) => {
        const meta = roleMeta(step);
        return `
          <article class="run-turn run-turn--${escapeHtml(meta.role)}">
            <div>
              <span class="role-label role-label--${escapeHtml(meta.role)}">${escapeHtml(meta.label)}</span>
              <span class="small muted">Turn ${index + 1}</span>
            </div>
            <p>${formatSpoken(step.spoken)}</p>
          </article>`;
      }).join("")}
    </div>`;
}

function renderLoading(message) {
  return `<section class="room room--reading"><div class="panel"><h1 style="font-size:2.2rem">${escapeHtml(message)}</h1></div></section>`;
}

function latestAttempt() {
  return state.attempt_history.at(-1) || null;
}

function renderAttemptEvidence() {
  const attempt = latestAttempt();
  if (!attempt) return "";
  const missing = [];
  if (!attempt.revealed_ids?.includes("pain_story")) missing.push("focused pain questions");
  if (!attempt.revealed_ids?.includes("associated_symptoms")) missing.push("warning symptoms");
  if (!attempt.examiner_findings_requested) missing.push("examiner findings");
  if (!attempt.pushback_opened) missing.push("David's concern about driving");
  return `
    <section class="attempt-evidence panel panel--quiet" data-attempt-evidence aria-labelledby="attempt-evidence-title">
      <h3 id="attempt-evidence-title">What the site recorded</h3>
      <div class="evidence-metrics">
        <div><span>Time used</span><strong>${escapeHtml(formatDuration(attempt.elapsed_seconds))}</strong></div>
        <div><span>Responses opened</span><strong>${attempt.revealed_count} of ${attempt.available_reveals}</strong></div>
        <div><span>Required parts</span><strong>${missing.length ? `Missing ${missing.length}` : "Opened"}</strong></div>
      </div>
      ${missing.length ? `<p class="small"><strong>Focus next:</strong> ${escapeHtml(missing.join(", "))}.</p>` : `<p class="small">You opened the required patient and examiner responses.</p>`}
    </section>`;
}

function reviewRequirements() {
  const drills = visibleTransferDrills();
  return [
    { id: "self_check", label: "Attempt reviewed", complete: state.self_check_confirmed && Boolean(state.confidence_before) },
    { id: "safety_mirror", label: "Safety check completed", complete: Boolean(state.safety_mirror) },
    { id: "reasoning", label: "Plan change reviewed", complete: state.reasoning_revealed },
    { id: "actual_run", label: "Actual Run checked", complete: state.actual_run_completed },
    { id: "transfer", label: `Changed-detail questions completed`, complete: drills.length > 0 && drills.every((drill) => state.transfer_responses[drill.id] === drill.correct_choice_id) },
    { id: "weak_turn", label: "One practice area selected", complete: Boolean(state.weak_segment) },
    { id: "confidence", label: "Final confidence chosen", complete: Boolean(state.confidence_after) }
  ];
}

function renderReview() {
  if (!state.review_unlocked) return renderReviewLocked();
  if (!reviewData) return renderLoading("Opening Review...");

  const index = Math.min(state.review_stage, reviewData.stages.length - 1);
  const stage = reviewData.stages[index];

  return `
    <section class="room" aria-labelledby="review-title">
      <p class="eyebrow">Review · Stage ${index + 1} of ${reviewData.stages.length}</p>
      <h1 id="review-title" style="font-size:clamp(2.1rem,6vw,3.8rem)">${index === 0 ? "Review one useful part at a time." : escapeHtml(stage.title)}</h1>
      ${index === 0 ? `<p class="lead">Each stage adds a new job: compare, understand, adapt, then practise.</p>` : ""}

      <div class="review-grid">
        <nav class="review-stage-nav" aria-label="Review stages">
          ${reviewData.stages.map((item, itemIndex) => `
            <button type="button" data-action="review-stage" data-stage-index="${itemIndex}" ${itemIndex === index ? 'aria-current="step"' : ""} ${itemIndex > state.review_max_stage ? "disabled" : ""}>
              ${itemIndex + 1}. ${escapeHtml(item.short_label)}
            </button>`).join("")}
        </nav>
        <article class="review-stage" id="review-stage-panel" tabindex="-1" aria-labelledby="${index === 0 ? "review-stage-title" : "review-title"}">
          ${renderReviewStage(stage)}
          ${renderReviewControls(stage, index)}
        </article>
      </div>
    </section>`;
}

function renderReviewControls(stage, index) {
  const finalStage = index === reviewData.stages.length - 1;
  if (finalStage && state.review_status === "completed") {
    return `
      <div class="action-row review-actions">
        <button class="button button--secondary" type="button" data-action="review-prev">Back</button>
        <button class="button" type="button" data-room="journey">Open Journey</button>
      </div>`;
  }
  if (stage.id === "try_again") {
    return `<div class="action-row review-actions"><button class="button button--secondary" type="button" data-action="review-prev">Back</button></div>`;
  }

  let primaryAction = "review-next";
  let primaryLabel = finalStage ? "Complete Review" : "Continue";

  if (stage.id === "what_changed" && !state.reasoning_revealed) {
    primaryAction = "reveal-reasoning";
    primaryLabel = "Show why the plan changed";
  }

  return `
    <div class="action-row review-actions">
      <button class="button button--secondary" type="button" data-action="review-prev" ${index === 0 ? "disabled" : ""}>Back</button>
      <button class="button" type="button" data-action="${primaryAction}">${primaryLabel}</button>
    </div>`;
}

function renderReviewLocked() {
  return `
    <section class="room room--reading">
      <article class="locked-panel">
        <p class="eyebrow">Review not open yet</p>
        <h1 style="font-size:clamp(2rem,6vw,3.4rem)">Finish the station first.</h1>
        <p>The Actual Run and explanations stay hidden during timed practice.</p>
        <div class="action-row" style="justify-content:center"><button class="button" type="button" data-room="station">Go to Station</button></div>
      </article>
    </section>`;
}

function renderReviewStage(stage) {
  const stageHeading = state.review_stage === 0 ? `<h2 id="review-stage-title">${escapeHtml(stage.title)}</h2>` : "";
  if (stage.id === "self_check") {
    const confidenceStage = reviewData.stages.find((item) => item.id === "confidence_after_review");
    return `
      ${stageHeading}
      <p>${escapeHtml(stage.intro)}</p>
      ${renderAttemptEvidence()}
      <div class="confidence-before">
        <h3>How did the station feel?</h3>
        <div class="confidence-scale" aria-label="Confidence before Review">
          ${confidenceStage.levels.map((level) => `<button type="button" data-action="confidence-before" data-confidence="${level.value}" aria-pressed="${state.confidence_before === level.value}">${level.value}</button>`).join("")}
        </div>
        <div class="confidence-key small muted"><span>1 · Needed the example</span><span>2 · Knew the danger, lost some order</span><span>3 · Could run it independently</span></div>
      </div>`;
  }

  if (stage.id === "safety_mirror") {
    return `
      ${stageHeading}
      <p>${escapeHtml(stage.intro)}</p>
      <div class="choice-list">
        ${stage.options.map((option) => `
          <button class="mirror-choice" type="button" data-action="safety-choice" data-choice="${escapeHtml(option.id)}" aria-pressed="${state.safety_mirror === option.id}">
            <strong>${escapeHtml(option.label)}</strong>
            <span>${escapeHtml(option.description)}</span>
          </button>`).join("")}
      </div>`;
  }

  if (stage.id === "what_changed") {
    const prompts = stage.retrieval_prompts || [
      "What changed the risk?",
      "What is unsafe to miss?",
      "What should happen now?"
    ];
    return `
      ${stageHeading}
      <p>${escapeHtml(stage.intro)}</p>
      ${!state.reasoning_revealed ? `
        <div class="retrieval-prompt">
          <p class="eyebrow">Think before you look</p>
          <ol>${prompts.map((prompt) => `<li>${escapeHtml(prompt)}</li>`).join("")}</ol>
          <p class="small muted">Answer aloud, then check your reasoning.</p>
        </div>` : `
        <ol class="logic-list">
          ${stage.logic_moments.map((item) => `
            <li class="logic-item">
              <div class="logic-item__step">${escapeHtml(item.step)}</div>
              <div class="logic-item__signal">${escapeHtml(item.signal)}</div>
              <p>${escapeHtml(item.road_map)}</p>
            </li>`).join("")}
        </ol>
        <details class="selected-retry">
          <summary><strong>If you first thought it was indigestion</strong></summary>
          <p>${escapeHtml(stage.recovery_sentence)}</p>
        </details>`}`;
  }

  if (stage.id === "safe_version") return renderGoldRun(stage);

  if (stage.id === "thinking_traps") {
    const attempt = latestAttempt();
    const trap = !attempt?.plan_discussed || attempt?.timed_out
      ? stage.traps[1]
      : !attempt?.pushback_opened
        ? stage.traps[2]
        : stage.traps[0];
    return `
      ${stageHeading}
      <ul class="trap-list">
        <li class="trap-item">
          <h3>${escapeHtml(trap.label)}</h3>
          <p class="muted"><strong>What can happen:</strong> ${escapeHtml(trap.drift)}</p>
          <p class="trap-reset"><strong>Do this instead:</strong> ${escapeHtml(trap.reset)}</p>
        </li>
      </ul>`;
  }

  if (stage.id === "what_if_paths") {
    const drills = visibleTransferDrills();
    return `
      ${stageHeading}
      <p>${escapeHtml(stage.intro || "Apply the safety rule before reading an explanation.")}</p>
      ${drills.length ? `<div class="transfer-list">
        ${drills.map((drill, index) => renderTransferDrill(drill, index, drills.length)).join("")}
      </div>` : `<ul class="what-if-list">
          ${stage.paths.map((path) => `<li class="what-if-item"><h3>${escapeHtml(path.question)}</h3><p class="what-if-answer">${escapeHtml(path.answer)}</p></li>`).join("")}
        </ul>`}`;
  }

  if (stage.id === "try_again") return renderTryAgain(stage);

  if (stage.id === "confidence_after_review") {
    return `
      ${stageHeading}
      <p>${escapeHtml(stage.intro)}</p>
      <div class="confidence-list">
        ${stage.levels.map((level) => `
          <button class="confidence-choice" type="button" data-action="confidence-choice" data-confidence="${level.value}" aria-pressed="${state.confidence_after === level.value}">
            <strong>${level.value}</strong><span>${escapeHtml(level.label)}</span>
          </button>`).join("")}
      </div>
      ${state.confidence_after ? `<div class="selected-retry"><strong>Ready to save this Review.</strong></div>` : ""}`;
  }

  return "";
}

function visibleTransferDrills() {
  const drills = reviewData?.stages.find((stage) => stage.id === "what_if_paths")?.transfer_drills || [];
  if (drills.length <= 2) return drills;
  const fixed = drills.find((drill) => drill.id === "one_classic_clue_missing");
  const rotating = drills.filter((drill) => drill.id !== "one_classic_clue_missing");
  const attemptNumber = latestAttempt()?.number || 1;
  return [fixed, rotating[(attemptNumber - 1) % rotating.length]].filter(Boolean);
}

function renderTransferDrill(drill, index, total) {
  const selected = state.transfer_responses[drill.id];
  const correct = selected === drill.correct_choice_id;
  const attempted = (state.transfer_attempts[drill.id] || []).length > 0;
  return `
    <article class="transfer-drill">
      <p class="eyebrow">Change ${index + 1} of ${total}</p>
      <h3>${escapeHtml(drill.scenario)}</h3>
      <p>${escapeHtml(drill.prompt)}</p>
      <div class="choice-list">
        ${drill.choices.map((choice) => `
          <button class="transfer-choice" type="button" data-action="transfer-choice" data-drill-id="${escapeHtml(drill.id)}" data-choice-id="${escapeHtml(choice.id)}" aria-pressed="${selected === choice.id}">
            ${escapeHtml(choice.label)}
          </button>`).join("")}
      </div>
      ${attempted ? `<div class="transfer-feedback ${correct ? "is-correct" : "is-retry"}" role="status"><strong>${correct ? "This follows the safe plan" : "Look again"}</strong><p>${escapeHtml(correct ? drill.feedback_correct : drill.feedback_retry)}</p></div>` : ""}
    </article>`;
}

function renderGoldRun(stage) {
  if (!state.learning_run_seen) {
    return `
      <p>${escapeHtml(stage.intro)}</p>
      ${stage.completeness_note ? `<div class="clinical-hold-note"><strong>About this example</strong><p>${escapeHtml(stage.completeness_note)}</p></div>` : ""}
      ${renderActualRunScript(stage.gold_run)}
      <details class="station-spine panel panel--quiet">
        <summary><strong>Need a shorter order?</strong></summary>
        ${stage.portable_station_spine ? `<ol>${stage.portable_station_spine.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("")}</ol>` : ""}
      </details>`;
  }

  return `
    <div class="selected-retry">
      <strong>You already studied the full run.</strong>
      <p>Skip the repeated script. Open it only if you need the exact wording.</p>
    </div>
    <details class="panel panel--quiet">
      <summary><strong>Show the Actual Run again</strong></summary>
      ${renderActualRunScript(stage.gold_run)}
    </details>`;
}

function renderTryAgain(stage) {
  return `
    <p>${escapeHtml(stage.intro)}</p>
    <div class="retry-list">
      ${stage.retry_options.map((option) => `
        <button class="retry-choice" type="button" data-action="retry-choice" data-retry-id="${escapeHtml(option.id)}" aria-pressed="${state.weak_segment === option.id}">
          <strong>${escapeHtml(option.label)}</strong>
        </button>`).join("")}
    </div>`;
}

function renderGuidedRetry() {
  if (!reviewData) return renderLoading("Preparing your practice...");
  const stage = reviewData.stages.find((item) => item.id === "try_again");
  const option = stage.retry_options.find((item) => item.id === state.weak_segment) || stage.retry_options[0];

  return `
    <section class="room room--reading" aria-labelledby="guided-title">
      <p class="eyebrow">Guided practice · One part</p>
      <h1 id="guided-title" style="font-size:clamp(2rem,6vw,3.6rem)">${escapeHtml(option.label)}</h1>
      <article class="panel">
        <h2>Speak this task aloud</h2>
        <p class="lead">${escapeHtml(option.practice_task)}</p>
        ${state.guided_hint_visible ? `
          <div class="hint-box" tabindex="-1">
            <p class="eyebrow">Hints</p>
            <p>${escapeHtml(option.hint)}</p>
          </div>` : `
          <div class="action-row"><button class="button button--secondary" type="button" data-action="show-hint">Show Hints</button></div>`}
        ${state.guided_model_visible ? `
          <div class="model-line" tabindex="-1"><strong>Example wording</strong><br>${escapeHtml(option.model_line)}</div>` : `
          <div class="action-row"><button class="button button--quiet" type="button" data-action="show-model">Show example wording</button></div>`}
      </article>
      <div class="action-row">
        ${!state.guided_retry_completed
          ? `<button class="button" type="button" data-action="complete-guided">Done practising</button>`
          : `<button class="button" type="button" data-room="review">Return to Review</button>`}
        <button class="button button--secondary" type="button" data-room="review">Back to Review</button>
      </div>
    </section>`;
}

function journeyRecommendation() {
  const attempt = latestAttempt();
  if (state.station_started && !state.attempt_finished) return { title: "Continue the timed station", detail: "Finish the station before opening Review.", cadence: "Now", room: "station" };
  if (!state.attempt_finished) return { title: "Try the station without prompts", detail: "Complete Station 001 before opening Review.", cadence: "Now", action: "prepare-blind" };
  if (state.review_status !== "completed") return { title: "Finish Review", detail: "Complete each part in order, then choose what to practise.", cadence: "Now", room: "review" };
  if (state.weak_segment && !state.guided_retry_completed) return { title: "Practise the part you selected", button_label: "Practise this part", detail: "Use the Hints, say it aloud, then try the station again.", cadence: "Today", action: "start-guided" };
  if (state.attempt_history.length < 2) return { title: "Try a second timed station", detail: "Practise the selected part, then repeat the whole station without the example.", cadence: "Today", action: "prepare-blind" };
  if (!attempt?.examiner_findings_requested || !attempt?.pushback_opened || attempt.elapsed_seconds < MIN_FULL_SPOKEN_RUN_SECONDS) return { title: "Repeat the whole station aloud", detail: "The last station was short or did not include examiner findings and David's concern.", cadence: "Today", action: "prepare-blind" };
  if ((state.confidence_after || 0) < 3 || state.safety_mirror !== "likely_safe") return { title: "Practise one part again", detail: "One more focused practice will help before the next full run.", cadence: "Next day", action: state.weak_segment ? "start-guided" : "prepare-blind" };
  return { title: "Practise again in one week", detail: "Repeat the station without the example, then compare what you completed.", cadence: "One week", action: "prepare-blind" };
}

function renderJourney() {
  const recommendation = journeyRecommendation();
  const attemptDone = state.attempt_finished;
  const reviewDone = state.review_status === "completed";
  const currentIndex = !attemptDone ? 3 : !reviewDone ? 4 : 5;
  const nodes = [
    ["Phase", "Phase 1"],
    ["Pattern", "Dangerous chest pain"],
    ["Station", "001"],
    ["Attempt", attemptDone ? "Finished" : state.station_started ? "In progress" : "Not started"],
    ["Review", reviewDone ? "Completed" : state.review_unlocked ? "Ready" : "Not ready"],
    ["Next", recommendation.cadence]
  ];
  return `
    <section class="room" aria-labelledby="journey-title">
      <p class="eyebrow">Journey</p>
      <h1 id="journey-title">See what you have done. Choose what to practise next.</h1>
      <p class="lead">Use the next action. Open past attempts only when you need them.</p>

      <div class="journey-path" aria-label="Current pathway">
        ${nodes.map((node, index) => `
          <div class="journey-node ${index < currentIndex ? "is-complete" : ""} ${index === currentIndex ? "is-current" : ""}">
            <span class="journey-node__label">${escapeHtml(node[0])}</span>
            <span class="journey-node__value">${escapeHtml(node[1])}</span>
          </div>`).join("")}
      </div>

      <div class="journey-grid" style="grid-template-columns:minmax(0,1fr)">
        <article class="journey-card">
          <p class="eyebrow">Next step · ${escapeHtml(recommendation.cadence)}</p>
          <h2>${escapeHtml(recommendation.title)}</h2>
          <p>${escapeHtml(recommendation.detail)}</p>
          <div class="action-row">
            <button class="button" type="button" ${recommendation.action ? `data-action="${escapeHtml(recommendation.action)}"` : `data-room="${escapeHtml(recommendation.room)}"`}>${escapeHtml(recommendation.button_label || recommendation.title)}</button>
          </div>
        </article>
      </div>

      <details class="attempt-history" data-attempt-history>
        <summary><strong>Past station attempts</strong> <span class="small muted">${state.attempt_history.length}</span></summary>
        <div class="attempt-records">
          ${state.attempt_history.length ? state.attempt_history.slice().reverse().map((attempt) => `
            <article class="attempt-record" data-attempt-record>
              <strong>Attempt ${attempt.number}</strong>
              <span>${formatDuration(attempt.elapsed_seconds)} used</span>
              <span>${attempt.revealed_count} of ${attempt.available_reveals} topics opened</span>
              <span>Examiner findings: ${attempt.examiner_findings_requested ? "asked" : "not asked"}</span>
              <span>David's concern: ${attempt.pushback_opened ? "opened" : "not opened"}</span>
              <span>${attempt.timed_out ? "Time finished" : "You finished"}</span>
            </article>`).join("") : `<p>No timed station completed yet.</p>`}
        </div>
      </details>

      <div class="action-row">
        ${state.review_unlocked ? `<button class="button button--secondary" type="button" data-room="review">Return to Review</button>` : ""}
        <button class="button button--quiet" type="button" data-room="library">Return to Library</button>
      </div>
    </section>`;
}

function resetAttemptForBlind() {
  if (state.station_started && !state.attempt_finished) {
    setRoom("station");
    announce("Your current station is still in progress.");
    return;
  }
  state = {
    ...state,
    room: "station",
    mode: "blind_station",
    reading_started_at: Date.now(),
    reading_time_expired: false,
    station_started: false,
    station_started_at: null,
    station_finished_at: null,
    station_timed_out: false,
    attempt_finished: false,
    station_locked: false,
    review_unlocked: false,
    plan_discussed: false,
    review_stage: 0,
    review_max_stage: 0,
    review_completed_stages: [],
    journey_updated: false,
    attempt_status: "not_started",
    review_status: "locked",
    revealed: [],
    encounter_log: [],
    self_check: [],
    self_check_confirmed: false,
    safety_mirror: null,
    confidence_before: null,
    confidence_after: null,
    reasoning_revealed: false,
    actual_run_completed: false,
    transfer_responses: {},
    transfer_attempts: {},
    guided_hint_visible: false,
    guided_model_visible: false
  };
  saveState();
  setRoom("station");
}

async function startLearning() {
  await loadReview();
  state.mode = "learning_mode";
  state.learning_step = 0;
  state.learning_view = "actual_run";
  state.learning_run_seen = true;
  saveState();
  setRoom("station");
}

function startStation() {
  state.mode = "blind_station";
  state.station_started = true;
  state.station_started_at = Date.now();
  state.attempt_status = "in_progress";
  state.encounter_log = [{
    order: 1,
    event_type: "patient_opening",
    action_label: "Opening",
    speaker: stationData.opening_line.speaker,
    response_text: stationData.opening_line.text,
    unlock_source: "station_started"
  }];
  saveState();
  render({ focusSelector: "#current-response" });
  announce("Station started. The Actual Run and Review are hidden.");
}

function revealAction(id) {
  const action = stationData.reveal_actions.find((item) => item.id === id);
  if (!action || state.revealed.includes(id)) return;
  if (action.unlock_source === "plan_discussed" && !state.plan_discussed) return;

  state.revealed.push(id);
  state.encounter_log.push({
    order: state.encounter_log.length + 1,
    event_type: "reveal",
    action_label: action.label,
    speaker: action.speaker,
    response_text: action.response_text,
    unlock_source: action.unlock_source
  });
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: "#current-response", scrollTarget: "#current-response" });
}

function markPlanDiscussed() {
  state.plan_discussed = true;
  state.encounter_log.push({
    order: state.encounter_log.length + 1,
    event_type: "plan_gate",
    action_label: "Plan explained",
    speaker: "You",
    response_text: "You explained your concern and urgent plan to David.",
    unlock_source: "learner_action"
  });
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: ".ask-panel", scrollTarget: ".ask-panel" });
  announce("David's response is ready.");
}

async function finishStation(reason = "manual") {
  if (state.attempt_finished) return;
  if (reason === "manual" && !canFinishStation()) {
    announce("Complete the remaining parts above before you finish.");
    return;
  }
  const finishedAt = Date.now();
  const elapsed = state.station_started_at ? Math.min(STATION_SECONDS, Math.max(0, Math.floor((finishedAt - state.station_started_at) / 1000))) : 0;
  const record = {
    id: `attempt-${state.attempt_history.length + 1}-${finishedAt}`,
    number: state.attempt_history.length + 1,
    started_at: state.station_started_at,
    finished_at: finishedAt,
    elapsed_seconds: elapsed,
    timed_out: reason === "time_limit",
    completion_reason: reason,
    revealed_ids: [...state.revealed],
    revealed_count: state.revealed.length,
    available_reveals: stationData.reveal_actions.length,
    examiner_findings_requested: state.revealed.includes("observations_examination"),
    pushback_opened: state.revealed.includes("response_to_plan"),
    plan_discussed: state.plan_discussed
  };
  state.attempt_history = [...state.attempt_history, record];
  state.attempt_finished = true;
  state.station_started = false;
  state.station_finished_at = finishedAt;
  state.station_timed_out = reason === "time_limit";
  state.station_locked = true;
  state.review_unlocked = true;
  state.attempt_status = reason === "time_limit" ? "timed_out" : "finished";
  state.review_status = "ready";
  state.mode = "review_mode";
  state.review_stage = 0;
  state.review_max_stage = 0;
  saveState();
  await loadReview();
  setRoom("review");
  announce(reason === "time_limit" ? "Time is up. The station is finished and Review is open." : "Station finished. Review is now open.");
}

function selectWeakSegment(id) {
  state.weak_segment = id;
  state.guided_hint_visible = false;
  state.guided_model_visible = false;
  state.guided_retry_completed = id === "full_run";
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: `[data-retry-id='${CSS.escape(id)}']` });
}

async function startGuidedRetry() {
  await loadReview();
  if (!state.weak_segment) state.weak_segment = "danger_explanation";
  state.mode = "guided_retry";
  state.guided_hint_visible = false;
  state.guided_model_visible = false;
  state.guided_retry_completed = false;
  saveState();
  setRoom("station");
}

function completeGuidedRetry() {
  state.guided_retry_completed = true;
  state.guided_retry_count += 1;
  markReviewStageComplete("try_again");
  state.mode = "review_mode";
  state.review_stage = reviewData.stages.length - 1;
  state.review_max_stage = Math.max(state.review_max_stage, state.review_stage);
  saveState();
  setRoom("review");
  announce("Practice saved. Choose how ready you feel now.");
}

function markReviewStageComplete(id) {
  state.review_completed_stages = [...new Set([...state.review_completed_stages, id])];
}

function allTransferDrillsComplete() {
  const drills = visibleTransferDrills();
  return drills.length > 0 && drills.every((drill) => state.transfer_responses[drill.id] === drill.correct_choice_id);
}

function stageAdvanceBlock(stage) {
  if (stage.id === "self_check" && !state.confidence_before) return "Choose how the station felt.";
  if (stage.id === "safety_mirror" && !state.safety_mirror) return "Choose the safety statement that best matches what you did.";
  if (stage.id === "what_changed" && !state.reasoning_revealed) return "Answer the questions aloud, then show why the plan changed.";
  if (stage.id === "what_if_paths" && !allTransferDrillsComplete()) return "Answer both changed-detail questions before continuing.";
  if (stage.id === "try_again" && !state.weak_segment) return "Choose one part to practise.";
  if (stage.id === "confidence_after_review" && !state.confidence_after) return "Choose how ready you feel now.";
  return null;
}

function completeReview() {
  const unmet = reviewRequirements().filter((item) => !item.complete);
  const priorStagesComplete = reviewData.stages.slice(0, -1).every((stage) => state.review_completed_stages.includes(stage.id));
  if (unmet.length || !priorStagesComplete) {
    announce(unmet[0]?.label || "Complete each Review stage in order.");
    return;
  }

  markReviewStageComplete("confidence_after_review");
  state.self_check_confirmed = true;
  state.review_status = "completed";
  state.journey_updated = true;
  const attempt = latestAttempt();
  const alreadyRecorded = state.review_history.some((item) => item.attempt_id === attempt?.id);
  if (!alreadyRecorded) {
    state.review_history = [...state.review_history, {
      attempt_id: attempt?.id || null,
      completed_at: Date.now(),
      self_check: [...state.self_check],
      safety_mirror: state.safety_mirror,
      weak_segment: state.weak_segment,
      confidence_before: state.confidence_before,
      confidence_after: state.confidence_after,
      transfer_attempts: { ...state.transfer_attempts }
    }];
  }
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: "#review-stage-panel", scrollTarget: "#review-stage-panel" });
  announce("Review finished. Your next practice is in Journey.");
}

function advanceReview() {
  const index = Math.min(state.review_stage, reviewData.stages.length - 1);
  const stage = reviewData.stages[index];

  const blocked = stageAdvanceBlock(stage);
  if (blocked) {
    announce(blocked);
    return;
  }

  if (stage.id === "self_check") state.self_check_confirmed = true;
  if (stage.id === "safe_version") {
    state.actual_run_completed = true;
    state.learning_run_seen = true;
  }
  markReviewStageComplete(stage.id);

  if (index === reviewData.stages.length - 1) {
    completeReview();
    return;
  }

  state.review_stage = index + 1;
  state.review_max_stage = Math.max(state.review_max_stage, state.review_stage);
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: "#review-stage-panel", scrollTarget: "#review-stage-panel" });
}

function previousReviewTurn() {
  state.review_stage = Math.max(0, state.review_stage - 1);
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: "#review-stage-panel", scrollTarget: "#review-stage-panel" });
}

function chooseTransfer(drillId, choiceId) {
  const stage = reviewData.stages.find((item) => item.id === "what_if_paths");
  const drill = stage.transfer_drills.find((item) => item.id === drillId);
  if (!drill) return;
  state.transfer_responses = { ...state.transfer_responses, [drillId]: choiceId };
  state.transfer_attempts = {
    ...state.transfer_attempts,
    [drillId]: [...(state.transfer_attempts[drillId] || []), choiceId]
  };
  saveState();
  render({ focus: true, resetScroll: false, focusSelector: `[data-drill-id='${CSS.escape(drillId)}'][data-choice-id='${CSS.escape(choiceId)}']` });
}

main.addEventListener("click", async (event) => {
  const roomButton = event.target.closest("[data-room]");
  if (roomButton) {
    clearAnnouncement();
    const room = roomButton.dataset.room;
    if (room === "review" && state.review_unlocked) await loadReview();
    setRoom(room);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  clearAnnouncement();
  const action = actionButton.dataset.action;

  if (action === "start-learning") await startLearning();
  else if (action === "prepare-blind") resetAttemptForBlind();
  else if (action === "start-station") startStation();
  else if (action === "reveal") revealAction(actionButton.dataset.revealId);
  else if (action === "plan-gate") markPlanDiscussed();
  else if (action === "finish-station") await finishStation();
  else if (action === "learning-open-map") {
    state.learning_view = "step_map";
    state.learning_step = 0;
    saveState();
    render({ focus: true, focusSelector: "#learning-step", scrollTarget: "#learning-step" });
  } else if (action === "learning-show-run") {
    state.learning_view = "actual_run";
    saveState();
    render({ focus: true, focusSelector: "#learning-title" });
  } else if (action === "learning-prev") {
    state.learning_step = Math.max(0, state.learning_step - 1);
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: "#learning-step", scrollTarget: "#learning-step" });
  } else if (action === "learning-next") {
    state.learning_step += 1;
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: "#learning-step", scrollTarget: "#learning-step" });
  } else if (action === "review-stage") {
    const requested = Number(actionButton.dataset.stageIndex);
    if (requested > state.review_max_stage) return;
    state.review_stage = requested;
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: "#review-stage-panel", scrollTarget: "#review-stage-panel" });
  } else if (action === "review-prev") previousReviewTurn();
  else if (action === "review-next") advanceReview();
  else if (action === "reveal-reasoning") {
    state.reasoning_revealed = true;
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: "#review-stage-panel", scrollTarget: "#review-stage-panel" });
  } else if (action === "safety-choice") {
    state.safety_mirror = actionButton.dataset.choice;
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: `[data-choice='${CSS.escape(state.safety_mirror)}']` });
  } else if (action === "transfer-choice") chooseTransfer(actionButton.dataset.drillId, actionButton.dataset.choiceId);
  else if (action === "retry-choice") {
    selectWeakSegment(actionButton.dataset.retryId);
    await startGuidedRetry();
  }
  else if (action === "start-guided") await startGuidedRetry();
  else if (action === "complete-guided") completeGuidedRetry();
  else if (action === "show-hint") {
    state.guided_hint_visible = true;
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: ".hint-box" });
  } else if (action === "show-model") {
    state.guided_model_visible = true;
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: ".model-line" });
  } else if (action === "confidence-before") {
    state.confidence_before = Number(actionButton.dataset.confidence);
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: `[data-action='confidence-before'][data-confidence='${state.confidence_before}']` });
  } else if (action === "confidence-choice") {
    state.confidence_after = Number(actionButton.dataset.confidence);
    saveState();
    render({ focus: true, resetScroll: false, focusSelector: `[data-action='confidence-choice'][data-confidence='${state.confidence_after}']` });
  }
});

primaryNav.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-room]");
  if (!button) return;
  clearAnnouncement();
  const room = button.dataset.room;
  if (room === "review" && state.review_unlocked) await loadReview();
  setRoom(room);
});

window.addEventListener("popstate", async () => {
  clearAnnouncement();
  const room = currentHashRoom();
  if (room === "review" && state.review_unlocked) await loadReview();
  setRoom(room, { replace: true });
});

async function boot() {
  try {
    [libraryData, stationData] = await Promise.all([
      fetchJson(DATA_PATHS.library),
      fetchJson(DATA_PATHS.station)
    ]);

    const requestedRoom = currentHashRoom();
    if ((requestedRoom === "review" && state.review_unlocked) || state.mode === "learning_mode" || state.mode === "guided_retry") {
      await loadReview();
    }
    state.room = requestedRoom;
    if (state.room === "review" && !state.review_unlocked) state.room = state.station_started ? "station" : "library";
    saveState();
    history.replaceState(null, "", `#${state.room}`);
    render({ focus: false });
  } catch (error) {
    main.innerHTML = `
      <section class="room room--reading">
        <article class="panel">
          <p class="eyebrow">Module unavailable</p>
          <h1 style="font-size:2.4rem">The station data could not load.</h1>
          <p>${escapeHtml(error.message)}</p>
        </article>
      </section>`;
  }
}

boot();

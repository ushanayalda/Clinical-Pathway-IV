import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { prepareChromium, runtimeRoot } from "../scripts/prepare-chromium.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const serverlessChromium = require("@sparticuz/chromium").default;

const baseUrl = "http://127.0.0.1:4173";
const storageKey = "clinical-pathway-case-001-v2";
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: "4173", HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverError = "";
server.stderr.on("data", (chunk) => { serverError += chunk.toString(); });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Preview server did not start. ${serverError}`);
}

async function clearState(page) {
  await page.goto(`${baseUrl}/#home`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector("#home-title", { state: "visible" });
}

async function savedState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
}

async function bodyText(page) {
  return page.locator("body").innerText();
}

async function assertLearnerLanguage(page) {
  const text = await bodyText(page);
  assert(!/\bAMC\b|\bADHD\b|\bcandidate\b|\bDr\./i.test(text), "Learner UI leaked internal branding, labels, or title style");
  assert(!/\b(badge|XP|streak|confetti|leaderboard|trophy)\b/i.test(text), "Learner UI contains gamification");
}

async function assertPlainLanguage(page) {
  const text = await bodyText(page);
  const banned = /\b(certainty|prototype|retrieval|spacing)\b|clinic proof|Safety Mirror|strict mirror|weak turn|patient pushback|objective (?:attempt )?evidence|continuous rehearsal|portable station spine|heart danger|safe direction|safety action|Where did your run sit|After lunch becomes indigestion|examiner-facing/i;
  assert(!banned.test(text), `Learner UI contains robotic or academic wording: ${text.match(banned)?.[0]}`);
}

async function openBlindReading(page) {
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page.waitForSelector("#library-title");
  await page.getByRole("button", { name: "Practise without prompts" }).click();
  await page.waitForSelector("#reading-title");
}

async function startBlindStation(page) {
  await openBlindReading(page);
  await page.getByRole("button", { name: "Start station" }).click();
  await page.waitForSelector("#station-title");
}

async function revealAllPrePlanActions(page) {
  const ids = [
    "pain_story",
    "associated_symptoms",
    "risk_factors",
    "ideas_concerns",
    "observations_examination",
    "investigation_availability"
  ];
  for (const id of ids) {
    const button = page.locator(`[data-reveal-id="${id}"]`);
    if (await button.count()) await button.click();
  }
}

async function openPushbackAndFinish(page, { revealAll = true } = {}) {
  if (revealAll) await revealAllPrePlanActions(page);
  await page.getByRole("button", { name: "I have discussed my plan." }).click();
  await page.getByRole("button", { name: "Hear David's response" }).click();
  const finish = page.getByRole("button", { name: "Finish station" });
  await finish.waitFor({ state: "visible" });
  assert(!(await finish.isDisabled()), "Finish remained disabled after patient pushback was opened");
  await finish.click();
  await page.waitForSelector("#review-title");
}

async function finishObjectiveAttempt(page) {
  await startBlindStation(page);
  await openPushbackAndFinish(page);
  await page.evaluate((key) => {
    const state = JSON.parse(localStorage.getItem(key));
    state.attempt_history[state.attempt_history.length - 1].elapsed_seconds = 342;
    localStorage.setItem(key, JSON.stringify(state));
  }, storageKey);
  await page.reload();
  await page.waitForSelector("#review-title");
}

async function currentReviewStage(page) {
  const label = await page.locator(".room > .eyebrow").first().innerText();
  return Number(label.match(/Stage\s+(\d+)\s+of/i)?.[1] ?? 0);
}

async function exhaustSafeVersion(page) {
  const start = page.getByRole("button", { name: "Start full spoken practice" });
  if (await start.count()) await start.click();
  const finish = page.getByRole("button", { name: "Finish full spoken practice" });
  if (await finish.count()) await finish.click();
  const nextTurn = page.getByRole("button", { name: "Next part" });
  let guard = 0;
  while (await nextTurn.count()) {
    await nextTurn.click();
    guard += 1;
    assert(guard <= 20, "Safe version did not reach its final mapped turn");
  }
}

async function prepareCurrentReviewStage(page, stageNumber) {
  if (stageNumber === 1) {
    const boxes = page.locator("[data-self-check]");
    for (let index = 0; index < await boxes.count(); index += 1) await boxes.nth(index).check();
    await page.locator('[data-action="confidence-before"][data-confidence="3"]').click();
  }
  if (stageNumber === 2) {
    await page.getByRole("button", { name: /Likely safe/ }).click();
  }
  if (stageNumber === 3) {
    const reveal = page.locator('[data-action="reveal-reasoning"]');
    if (await reveal.count()) await reveal.click();
  }
  if (stageNumber === 4) await exhaustSafeVersion(page);
  if (stageNumber === 6) {
    const answers = [
      ["patient_label_changes", "follow_pattern"],
      ["one_classic_clue_missing", "continue_escalation"],
      ["early_ecg_pressure", "during_transfer"]
    ];
    for (const [drillId, choiceId] of answers) {
      await page.locator(`[data-action="transfer-choice"][data-drill-id="${drillId}"][data-choice-id="${choiceId}"]`).click();
    }
  }
  if (stageNumber === 7) {
    await page.getByRole("button", { name: /Explain why it is urgent/ }).click();
  }
}

async function advanceReviewTo(page, targetStage) {
  let stage = await currentReviewStage(page);
  while (stage < targetStage) {
    await assertLearnerLanguage(page);
    await assertPlainLanguage(page);
    await prepareCurrentReviewStage(page, stage);
    const next = page.locator('[data-action="review-next"]');
    assert(await next.count(), `Review Stage ${stage} has no Next stage control`);
    assert(!(await next.isDisabled()), `Review Stage ${stage} cannot advance after its required action`);
    await next.click();
    stage = await currentReviewStage(page);
  }
  await assertLearnerLanguage(page);
  await assertPlainLanguage(page);
}

async function completeReview(page) {
  await advanceReviewTo(page, 8);
  await page.locator('[data-action="confidence-choice"][data-confidence="4"]').click();
  await page.locator('[data-action="review-next"]').click();
  const state = await savedState(page);
  assert(state.review_status === "completed", "Review did not complete after every required stage and confidence selection");
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function runDesktopBoundary(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const page = await context.newPage();
  const reviewRequests = [];
  const consoleErrors = [];
  page.on("request", (request) => { if (request.url().endsWith("/review.json")) reviewRequests.push(request.url()); });
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  try {
    await clearState(page);
    await assertLearnerLanguage(page);
    await assertPlainLanguage(page);
    assert(reviewRequests.length === 0, "Review data loaded on Home");
    await page.screenshot({ path: "artifacts/screenshots/01-home-desktop.png", fullPage: true });

    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.waitForSelector("#library-title");
    await page.screenshot({ path: "artifacts/screenshots/02-library-desktop.png", fullPage: true });
    await page.getByRole("button", { name: "Practise without prompts" }).click();
    await page.waitForSelector("#reading-title");
    let text = await bodyText(page);
    assert(!text.includes("Doctor, I think it is just indigestion"), "Patient opening leaked before Start");
    assert(!text.includes("Actual Run: the whole station"), "Actual Run leaked on reading screen");
    assert(reviewRequests.length === 0, "Review data loaded before Blind Station Finish");

    await page.getByRole("button", { name: "Start station" }).click();
    await page.waitForSelector("#station-title");
    assert(await page.locator("#site-header").evaluate((element) => getComputedStyle(element).display === "none"), "Normal navigation stayed visible during live Station");
    text = await bodyText(page);
    assert(!text.includes("Hear David's response"), "David's response leaked before the plan gate");
    assert(!text.includes("Actual Run: the whole station"), "Review teaching leaked into timed Station");
    await page.screenshot({ path: "artifacts/screenshots/03-station-desktop.png", fullPage: true });

    await revealAllPrePlanActions(page);
    await page.getByRole("button", { name: "I have discussed my plan." }).click();
    const prematureFinish = page.getByRole("button", { name: "Finish station" });
    assert(!(await prematureFinish.count()) || await prematureFinish.isDisabled(), "Station can finish before Response to your plan is opened");
    await page.getByRole("button", { name: "Hear David's response" }).click();
    const finish = page.getByRole("button", { name: "Finish station" });
    assert(await finish.isVisible() && !(await finish.isDisabled()), "Opening patient pushback did not enable Finish station");
    await finish.click();
    await page.waitForSelector("#review-title");
    assert(reviewRequests.length === 1, "Review payload did not load exactly once after Finish");
    assert(consoleErrors.length === 0, `Browser console errors: ${consoleErrors.join(" | ")}`);
  } finally {
    await page.close();
  }
}

async function runRoleCorrectLearning(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  try {
    await clearState(page);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page.getByRole("button", { name: "Learn from Actual Run" }).click();
    await page.waitForSelector("#learning-title");

    const runRoles = await page.locator(".actual-run-script .role-label").allInnerTexts();
    assert(runRoles.some((label) => /you say/i.test(label)), "Actual Run does not distinguish learner-spoken turns");
    assert(runRoles.some((label) => /you hand over/i.test(label)), "Actual Run does not label the handover as learner-spoken");
    assert(runRoles.some((label) => /david says|patient responds/i.test(label)), "Actual Run does not distinguish patient responses");
    assert(runRoles.some((label) => /action to take/i.test(label)), "Actual Run does not distinguish non-spoken actions");
    await assertLearnerLanguage(page);
    await assertPlainLanguage(page);
    await page.getByRole("button", { name: "See it step by step" }).click();

    const instruction = page.locator(".learning-instruction");
    assert(await instruction.count(), "Learning mode has no role-correct .learning-instruction label");
    assert(/speak.*(your|doctor).*line|say.*aloud/i.test(await instruction.innerText()), "Doctor step is not labelled as learner-spoken");

    await page.getByRole("button", { name: "Next step" }).click();
    assert(/david|patient/i.test(await page.locator(".role-label").innerText()), "Second model step is not labelled as the patient response");
    const patientInstruction = await instruction.innerText();
    assert(/patient|david|listen|read/i.test(patientInstruction), "Patient step is not labelled as a patient response");
    assert(!/speak (this|the) line aloud|say (this|the) line aloud/i.test(patientInstruction), "Patient response incorrectly tells the learner to speak David's line");

    let guard = 0;
    while (!/action to take/i.test(await page.locator(".role-label").innerText())) {
      await page.getByRole("button", { name: "Next step" }).click();
      guard += 1;
      assert(guard <= 20, "Learning mode never reached the non-spoken Action step");
    }
    assert(/not spoken|do not say|clinical action/i.test(await instruction.innerText()), "Action step is not clearly labelled as non-spoken");
    await assertLearnerLanguage(page);
    await assertPlainLanguage(page);
    await page.evaluate(() => document.activeElement?.blur());
    await page.addStyleTag({ content: ".skip-link { display: none !important; }" });
    await page.screenshot({ path: "artifacts/screenshots/06-learning-desktop.png", fullPage: true });
  } finally {
    await page.close();
  }
}

async function runReviewCompletionIntegrity(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await clearState(page);
    await finishObjectiveAttempt(page);
    const confidenceTab = page.getByRole("button", { name: "8. Ready now?" });
    if (!(await confidenceTab.isDisabled())) await confidenceTab.click();
    const confidence = page.locator('[data-action="confidence-choice"][data-confidence="4"]');
    if (await confidence.count() && !(await confidence.isDisabled())) await confidence.click();

    const state = await savedState(page);
    assert(state.review_status !== "completed", "Confidence alone falsely completed Review");
    assert(!/Review recorded/i.test(await bodyText(page)), "UI falsely announced Review completion from confidence alone");

    await page.getByRole("button", { name: "Review", exact: true }).click();
    const firstStage = page.getByRole("button", { name: "1. Self-check" });
    if (!(await firstStage.isDisabled())) await firstStage.click();
    await advanceReviewTo(page, 6);
    const choices = page.locator('[data-action="transfer-choice"][data-drill-id][data-choice-id]');
    const drillIds = await choices.evaluateAll((items) => [...new Set(items.map((item) => item.dataset.drillId))].sort());
    assert(drillIds.length === 3, "Review does not expose exactly three transfer drills");
    assert(
      JSON.stringify(drillIds) === JSON.stringify(["early_ecg_pressure", "one_classic_clue_missing", "patient_label_changes"]),
      "Transfer drills do not cover label change, missing clue, and early-test pressure"
    );
    await page.waitForTimeout(3300);
    await page.evaluate(() => document.activeElement?.blur());
    await page.locator("#review-stage-title").evaluate((element) => {
      element.scrollIntoView({ block: "start" });
      window.scrollBy(0, -90);
    });
    await page.screenshot({ path: "artifacts/screenshots/04-review-desktop.png", fullPage: false });
  } finally {
    await page.close();
  }
}

async function runAttemptEvidenceAndHistory(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await clearState(page);
    await finishObjectiveAttempt(page);
    const evidence = page.locator("[data-attempt-evidence]");
    assert(await evidence.isVisible(), "Review has no visible objective attempt evidence region");
    const evidenceSummary = evidence.locator("summary");
    if (await evidenceSummary.count() && await evidence.getAttribute("open") === null) await evidenceSummary.click();
    const evidenceText = await evidence.innerText();
    assert(/7\s*(of|\/)\s*7|7 responses/i.test(evidenceText), "Attempt evidence does not report revealed-response coverage");
    assert(/David\'s concern\s*opened/i.test(evidenceText), "Attempt checklist does not confirm that David\'s concern was opened");
    assert(/duration|time used|elapsed/i.test(evidenceText), "Attempt evidence does not report objective duration");

    const beforeReview = await savedState(page);
    const beforeHistory = beforeReview.attempt_history ?? beforeReview.attempts ?? [];
    assert(beforeHistory.length >= 1, "Finished attempt was not appended to attempt history");
    const record = beforeHistory.at(-1);
    const revealCount = record.revealed_count ?? record.reveal_ids?.length ?? record.revealed?.length;
    assert(revealCount === 7, "Attempt history did not preserve seven opened responses");
    assert(record.pushback_opened === true || record.response_to_plan_opened === true, "Attempt history did not preserve pushback-opened evidence");
    assert(Number.isFinite(record.duration_seconds ?? record.elapsed_seconds), "Attempt history did not preserve objective duration");

    await completeReview(page);
    await page.getByRole("button", { name: "Open Journey" }).click();
    await page.waitForSelector("#journey-title");
    await page.waitForTimeout(3300);
    await page.screenshot({ path: "artifacts/screenshots/05-journey-desktop.png", fullPage: true });
    const history = page.locator("[data-attempt-history]");
    assert(await history.isVisible(), "Journey has no visible retained attempt history");
    const historicalRecords = page.locator("[data-attempt-history] [data-attempt-record]");
    assert(await historicalRecords.count() >= 1, "Journey history has no completed attempt record");

    await page.locator('[data-action="start-guided"]').click();
    await page.locator('[data-action="complete-guided"]').click();
    await page.getByRole("button", { name: "Start timed station" }).click();
    const afterReset = await savedState(page);
    const afterHistory = afterReset.attempt_history ?? afterReset.attempts ?? [];
    assert(afterHistory.length === beforeHistory.length, "Starting a retry erased or duplicated prior attempt history");

    await page.getByRole("button", { name: "Back to Library" }).click();
    await page.getByRole("button", { name: "Journey", exact: true }).click();
    assert(await page.locator("[data-attempt-history] [data-attempt-record]").count() >= 1, "Journey lost prior attempt evidence after retry started");
  } finally {
    await page.close();
  }
}

async function runStrictTiming(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  try {
    await clearState(page);
    await openBlindReading(page);
    const readingTimer = page.getByRole("timer", { name: /Reading time remaining/i });
    assert(await readingTimer.isVisible(), "Reading screen has no accessible two-minute timer");
    assert(/02:00|01:59/.test(await readingTimer.innerText()), "Reading timer does not begin at two minutes");
    assert(!(await page.locator("#station-clock").isVisible()), "Eight-minute Station timer is visible during reading time");

    await page.getByRole("button", { name: "Start station" }).click();
    await page.waitForSelector("#station-title");
    assert(!(await readingTimer.isVisible()), "Reading timer remained visible in the live Station");
    assert(await page.locator("#station-clock").isVisible(), "Live Station has no eight-minute timer");
    assert(/08:00|07:59/.test(await page.locator("#station-clock").innerText()), "Station timer does not begin at eight minutes");

    await page.evaluate((key) => {
      const state = JSON.parse(localStorage.getItem(key));
      state.station_started_at = Date.now() - (8 * 60 + 2) * 1000;
      localStorage.setItem(key, JSON.stringify(state));
    }, storageKey);
    await page.reload();
    await page.waitForTimeout(1200);
    const timedOutText = await bodyText(page);
    assert(/time is up|station time (has )?finished/i.test(timedOutText), "Eight-minute expiry has no clear timed-out state");
    const timedOut = await savedState(page);
    assert(timedOut.attempt_status === "timed_out", "Eight-minute expiry did not record attempt_status=timed_out");
    assert(timedOut.attempt_finished === true && timedOut.review_unlocked === true, "Eight-minute expiry did not lock the attempt and unlock Review");
  } finally {
    await page.close();
  }
}

async function runMobileAccessibility(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await clearState(page);
    await startBlindStation(page);
    await page.waitForTimeout(180);

    const statusVisibility = await page.locator(".status-message-inline").evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, opacity: Number(style.opacity) };
    });
    assert(statusVisibility.width > 100 && statusVisibility.height > 20 && statusVisibility.opacity === 1, "Mobile status message is not visually readable");

    const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(layout.scrollWidth <= layout.width, `Mobile has horizontal overflow: ${layout.scrollWidth} > ${layout.width}`);
    const smallTargets = await page.locator("button:visible").evaluateAll((buttons) => buttons.filter((button) => button.getBoundingClientRect().height < 44).map((button) => button.innerText));
    assert(smallTargets.length === 0, `Mobile tap targets below 44px: ${smallTargets.join(", ")}`);

    const obstruction = await page.evaluate(() => {
      const toast = document.querySelector(".status-message-inline");
      if (!toast) return [];
      const toastRect = toast.getBoundingClientRect();
      return [...document.querySelectorAll("button")]
        .filter((button) => {
          const style = getComputedStyle(button);
          const rect = button.getBoundingClientRect();
          const visible = style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          return visible && rect.left < toastRect.right && rect.right > toastRect.left && rect.top < toastRect.bottom && rect.bottom > toastRect.top;
        })
        .map((button) => button.innerText.trim());
    });
    assert(obstruction.length === 0, `Mobile status message obstructs controls: ${obstruction.join(", ")}`);

    const planBeforeQuestions = await page.evaluate(() => {
      const plan = document.querySelector(".plan-gate");
      const questions = document.querySelector(".ask-panel");
      return Boolean(plan && questions && (plan.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    assert(planBeforeQuestions, "Urgent-plan control still appears after every history control");

    const pain = page.getByRole("button", { name: "Pain questions" });
    await page.screenshot({ path: "artifacts/screenshots/07-station-mobile.png", fullPage: false });
    await pain.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    const revealFocus = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      id: document.activeElement.id,
      className: document.activeElement.className,
      responseRect: document.querySelector(".patient-response").getBoundingClientRect().toJSON(),
      viewportHeight: innerHeight
    }));
    assert(!["BODY", "MAIN"].includes(revealFocus.tag), `Reveal lost keyboard focus to ${revealFocus.tag}`);
    assert(revealFocus.responseRect.bottom > 0 && revealFocus.responseRect.top < revealFocus.viewportHeight, "Updated patient response is outside the mobile viewport");

    await revealAllPrePlanActions(page);
    await page.getByRole("button", { name: "I have discussed my plan." }).click();
    await page.getByRole("button", { name: "Hear David's response" }).click();
    await page.getByRole("button", { name: "Finish station" }).click();
    await page.waitForSelector("#review-title");
    await advanceReviewTo(page, 5);

    const nextStage = page.locator('[data-action="review-next"]');
    await nextStage.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(60);
    const stageFocus = await page.evaluate(() => ({
      tag: document.activeElement.tagName,
      id: document.activeElement.id,
      currentRect: document.querySelector('.review-stage-nav [aria-current="step"]').getBoundingClientRect().toJSON(),
      navRect: document.querySelector(".review-stage-nav").getBoundingClientRect().toJSON(),
      scrollLeft: document.querySelector(".review-stage-nav").scrollLeft
    }));
    assert(!["BODY", "MAIN"].includes(stageFocus.tag), `Review stage change lost keyboard focus to ${stageFocus.tag}`);
    assert(["review-stage-title", "review-stage-panel"].includes(stageFocus.id) || await page.locator(':focus[aria-current="step"]').count(), "Review stage change did not focus the new stage content or active stage control");
    assert(
      stageFocus.currentRect.left >= stageFocus.navRect.left && stageFocus.currentRect.right <= stageFocus.navRect.right,
      `Active mobile Review stage is offscreen at scrollLeft=${stageFocus.scrollLeft}`
    );

    await page.screenshot({ path: "artifacts/screenshots/08-review-mobile.png", fullPage: false });
    await assertLearnerLanguage(page);
    await assertPlainLanguage(page);
  } finally {
    await page.close();
  }
}

async function runKeyboardEntry(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  try {
    await clearState(page);
    await page.keyboard.press("Tab");
    assert(await page.locator(":focus").getAttribute("class") === "skip-link", "Skip link is not the first keyboard stop");
  } finally {
    await page.close();
  }
}

await mkdir("artifacts/screenshots", { recursive: true });

const scenarios = [
  ["desktop boundary and pushback gate", runDesktopBoundary],
  ["role-correct Learning mode", runRoleCorrectLearning],
  ["Review completion and transfer drills", runReviewCompletionIntegrity],
  ["objective attempt evidence and retained history", runAttemptEvidenceAndHistory],
  ["strict reading and Station timing", runStrictTiming],
  ["mobile visibility and focus continuity", runMobileAccessibility],
  ["keyboard entry", runKeyboardEntry]
];

const failures = [];
let browser;
try {
  await waitForServer();
  const executablePath = await prepareChromium();
  process.env.FONTCONFIG_PATH = "/etc/fonts";
  process.env.FONTCONFIG_FILE = "/etc/fonts/fonts.conf";
  process.env.LD_LIBRARY_PATH = [join(runtimeRoot, "al2023", "lib"), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: serverlessChromium.args
  });

  for (const [name, scenario] of scenarios) {
    try {
      await scenario(browser);
      console.log(`PASS: ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      console.error(`FAIL: ${name}: ${error.message}`);
    }
  }

  if (failures.length) {
    throw new Error(`Browser acceptance failed (${failures.length}/${scenarios.length}):\n- ${failures.join("\n- ")}`);
  }

  console.log("Browser acceptance passed: Review integrity, objective evidence, retained history, timing, transfer drills, mobile visibility, and focus continuity");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}

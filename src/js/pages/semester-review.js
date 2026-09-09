import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js?v=20260812-nav";
import { generateInsight, insightContent } from "../services/insight.service.js";
import { getCurrentSemester, listSnapshots } from "../services/semester.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage, userMessage } from "../utils/forms.js";

await requireSession({ requireOnboarding: true }); bindLogout();
const semester = await getCurrentSemester();
document.querySelector("#semester-title").textContent = `${semester.academic_year} · ${semester.semester_name}`;
const snapshots = await listSnapshots(semester.id); const chart = document.querySelector("#trend-chart");
const number = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : null;
const formatDate = (value) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
document.querySelector("#snapshot-count").textContent = `${snapshots.length} ${snapshots.length === 1 ? "record" : "records"}`;
document.querySelector("#trend-copy").textContent = snapshots.length ? "Each bar is a saved Academic Pulse snapshot." : "Your timeline will build as you add academic records.";
if (snapshots.length) {
  const first = number(snapshots[0].pulse_score); const latest = number(snapshots.at(-1).pulse_score); const change = latest - first; const label = `${change > 0 ? "+" : ""}${change}`;
  document.querySelector("#current-pulse").textContent = latest; document.querySelector("#starting-pulse").textContent = first; document.querySelector("#latest-pulse").textContent = latest;
  const changeElement = document.querySelector("#pulse-change"); changeElement.textContent = label; changeElement.classList.add(change > 0 ? "positive" : change < 0 ? "negative" : "steady");
  document.querySelector("#pulse-direction").textContent = change > 0 ? `${label} since the first snapshot` : change < 0 ? `${Math.abs(change)} points below the start` : "Steady from the first snapshot";
  chart.setAttribute("aria-label", `Academic Pulse history from ${first} to ${latest}, a change of ${label} points.`);
  for (const item of snapshots) { const score = number(item.pulse_score) ?? 0; chart.append(el("div", { className: "trend-column", title: `${formatDate(item.snapshot_date)}: Pulse ${score}` }, [el("span", { style: `height:${Math.max(5, Math.min(100, score))}%`, dataScore: score }), el("small", { text: formatDate(item.snapshot_date) })])); }
}
const button = document.querySelector("#generate-review");
button.addEventListener("click", async () => { setBusy(button, true, "Generating…"); try {
  const result = await generateInsight("semester_review"); const content = insightContent(result.insight); const elements = [el("h3", { text: content.title || "Semester review" }), el("p", { text: content.summary || "Your review is ready." })];
  if (Array.isArray(content.observations) && content.observations.length) elements.push(el("ul", { className: "review-observations" }, content.observations.map((observation, index) => el("li", {}, [el("span", { text: String(index + 1).padStart(2, "0") }), el("p", { text: observation })]))));
  elements.push(el("small", { className: "review-freshness", text: result.cached ? "Reused because your academic context has not changed." : "Generated now from your current semester context." })); document.querySelector("#review-content").replaceChildren(...elements); showMessage("Your semester review is ready.", "success");
} catch (error) { showMessage(userMessage(error, "We couldn’t generate your semester review right now. Please try again shortly."), "error"); } finally { setBusy(button, false); } });

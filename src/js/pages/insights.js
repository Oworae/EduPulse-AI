import { requireSession } from "../auth/guards.js";
import { bindLogout } from "../auth/logout.js";
import { generateInsight, insightContent, listInsights, listStudyActions, updateStudyAction } from "../services/insight.service.js";
import { getCurrentSemester } from "../services/semester.service.js";
import { el } from "../utils/dom.js";
import { setBusy, showMessage } from "../utils/forms.js";

await requireSession({ requireOnboarding: true }); bindLogout(); const semester = await getCurrentSemester();
const insightList = document.querySelector("#insight-list"); const actionList = document.querySelector("#action-list"); const generate = document.querySelector("#generate-insight");
function renderInsight(insight) {
  const content = insightContent(insight); const observations = el("ul", { className: "observation-list" });
  for (const observation of content.observations ?? []) observations.append(el("li", { text: observation }));
  return el("article", { className: "insight-card card" }, [el("div", { className: "insight-meta", text: `${insight.insight_type.replaceAll("_", " ")} · ${new Date(insight.generated_at).toLocaleDateString()}` }), el("h2", { text: insight.title }), el("p", { text: insight.summary }), observations, el("small", { className: "muted", text: `AI explanation · ${insight.prompt_version}` })]);
}
async function render() {
  const [insights, actions] = await Promise.all([listInsights(semester.id), listStudyActions(semester.id)]); insightList.replaceChildren(); actionList.replaceChildren();
  if (!insights.length) insightList.append(el("div", { className: "empty-list card", text: "No AI explanations yet. Generate one after recording academic data." })); else for (const insight of insights) insightList.append(renderInsight(insight));
  if (!actions.length) actionList.append(el("p", { className: "muted", text: "Recommendations generated from insights will appear here." }));
  for (const action of actions) { const row = el("article", { className: `action-row ${action.status}` }, [el("span", { className: "priority", text: String(action.priority) }), el("div", {}, [el("strong", { text: action.title }), el("p", { text: action.description ?? "" })])]); const button = el("button", { className: "text-button", type: "button", text: action.status === "completed" ? "Reopen" : "Complete" }); button.addEventListener("click", async () => { await updateStudyAction(action.id, action.status === "completed" ? "pending" : "completed"); await render(); }); row.append(button); actionList.append(row); }
}
generate.addEventListener("click", async () => { setBusy(generate, true, "Generating…"); try { const result = await generateInsight("home_summary"); showMessage(result.cached ? "Your current insight is still up to date." : "A new insight was generated from your academic data.", "success"); await render(); } catch (error) { showMessage(error.message || "Insight generation failed. Try again shortly.", "error"); } finally { setBusy(generate, false); } });
await render();

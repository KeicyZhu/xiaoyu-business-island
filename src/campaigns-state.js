export const CAMPAIGN_VERSION = "1.0.0";
export const CAMPAIGN_MAX_BYTES = 2 * 1024 * 1024;
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const idOK = (v) =>
  typeof v === "string" &&
  /^[a-z][a-z0-9-]{0,70}$/.test(v) &&
  !["constructor", "prototype"].includes(v);
const finite = (v) =>
  (typeof v === "number" ||
    (typeof v === "string" &&
      v.trim() !== "" &&
      /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(v.trim()))) &&
  Number.isFinite(Number(v));
export function createCampaignState() {
  return { version: CAMPAIGN_VERSION, events: [], drafts: {}, completed: {} };
}
export function gradeQuestion(q, value) {
  if (q.type === "single") return Number.isInteger(value) && value === q.answer;
  if (q.type === "number")
    return (
      finite(value) &&
      Math.abs(Number(value) - q.answer) <=
        (q.tolerance ?? 0.001) + Number.EPSILON * 10
    );
  if (
    !Array.isArray(value) ||
    !value.every(Number.isInteger) ||
    new Set(value).size !== value.length
  )
    return false;
  if (q.type === "multi")
    return (
      value.length === q.answer.length &&
      value.every((x) => q.answer.includes(x))
    );
  if (q.type === "order")
    return (
      value.length === q.answer.length &&
      value.every((x, i) => x === q.answer[i])
    );
  return false;
}
export function assessMission(m, draft = {}) {
  const d = record(draft) ? draft : {};
  const answers = record(d.answers) ? d.answers : {};
  const grades = m.questions.map((q) => ({
    id: q.id,
    correct: gradeQuestion(q, answers[q.id]),
  }));
  const checks = Array.isArray(d.checks) ? d.checks : [];
  const validChecks =
    checks.length >= 3 &&
    checks.length <= m.deliverable.checklist.length &&
    new Set(checks).size === checks.length &&
    checks.every(
      (x) =>
        Number.isInteger(x) && x >= 0 && x < m.deliverable.checklist.length,
    );
  const report =
    typeof d.answer === "string" &&
    d.answer.trim().length >= 40 &&
    d.answer.length <= 12000;
  const decision = m.decisions.some((x) => x.id === d.decisionId);
  return {
    grades,
    correct: grades.filter((g) => g.correct).length,
    total: grades.length,
    validChecks,
    report,
    decision,
    ready: validChecks && report && decision && grades.every((g) => g.correct),
  };
}
export function isMissionUnlocked(s, c, index) {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < c.missions.length &&
    c.missions.slice(0, index).every((m) => Object.hasOwn(s.completed, m.id))
  );
}
function validDraft(d, m) {
  if (
    !record(d) ||
    typeof d.answer !== "string" ||
    d.answer.length > 12000 ||
    !Array.isArray(d.checks) ||
    !record(d.answers) ||
    typeof d.decisionId !== "string"
  )
    return false;
  if (
    d.checks.length > m.deliverable.checklist.length ||
    new Set(d.checks).size !== d.checks.length ||
    !d.checks.every(
      (x) =>
        Number.isInteger(x) && x >= 0 && x < m.deliverable.checklist.length,
    )
  )
    return false;
  if (d.decisionId !== "" && !m.decisions.some((x) => x.id === d.decisionId))
    return false;
  for (const [id, value] of Object.entries(d.answers)) {
    const q = m.questions.find((q) => q.id === id);
    if (!q) return false;
    if (q.type === "number") {
      if (typeof value !== "string" && typeof value !== "number") return false;
      if (String(value).length > 40) return false;
    } else if (q.type === "single") {
      if (!Number.isInteger(value) || value < 0 || value >= q.options.length)
        return false;
    } else if (
      !Array.isArray(value) ||
      value.length > q.options.length ||
      new Set(value).size !== value.length ||
      !value.every((x) => Number.isInteger(x) && x >= 0 && x < q.options.length)
    )
      return false;
  }
  return true;
}
export function reduceCampaign(s, e, campaigns) {
  if (!record(e) || !idOK(e.campaignId) || !idOK(e.missionId)) return s;
  const c = campaigns.find((c) => c.id === e.campaignId);
  if (!c) return s;
  const index = c.missions.findIndex((m) => m.id === e.missionId);
  if (
    !isMissionUnlocked(s, c, index) ||
    Object.hasOwn(s.completed, e.missionId)
  )
    return s;
  const m = c.missions[index];
  if (e.type === "DRAFT") {
    if (!validDraft(e.draft, m)) return s;
    const draft = JSON.parse(JSON.stringify(e.draft));
    if (JSON.stringify(s.drafts[m.id]) === JSON.stringify(draft)) return s;
    const event = { type: "DRAFT", campaignId: c.id, missionId: m.id, draft };
    return {
      ...s,
      events: [
        ...s.events.filter(
          (x) => !(x.type === "DRAFT" && x.missionId === m.id),
        ),
        event,
      ],
      drafts: { ...s.drafts, [m.id]: draft },
    };
  }
  if (e.type === "COMPLETE") {
    const draft = s.drafts[m.id];
    if (!assessMission(m, draft).ready) return s;
    const decision = m.decisions.find((x) => x.id === draft.decisionId);
    const metrics = campaignMetrics(s, c);
    if (metrics.budget + decision.effect.budget < 0) return s;
    return {
      ...s,
      events: [
        ...s.events,
        { type: "COMPLETE", campaignId: c.id, missionId: m.id },
      ],
      completed: { ...s.completed, [m.id]: { decisionId: decision.id } },
    };
  }
  return s;
}
export function campaignMetrics(s, c) {
  const metrics = { ...c.initial, completed: 0 };
  for (const m of c.missions) {
    const stored = s.completed[m.id];
    if (!stored) continue;
    const d = m.decisions.find((x) => x.id === stored.decisionId);
    if (!d) continue;
    for (const key of ["budget", "readiness", "trust"])
      metrics[key] += d.effect[key] ?? 0;
    metrics.readiness = Math.max(0, Math.min(100, metrics.readiness));
    metrics.trust = Math.max(0, Math.min(100, metrics.trust));
    metrics.completed++;
  }
  return metrics;
}
export function serializeCampaign(s) {
  const json = JSON.stringify({ version: CAMPAIGN_VERSION, events: s.events });
  if (new TextEncoder().encode(json).length > CAMPAIGN_MAX_BYTES)
    throw new Error("任务存档超过 2 MiB");
  return json;
}
export function deserializeCampaign(text, campaigns) {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > CAMPAIGN_MAX_BYTES
  )
    throw new Error("任务存档过大");
  const raw = JSON.parse(text);
  if (
    !record(raw) ||
    raw.version !== CAMPAIGN_VERSION ||
    !Array.isArray(raw.events) ||
    raw.events.length > 500
  )
    throw new Error("任务存档格式或版本不支持");
  let s = createCampaignState();
  for (const e of raw.events) {
    const next = reduceCampaign(s, e, campaigns);
    if (next === s) throw new Error("任务存档包含不合法的顺序或数据");
    s = next;
  }
  return s;
}

/** Versioned, replayable learning progress. Imported snapshots never grant progress. */
export const RULES_VERSION = "1.0.0";
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 10000;
const MAX_TEXT = 20000;
const safeId = (id) =>
  typeof id === "string" &&
  id.length > 0 &&
  id.length < 150 &&
  !["__proto__", "prototype", "constructor"].includes(id);
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const validSeed = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const validText = (value) =>
  typeof value === "string" && value.length <= MAX_TEXT;
const emptyProgress = () => ({
  learned: false,
  caseDone: false,
  completed: false,
  caseAnswer: "",
  attempts: [],
  review: {},
});

export function createState(seed = 20261017) {
  if (!validSeed(seed)) throw new Error("无效的随机种子");
  return {
    version: RULES_VERSION,
    seed,
    events: [],
    progress: {},
    settings: { reducedMotion: false },
    createdAt: 0,
  };
}
export function getProgress(state, id) {
  return safeId(id) && Object.hasOwn(state.progress, id)
    ? state.progress[id]
    : emptyProgress();
}
export function isUnlocked(state, index, lessons) {
  return (
    Number.isInteger(index) &&
    index >= 0 &&
    index < lessons.length &&
    (index === 0 ||
      lessons.slice(0, index).every((l) => getProgress(state, l.id).completed))
  );
}
export function reduce(state, event, lessons) {
  if (!object(event) || state.events.length >= MAX_EVENTS) return state;
  const at = event.at ?? 0;
  if (!Number.isSafeInteger(at) || at < 0) return state;
  const type = event.type;
  if (type === "SETTINGS") {
    if (
      typeof event.reducedMotion !== "boolean" ||
      event.reducedMotion === state.settings.reducedMotion
    )
      return state;
    return {
      ...state,
      settings: { reducedMotion: event.reducedMotion },
      events: [
        ...state.events,
        { type, at, reducedMotion: event.reducedMotion },
      ],
    };
  }
  if (!safeId(event.lessonId)) return state;
  const index = lessons.findIndex((l) => l.id === event.lessonId);
  if (!isUnlocked(state, index, lessons)) return state;
  const lesson = lessons[index];
  const current = getProgress(state, lesson.id);
  const p = { ...current };
  const record = { type, lessonId: lesson.id, at };
  if (type === "LEARN") {
    if (p.learned) return state;
    p.learned = true;
  } else if (type === "DRAFT") {
    if (
      !validText(event.answer) ||
      p.completed ||
      event.answer === p.caseAnswer
    )
      return state;
    p.caseAnswer = record.answer = event.answer;
    // Drafts are editable snapshots; durable CASE and answer events retain history.
    const events = state.events.filter(
      (e) => e.type !== "DRAFT" || e.lessonId !== lesson.id,
    );
    const baseline =
      events.findLast((e) => e.type === "CASE" && e.lessonId === lesson.id)
        ?.answer ?? "";
    // Reverting to the submitted answer needs no draft event: replay must stay valid.
    if (event.answer !== baseline) events.push(record);
    const progress = { ...state.progress, [lesson.id]: p };
    if (!events.some((e) => e.lessonId === lesson.id))
      delete progress[lesson.id];
    return { ...state, progress, events };
  } else if (type === "CASE") {
    if (
      !p.learned ||
      p.caseDone ||
      !validText(event.answer) ||
      event.answer.trim().length < 20 ||
      !Number.isInteger(event.checkedCount) ||
      event.checkedCount < 3 ||
      event.checkedCount > (lesson.caseStudy?.rubric?.length ?? 0)
    )
      return state;
    p.caseDone = true;
    p.caseAnswer = record.answer = event.answer;
    record.checkedCount = event.checkedCount;
  } else if (type === "ANSWER" || type === "REVIEW") {
    if (!p.caseDone || (type === "REVIEW" ? !p.completed : p.completed))
      return state;
    if (!safeId(event.questionId)) return state;
    const question = lesson.questions.find((q) => q.id === event.questionId);
    if (
      !question ||
      !Number.isInteger(event.option) ||
      event.option < 0 ||
      event.option >= question.options.length
    )
      return state;
    record.questionId = question.id;
    record.option = event.option;
    const attempt = {
      questionId: question.id,
      option: event.option,
      correct: event.option === question.answer,
      at,
    };
    if (type === "ANSWER") p.attempts = [...p.attempts, attempt];
    else
      p.review = {
        ...p.review,
        [question.id]: [...(p.review[question.id] || []), attempt],
      };
  } else if (type === "COMPLETE") {
    if (
      p.completed ||
      !p.caseDone ||
      !lesson.questions.length ||
      !lesson.questions.every((q) =>
        p.attempts.some((a) => a.questionId === q.id && a.correct),
      )
    )
      return state;
    p.completed = true;
  } else return state;
  return {
    ...state,
    progress: { ...state.progress, [lesson.id]: p },
    events: [...state.events, record],
  };
}
export function getStats(state, lessons) {
  const p = lessons.map((l) => getProgress(state, l.id));
  const attempts = p.flatMap((v) => v.attempts);
  const correct = attempts.filter((a) => a.correct).length;
  const completed = p.filter((v) => v.completed).length;
  return {
    completed,
    total: lessons.length,
    books: p.filter((v) => v.learned).length,
    clues: p.filter((v) => v.caseDone).length,
    rewards: completed,
    correct,
    attempts: attempts.length,
    accuracy: attempts.length ? (correct / attempts.length) * 100 : 0,
  };
}
export function replay(events, lessons, seed = 20261017) {
  if (!Array.isArray(events) || events.length > MAX_EVENTS)
    throw new Error("事件日志过大或格式无效");
  return events.reduce((state, event) => {
    const next = reduce(state, event, lessons);
    if (next === state) throw new Error("存档包含非法或乱序事件");
    return next;
  }, createState(seed));
}
export function serializeState(state) {
  return JSON.stringify({
    version: state.version,
    seed: state.seed,
    events: state.events,
  });
}
export function deserializeState(raw, lessons) {
  if (
    typeof raw !== "string" ||
    raw.length > MAX_SAVE_BYTES ||
    new TextEncoder().encode(raw).byteLength > MAX_SAVE_BYTES
  )
    throw new Error("存档过大或格式无效");
  const parsed = JSON.parse(raw);
  if (
    !object(parsed) ||
    parsed.version !== RULES_VERSION ||
    !validSeed(parsed.seed)
  )
    throw new Error("存档版本或种子无效");
  return replay(parsed.events, lessons, parsed.seed);
}
export function shuffle(items, seed) {
  if (!validSeed(seed)) throw new Error("无效的随机种子");
  const result = [...items];
  let n = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = Math.floor((n / 4294967296) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

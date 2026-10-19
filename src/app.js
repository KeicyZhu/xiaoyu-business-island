import { lessons, CURRICULUM_VERSION } from "./curriculum.js";
import {
  createState,
  reduce,
  getProgress,
  isUnlocked,
  getStats,
  serializeState,
  deserializeState,
  shuffle,
  RULES_VERSION,
  MAX_SAVE_BYTES,
} from "./state.js";
import { mountRunner } from "./runner.js";
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
const KEY = "xiaoyu-island-save-v1",
  app = document.querySelector("#app"),
  dialog = document.querySelector("#lesson-dialog");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let state = createState(),
  screen = "map",
  selected = 0,
  active = 0,
  stage = "learn",
  conceptIndex = 0,
  caseRevealed = false,
  queue = [],
  questionIndex = 0,
  choice = null,
  answered = false,
  cleanupRunner = null,
  island = null,
  mapGeneration = 0,
  saveError = false;
let pendingDraft = null,
  draftTimer = 0;
function flushDraft() {
  clearTimeout(draftTimer);
  if (pendingDraft) {
    dispatch({ type: "DRAFT", ...pendingDraft });
    pendingDraft = null;
  }
}
let initialMessage = "";
try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = deserializeState(saved, lessons);
} catch {
  initialMessage = "未能读取存档。已开启新旅程；你仍可以导入备份。";
}
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent =
    saveError && !message.includes("未保存")
      ? `${message}（进度未保存，请导出备份。）`
      : message;
  el.classList.add("visible");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("visible"), 3800);
}
function save() {
  try {
    localStorage.setItem(KEY, serializeState(state));
    saveError = false;
  } catch {
    saveError = true;
    toast("浏览器无法保存进度，请在旅行手账中导出备份。");
  }
  updateSaveNotice();
}
function updateSaveNotice() {
  const notice = document.querySelector("#save-status");
  if (!notice) return;
  notice.hidden = !saveError;
  notice.innerHTML = saveError
    ? '进度未保存，请先导出备份。<button data-screen="report">前往导出 →</button>'
    : "";
}
function dispatch(event) {
  const next = reduce(state, { ...event, at: Date.now() }, lessons);
  if (next === state && state.events.length >= 10000)
    toast("学习记录已达上限，请导出备份后重新开始旅程。");
  state = next;
  save();
}
function currentIndex() {
  const i = lessons.findIndex((l) => !getProgress(state, l.id).completed);
  return i < 0 ? lessons.length - 1 : i;
}
selected = currentIndex();
const statusText = (p) =>
  p.completed
    ? "已通关"
    : p.caseDone
      ? "等待试炼"
      : p.learned
        ? "实战进行中"
        : "尚未探索";
const navs = [
  ["map", "⌁", "探险地图"],
  ["books", "▤", "我的宝典"],
  ["bag", "♧", "逃生背包"],
  ["review", "↻", "记忆营地"],
  ["report", "✎", "旅行手账"],
];
function reducedMotion() {
  return state.settings.reducedMotion || motionPreference.matches;
}
function motionLabel() {
  if (motionPreference.matches) return "◌ 减少动画：跟随系统";
  return state.settings.reducedMotion ? "◌ 减少动画：已开启" : "✧ 动画：开启";
}
function header() {
  return `<header class="world-header"><a class="world-brand" href="#" data-screen="map"><span class="brand-spark" aria-hidden="true">✳</span><span>空降之商业女王<b>小玉</b><small>XIAOYU’S BUSINESS ISLAND</small></span></a><nav aria-label="主导航">${navs.map(([id, icon, name]) => `<button data-screen="${id}" class="nav-item ${screen === id ? "active" : ""}" ${screen === id ? 'aria-current="page"' : ""}><span>${icon}</span>${name}</button>`).join("")}</nav><button class="sound-toggle" data-action="motion" aria-label="${motionLabel()}" title="${motionLabel()}">${reducedMotion() ? "◌" : "✧"}<span>${motionPreference.matches ? "系统静态" : state.settings.reducedMotion ? "静态" : "动态"}</span></button></header>`;
}
function shell(content) {
  document.body.classList.toggle("screen-map", screen === "map");
  app.innerHTML = `${header()}<main id="main" tabindex="-1">${screen !== "map" ? `<div class="inner-topline"><button data-screen="map">← 回到小岛</button><span>▤ ${getStats(state, lessons).books} 本宝典　✦ ${getStats(state, lessons).rewards} 件装备</span></div>` : ""}${content}${screen !== "map" ? '<footer class="page-footer"><span>带着好奇，向自由出发。</span><button data-action="about">关于这场冒险</button></footer>' : ""}</main>`;
  document.body.classList.toggle("reduce-motion", reducedMotion());
  const notice = document.createElement("div");
  notice.id = "save-status";
  notice.setAttribute("role", "alert");
  app.prepend(notice);
  updateSaveNotice();
}

const positions = [
  [14, 70],
  [28, 53],
  [16, 30],
  [34, 17],
  [49, 32],
  [45, 58],
  [60, 76],
  [73, 55],
  [65, 29],
  [83, 19],
  [89, 73],
];
function questView() {
  const l = lessons[selected],
    p = getProgress(state, l.id),
    unlocked = isUnlocked(state, selected, lessons);
  return `<aside class="quest-panel" aria-label="所选地区任务"><div class="quest-chapter">${String(selected + 1).padStart(2, "0")}<span>/ 11</span></div><div class="quest-copy"><small>${unlocked ? (p.completed ? "已经走过的风景" : "下一场小小冒险") : "还未抵达的风景"}</small><h2>${esc(l.title)}</h2><p>${esc(l.subtitle)}</p></div><div class="quest-stages"><span class="${p.learned ? "done" : ""}">${p.learned ? "✓" : "01"} 概念宝典</span><i>·</i><span class="${p.caseDone ? "done" : ""}">${p.caseDone ? "✓" : "02"} 案例自查</span><i>·</i><span class="${p.completed ? "done" : ""}">${p.completed ? "✓" : "03"} 知识试炼</span></div><div class="quest-reward"><span>${l.reward.icon}</span><small>本关发现<b>${esc(l.reward.name)}</b></small></div><button class="button primary" data-open="${selected}" ${!unlocked ? "disabled" : ""}>${!unlocked ? "完成前一关后开启" : p.completed ? "再去看看" : "出发，去探险"}<span>↗</span></button></aside>`;
}
function mapView() {
  const stats = getStats(state, lessons),
    all = stats.completed === lessons.length;
  const stars = Array.from(
    { length: 11 },
    (_, i) =>
      `<svg class="sky-star star-${i}" viewBox="0 0 60 60" aria-hidden="true"><path d="M30 3 35 22 56 16 43 32 55 48 35 41 26 59 23 38 3 39 19 26 12 8 29 19Z"/></svg>`,
  ).join("");
  return `<section class="island-world" aria-label="小玉的巴厘岛悬浮世界">
    <div class="sky-doodles" aria-hidden="true">${stars}<span class="wind-line wind-one"></span><span class="wind-line wind-two"></span></div>
    <div class="world-title"><span class="world-eyebrow">BALI · A LITTLE WORLD TO GET LOST IN</span><h1>零经验空降，<br>也能成为<span>商业女王！</span></h1><p>和小玉一起拾起知识、破解商业谜题。<br>集齐逃生装备，把未知的小岛走成自己的地图。</p><button class="world-start" data-open="${currentIndex()}">${all ? "重游我的小岛" : "继续我的冒险"}<span>↗</span></button><button class="world-how" data-action="how">第一次来？看看怎么玩</button></div>
    <div class="world-coordinates" aria-hidden="true">08° S &nbsp; / &nbsp; 115° E<br><span>AN ISLAND OF POSSIBILITIES</span></div>
    <div class="world-scene-wrap"><div class="map-viewport" role="region" aria-label="巴厘岛风格学习地图，选择编号查看地区"><div class="island-map">
      <img class="map-background" src="./assets/island.svg" alt="商业岛平面地图，3D 不可用时仍可选择全部学习地区">
      <svg class="route" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${positions.map((p) => p.join(",")).join(" ")}"/></svg>
      ${lessons
        .map((l, i) => {
          const p = getProgress(state, l.id),
            open = isUnlocked(state, i, lessons);
          return `<button class="map-node ${p.completed ? "complete" : open ? "available" : "locked"} ${selected === i ? "selected" : ""}" style="left:${positions[i][0]}%;top:${positions[i][1]}%" data-select="${i}" aria-label="${i + 1}. ${esc(l.title)}，${open ? statusText(p) : "未解锁"}" aria-pressed="${selected === i}"><span class="node-icon">${p.completed ? "✓" : String(i + 1).padStart(2, "0")}</span><span class="node-label">${esc(l.title)}</span>${i === currentIndex() && !all ? '<span class="you-are-here">小玉在这里</span>' : ""}</button>`;
        })
        .join("")}
    </div></div></div>
    <div class="world-companion"><img src="./assets/xiaoyu.svg" alt="黑发白裙的小玉，带着粉色小包出发"><p>不必准备好一切。<br>带上好奇心，就出发吧。<span>— 小玉的岛屿日记</span></p></div>
    <div class="world-tools"><span class="map-render-status" role="status">风正在托起小岛…</span><div class="map-controls" role="group" aria-label="地图视角"><button data-action="map-left" aria-label="向左旋转地图" title="向左旋转地图" disabled>↶</button><button data-action="map-right" aria-label="向右旋转地图" title="向右旋转地图" disabled>↷</button><button data-action="map-out" aria-label="缩小地图" title="缩小地图" disabled>−</button><button data-action="map-in" aria-label="放大地图" title="放大地图" disabled>＋</button><button data-action="map-reset" aria-label="恢复地图视角" disabled>复位</button></div></div>
    <div class="world-bottom"><div class="world-progress"><span>旅程 <b>${String(stats.completed).padStart(2, "0")}</b> / ${stats.total}</span><div class="progress-track"><i style="width:${(stats.completed / stats.total) * 100}%"></i></div></div><details class="map-directory"><summary>寻找一个地区 <span>＋</span></summary><div>${lessons.map((l, i) => `<button data-select="${i}" aria-pressed="${selected === i}"><b>${String(i + 1).padStart(2, "0")}</b> ${esc(l.title)}<small>${getProgress(state, l.id).completed ? "已通关" : isUnlocked(state, i, lessons) ? "可探索" : "待开启"}</small></button>`).join("")}</div></details><button data-action="about" class="world-about">关于这场冒险 ↗</button></div>
  </section><div class="quest-slot">${questView()}</div>`;
}

function selectMap(index) {
  if (!Number.isInteger(index) || !lessons[index] || screen !== "map") return;
  selected = index;
  const panel = app.querySelector(".quest-panel");
  if (panel) panel.outerHTML = questView();
  app.querySelectorAll("[data-select]").forEach((node) => {
    const chosen = Number(node.dataset.select) === index;
    node.classList.toggle("selected", chosen);
    node.setAttribute("aria-pressed", String(chosen));
  });
  app.querySelector(".map-directory")?.removeAttribute("open");
}
async function mountMap(generation) {
  const container = app.querySelector(".island-map");
  if (!container) return;
  try {
    const { mountIsland } = await import("./island-scene.js");
    if (generation !== mapGeneration || !container.isConnected) return;
    island = mountIsland(container, {
      nodes: [...container.querySelectorAll(".map-node")],
      currentIndex: currentIndex(),
      reducedMotion: reducedMotion(),
      onSelect: selectMap,
      onStatus: (status) => {
        if (generation === mapGeneration) setMapStatus(status === "ready");
      },
    });
    island?.setPaused?.(dialog.open);
  } catch {
    island = null;
  }
  if (generation !== mapGeneration) return;
  setMapStatus(Boolean(island));
}
function setMapStatus(ready) {
  app
    .querySelectorAll(".map-controls button")
    .forEach((b) => (b.disabled = !ready));
  const status = app.querySelector(".map-render-status");
  if (status)
    status.textContent = ready
      ? "选择路标，开启下一站"
      : "平面地图 · 所有学习功能可用";
}

function pageTitle(kicker, title, description) {
  return `<div class="page-heading"><span class="eyebrow">${kicker}</span><h1>${title}</h1><p>${description}</p></div>`;
}
function booksView() {
  const unlocked = lessons.filter((l) => getProgress(state, l.id).learned);
  return `${pageTitle("THE POCKET LIBRARY", "把知识，装进口袋。", "每本宝典都保留概念、例子与易错点。随时回来，不必重新闯关。")}<div class="book-grid">${unlocked.length ? unlocked.map((l) => `<article class="book-card"><span class="book-spine">${l.icon}</span><div><small>POCKET GUIDE</small><h2>${esc(l.book)}</h2><p>${l.concepts.length} 个关键概念</p><button class="text-button" data-book="${lessons.indexOf(l)}">打开宝典 →</button></div></article>`).join("") : empty("第一本宝典还在海滩等你。", "开始第一站")}</div>`;
}
function empty(text, cta) {
  return `<div class="empty-state"><span>✿</span><h2>${text}</h2><p>每次学习都会留下自己的痕迹。</p><button class="button primary" data-open="${currentIndex()}">${cta}</button></div>`;
}
function bagView() {
  return `${pageTitle("A BAG FULL OF POSSIBILITIES", "逃生背包", "每件小装备，都是你想明白一个问题的证据。")}<div class="inventory-grid">${lessons
    .map((l, i) => {
      const p = getProgress(state, l.id);
      return `<article class="item-card ${p.completed ? "owned" : "not-owned"}"><span class="item-number">NO. ${String(i + 1).padStart(2, "0")}</span><span class="item-icon">${p.completed ? l.reward.icon : "♧"}</span><h2>${esc(l.reward.name)}</h2><p>${p.completed ? esc(l.reward.description) : `在${esc(l.title)}等待领取`}</p><span class="pill">${p.completed ? "✓ 已收集" : "未获得"}</span>${p.completed ? `<button class="text-button" data-run-lesson="${i}">带它出发 →</button>` : ""}</article>`;
    })
    .join("")}</div><div class="clue-board"><h2>拼起来的逃岛路线</h2>${
    lessons
      .filter((l) => getProgress(state, l.id).caseDone)
      .map(
        (l) =>
          `<div class="clue-note"><span>✎ ${esc(l.title)}</span><p>${esc(l.clue)}</p></div>`,
      )
      .join("") || "<p>完成第一道实战案例，就会找到第一片路线。</p>"
  }</div>`;
}
function wrongQuestions() {
  return lessons.flatMap((l, i) => {
    const p = getProgress(state, l.id);
    return l.questions
      .filter((q) =>
        p.attempts.some((a) => a.questionId === q.id && !a.correct),
      )
      .map((q) => ({ lesson: l, lessonIndex: i, question: q }));
  });
}
function reviewView() {
  const wrong = wrongQuestions();
  return `${pageTitle("CAMP OF SECOND CHANCES", "忘记了？回来坐坐。", "错题不是扣分项。换个角度再想一次，让知识真正留下来。")}<div class="review-intro"><span>☕</span><p>本版记录错题和复习表现，不把“看过答案”当作独立掌握。<br>建议下一次回来时，再不看宝典地试一试。</p></div><div class="review-list">${wrong.length ? wrong.map(({ lesson: l, lessonIndex: i, question: q }) => `<article><div><small>${esc(l.title)} · ${getProgress(state, l.id).completed ? "可复习" : "学习中"}</small><h3>${esc(q.prompt)}</h3></div><button class="button quiet" data-review="${i}" data-q="${q.id}">再想一次 ↗</button></article>`).join("") : empty("暂时还没有错题。", "去岛上学点新知识")}</div><h2 class="subheading">已经走过的地方</h2><div class="region-chips">${
    lessons
      .filter((l) => getProgress(state, l.id).completed)
      .map(
        (l) =>
          `<button class="button quiet" data-review="${lessons.indexOf(l)}">${l.icon} ${esc(l.title)} ↻</button>`,
      )
      .join("") || "<p>完成地区后，可以在这里进行复习。</p>"
  }</div>`;
}
function reportView() {
  const st = getStats(state, lessons);
  return `${pageTitle("MY ADVENTURE JOURNAL", "每一步，都算数。", "这里记录学习过程与自查结果，不代表真实经营业绩或自动能力认证。")}<div class="stat-grid"><div><small>地区通关</small><b>${st.completed}<em> / ${st.total}</em></b></div><div><small>已读宝典</small><b>${st.books}</b></div><div><small>闯关答题准确率</small><b>${Math.round(st.accuracy)}<em>%</em></b></div><div><small>答题次数</small><b>${st.attempts}</b></div></div><section class="journal"><h2>我的能力足迹</h2>${lessons
    .map((l) => {
      const p = getProgress(state, l.id);
      return `<div class="journal-row"><span>${l.icon}</span><div><b>${esc(l.title)}</b><small>${esc(l.subtitle)}</small></div><span class="pill ${p.completed ? "green" : ""}">${statusText(p)}</span><button class="text-button" data-source="${lessons.indexOf(l)}">来源 ↗</button></div>`;
    })
    .join(
      "",
    )}</section><section class="save-panel"><div><h2>给冒险留一份备份</h2><p>导出包含你输入的案例答案、版本、种子与作答记录。只保存在你的设备，不会上传。</p></div><div class="save-actions"><button class="button primary" data-action="export">导出学习存档 ↓</button><label class="button quiet file-label">导入存档 ↑<input id="import-save" type="file" accept="application/json,.json" aria-label="导入学习存档"></label><button class="button quiet" data-action="motion">${state.settings.reducedMotion ? "恢复动画" : "减少动画"}</button><button class="text-button danger" data-action="reset">重新开始旅程</button></div><small>课程 ${CURRICULUM_VERSION} · 规则 ${RULES_VERSION} · ${state.events.length} 条可回放记录</small></section>`;
}
function render() {
  island?.dispose();
  island = null;
  const generation = ++mapGeneration;
  shell(
    screen === "map"
      ? mapView()
      : screen === "books"
        ? booksView()
        : screen === "bag"
          ? bagView()
          : screen === "review"
            ? reviewView()
            : reportView(),
  );
  if (screen === "map") mountMap(generation);
}
function closeModal() {
  flushDraft();
  cleanupRunner?.();
  cleanupRunner = null;
  dialog.close();
  dialog.innerHTML = "";
  render();
  document.querySelector("#main").focus({ preventScroll: true });
}
function showDialog(html) {
  cleanupRunner?.();
  cleanupRunner = null;
  dialog.innerHTML = html;
  island?.setPaused?.(true);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector("h2")?.focus();
}
function modalFrame(title, body, footer = "") {
  return `<button class="modal-close" data-action="close" aria-label="关闭">×</button><div class="modal-header"><span class="eyebrow">XIAOYU'S LEARNING CAMP</span><h2 id="dialog-title" tabindex="-1">${title}</h2></div>${body}${footer}`;
}
function lessonHeader(l) {
  const p = getProgress(state, l.id);
  return `<button class="modal-close" data-action="close" aria-label="关闭学习营地">×</button><div class="lesson-kicker"><span>${l.icon} ${esc(l.title)}</span><span>CHAPTER ${String(active + 1).padStart(2, "0")}</span></div><div class="stage-tabs"><button class="${stage === "learn" ? "active" : ""}" data-stage="learn">① 概念宝典 ${p.learned ? "✓" : ""}</button><button class="${stage === "case" ? "active" : ""}" data-stage="case" ${!p.learned ? "disabled" : ""}>② 实战线索 ${p.caseDone ? "✓" : ""}</button><button class="${stage === "quiz" ? "active" : ""}" data-stage="quiz" ${!p.caseDone ? "disabled" : ""}>③ 混合试炼 ${p.completed ? "✓" : ""}</button></div>`;
}
function openLesson(i, forced) {
  if (!isUnlocked(state, i, lessons)) {
    toast("先完成前面的地区，再一起出发。");
    return;
  }
  active = i;
  selected = i;
  const p = getProgress(state, lessons[i].id);
  stage = forced || (p.caseDone ? "quiz" : p.learned ? "case" : "learn");
  conceptIndex = 0;
  caseRevealed = false;
  resetQueue();
  renderLesson();
}
function resetQueue(onlyQ) {
  const l = lessons[active];
  queue = shuffle(
    l.questions.map((q) => ({ q, l })),
    (state.seed + active) >>> 0,
  );
  if (onlyQ) queue = queue.filter((x) => x.q.id === onlyQ);
  if (!onlyQ && active > 0) {
    const prev = lessons[active - 1];
    queue.push({
      q: prev.questions[((state.seed + active) >>> 0) % prev.questions.length],
      l: prev,
      bonus: true,
    });
  }
  questionIndex = 0;
  choice = null;
  answered = false;
}
function renderLesson() {
  const l = lessons[active],
    p = getProgress(state, l.id);
  let body = "";
  if (stage === "learn") {
    const c = l.concepts[conceptIndex];
    body = `<div class="lesson-content"><div class="concept-meta"><span class="pill">${conceptIndex + 1} / ${l.concepts.length} 个概念</span><span>速通关键概念 · 收下你的宝典</span></div><h2 id="dialog-title" tabindex="-1">${esc(c.title)}</h2><p class="concept-definition">${esc(c.definition)}</p><div class="example-card"><span>✦ 小玉的理解</span><p>${esc(c.example)}</p></div><div class="pitfall"><b>别踩这个坑</b><p>${esc(c.pitfall)}</p></div><div class="lesson-controls"><button class="button quiet" data-action="concept-prev" ${conceptIndex === 0 ? "disabled" : ""}>← 上一个</button><button class="button primary" data-action="concept-next">${conceptIndex === l.concepts.length - 1 ? `领取${esc(l.book)} ↗` : "想明白了，下一个 →"}</button></div></div>`;
  } else if (stage === "case") {
    const c = l.caseStudy;
    body = `<div class="lesson-content"><span class="pill">原创模拟案例 · 本地自查</span><h2 id="dialog-title" tabindex="-1">${esc(c.title)}</h2><p class="scenario">${esc(c.scenario)}</p><p class="case-prompt">${esc(c.prompt)}</p><label class="answer-label" for="case-answer">写下你的判断 <span>至少 20 字，可以不完美</span></label><textarea id="case-answer" maxlength="20000" placeholder="我的判断是…\n依据是…\n下一步我会…\n我会这样验证…">${esc(p.caseAnswer)}</textarea><p class="fineprint">自动保存草稿。本版不会用关键词假装判断答案质量。</p>${caseRevealed ? `<section class="case-feedback"><h3>对照一下自己的思路</h3><p>${esc(c.reference)}</p><div class="rubric">${c.rubric.map((r, i) => `<label><input type="checkbox" name="rubric" value="${i}"><span>${esc(r)}</span></label>`).join("")}</div><p class="fineprint">勾选你已理解或在答案中补充的要点，至少 3 项。该记录属于自评。</p><button class="button primary full" data-action="case-complete">保存自查，获得路线线索 ↗</button></section>` : `<button class="button primary full" data-action="case-reveal">写好了，查看参考思路 →</button>`}</div>`;
  } else {
    const entry = queue[questionIndex];
    if (!entry) {
      showQuizSummary();
      return;
    }
    const q = entry.q;
    body = `<div class="lesson-content"><div class="concept-meta"><span class="pill">${entry.bonus ? "回顾上一站" : "知识混合试炼"}</span><span>${questionIndex + 1} / ${queue.length}</span></div><h2 id="dialog-title" class="question-title" tabindex="-1">${esc(q.prompt)}</h2><div class="quiz-options">${q.options.map((o, i) => `<button class="quiz-option ${choice === i ? "chosen" : ""} ${answered && i === q.answer ? "correct" : ""} ${answered && choice === i && i !== q.answer ? "incorrect" : ""}" data-choice="${i}" ${answered ? "disabled" : ""}><span>${String.fromCharCode(65 + i)}</span>${esc(o)}${answered && i === q.answer ? "<b>✓</b>" : ""}</button>`).join("")}</div>${answered ? `<div class="answer-feedback ${choice === q.answer ? "positive" : "negative"}"><b>${choice === q.answer ? "✦ 这次想对了！" : "没关系，我们把它想明白。"}</b><p>${esc(q.explanation)}</p></div><button class="button primary full" data-action="quiz-next">${questionIndex === queue.length - 1 ? "查看本次试炼 →" : "继续下一题 →"}</button>` : `<button class="button primary full" data-action="quiz-submit" ${choice === null ? "disabled" : ""}>确认我的选择 →</button>`}<p class="fineprint">不计时。先想清楚，再做选择。</p></div>`;
  }
  showDialog(lessonHeader(l) + body);
}
function showQuizSummary() {
  const l = lessons[active],
    p = getProgress(state, l.id);
  const missing = l.questions.filter(
    (q) => !p.attempts.some((a) => a.questionId === q.id && a.correct),
  );
  if (p.completed) {
    showDialog(
      modalFrame(
        "再走一次，记得更牢。",
        `<div class="modal-body center"><span class="large-icon">☕</span><p>本次复习已记录。想一想：离开选项，你能独立解释这些判断吗？</p><button class="button primary" data-action="close">回到岛上 →</button></div>`,
      ),
    );
    return;
  }
  if (missing.length) {
    showDialog(
      modalFrame(
        "再给自己一次机会。",
        `<div class="modal-body center"><span class="large-icon">🌱</span><p>还有 ${missing.length} 个概念需要重新想想。刚才的解释可以帮你理清依据。</p><button class="button primary" data-action="retry">重试未通过的题目 →</button><p class="fineprint">重试原题只记录练习完成，不视为独立迁移认证。</p></div>`,
      ),
    );
    return;
  }
  dispatch({ type: "COMPLETE", lessonId: l.id });
  if (getProgress(state, l.id).completed) showReward();
  else toast("当前记录无法继续，请先导出备份。");
}
function showReward() {
  const l = lessons[active];
  showDialog(
    modalFrame(
      "又离自由近了一步。",
      `<div class="modal-body center reward-celebration"><span class="eyebrow">A LITTLE REWARD FOR A BIG STEP</span><div class="reward-orbit"><span>${l.reward.icon}</span><i>✦</i><b>✧</b></div><h3>获得「${esc(l.reward.name)}」</h3><p>${esc(l.reward.description)}</p><div class="clue-note"><small>你的新线索</small><p>${esc(l.clue)}</p></div><button class="button primary" data-action="run">带上装备，向下一站出发 ↗</button><button class="text-button" data-action="after-run">直接回到地图</button></div>`,
    ),
  );
}
function startRun() {
  const l = lessons[active];
  showDialog(
    modalFrame(
      `${l.reward.icon} 带着${esc(l.reward.name)}出发`,
      '<div id="runner-mount" class="runner-mount"></div>',
    ),
  );
  cleanupRunner = mountRunner(dialog.querySelector("#runner-mount"), {
    seed: (state.seed + active) >>> 0,
    reward: l.reward,
    reducedMotion: reducedMotion(),
    onDone: afterRun,
  });
}
function afterRun() {
  cleanupRunner?.();
  cleanupRunner = null;
  if (getStats(state, lessons).completed === lessons.length) {
    showDialog(
      modalFrame(
        "小玉，欢迎来到更大的世界。",
        `<div class="modal-body center ending"><img src="./assets/xiaoyu.svg" alt="完成旅程的小玉"><span class="eyebrow">THE ISLAND WAS ONLY THE BEGINNING</span><h3>不是突然变厉害，<br>是每一步都没有白走。</h3><p>你已完成 ${lessons.length} 个地区的首轮学习。<br>带着宝典与装备逃离商业岛，下一站是新的问题与实践。</p><button class="button primary" data-action="ending-report">打开我的旅行手账 ↗</button><p class="fineprint">首通不等于长期掌握。记得回来复习，用新情境检验自己。</p></div>`,
      ),
    );
  } else {
    closeModal();
    selected = currentIndex();
    screen = "map";
    render();
    toast("新地区已解锁，下一站见！");
  }
}
function showSource(i) {
  const l = lessons[i];
  showDialog(
    modalFrame(
      "这份知识从哪里来？",
      `<div class="modal-body"><h3>${esc(l.title)}</h3><p>课程采用通用业务概念，案例与数值为原创教学模拟，不代表任何企业内部规则或个人实绩。</p><a class="source-link" href="${esc(l.source.url)}" target="_blank" rel="noopener noreferrer">${esc(l.source.label)} ↗</a><p class="fineprint">外部产品规则可能变化，请以所在市场与当前官方说明为准。课程版本 ${CURRICULUM_VERSION}。</p></div>`,
    ),
  );
}
function showInfo(kind) {
  const content =
    kind === "how"
      ? [
          "小玉的逃岛指南",
          '<div class="how-steps"><p><b>01 · 学一点</b>每站先阅读关键概念，收下可以随时翻阅的宝典。</p><p><b>02 · 想一想</b>写下你的案例判断，再对照参考思路自查，获得路线线索。</p><p><b>03 · 试一试</b>完成混合测验，答错会得到解释，补练通过后拿到装备。</p><p><b>04 · 跑起来</b>带着奖励走一段轻跑酷。可以跳过，装备不会丢。</p></div>',
        ]
      : [
          "关于这场小小冒险",
          "<p>《空降之商业女王小玉》是一款面向零基础商业化与出海学习者的闯关学习小游戏。和小玉一起，从问题走向判断，从判断走向行动。</p><p>本版 11 个地区可完整游玩，使用本地案例自查，无 AI 自动评分，无账户登录，不上传学习答案。</p><p>角色为代码绘制的非官方学习原型；YuY IP 与原作者相关权益归其所有。本项目未获官方联名或授权背书。</p><p>因果研究所、AI 工坊和跨行业支岛留待后续课程扩展；当前不作为完成主线的必要条件。</p>",
        ];
  showDialog(
    modalFrame(
      content[0],
      `<div class="modal-body">${content[1]}<p class="public-guides"><a href="https://github.com/KeicyZhu/xiaoyu-business-island/blob/main/docs/PLAY_GUIDE.md" target="_blank" rel="noopener noreferrer">完整玩法手册 ↗</a>　<a href="https://github.com/KeicyZhu/xiaoyu-business-island/blob/main/docs/knowledge/README.md" target="_blank" rel="noopener noreferrer">公开知识库 ↗</a></p><button class="button primary" data-action="close">知道啦 →</button></div>`,
    ),
  );
}
function handleAction(action) {
  const l = lessons[active];
  switch (action) {
    case "map-left":
      island?.rotate(-0.18);
      break;
    case "map-right":
      island?.rotate(0.18);
      break;
    case "map-in":
      island?.zoom(0.1);
      break;
    case "map-out":
      island?.zoom(-0.1);
      break;
    case "map-reset":
      island?.resetView();
      break;
    case "close":
      closeModal();
      break;
    case "how":
    case "about":
      showInfo(action);
      break;
    case "motion":
      dispatch({
        type: "SETTINGS",
        reducedMotion: !state.settings.reducedMotion,
      });
      render();
      break;
    case "concept-prev":
      conceptIndex = Math.max(0, conceptIndex - 1);
      renderLesson();
      break;
    case "concept-next":
      if (conceptIndex < l.concepts.length - 1) {
        conceptIndex++;
        renderLesson();
      } else {
        dispatch({ type: "LEARN", lessonId: l.id });
        stage = "case";
        renderLesson();
        toast(`已收下「${l.book}」`);
      }
      break;
    case "case-reveal": {
      const answer = dialog.querySelector("#case-answer").value;
      if (answer.trim().length < 20) {
        toast("再写一点自己的想法吧，至少 20 字。");
        return;
      }
      dispatch({ type: "DRAFT", lessonId: l.id, answer });
      caseRevealed = true;
      renderLesson();
      break;
    }
    case "case-complete": {
      const answer = dialog.querySelector("#case-answer").value,
        checkedCount = dialog.querySelectorAll(
          '[name="rubric"]:checked',
        ).length;
      if (answer.trim().length < 20 || checkedCount < 3) {
        toast("请保留至少 20 字的判断，并自查至少 3 个要点。");
        return;
      }
      dispatch({ type: "CASE", lessonId: l.id, answer, checkedCount });
      stage = "quiz";
      resetQueue();
      renderLesson();
      toast("路线线索已经放进背包。");
      break;
    }
    case "quiz-submit": {
      if (choice === null) return;
      const { q, l: owner } = queue[questionIndex];
      dispatch({
        type: getProgress(state, owner.id).completed ? "REVIEW" : "ANSWER",
        lessonId: owner.id,
        questionId: q.id,
        option: choice,
      });
      answered = true;
      renderLesson();
      break;
    }
    case "quiz-next":
      questionIndex++;
      choice = null;
      answered = false;
      renderLesson();
      break;
    case "retry": {
      const p = getProgress(state, l.id);
      queue = l.questions
        .filter(
          (q) => !p.attempts.some((a) => a.questionId === q.id && a.correct),
        )
        .map((q) => ({ q, l }));
      questionIndex = 0;
      choice = null;
      answered = false;
      stage = "quiz";
      renderLesson();
      break;
    }
    case "run":
      startRun();
      break;
    case "after-run":
      afterRun();
      break;
    case "ending-report":
      closeModal();
      screen = "report";
      render();
      break;
    case "export": {
      const blob = new Blob([serializeState(state)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `xiaoyu-journey-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 500);
      toast("存档已导出，包含你的案例答案，请自行保管。");
      break;
    }
    case "reset":
      showDialog(
        modalFrame(
          "要重新开始旅程吗？",
          '<div class="modal-body"><p>当前浏览器的学习进度和答案会被清除。建议先关闭此窗口并导出存档。</p><div class="save-actions"><button class="button quiet" data-action="close">保留我的旅程</button><button class="button primary danger-fill" data-action="confirm-reset">确认清除并重新开始</button></div></div>',
        ),
      );
      break;
    case "confirm-reset":
      state = createState();
      save();
      selected = 0;
      screen = "map";
      closeModal();
      toast("新的旅程，从海滩开始。");
      break;
  }
}
document.addEventListener("click", (e) => {
  const button = e.target.closest(
    "[data-action],[data-screen],[data-open],[data-select],[data-stage],[data-choice],[data-book],[data-review],[data-source],[data-run-lesson]",
  );
  if (!button || button.disabled) return;
  flushDraft();
  e.preventDefault();
  if (button.dataset.screen) {
    screen = button.dataset.screen;
    render();
    window.scrollTo({
      top: 0,
      behavior: state.settings.reducedMotion ? "instant" : "smooth",
    });
  } else if (button.dataset.open !== undefined)
    openLesson(Number(button.dataset.open));
  else if (button.dataset.select !== undefined) {
    selectMap(Number(button.dataset.select));
  } else if (button.dataset.book !== undefined)
    openLesson(Number(button.dataset.book), "learn");
  else if (button.dataset.review !== undefined) {
    active = Number(button.dataset.review);
    if (!getProgress(state, lessons[active].id).completed) {
      openLesson(active, "quiz");
      return;
    }
    stage = "quiz";
    resetQueue(button.dataset.q);
    renderLesson();
  } else if (button.dataset.runLesson !== undefined) {
    active = Number(button.dataset.runLesson);
    if (getProgress(state, lessons[active].id).completed) startRun();
  } else if (button.dataset.source !== undefined)
    showSource(Number(button.dataset.source));
  else if (button.dataset.stage) {
    stage = button.dataset.stage;
    if (stage === "quiz") resetQueue();
    renderLesson();
  } else if (button.dataset.choice !== undefined) {
    choice = Number(button.dataset.choice);
    renderLesson();
  } else handleAction(button.dataset.action);
});
document.addEventListener("input", (e) => {
  if (e.target.id === "case-answer") {
    pendingDraft = { lessonId: lessons[active].id, answer: e.target.value };
    clearTimeout(draftTimer);
    draftTimer = setTimeout(flushDraft, 800);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id !== "import-save") return;
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_SAVE_BYTES) {
    toast("存档过大，请选择 5MB 以内的学习存档。");
    return;
  }
  try {
    const incoming = deserializeState(await file.text(), lessons);
    if (!window.confirm("导入将替换此浏览器当前进度，是否继续？")) return;
    state = incoming;
    save();
    selected = currentIndex();
    render();
    toast("存档已恢复，欢迎回到商业岛。");
  } catch {
    toast("这份存档无法读取，当前进度未改变。");
  }
});
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeModal();
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      closeModal();
  }
});
motionPreference.addEventListener("change", () => {
  document.body.classList.toggle("reduce-motion", reducedMotion());
  island?.setReducedMotion(reducedMotion());
  app.querySelectorAll(".sound-toggle").forEach((button) => {
    button.setAttribute("aria-label", motionLabel());
    button.title = motionLabel();
    button.innerHTML = `${reducedMotion() ? "◌" : "✧"}<span>${motionPreference.matches ? "系统静态" : state.settings.reducedMotion ? "静态" : "动态"}</span>`;
  });
});
window.addEventListener("pagehide", () => {
  flushDraft();
  island?.dispose();
  island = null;
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) render();
});
render();
if (initialMessage) toast(initialMessage);

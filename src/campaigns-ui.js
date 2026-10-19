import { campaigns, caseSources } from "./campaigns-data.js";
import {
  createCampaignState,
  reduceCampaign,
  assessMission,
  campaignMetrics,
  isMissionUnlocked,
  serializeCampaign,
  deserializeCampaign,
  CAMPAIGN_MAX_BYTES,
} from "./campaigns-state.js";
import { mountIsland } from "./island-scene.js";
const KEY = "xiaoyu-twin-campaign-v1";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const TYPES = {
  single: "情境判断",
  multi: "多选 · 全部选对",
  number: "业务计算",
  order: "行动排序",
};
// Keep unsaved work alive across top-level navigation and animation toggles.
let memorySession = null;
export function mountCampaigns(
  root,
  { reducedMotion = false, toast = () => {} } = {},
) {
  let state = createCampaignState(),
    campaign = null,
    missionIndex = 0,
    tab = "brief",
    view = "home",
    graded = false,
    scenes = [],
    generation = 0,
    saveFailed = false,
    disposed = false,
    unreadableRaw = null;
  if (memorySession) {
    ({ state, saveFailed, unreadableRaw } = memorySession);
  } else
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) state = deserializeCampaign(saved, campaigns);
    } catch {
      saveFailed = true;
      try {
        unreadableRaw = localStorage.getItem(KEY);
      } catch {}
      toast(
        "双岛存档未能读取，已暂停覆盖。请先导出原始文件，再确认重置；基础营地不受影响。",
      );
    }
  const c = () => campaigns.find((x) => x.id === campaign);
  const m = () => c()?.missions[missionIndex];
  const draft = () =>
    state.drafts[m()?.id] ?? {
      decisionId: "",
      answer: "",
      checks: [],
      answers: {},
    };
  function persist() {
    if (unreadableRaw !== null) {
      saveFailed = true;
      memorySession = { state, saveFailed, unreadableRaw };
      return;
    }
    try {
      localStorage.setItem(KEY, serializeCampaign(state));
      saveFailed = false;
    } catch {
      saveFailed = true;
      toast("双岛任务进度未保存，请先导出备份。");
    }
    const warning = root.querySelector("[data-save-warning]");
    if (warning) warning.hidden = !saveFailed;
    memorySession = { state, saveFailed, unreadableRaw };
  }
  function updateDraft(patch) {
    if (!m() || state.completed[m().id]) return;
    const next = reduceCampaign(
      state,
      {
        type: "DRAFT",
        campaignId: campaign,
        missionId: m().id,
        draft: { ...draft(), ...patch },
      },
      campaigns,
    );
    state = next;
    persist();
    refreshFeedback();
  }
  function refreshFeedback() {
    if (view !== "mission" || !m()) return;
    const result = assessMission(m(), draft());
    if (tab === "questions" && graded) {
      for (const q of m().questions) {
        const box = root.querySelector(
          `[data-question-id="${q.id}"] .question-feedback`,
        );
        if (!box) continue;
        const correct = result.grades.find((x) => x.id === q.id).correct;
        box.className = `question-feedback ${correct ? "correct" : "incorrect"}`;
        box.innerHTML = `<b>${correct ? "判断正确" : "还需要核对"}</b><p>${esc(q.explanation)}</p>`;
      }
      const score = root.querySelector('.assessment-actions [role="status"]');
      if (score)
        score.textContent = `${result.correct} / ${result.total} 已答对`;
    }
    const summary = root.querySelector(".mission-completion p");
    if (summary)
      summary.textContent = `客观题 ${result.correct}/${result.total} · 业务方案${result.decision ? "已选择" : "未选择"} · 文本${result.report ? "已填写" : "待补充"} · 自查${result.validChecks ? "已完成" : "待完成"}`;
  }
  function cleanupScenes() {
    generation++;
    scenes.forEach((x) => x?.dispose());
    scenes = [];
  }
  function sourceLinks(ids) {
    return ids
      .map((id) => {
        const s = caseSources[id];
        return s
          ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`
          : "";
      })
      .join("");
  }
  function evidence(mission) {
    return `<section class="evidence-block"><span class="case-tag">可核查的现实案例</span><h3>${esc(mission.realCase.title)}</h3><p>${esc(mission.realCase.fact)}</p><div class="source-links">${sourceLinks(mission.realCase.sourceIds)}</div><details><summary>核对国家、日期与案例边界</summary>${mission.realCase.sourceIds
      .map((id) => {
        const s = caseSources[id];
        return s
          ? `<p><b>${esc(s.title)}</b><br>${esc(s.context)}<br><span>不能据此推断：${esc(s.limits)}</span></p>`
          : "";
      })
      .join("")}</details></section>`;
  }
  function metricStrip(campaign) {
    const s = campaignMetrics(state, campaign);
    return `<div class="campaign-metrics"><span>剩余项目预算 <b>${s.budget}</b> ${esc(campaign.unit)}</span><span>上线准备 <b>${s.readiness}</b>/100</span><span>体验与信任 <b>${s.trust}</b>/100</span><span>已交付 <b>${s.completed}</b>/${campaign.missions.length}</span></div>`;
  }
  function home() {
    return `<section class="twin-home"><header class="twin-intro"><span>FROM KNOWING TO DOING</span><h1>两座岛，两场真正要想明白的生意。</h1><p>一边负责 TikTok Shop 用户增长，一边带中国蟹黄酱走向海外。<br>从现实案例出发，用证据、数字与连续决策完成全链路任务。</p></header><div class="campaign-islands">${campaigns
      .map((track, i) => {
        const stats = campaignMetrics(state, track);
        return `<article class="campaign-island campaign-${track.id}"><div class="campaign-scene" data-campaign-scene="${track.id}" aria-hidden="true"></div><div class="campaign-identity"><span>0${i + 1} / ${esc(track.role)}</span><h2>${esc(track.title)}</h2><p>${esc(track.subtitle)}</p><button class="button primary" data-c-act="enter" data-track="${track.id}">${stats.completed === track.missions.length ? "回看已完成任务" : stats.completed ? "继续项目" : "接受任务"} <span>↗</span></button><small>${stats.completed} / ${track.missions.length} 阶段 · ${track.missions.reduce((n, m) => n + m.questions.length, 0)} 道实战题</small></div></article>`;
      })
      .join(
        "",
      )}</div><div class="twin-note"><span>事实有出处，推演有边界。</span><p>平台案例可查原文；任务预算、转化表与决策变化均为教学仿真，不是企业内部数据或收益预测。开放方案采用自查，不冒充 AI 评分。</p></div><div class="campaign-home-links"><button data-screen="map">先去基础营地复习 11 关 →</button><button data-c-act="report">我的双岛任务档案 →</button><button data-c-act="sources">查看案例与资料来源 →</button></div></section>`;
  }
  function sidebar() {
    return `<aside class="mission-navigation"><button class="mission-back" data-c-act="home">← 返回双子岛</button><p>${esc(c().role)}</p><h2>${esc(c().title)}</h2><nav aria-label="任务阶段">${c()
      .missions.map(
        (mission, i) =>
          `<button data-c-act="stage" data-index="${i}" class="${i === missionIndex ? "active" : ""}" ${isMissionUnlocked(state, c(), i) ? "" : "disabled"} ${i === missionIndex ? 'aria-current="step"' : ""}><span>${state.completed[mission.id] ? "✓" : String(i + 1).padStart(2, "0")}</span><span><b>${esc(mission.title)}</b><small>${esc(mission.phase)}</small></span></button>`,
      )
      .join(
        "",
      )}</nav><button data-c-act="report" class="text-button">查看任务档案与备份 →</button></aside>`;
  }
  function carry() {
    const track = c(),
      metrics = campaignMetrics(state, track);
    const previous = track.missions
      .slice(0, missionIndex)
      .filter((x) => state.completed[x.id]);
    if (!previous.length)
      return `<p class="carry-note">项目起始预算 ${track.initial.budget} ${esc(track.unit)}。请先区分公开事实与任务数据，再开始决策。</p>`;
    const last = previous.at(-1),
      d = last.decisions.find(
        (x) => x.id === state.completed[last.id].decisionId,
      );
    const alert =
      metrics.trust < 55
        ? "前序选择已经压低体验与信任，本阶段方案应优先补充风控、退款或客户解释。"
        : metrics.readiness < 50
          ? "项目准备仍不充分，本阶段要明确上线依赖与放行条件。"
          : "前序准备可以承接，本阶段仍须核对证据和预设停止条件。";
    return `<div class="carry-note"><b>接续上阶段：${esc(d.title)}</b><p>${esc(d.consequence)}</p><p>${esc(last.handoff)}</p><strong>${alert}</strong></div>`;
  }
  function brief() {
    const mission = m();
    return `${carry()}${
      c().dataDictionary
        ? `<details class="metric-dictionary" ${missionIndex === 0 ? "open" : ""}><summary>本项目指标字典 · 明确的教学口径</summary>${c()
            .dataDictionary.map(
              (item) => `<p><b>${esc(item.title)}</b><br>${esc(item.body)}</p>`,
            )
            .join("")}</details>`
        : ""
    }${evidence(mission)}<section class="mission-material"><span class="case-tag simulated">项目材料 · 原创教学仿真</span><h3>你的任务简报</h3><p class="material-copy">${esc(mission.brief)}</p><div class="material-table"><table><thead><tr>${mission.table.columns.map((x) => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${mission.table.rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section><section class="mission-concepts"><h3>这一步需要懂什么</h3>${mission.concepts.map((x) => `<details open><summary>${esc(x.title)}</summary><p>${esc(x.body)}</p></details>`).join("")}</section>${imageBrief(mission.id)}<button class="button primary" data-c-act="tab" data-tab="decision">证据看完，开始做决定 →</button>`;
  }
  function imageBrief(id) {
    const img =
      id === "b6"
        ? {
            src: "./assets/gtm/message-house.png",
            title: "Message House：让人群、核心信息与证据形成一致表达",
          }
        : id === "b8"
          ? {
              src: "./assets/gtm/annual-plan.png",
              title: "年度规划框架：从分析到策略与执行",
            }
          : null;
    return img
      ? `<figure class="gtm-reference"><a href="${img.src}" target="_blank" rel="noopener noreferrer"><img src="${img.src}" alt="${esc(img.title)}" loading="lazy"></a><figcaption>${esc(img.title)}。来自用户提供的《GTM入门指南-W的营销笔记》，按用户指示引用；是方法资料，不是蟹黄酱项目真实结果。点击可查看大图。</figcaption></figure>`
      : "";
  }
  function decision() {
    const mission = m(),
      d = draft(),
      locked = !!state.completed[mission.id];
    return `<h3>选择你愿意负责的方案</h3><p>每个方案都会写进项目档案，并影响下一阶段的剩余预算、准备度与信任。以下变化是显式教学规则，不是实际经营预测。</p><div class="decision-options">${mission.decisions.map((option) => `<label class="decision-option ${d.decisionId === option.id ? "selected" : ""}"><input type="radio" name="campaign-decision" value="${esc(option.id)}" ${d.decisionId === option.id ? "checked" : ""} ${locked ? "disabled" : ""}><div><h4>${esc(option.title)}</h4><p>${esc(option.description)}</p><div class="effect-line">预算 ${signed(option.effect.budget)} ${esc(c().unit)} · 准备 ${signed(option.effect.readiness)} · 信任 ${signed(option.effect.trust)}</div><small>${esc(option.consequence)}</small></div></label>`).join("")}</div><button class="button primary" data-c-act="tab" data-tab="questions">验证方案背后的判断 →</button>`;
  }
  function questionCard(q, i) {
    const d = draft(),
      value = d.answers[q.id],
      locked = !!state.completed[m().id];
    const result = assessMission(m(), d).grades.find((g) => g.id === q.id);
    let input = "";
    if (q.type === "number")
      input = `<label class="numeric-answer">计算结果 <input data-c-number="${q.id}" type="text" inputmode="decimal" value="${esc(value ?? "")}" ${locked ? "disabled" : ""} autocomplete="off"><span>${esc(q.unit)}</span></label>`;
    else if (q.type === "order") {
      const selected = Array.isArray(value) ? value : [];
      input = `<div class="ordering-selected"><b>当前顺序：</b>${selected.length ? selected.map((n, j) => `<span>${j + 1}. ${esc(q.options[n])}</span>`).join("") : "尚未排列"}</div><div class="question-options">${q.options.map((x, n) => `<button data-c-act="order" data-q="${q.id}" data-option="${n}" ${locked || selected.includes(n) ? "disabled" : ""}>${selected.includes(n) ? "✓" : "＋"} ${esc(x)}</button>`).join("")}</div><button class="text-button" data-c-act="order-reset" data-q="${q.id}" ${locked ? "disabled" : ""}>清空并重新排序</button>`;
    } else
      input = `<div class="question-options">${q.options.map((x, n) => `<label><input type="${q.type === "multi" ? "checkbox" : "radio"}" name="campaign-q-${q.id}" data-c-question="${q.id}" value="${n}" ${(q.type === "multi" ? Array.isArray(value) && value.includes(n) : value === n) ? "checked" : ""} ${locked ? "disabled" : ""}><span>${esc(x)}</span></label>`).join("")}</div>`;
    return `<fieldset class="campaign-question" data-question-id="${q.id}"><legend><span>${String(i + 1).padStart(2, "0")} · ${TYPES[q.type]}</span>${esc(q.prompt)}</legend>${input}${graded || locked ? `<div class="question-feedback ${result.correct ? "correct" : "incorrect"}"><b>${result.correct ? "判断正确" : "还需要核对"}</b><p>${esc(q.explanation)}</p></div>` : ""}</fieldset>`;
  }
  function questions() {
    const r = assessMission(m(), draft());
    return `<div class="question-intro"><h3>用实战题检查依据</h3><p>包含数据计算、多选、行动排序和产品诊断。计算题按题干单位输入数字；多选需选出全部正确项。可以查看反馈后补练。</p></div>${m().questions.map(questionCard).join("")}<div class="assessment-actions"><button class="button primary" data-c-act="grade">核对 ${r.total} 道题的依据</button><span role="status">${graded ? `${r.correct} / ${r.total} 已答对` : "先独立判断，再看解释"}</span><button class="button quiet" data-c-act="tab" data-tab="deliverable">撰写阶段交付物 →</button></div>`;
  }
  function deliverable() {
    const mission = m(),
      d = draft(),
      r = assessMission(mission, d),
      locked = !!state.completed[mission.id];
    return `<h3>${esc(mission.deliverable.title)}</h3><p>${esc(mission.deliverable.prompt)}</p><label class="report-answer">你的阶段方案（至少 40 字）<textarea data-c-report rows="8" maxlength="12000" ${locked ? "readonly" : ""} placeholder="写清依据、计算、取舍、责任人、验收与回退条件。">${esc(d.answer)}</textarea></label><div class="report-checks"><b>完成前逐项自查（至少 3 项）</b>${mission.deliverable.checklist.map((x, i) => `<label><input type="checkbox" data-c-check="${i}" ${d.checks.includes(i) ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(x)}</label>`).join("")}</div><p class="self-review-note">文字长度和自查只验证完成步骤，不代表自动理解或评判商业方案。</p><div class="mission-completion"><p>客观题 ${r.correct}/${r.total} · 业务方案${r.decision ? "已选择" : "未选择"} · 文本${r.report ? "已填写" : "待补充"} · 自查${r.validChecks ? "已完成" : "待完成"}</p>${locked ? `<b>✓ 已交付 · 获得 ${esc(mission.reward)}</b><button class="button primary" data-c-act="next">${missionIndex === c().missions.length - 1 ? "查看全链路报告" : "进入下一阶段 →"}</button>` : `<button class="button primary" data-c-act="complete">提交阶段方案，推进项目 →</button>`}</div>`;
  }
  function workspace() {
    const mission = m();
    return `<div class="mission-workspace">${sidebar()}<section class="mission-main"><header><span class="mission-kicker">${esc(mission.phase)} · ${missionIndex + 1}/${c().missions.length}</span><h1>${esc(mission.title)}</h1><p>${esc(mission.objective)}</p>${metricStrip(c())}<small class="metric-disclosure">预算为仿真项目资源；准备／信任为教学量表，不是企业 KPI 或预测分数。</small></header><nav class="mission-tabs" aria-label="本阶段步骤">${[
      ["brief", "01 现实案例与材料"],
      ["decision", "02 业务决策"],
      ["questions", "03 实战题"],
      ["deliverable", "04 阶段交付"],
    ]
      .map(
        ([id, title]) =>
          `<button data-c-act="tab" data-tab="${id}" ${tab === id ? 'aria-current="step"' : ""}>${title}</button>`,
      )
      .join(
        "",
      )}</nav><div class="mission-tab-content">${tab === "brief" ? brief() : tab === "decision" ? decision() : tab === "questions" ? questions() : deliverable()}</div></section></div>`;
  }
  function report() {
    return `<section class="campaign-report"><button data-c-act="home" class="text-button">← 返回双子岛</button><h1>你的两份项目档案</h1><p>以下是选择、交付物与教学资源的记录。实战题可自动核验，文字方案仍需自己或导师审阅。</p>${campaigns
      .map(
        (track) =>
          `<section><h2>${esc(track.title)}</h2>${metricStrip(track)}${track.missions
            .map((mission, i) => {
              const done = state.completed[mission.id],
                d = state.drafts[mission.id],
                chosen = mission.decisions.find(
                  (x) => x.id === done?.decisionId,
                );
              return `<details class="report-mission"><summary>${done ? "✓" : "○"} ${String(i + 1).padStart(2, "0")} ${esc(mission.title)} <span>${done ? esc(mission.reward) : d ? "草稿中" : "尚未推进"}</span></summary>${done ? `<p><b>${esc(chosen.title)}</b>：${esc(chosen.consequence)}</p><p class="saved-report">${esc(d.answer)}</p><p>下一阶段交接：${esc(mission.handoff)}</p>` : "完成对应任务后在这里查看交付物。"}</details>`;
            })
            .join("")}</section>`,
      )
      .join(
        "",
      )}<div class="campaign-save-tools"><button class="button primary" data-c-act="export">导出双岛任务档案 ↓</button><label class="button quiet">导入双岛存档<input type="file" data-c-import accept=".json,application/json"></label><button class="text-button" data-c-act="reset">重新开始双岛任务</button></div><p class="fineprint">双岛存档与基础营地分开保存。导出包含自己输入的方案，请自行保管；不上传服务器。</p></section>`;
  }
  function sources() {
    return `<section class="campaign-sources"><button data-c-act="home" class="text-button">← 返回双子岛</button><h1>现实案例与资料依据</h1><p>真实企业案例为训练提供事实背景，不代表其内部项目授权、因果证明或当前全市场规则。</p>${Object.values(
      caseSources,
    )
      .map(
        (s) =>
          `<article><h2>${esc(s.title)}</h2><small>${esc(s.context)}</small><p>${esc(s.fact)}</p><p class="source-boundary">边界：${esc(s.limits)}</p>${s.links.map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ↗</a>`).join(" · ")}</article>`,
      )
      .join(
        "",
      )}<h2>新增 GTM 与面试参考</h2><p>GTM 36 个正文文件经哈希去重为 18 份唯一资料，覆盖市场洞察、产品、价格、渠道、IMC、SOP 与 WBS。TikTok PDF 的两份副本内容一致，共 282 页；参考题存在编号错配、重复和未证实数字，新增题目采用原创改写与独立算式。</p><p>品牌线是待命名中国蟹黄酱品牌的教学项目。没有将李锦记或 Eatsambel 的成绩写成该品牌的真实成绩。</p></section>`;
  }
  function render() {
    cleanupScenes();
    if (disposed) return;
    root.innerHTML = `<div class="campaign-save-warning" data-save-warning role="alert" ${saveFailed ? "" : "hidden"}>${unreadableRaw !== null ? "原存档无法读取，已暂停覆盖。导出原始文件后，可在任务档案中确认重新开始。" : "任务进度未保存。"}<button data-c-act="export">先导出备份</button></div>${view === "home" ? home() : view === "mission" ? workspace() : view === "report" ? report() : sources()}`;
    if (view === "home") {
      const token = generation;
      requestAnimationFrame(() => {
        if (disposed || token !== generation) return;
        root.querySelectorAll("[data-campaign-scene]").forEach((el) => {
          try {
            const scene = mountIsland(el, {
              nodes: [],
              variant: el.dataset.campaignScene,
              reducedMotion,
            });
            if (scene) scenes.push(scene);
            else el.classList.add("scene-unavailable");
          } catch {
            el.classList.add("scene-unavailable");
          }
        });
      });
    }
  }
  function showMission(track, index) {
    campaign = track;
    missionIndex = index;
    tab = "brief";
    graded = !!state.completed[m().id];
    view = "mission";
    render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function saveAnswers(id, value) {
    const answers = { ...draft().answers, [id]: value };
    updateDraft({ answers });
  }
  const onClick = (e) => {
    const b = e.target.closest("[data-c-act]");
    if (!b || b.disabled || !root.contains(b)) return;
    const action = b.dataset.cAct;
    if (action === "home") {
      view = "home";
      render();
      window.scrollTo(0, 0);
    }
    if (action === "enter") {
      const track = campaigns.find((x) => x.id === b.dataset.track);
      const idx = track.missions.findIndex((x) => !state.completed[x.id]);
      if (idx < 0) {
        showMission(track.id, 0);
      } else showMission(track.id, idx);
    }
    if (action === "stage") {
      const idx = Number(b.dataset.index);
      if (isMissionUnlocked(state, c(), idx)) showMission(campaign, idx);
    }
    if (action === "tab") {
      tab = b.dataset.tab;
      render();
      root
        .querySelector(".mission-tabs")
        ?.scrollIntoView({ block: "start", behavior: "instant" });
    }
    if (action === "grade") {
      graded = true;
      render();
      const first =
        root.querySelector(".question-feedback.incorrect") ??
        root.querySelector(".assessment-actions");
      first?.scrollIntoView({
        block: "center",
        behavior: reducedMotion ? "instant" : "smooth",
      });
    }
    if (action === "order") {
      const values = Array.isArray(draft().answers[b.dataset.q])
        ? draft().answers[b.dataset.q]
        : [];
      saveAnswers(b.dataset.q, [...values, Number(b.dataset.option)]);
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    if (action === "order-reset") {
      saveAnswers(b.dataset.q, []);
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
    }
    if (action === "complete") {
      const assessment = assessMission(m(), draft());
      if (!assessment.ready) {
        toast(
          `还需完成：${[assessment.correct < assessment.total ? "全部实战题" : null, !assessment.decision ? "业务决策" : null, !assessment.report ? "至少40字方案" : null, !assessment.validChecks ? "至少3项自查" : null].filter(Boolean).join("、")}`,
        );
        return;
      }
      const next = reduceCampaign(
        state,
        { type: "COMPLETE", campaignId: campaign, missionId: m().id },
        campaigns,
      );
      if (next === state) {
        toast("项目预算不足，请调整本阶段方案。");
        return;
      }
      state = next;
      persist();
      render();
      toast(`阶段已交付：${m().reward}`);
    }
    if (action === "next") {
      if (missionIndex < c().missions.length - 1)
        showMission(campaign, missionIndex + 1);
      else {
        view = "report";
        render();
        window.scrollTo(0, 0);
      }
    }
    if (action === "report" || action === "sources") {
      view = action;
      render();
      window.scrollTo(0, 0);
    }
    if (action === "export") {
      try {
        const blob = new Blob([unreadableRaw ?? serializeCampaign(state)], {
            type: "application/json",
          }),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "xiaoyu-twin-projects.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (error) {
        toast(error.message);
      }
    }
    if (
      action === "reset" &&
      confirm("清除两条任务线的进度和方案？基础营地不受影响。建议先导出备份。")
    ) {
      unreadableRaw = null;
      state = createCampaignState();
      persist();
      view = "home";
      render();
    }
  };
  const onInput = (e) => {
    const t = e.target;
    if (t.matches("[data-c-report]")) updateDraft({ answer: t.value });
    if (t.matches("[data-c-number]")) saveAnswers(t.dataset.cNumber, t.value);
  };
  const onChange = async (e) => {
    const t = e.target;
    if (t.name === "campaign-decision") updateDraft({ decisionId: t.value });
    if (t.matches("[data-c-check]"))
      updateDraft({
        checks: [...root.querySelectorAll("[data-c-check]:checked")].map((x) =>
          Number(x.dataset.cCheck),
        ),
      });
    if (t.matches("[data-c-question]")) {
      const q = m().questions.find((x) => x.id === t.dataset.cQuestion);
      const value =
        q.type === "multi"
          ? [
              ...root.querySelectorAll(`[data-c-question="${q.id}"]:checked`),
            ].map((x) => Number(x.value))
          : Number(t.value);
      saveAnswers(q.id, value);
    }
    if (t.matches("[data-c-import]")) {
      const f = t.files[0];
      if (!f) return;
      try {
        if (f.size > CAMPAIGN_MAX_BYTES)
          throw new Error("请选择2MiB以内的双岛任务存档");
        const loaded = deserializeCampaign(await f.text(), campaigns);
        if (disposed) return;
        if (!confirm("导入将替换当前双岛任务进度，是否继续？")) return;
        unreadableRaw = null;
        state = loaded;
        persist();
        render();
        toast("双岛任务已恢复");
      } catch (error) {
        toast(error.message);
      }
    }
  };
  root.addEventListener("click", onClick);
  root.addEventListener("input", onInput);
  root.addEventListener("change", onChange);
  render();
  return {
    dispose() {
      memorySession = { state, saveFailed, unreadableRaw };
      disposed = true;
      cleanupScenes();
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
    },
    setReducedMotion(value) {
      reducedMotion = value;
      scenes.forEach((s) => s.setReducedMotion(value));
    },
  };
}

// Fixed-step, seed-derived obstacle course. Cosmetic outcomes never change learning state.
export function createRunner(seed = 1, mode = "trail") {
  let value = seed >>> 0;
  const rand = () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
  return {
    mode,
    time: 0,
    y: 0,
    vy: 0,
    bumps: 0,
    finished: false,
    duration: 14,
    obstacles: Array.from({ length: 5 }, (_, i) => ({
      x: 550 + i * 360 + rand() * 80,
      hit: false,
    })),
  };
}
export function stepRunner(state, delta, jump = false) {
  if (state.finished) return state;
  const dt = Math.max(0, Math.min(0.05, delta));
  const config = {
    trail: { jump: 470, gravity: 1100 },
    rope: { jump: 650, gravity: 900 },
    wings: { jump: 520, gravity: 500 },
    boat: { jump: 280, gravity: 650 },
  }[state.mode || "trail"];
  let vy = jump && state.y <= 0 ? config.jump : state.vy;
  let y = Math.max(0, state.y + vy * dt);
  vy -= config.gravity * dt;
  if (y === 0) vy = 0;
  let bumps = state.bumps;
  const obstacles = state.obstacles.map((o) => {
    const n = { ...o, x: o.x - 170 * dt };
    if (!n.hit && n.x < 132 && n.x > 70 && y < 38) {
      n.hit = true;
      bumps++;
    }
    return n;
  });
  const time = state.time + dt;
  return {
    ...state,
    y,
    vy,
    bumps,
    obstacles,
    time,
    finished: time >= state.duration,
  };
}
export function mountRunner(
  container,
  { seed = 1, reward, onDone, reducedMotion = false },
) {
  const mode = /船/.test(reward.name)
    ? "boat"
    : /翅|翼/.test(reward.name)
      ? "wings"
      : /绳|索/.test(reward.name)
        ? "rope"
        : "trail";
  const action = {
    trail: "跳一下",
    boat: "跃过浪花",
    wings: "展开翅膀",
    rope: "借绳腾跃",
  }[mode];
  container.innerHTML = `<div class="runner-scene mode-${mode}"><div class="runner-sun"></div><div class="runner-cloud one"></div><div class="runner-cloud two"></div><div class="runner-hills"></div><div class="runner-ground"></div><img class="runner-player" src="./assets/xiaoyu.svg" alt="奔跑的小玉"><span class="runner-gear" aria-hidden="true">${mode === "boat" ? "⛵" : mode === "wings" ? "🪽" : mode === "rope" ? "〰" : ""}</span><div class="runner-props"></div><div class="runner-reward" aria-hidden="true">${reward.icon}</div></div><div class="runner-meta"><span class="runner-status" aria-live="polite">拿好${reward.name}，向下一座营地出发！</span><span class="runner-time">0 / 14 秒</span></div><div class="runner-controls"><button class="button primary" data-jump>${action} <span>空格 / ↑</span></button><button class="button quiet" data-pause>暂停</button><button class="button quiet" data-skip>跳过动作，保留奖励 →</button></div><p class="fineprint">动作是旅途的小插曲。碰到障碍不会失去装备，也不影响学习成绩。</p>`;
  let state = createRunner(seed, mode),
    last = 0,
    frame = 0,
    jumping = false,
    paused = reducedMotion,
    ended = false;
  const player = container.querySelector(".runner-player"),
    props = container.querySelector(".runner-props"),
    status = container.querySelector(".runner-status"),
    timer = container.querySelector(".runner-time"),
    pauseButton = container.querySelector("[data-pause]");
  const finish = () => {
    if (ended) return;
    ended = true;
    cleanup();
    onDone();
  };
  const jump = () => {
    jumping = true;
  };
  const onKey = (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      e.preventDefault();
      jump();
    }
  };
  const pause = () => {
    paused = !paused;
    pauseButton.textContent = paused ? "继续" : "暂停";
    last = 0;
  };
  const visibility = () => {
    if (document.hidden && !paused) pause();
  };
  const tick = (t) => {
    if (ended) return;
    if (!paused) {
      const before = state.bumps;
      state = stepRunner(state, last ? (t - last) / 1000 : 0, jumping);
      jumping = false;
      if (state.bumps > before)
        status.textContent = "轻轻绊了一下，没关系，知识与装备都还在。";
      player.style.bottom = `${47 + state.y * 0.45}px`;
      container.querySelector(".runner-gear").style.bottom =
        `${mode === "boat" ? 28 : 65 + state.y * 0.45}px`;
      props.innerHTML = state.obstacles
        .filter((o) => o.x > -30 && o.x < 850)
        .map(
          (o) =>
            `<span class="runner-rock ${o.hit ? "bumped" : ""}" style="left:${o.x / 8}%">${o.hit ? "✧" : mode === "boat" ? "≈" : "✿"}</span>`,
        )
        .join("");
      timer.textContent = `${Math.min(14, Math.floor(state.time))} / 14 秒`;
      if (state.finished) {
        finish();
        return;
      }
    }
    last = t;
    frame = requestAnimationFrame(tick);
  };
  function cleanup() {
    cancelAnimationFrame(frame);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("visibilitychange", visibility);
  }
  container.querySelector("[data-jump]").addEventListener("click", jump);
  pauseButton.addEventListener("click", pause);
  pauseButton.textContent = paused ? "继续" : "暂停";
  container.querySelector("[data-skip]").addEventListener("click", finish);
  document.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", visibility);
  frame = requestAnimationFrame(tick);
  return () => {
    ended = true;
    cleanup();
  };
}

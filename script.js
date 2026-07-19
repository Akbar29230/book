/* ============================================================
   IELTS Master Book — Application logic
   Vanilla JS, no frameworks. Data comes from data.js (PART1_DATA,
   PART2_DATA, PART3_DATA, VOCAB_DATA), generated from the user's book.
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- Storage ---------------- */
  const STORAGE_KEY = "imb_state_v1";

  function defaultState() {
    return {
      favourites: {},   // id -> true
      completed: {},    // id -> true (topics/cards only)
      learned: {},      // vocab id -> true
      notes: {},        // id -> { note: "", answer: "" }
      xp: 0,
      practiceSeconds: 0,
      activityDays: {}, // "YYYY-MM-DD" -> true
      settings: { theme: "dark", accent: "violet", fontSize: "md" }
    };
  }

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed, {
        settings: Object.assign(defaultState().settings, parsed.settings || {})
      });
    } catch (e) {
      return defaultState();
    }
  }

  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
      catch (e) { /* storage full / unavailable */ }
    }, 200);
  }

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function touchActivity() {
    state.activityDays[todayStr()] = true;
    saveState();
  }

  function addXP(amount) {
    state.xp = Math.max(0, state.xp + amount);
  }

  /* ---------------- Data indexing ---------------- */
  const ITEMS = {}; // id -> { ...item, type }

  (PART1_DATA || []).forEach(t => ITEMS[t.id] = Object.assign({ type: "part1" }, t));
  (PART2_DATA || []).forEach(t => ITEMS[t.id] = Object.assign({ type: "part2" }, t));
  (PART3_DATA || []).forEach(t => ITEMS[t.id] = Object.assign({ type: "part3" }, t));
  (VOCAB_DATA || []).forEach(t => ITEMS[t.id] = Object.assign({ type: "vocab" }, t));

  const TOTALS = {
    part1: PART1_DATA.length,
    part2: PART2_DATA.length,
    part3: PART3_DATA.length,
    vocab: VOCAB_DATA.length
  };

  const LINKING_WORDS = [
    "However", "Additionally", "Moreover", "For example", "For instance",
    "On the other hand", "In addition", "Furthermore", "As a result",
    "Consequently", "In contrast", "Nevertheless", "Therefore", "Meanwhile",
    "In conclusion", "Overall", "While", "Although", "Despite", "Due to",
    "Owing to", "Thanks to", "Firstly", "Secondly", "Finally"
  ];

  function extractLinkers(text) {
    if (!text) return [];
    const found = [];
    LINKING_WORDS.forEach(w => {
      const re = new RegExp("\\b" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
      if (re.test(text)) found.push(w);
    });
    return found;
  }

  /* ---------------- Search index ---------------- */
  const SEARCH_INDEX = [];
  PART1_DATA.forEach(t => SEARCH_INDEX.push({ id: t.id, type: "part1", title: t.question, snippet: t.answer, group: "Questions" }));
  PART2_DATA.forEach(t => SEARCH_INDEX.push({ id: t.id, type: "part2", title: t.question, snippet: t.answer, group: "Cue Cards" }));
  PART3_DATA.forEach(t => SEARCH_INDEX.push({ id: t.id, type: "part3", title: t.topic, snippet: t.essay, group: "Discussions" }));
  VOCAB_DATA.forEach(v => SEARCH_INDEX.push({ id: v.id, type: "vocab", title: v.term, snippet: v.meaning, group: "Vocabulary" }));

  /* ---------------- Utilities ---------------- */
  function escapeHTML(s) {
    return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-visible"), 1800);
  }

  /* ---------------- Toggle actions ---------------- */
  function isFav(id) { return !!state.favourites[id]; }
  function isDone(id) { return !!state.completed[id]; }
  function isLearned(id) { return !!state.learned[id]; }

  function toggleFav(id) {
    if (state.favourites[id]) delete state.favourites[id];
    else state.favourites[id] = true;
    touchActivity();
    saveState();
  }

  function toggleDone(id) {
    if (state.completed[id]) { delete state.completed[id]; addXP(-10); }
    else { state.completed[id] = true; addXP(10); }
    touchActivity();
    saveState();
  }

  function toggleLearned(id) {
    if (state.learned[id]) { delete state.learned[id]; addXP(-2); }
    else { state.learned[id] = true; addXP(2); }
    touchActivity();
    saveState();
  }

  function getNote(id, field) {
    return (state.notes[id] && state.notes[id][field]) || "";
  }
  function setNote(id, field, value) {
    if (!state.notes[id]) state.notes[id] = { note: "", answer: "" };
    state.notes[id][field] = value;
    saveState();
  }

  /* ---------------- Icons ---------------- */
  const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none"><path d="m12 3 2.7 5.9 6.3.7-4.7 4.4 1.3 6.3L12 17.2 6.4 20.3l1.3-6.3-4.7-4.4 6.3-.7L12 3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ---------------- Card renderers ---------------- */
  function vocabListHTML(vocab) {
    if (!vocab || !vocab.length) return '<p class="block-text">No vocabulary tagged for this topic yet.</p>';
    return '<div class="vocab-grid">' + vocab.map(v => (
      `<div class="vocab-pill"><b>${escapeHTML(v.term)}</b> — ${escapeHTML(v.definition || v.meaning || "")}` +
      (v.uzbek ? `<span class="uz">${escapeHTML(v.uzbek)}</span>` : "") +
      `</div>`
    )).join("") + '</div>';
  }

  function myAnswerBlockHTML(id) {
    return `
      <div class="block-label">My answer</div>
      <textarea class="myanswer-box" data-note-id="${id}" data-note-field="answer" placeholder="Write and practise your own answer here…">${escapeHTML(getNote(id, "answer"))}</textarea>
      <div class="block-label">Notes</div>
      <textarea class="myanswer-box" data-note-id="${id}" data-note-field="note" placeholder="Any personal notes, corrections, or reminders…">${escapeHTML(getNote(id, "note"))}</textarea>
    `;
  }

  function cardShellHTML(id, badge, title, bodyHTML, extraToggles) {
    const fav = isFav(id), done = isDone(id);
    return `
    <article class="item-card glass" data-id="${id}">
      <div class="item-card__top">
        <div>
          <span class="item-card__badge">${badge}</span>
          <h3 class="item-card__title">${escapeHTML(title)}</h3>
        </div>
        <div class="item-card__actions">
          ${extraToggles || ""}
          <button class="icon-toggle ${fav ? "is-on" : ""}" data-action="fav" data-id="${id}" aria-label="Favourite">${ICON_STAR}</button>
          <button class="icon-toggle ${done ? "is-on complete" : ""}" data-action="done" data-id="${id}" aria-label="Completed">${ICON_CHECK}</button>
        </div>
      </div>
      <div class="item-card__body"><div class="item-card__body-inner">${bodyHTML}</div></div>
    </article>`;
  }

  function renderPart1Card(t) {
    const body = `
      <div class="block-label">Sample answer</div>
      <p class="block-text">${escapeHTML(t.answer)}</p>
      <div class="block-label">Vocabulary &amp; expressions</div>
      ${vocabListHTML(t.vocab)}
      ${myAnswerBlockHTML(t.id)}
    `;
    return cardShellHTML(t.id, "Test " + t.test, t.question, body);
  }

  function renderPart2Card(c) {
    const points = (c.points || []).map(p => `<li>${escapeHTML(p)}</li>`).join("");
    const body = `
      <div class="block-label">Cue card points</div>
      <ul class="points-list">${points}</ul>
      <div class="block-label">Sample answer</div>
      <p class="block-text">${escapeHTML(c.answer)}</p>
      <div class="block-label">Useful vocabulary</div>
      ${vocabListHTML(c.vocab)}
      ${myAnswerBlockHTML(c.id)}
    `;
    return cardShellHTML(c.id, "Test " + c.test, c.question || c.points[0] || "Cue card", body);
  }

  function renderPart3Card(t) {
    const linkers = extractLinkers(t.essay);
    const essayParas = (t.essay || "").split("\n\n").map(p => `<p class="block-text">${escapeHTML(p)}</p>`).join("");
    const body = `
      <div class="block-label">Model answer</div>
      ${essayParas}
      <div class="block-label">Advanced vocabulary</div>
      ${vocabListHTML(t.vocab)}
      ${linkers.length ? `<div class="block-label">Useful linking words found here</div><div class="vocab-grid">${linkers.map(l => `<div class="vocab-pill">${escapeHTML(l)}</div>`).join("")}</div>` : ""}
      ${myAnswerBlockHTML(t.id)}
    `;
    return cardShellHTML(t.id, "Test " + t.test, t.topic, body);
  }

  function renderVocabCard(v) {
    const learned = isLearned(v.id), fav = isFav(v.id);
    const body = `
      <div class="block-label">Meaning</div>
      <p class="block-text">${escapeHTML(v.meaning)}</p>
      ${v.uzbek ? `<div class="block-label">Uzbek</div><p class="block-text">${escapeHTML(v.uzbek)}</p>` : ""}
      <div class="block-label">Example</div>
      <p class="block-text">${escapeHTML(v.term)} — ${escapeHTML(v.meaning)}</p>
    `;
    const learnedToggle = `<button class="icon-toggle ${learned ? "is-on complete" : ""}" data-action="learned" data-id="${v.id}" aria-label="Learned">${ICON_CHECK}</button>`;
    return `
    <article class="item-card glass" data-id="${v.id}">
      <div class="item-card__top">
        <div>
          <span class="item-card__badge">${v.level}</span>
          <h3 class="item-card__title">${escapeHTML(v.term)}</h3>
        </div>
        <div class="item-card__actions">
          ${learnedToggle}
          <button class="icon-toggle ${fav ? "is-on" : ""}" data-action="fav" data-id="${v.id}" aria-label="Favourite">${ICON_STAR}</button>
        </div>
      </div>
      <div class="item-card__body"><div class="item-card__body-inner">${body}</div></div>
    </article>`;
  }

  /* ---------------- Generic paginated section ---------------- */
  const sectionState = {
    part1: { page: 1, filter: "all", query: "" },
    part2: { page: 1, filter: "all", query: "" },
    part3: { page: 1, filter: "all", query: "" },
    vocab: { page: 1, filter: "all", query: "" }
  };
  const PAGE_SIZE = 16;

  function matchesFilter(id, type, filter) {
    if (filter === "all") return true;
    if (filter === "incomplete") return !isDone(id);
    if (filter === "completed") return isDone(id);
    if (filter === "favourite") return isFav(id);
    if (filter === "learned") return isLearned(id);
    if (["B1", "B2", "C1", "C2"].includes(filter)) return ITEMS[id].level === filter;
    return true;
  }

  function getFiltered(type) {
    const st = sectionState[type];
    const dataMap = { part1: PART1_DATA, part2: PART2_DATA, part3: PART3_DATA, vocab: VOCAB_DATA };
    const arr = dataMap[type];
    const q = st.query.trim().toLowerCase();
    return arr.filter(item => {
      if (!matchesFilter(item.id, type, st.filter)) return false;
      if (!q) return true;
      const hay = (
        (item.question || "") + " " + (item.topic || "") + " " + (item.term || "") + " " +
        (item.answer || "") + " " + (item.essay || "") + " " + (item.meaning || "")
      ).toLowerCase();
      return hay.includes(q);
    });
  }

  const renderers = { part1: renderPart1Card, part2: renderPart2Card, part3: renderPart3Card, vocab: renderVocabCard };
  const listElIds = { part1: "part1List", part2: "part2List", part3: "part3List", vocab: "vocabList" };
  const pagerElIds = { part1: "part1Pager", part2: "part2Pager", part3: "part3Pager", vocab: "vocabPager" };

  function renderSection(type) {
    const st = sectionState[type];
    const filtered = getFiltered(type);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    st.page = Math.min(st.page, totalPages);
    const start = (st.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    const listEl = document.getElementById(listElIds[type]);
    if (!pageItems.length) {
      listEl.innerHTML = `<div class="empty-state"><h3>Nothing here</h3><p>Try a different filter or search term.</p></div>`;
    } else {
      listEl.innerHTML = pageItems.map(renderers[type]).join("");
    }

    const pagerEl = document.getElementById(pagerElIds[type]);
    pagerEl.innerHTML = "";
    if (totalPages > 1) {
      const maxButtons = 5;
      let s = Math.max(1, st.page - 2), e = Math.min(totalPages, s + maxButtons - 1);
      s = Math.max(1, e - maxButtons + 1);
      for (let p = s; p <= e; p++) {
        const b = document.createElement("button");
        b.textContent = p;
        if (p === st.page) b.classList.add("is-active");
        b.addEventListener("click", () => { st.page = p; renderSection(type); window.scrollTo({ top: 0, behavior: "smooth" }); });
        pagerEl.appendChild(b);
      }
    }
  }

  /* ---------------- Card interaction (open/close + toggles) ---------------- */
  function bindCardListEvents(containerId, type) {
    const el = document.getElementById(containerId);
    el.addEventListener("click", (e) => {
      const toggleBtn = e.target.closest("[data-action]");
      if (toggleBtn) {
        const id = toggleBtn.dataset.id;
        const action = toggleBtn.dataset.action;
        if (action === "fav") { toggleFav(id); toggleBtn.classList.toggle("is-on"); }
        if (action === "done") { toggleDone(id); toggleBtn.classList.toggle("is-on"); toggleBtn.classList.toggle("complete"); toast(isDone(id) ? "Marked as completed +10 XP" : "Marked as not done"); }
        if (action === "learned") { toggleLearned(id); toggleBtn.classList.toggle("is-on"); toggleBtn.classList.toggle("complete"); toast(isLearned(id) ? "Word learned +2 XP" : "Unmarked"); }
        e.stopPropagation();
        return;
      }
      const top = e.target.closest(".item-card__top");
      if (top) {
        const card = top.closest(".item-card");
        card.classList.toggle("is-open");
      }
    });
    el.addEventListener("input", (e) => {
      const ta = e.target.closest("textarea[data-note-id]");
      if (ta) setNote(ta.dataset.noteId, ta.dataset.noteField, ta.value);
    });
  }

  bindCardListEvents("part1List", "part1");
  bindCardListEvents("part2List", "part2");
  bindCardListEvents("part3List", "part3");
  bindCardListEvents("vocabList", "vocab");
  bindCardListEvents("searchResults", "search");
  bindCardListEvents("bookmarksList", "bookmarks");

  /* ---------------- Filters & search wiring ---------------- */
  function wireToolbar(type, searchInputId, filterRowId) {
    const searchInput = document.getElementById(searchInputId);
    let t;
    searchInput.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => { sectionState[type].query = searchInput.value; sectionState[type].page = 1; renderSection(type); }, 150);
    });
    const row = document.getElementById(filterRowId);
    row.addEventListener("click", (e) => {
      const chip = e.target.closest(".chip");
      if (!chip) return;
      [...row.children].forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      sectionState[type].filter = chip.dataset.filter || chip.dataset.level;
      sectionState[type].page = 1;
      renderSection(type);
    });
  }
  wireToolbar("part1", "part1Search", "part1Filters");
  wireToolbar("part2", "part2Search", "part2Filters");
  wireToolbar("part3", "part3Search", "part3Filters");
  wireToolbar("vocab", "vocabSearch", "vocabFilters");

  /* ---------------- Global search page ---------------- */
  const globalSearchInput = document.getElementById("globalSearch");
  let gsT;
  globalSearchInput.addEventListener("input", () => {
    clearTimeout(gsT);
    gsT = setTimeout(renderGlobalSearch, 150);
  });

  function miniResultCard(entry) {
    const id = entry.id;
    const isVocab = entry.type === "vocab";
    return `
    <article class="item-card glass" data-id="${id}">
      <div class="item-card__top">
        <div>
          <span class="item-card__badge">${entry.group}</span>
          <h3 class="item-card__title">${escapeHTML(entry.title)}</h3>
        </div>
        <div class="item-card__actions">
          <button class="icon-toggle ${isFav(id) ? "is-on" : ""}" data-action="fav" data-id="${id}" aria-label="Favourite">${ICON_STAR}</button>
        </div>
      </div>
      <div class="item-card__body"><div class="item-card__body-inner">
        <p class="block-text">${escapeHTML((entry.snippet || "").slice(0, 220))}${(entry.snippet || "").length > 220 ? "…" : ""}</p>
      </div></div>
    </article>`;
  }

  function renderGlobalSearch() {
    const q = globalSearchInput.value.trim().toLowerCase();
    const resultsEl = document.getElementById("searchResults");
    if (!q) { resultsEl.innerHTML = `<div class="empty-state"><h3>Search your whole book</h3><p>Start typing to find questions, vocabulary, topics and expressions.</p></div>`; return; }
    const results = SEARCH_INDEX.filter(e => (e.title + " " + e.snippet).toLowerCase().includes(q)).slice(0, 60);
    if (!results.length) { resultsEl.innerHTML = `<div class="empty-state"><h3>No matches</h3><p>Try a different word.</p></div>`; return; }
    resultsEl.innerHTML = results.map(miniResultCard).join("");
  }
  // simple click-to-expand for search results (toggle a body if desired) — reuse item-card open behaviour
  document.getElementById("searchResults").addEventListener("click", (e) => {
    const top = e.target.closest(".item-card__top");
    if (top && !e.target.closest("[data-action]")) top.closest(".item-card").classList.toggle("is-open");
  });

  /* ---------------- Bookmarks page ---------------- */
  function renderBookmarks() {
    const ids = Object.keys(state.favourites);
    const countEl = document.getElementById("bookmarksCount");
    const listEl = document.getElementById("bookmarksList");
    countEl.textContent = ids.length ? `${ids.length} item${ids.length > 1 ? "s" : ""} saved` : "Nothing saved yet";
    if (!ids.length) {
      listEl.innerHTML = `<div class="empty-state"><h3>No bookmarks yet</h3><p>Tap the star on any question, cue card, topic, or word to save it here.</p></div>`;
      return;
    }
    listEl.innerHTML = ids.map(id => {
      const item = ITEMS[id];
      if (!item) return "";
      if (item.type === "vocab") return renderVocabCard(item);
      if (item.type === "part1") return renderPart1Card(item);
      if (item.type === "part2") return renderPart2Card(item);
      if (item.type === "part3") return renderPart3Card(item);
      return "";
    }).join("");
  }

  /* ---------------- Home rings & stats ---------------- */
  function pct(done, total) { return total ? Math.round((done / total) * 100) : 0; }

  function countDone(type) {
    const dataMap = { part1: PART1_DATA, part2: PART2_DATA, part3: PART3_DATA };
    return dataMap[type].filter(i => isDone(i.id)).length;
  }
  function countVocabLearned() { return VOCAB_DATA.filter(v => isLearned(v.id)).length; }

  function buildRingSVG(percent) {
    const r = 52, c = 2 * Math.PI * r;
    const offset = c - (percent / 100) * c;
    return `
    <svg viewBox="0 0 132 132">
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="rgba(255,255,255,0.09)" stroke-width="12"/>
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="12"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
        transform="rotate(-90 66 66)"/>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="var(--accent)"/>
          <stop offset="100%" stop-color="var(--accent-2)"/>
        </linearGradient>
      </defs>
      <text x="66" y="72" text-anchor="middle" font-family="Fraunces, serif" font-size="26" font-weight="600" fill="var(--text-1)">${percent}%</text>
    </svg>`;
  }

  function renderHome() {
    const d1 = countDone("part1"), d2 = countDone("part2"), d3 = countDone("part3");
    const vLearned = countVocabLearned();
    const totalTopics = TOTALS.part1 + TOTALS.part2 + TOTALS.part3;
    const totalDone = d1 + d2 + d3;
    const overall = pct(totalDone + vLearned, totalTopics + TOTALS.vocab);

    document.getElementById("homeRings").innerHTML = buildRingSVG(overall);
    document.getElementById("homeRingsLegend").innerHTML = [
      ["Part 1", pct(d1, TOTALS.part1)],
      ["Part 2", pct(d2, TOTALS.part2)],
      ["Part 3", pct(d3, TOTALS.part3)],
      ["Vocabulary", pct(vLearned, TOTALS.vocab)]
    ].map(([label, p]) => `<div class="rings-legend__item"><span class="rings-legend__dot" style="background:var(--accent)"></span>${label} <b style="margin-left:auto">${p}%</b></div>`).join("");

    document.getElementById("statTotalTopics").textContent = totalTopics;
    document.getElementById("statLearnedTopics").textContent = totalDone;
    document.getElementById("statVocabLearned").textContent = vLearned + " / " + TOTALS.vocab;
    const mins = Math.round(state.practiceSeconds / 60);
    document.getElementById("statPracticeTime").textContent = mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h " + (mins % 60) + "m";
    const streaks = computeStreaks();
    document.getElementById("statStreak").textContent = streaks.current + " 🔥";
    document.getElementById("statXP").textContent = state.xp;
  }

  document.getElementById("continueLearningBtn").addEventListener("click", () => {
    const nextTopic = PART1_DATA.find(t => !isDone(t.id)) || PART2_DATA.find(t => !isDone(t.id)) || PART3_DATA.find(t => !isDone(t.id));
    const targetPage = nextTopic ? (nextTopic.id.startsWith("p2") ? "part2" : nextTopic.id.startsWith("p3") ? "part3" : "part1") : "part1";
    goToPage(targetPage);
  });

  /* ---------------- Streaks ---------------- */
  function computeStreaks() {
    const days = Object.keys(state.activityDays).sort();
    if (!days.length) return { current: 0, longest: 0, practiceDays: 0 };
    const daySet = new Set(days);
    let longest = 0, run = 0, prev = null;
    days.forEach(d => {
      if (prev) {
        const prevDate = new Date(prev), curDate = new Date(d);
        const diff = Math.round((curDate - prevDate) / 86400000);
        run = diff === 1 ? run + 1 : 1;
      } else run = 1;
      longest = Math.max(longest, run);
      prev = d;
    });
    // current streak: count back from today/yesterday
    let current = 0;
    let cursor = new Date();
    for (;;) {
      const key = cursor.getFullYear() + "-" + String(cursor.getMonth() + 1).padStart(2, "0") + "-" + String(cursor.getDate()).padStart(2, "0");
      if (daySet.has(key)) { current++; cursor.setDate(cursor.getDate() - 1); }
      else if (current === 0 && key === todayStr()) { cursor.setDate(cursor.getDate() - 1); continue; }
      else break;
    }
    return { current, longest, practiceDays: days.length };
  }

  /* ---------------- Progress page ---------------- */
  function renderProgress() {
    const d1 = countDone("part1"), d2 = countDone("part2"), d3 = countDone("part3");
    const vLearned = countVocabLearned();
    const rows = [
      ["Part 1 completion", pct(d1, TOTALS.part1)],
      ["Part 2 completion", pct(d2, TOTALS.part2)],
      ["Part 3 completion", pct(d3, TOTALS.part3)],
      ["Vocabulary learned", pct(vLearned, TOTALS.vocab)],
      ["Overall progress", pct(d1 + d2 + d3 + vLearned, TOTALS.part1 + TOTALS.part2 + TOTALS.part3 + TOTALS.vocab)]
    ];
    document.getElementById("progressBars").innerHTML = rows.map(([label, p]) => `
      <div class="progress-row">
        <div class="progress-row__label"><span>${label}</span><span>${p}%</span></div>
        <div class="progress-row__track"><div class="progress-row__fill" style="width:${p}%"></div></div>
      </div>`).join("");

    const streaks = computeStreaks();
    document.getElementById("progPracticeDays").textContent = streaks.practiceDays;
    document.getElementById("progCurrentStreak").textContent = streaks.current;
    document.getElementById("progLongestStreak").textContent = streaks.longest;
    document.getElementById("progXP").textContent = state.xp;

    const strip = document.getElementById("activityStrip");
    let html = "";
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      html += `<div class="activity-dot ${state.activityDays[key] ? "is-active" : ""}" title="${key}"></div>`;
    }
    strip.innerHTML = html;
  }

  /* ---------------- Settings ---------------- */
  function applySettingsToDOM() {
    document.documentElement.setAttribute("data-theme", state.settings.theme);
    document.documentElement.setAttribute("data-accent", state.settings.accent);
    document.documentElement.setAttribute("data-fontsize", state.settings.fontSize);
    document.querySelectorAll("#themeSegmented button").forEach(b => b.classList.toggle("is-active", b.dataset.value === state.settings.theme));
    document.querySelectorAll("#fontSegmented button").forEach(b => b.classList.toggle("is-active", b.dataset.value === state.settings.fontSize));
    document.querySelectorAll("#accentSwatches .swatch").forEach(b => b.classList.toggle("is-active", b.dataset.accent === state.settings.accent));
  }

  document.getElementById("themeSegmented").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.settings.theme = b.dataset.value; saveState(); applySettingsToDOM();
  });
  document.getElementById("fontSegmented").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.settings.fontSize = b.dataset.value; saveState(); applySettingsToDOM();
  });
  document.getElementById("accentSwatches").addEventListener("click", (e) => {
    const b = e.target.closest(".swatch"); if (!b) return;
    state.settings.accent = b.dataset.accent; saveState(); applySettingsToDOM();
  });

  document.getElementById("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ielts-master-book-progress.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Progress exported");
  });

  document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
  document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        state = Object.assign(defaultState(), parsed, { settings: Object.assign(defaultState().settings, parsed.settings || {}) });
        saveState(); applySettingsToDOM(); renderAll();
        toast("Progress imported");
      } catch (err) { toast("Couldn't read that file"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    if (!confirm("This clears all bookmarks, notes, completed items, and progress on this device. Continue?")) return;
    state = defaultState();
    saveState(); applySettingsToDOM(); renderAll();
    toast("Progress reset");
  });

  /* ---------------- Router ---------------- */
  function goToPage(name) {
    document.querySelectorAll(".page").forEach(p => p.classList.toggle("is-active", p.dataset.page === name));
    document.querySelectorAll(".navrail__item").forEach(b => b.classList.toggle("is-active", b.dataset.page === name));
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (name === "home") renderHome();
    if (name === "part1") renderSection("part1");
    if (name === "part2") renderSection("part2");
    if (name === "part3") renderSection("part3");
    if (name === "vocabulary") renderSection("vocab");
    if (name === "bookmarks") renderBookmarks();
    if (name === "progress") renderProgress();
    touchActivity();
  }

  document.getElementById("navrail").addEventListener("click", (e) => {
    const btn = e.target.closest(".navrail__item");
    if (btn) goToPage(btn.dataset.page);
  });
  document.getElementById("quickSearchBtn").addEventListener("click", () => goToPage("search"));

  function renderAll() {
    renderHome();
    renderSection("part1");
    renderSection("part2");
    renderSection("part3");
    renderSection("vocab");
    renderBookmarks();
    renderProgress();
  }

  /* ---------------- Practice time tracking ---------------- */
  setInterval(() => {
    if (document.visibilityState === "visible") {
      state.practiceSeconds += 20;
      saveState();
      if (document.querySelector('.page[data-page="home"]').classList.contains("is-active")) {
        const mins = Math.round(state.practiceSeconds / 60);
        document.getElementById("statPracticeTime").textContent = mins < 60 ? mins + "m" : Math.floor(mins / 60) + "h " + (mins % 60) + "m";
      }
    }
  }, 20000);

  /* ---------------- Init ---------------- */
  applySettingsToDOM();
  document.getElementById("part1Count").textContent = `${TOTALS.part1} topics from your book`;
  document.getElementById("part2Count").textContent = `${TOTALS.part2} cue cards from your book`;
  document.getElementById("part3Count").textContent = `${TOTALS.part3} topics from your book`;
  document.getElementById("vocabCount").textContent = `${TOTALS.vocab} words from your book`;
  goToPage("home");
  touchActivity();

})();

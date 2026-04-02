// ── projectStore.js ──
// 데이터 중심 구조: 프로젝트 / 캐릭터 / 회차를 구조적으로 관리

// ── AI 스타일 가이드 ──
export const guides = [
  {
    id: "default",
    name: "기본",
    prompt: "일반적인 스토리 구조로 작성"
  },
  {
    id: "action",
    name: "액션 중심",
    prompt: "빠른 전개, 강한 갈등, 긴장감 중심으로 작성"
  },
  {
    id: "emotion",
    name: "감정 중심",
    prompt: "인물의 감정과 내면 묘사를 깊게 표현"
  }
];

export function getActiveGuide(project, extraGuides = []) {
  const all = [...guides, ...extraGuides];
  return all.find(g => g.id === (project && project.activeGuide)) || all[0];
}

// ── 세분화 스타일 옵션 ──
export const guideDimensions = [
  {
    id: "tone",
    label: "톤",
    default: "neutral",
    options: [
      { id: "bright",  label: "밝음",   prompt: "밝고 희망적인 분위기로 작성한다" },
      { id: "neutral", label: "중립",   prompt: "" },
      { id: "dark",    label: "어두움", prompt: "어둡고 무거운 분위기로 작성한다" }
    ]
  },
  {
    id: "pace",
    label: "전개 속도",
    default: "medium",
    options: [
      { id: "fast",   label: "빠름",   prompt: "빠른 전개와 짧은 씬 전환으로 작성한다" },
      { id: "medium", label: "보통",   prompt: "" },
      { id: "slow",   label: "느림",   prompt: "천천히 쌓아가는 서사 전개로 작성한다" }
    ]
  },
  {
    id: "emotion",
    label: "감정 깊이",
    default: "medium",
    options: [
      { id: "light",  label: "가볍게", prompt: "감정보다 사건과 행동 중심으로 작성한다" },
      { id: "medium", label: "보통",   prompt: "" },
      { id: "deep",   label: "깊게",   prompt: "인물의 내면과 감정 변화를 깊게 묘사한다" }
    ]
  }
];

/**
 * 프리셋 가이드 + 세분화 옵션을 조합해 최종 스타일 지시문 생성
 * buildAIPrompt의 [스타일] 블록에 사용
 */
export function buildGuidePrompt(project, extraGuides = []) {
  const parts = [];
  const preset = getActiveGuide(project, extraGuides);
  if (preset && preset.prompt) parts.push(preset.prompt);
  const opts = (project && project.guideOptions) || {};
  guideDimensions.forEach(dim => {
    const selectedId = opts[dim.id] !== undefined ? opts[dim.id] : dim.default;
    const opt = dim.options.find(o => o.id === selectedId);
    if (opt && opt.prompt) parts.push(opt.prompt);
  });
  return parts.length > 0 ? parts.join(". ") : "일반적인 스토리 구조로 작성한다";
}

// 회차 타입별 기본 감정 매핑 (캐릭터 상태 추론용)
const TYPE_TO_EMOTION = {
  curiosity: "호기심",
  conflict:  "갈등",
  suspense:  "불안",
  climax:    "절박함",
  relief:    "안도",
};

export function createEmptyProject(title = "새 프로젝트") {
  return {
    id: Date.now().toString(),
    title,
    world: "",
    characters: [],
    episodes: [],
    activeGuide: "default",
    guideOptions: { tone: "neutral", pace: "medium", emotion: "medium" },
    memory: {
      // ── 파일 업로드 기반 (structureMemory) ──
      rawText: "",
      sourceCharacters: [],   // structureMemory 추출 이름 목록
      textTimeline: [],       // 텍스트 문장 단위 흐름

      // ── 에피소드 기반 (updateMemoryFromEpisodes) ──
      timeline: [],           // [{ep, title, event, tension, type, characters}]
      characterStates: {},    // {이름: {emotion, goal, lastSeen, arc: []}}
      summary: "",            // 최근 5화 기반 자동 요약
    }
  };
}

export function saveProject(project) {
  localStorage.setItem(`project_${project.id}`, JSON.stringify(project));
}

export function loadProject(projectId) {
  const data = localStorage.getItem(`project_${projectId}`);
  return data ? JSON.parse(data) : null;
}

export function getCurrentProject() {
  const id = localStorage.getItem("current_project_id");
  if (!id) return null;
  return loadProject(id);
}

export function setCurrentProject(project) {
  localStorage.setItem("current_project_id", project.id);
  saveProject(project);
}

export function addEpisode(project) {
  const ep = project.episodes.length + 1;

  project.episodes.push({
    ep,
    title: "",
    summary: "",
    events: [],
    tension: 50,
    characters_involved: []
  });

  saveProject(project);
}

export function addCharacter(project, name) {
  project.characters.push({
    id: Date.now().toString(),
    name,
    role: "",
    goal: "",
    emotion: "",
    relationships: {},
    arc: []
  });

  saveProject(project);
}

/**
 * 원본 텍스트를 project.memory 구조로 변환
 * (파일 업로드 경로 전용 — 에피소드 기반 데이터는 건드리지 않음)
 */
export function structureMemory(text) {
  if (!text || text.trim().length === 0) {
    return { rawText: "", summary: "", sourceCharacters: [], textTimeline: [] };
  }

  const clean = text.trim();

  // 1. summary: 원문 전체 그대로 (요약 없음)
  const summary = clean;

  // 2. sourceCharacters: 한국어 이름 패턴 추출
  const JOSA_CLASS = "은는이가을를의에서도로와과아야";
  const nameRe = new RegExp(`[가-힣]{2,4}(?=[${JOSA_CLASS}\\s])`, "g");
  const STOP_WORDS = new Set([
    "그것","이것","저것","그런","이런","저런","하지","있는","없는","되는","하는",
    "같은","모든","많은","적은","그리고","하지만","그러나","그래서","따라서",
    "때문","경우","정도","방법","사실","결국","아직","이미","다시","지금",
    "이후","이전","이상","이하","이외","동안","처럼","만큼","위해","통해",
    "관련","내용","제목","부분","전체","형태","중요","필요","가능","불가",
    "주인공","안타고","조연","빌런","악당","히로인","조력자","캐릭터","인물",
    "장르","세계관","로그라인","시놉시스","에피소드","회차","스토리","이야기",
  ]);

  const rawMatches = clean.match(nameRe) || [];
  const counts = {};
  rawMatches.forEach(n => {
    if (!STOP_WORDS.has(n)) counts[n] = (counts[n] || 0) + 1;
  });

  const sourceCharacters = Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, mentions]) => ({ name, role: "", mentions }));

  // 3. textTimeline: 문장 단위 흐름 최대 20개
  const tlMatches = clean.match(/[^.\n!?]{10,}[.!?\n]/g) || [];
  const textTimeline = tlMatches
    .map(s => s.trim())
    .filter(s => s.length >= 10)
    .slice(0, 20)
    .map((t, i) => ({ seq: i + 1, text: t }));

  return { rawText: clean, summary, sourceCharacters, textTimeline };
}

/**
 * project.memory를 업데이트하고 saveProject 호출
 * structureMemory 결과를 기존 에피소드 데이터와 병합
 */
export function saveMemory(project, memory) {
  const prev = project.memory || {};
  project.memory = {
    // 에피소드 기반 데이터 보존
    timeline:         prev.timeline        || [],
    characterStates:  prev.characterStates || {},
    // 파일 기반 데이터 덮어쓰기
    rawText:          memory.rawText          || prev.rawText       || "",
    sourceCharacters: memory.sourceCharacters || prev.sourceCharacters || [],
    textTimeline:     memory.textTimeline     || prev.textTimeline  || [],
    // summary는 에피소드 기반 요약이 있으면 보존, 없으면 파일 기반 사용
    summary: prev.summary || memory.summary || "",
  };
  saveProject(project);
}

/**
 * 특정 회차 1개를 timeline에 기록하고 관련 캐릭터 상태를 업데이트
 * - 이미 같은 ep 번호 항목이 있으면 갱신, 없으면 추가
 * @param {object} project
 * @param {object} ep  - olEpisodes 항목 {num, title, synopsis, keyword, tension, type, characters_involved}
 */
export function recordEpisodeEvent(project, ep) {
  if (!project || !ep) return;
  if (!project.memory) project.memory = createEmptyProject().memory;

  const mem = project.memory;
  if (!mem.timeline)        mem.timeline = [];
  if (!mem.characterStates) mem.characterStates = {};

  // ── 1. timeline 항목 생성/갱신 ──
  const event = ep.synopsis || ep.keyword || ep.title || "";
  const entry = {
    ep:         ep.num || ep.ep,
    title:      ep.title || "",
    event:      event.slice(0, 150),
    tension:    ep.tension || 5,
    type:       ep.type || "",
    characters: ep.characters_involved || [],
    updatedAt:  Date.now(),
  };

  const existingIdx = mem.timeline.findIndex(t => t.ep === entry.ep);
  if (existingIdx >= 0) {
    mem.timeline[existingIdx] = entry;
  } else {
    mem.timeline.push(entry);
    // 최대 100개 유지 (오래된 것부터 제거)
    if (mem.timeline.length > 100) mem.timeline.shift();
  }

  // 회차 번호 순 정렬
  mem.timeline.sort((a, b) => a.ep - b.ep);

  // ── 2. characterStates 업데이트 ──
  const involvedNames = ep.characters_involved && ep.characters_involved.length
    ? ep.characters_involved
    : _inferCharactersFromText(event, project.characters || []);

  const defaultEmotion = TYPE_TO_EMOTION[ep.type] || "";

  involvedNames.forEach(name => {
    if (!name) return;
    if (!mem.characterStates[name]) {
      // 새 캐릭터 — project.characters에서 기본값 조회
      const charDef = (project.characters || []).find(c => c.name === name) || {};
      mem.characterStates[name] = {
        emotion:  charDef.emotion || defaultEmotion,
        goal:     charDef.goal    || "",
        lastSeen: entry.ep,
        arc:      [],
      };
    } else {
      const state = mem.characterStates[name];
      // lastSeen 항상 갱신
      state.lastSeen = Math.max(state.lastSeen || 0, entry.ep);
      // 감정은 회차 타입으로 추론 (이미 있으면 arc에 기록 후 갱신)
      if (defaultEmotion && state.emotion !== defaultEmotion) {
        state.arc.push({
          ep:   entry.ep,
          from: state.emotion,
          to:   defaultEmotion,
          trigger: entry.title || entry.event.slice(0, 40),
        });
        // arc는 최대 20개
        if (state.arc.length > 20) state.arc.shift();
        state.emotion = defaultEmotion;
      }
    }
  });

  // project.characters에 있는 캐릭터도 기본 상태 등록 (미등록인 경우)
  (project.characters || []).forEach(ch => {
    if (!ch.name || mem.characterStates[ch.name]) return;
    mem.characterStates[ch.name] = {
      emotion:  ch.emotion || "",
      goal:     ch.goal    || "",
      lastSeen: 0,
      arc:      [],
    };
  });

  saveProject(project);
}

/**
 * 캐릭터 상태를 직접 수정하고 변화 이력(arc)에 기록
 * @param {object} project
 * @param {string} name     - 캐릭터 이름
 * @param {object} change   - { emotion?, goal?, ep? }
 */
export function updateCharacterState(project, name, change) {
  if (!project || !name) return;
  if (!project.memory)             project.memory = createEmptyProject().memory;
  if (!project.memory.characterStates) project.memory.characterStates = {};

  const states = project.memory.characterStates;
  if (!states[name]) {
    states[name] = { emotion: "", goal: "", lastSeen: 0, arc: [] };
  }

  const state  = states[name];
  const ep     = change.ep || state.lastSeen || 0;

  if (change.emotion && change.emotion !== state.emotion) {
    state.arc.push({ ep, from: state.emotion, to: change.emotion, trigger: "직접 수정" });
    if (state.arc.length > 20) state.arc.shift();
    state.emotion = change.emotion;
  }
  if (change.goal !== undefined) state.goal = change.goal;
  if (change.ep)                 state.lastSeen = change.ep;

  saveProject(project);
}

/**
 * 모든 에피소드를 순회해 timeline / characterStates / summary를 한번에 재구축
 * saveOutlineData 호출 시 호출됨
 * @param {object} project
 */
export function updateMemoryFromEpisodes(project) {
  if (!project) return;
  if (!project.memory) project.memory = createEmptyProject().memory;

  const mem = project.memory;
  if (!mem.timeline)        mem.timeline = [];
  if (!mem.characterStates) mem.characterStates = {};

  const episodes = project.episodes || [];

  // ── 1. 전체 timeline 재구축 ──
  const newTimeline = episodes
    .filter(ep => ep.title || ep.synopsis || ep.keyword)
    .map(ep => {
      // 기존 항목이 있으면 updatedAt 등 보존, 없으면 새 항목
      const prev = mem.timeline.find(t => t.ep === (ep.num || ep.ep)) || {};
      return {
        ep:         ep.num || ep.ep,
        title:      ep.title     || prev.title     || "",
        event:      (ep.synopsis || ep.keyword || "").slice(0, 150),
        tension:    ep.tension   ?? prev.tension   ?? 5,
        type:       ep.type      || prev.type      || "",
        characters: ep.characters_involved || prev.characters || [],
        updatedAt:  prev.updatedAt || Date.now(),
      };
    });

  mem.timeline = newTimeline;

  // ── 2. characterStates 전체 재추적 ──
  // 먼저 project.characters로 초기 상태 등록
  (project.characters || []).forEach(ch => {
    if (!ch.name) return;
    if (!mem.characterStates[ch.name]) {
      mem.characterStates[ch.name] = {
        emotion:  ch.emotion || "",
        goal:     ch.goal    || "",
        lastSeen: 0,
        arc:      [],
      };
    } else {
      // 기존 state가 비어있으면 project.characters 값으로 보충
      const s = mem.characterStates[ch.name];
      if (!s.emotion && ch.emotion) s.emotion = ch.emotion;
      if (!s.goal    && ch.goal)    s.goal    = ch.goal;
    }
  });

  // 회차 순서대로 순회하며 상태 변화 추적
  episodes.forEach(ep => {
    const epNum   = ep.num || ep.ep;
    const emotion = TYPE_TO_EMOTION[ep.type] || "";
    const involved = ep.characters_involved && ep.characters_involved.length
      ? ep.characters_involved
      : _inferCharactersFromText(ep.synopsis || ep.keyword || "", project.characters || []);

    involved.forEach(name => {
      if (!name) return;
      if (!mem.characterStates[name]) {
        mem.characterStates[name] = { emotion: emotion || "", goal: "", lastSeen: epNum, arc: [] };
        return;
      }
      const s = mem.characterStates[name];
      if (epNum > (s.lastSeen || 0)) {
        // 감정 변화 기록 (arc에 추가)
        if (emotion && s.emotion !== emotion) {
          s.arc.push({
            ep:      epNum,
            from:    s.emotion,
            to:      emotion,
            trigger: (ep.title || ep.keyword || "").slice(0, 40),
          });
          if (s.arc.length > 20) s.arc.shift();
          s.emotion = emotion;
        }
        s.lastSeen = epNum;
      }
    });
  });

  // ── 3. summary 자동 갱신: 최근 5화 기반 ──
  const recent = episodes
    .filter(ep => ep.synopsis || ep.title || ep.keyword)
    .slice(-5);

  if (recent.length > 0) {
    mem.summary = recent
      .map(ep => {
        const label  = ep.title || ep.keyword || `${ep.num || ep.ep}화`;
        const detail = ep.synopsis ? ` — ${ep.synopsis.slice(0, 60)}` : "";
        return `${ep.num || ep.ep}화 ${label}${detail}`;
      })
      .join(" → ");
  }

  saveProject(project);
}

/**
 * AI 호출용 프로젝트 컨텍스트 문자열 생성
 * 세계관 / 캐릭터(상태 포함) / 최근 회차 / 작품 요약을 하나의 블록으로 조립
 */
export function buildContext(project) {
  if (!project) return "";

  const world = (project.world || "").trim();

  // ── 캐릭터: project.characters + characterStates 병합 ──
  const states = (project.memory && project.memory.characterStates) || {};
  const characters = (project.characters || [])
    .filter(c => c.name)
    .map(c => {
      const s    = states[c.name] || {};
      const role = c.role          ? ` (${c.role})`         : "";
      const goal = (s.goal || c.goal) ? `, 목표: ${s.goal || c.goal}` : "";
      const emo  = (s.emotion || c.emotion) ? `, 현재 감정: ${s.emotion || c.emotion}` : "";
      const seen = s.lastSeen      ? `, 최근 등장: ${s.lastSeen}화`   : "";
      return `${c.name}${role}${goal}${emo}${seen}`;
    })
    .join("\n");

  // ── characterStates 전용 변화 이력 (arc가 있는 캐릭터) ──
  const arcLines = Object.entries(states)
    .filter(([, s]) => s.arc && s.arc.length > 0)
    .map(([name, s]) => {
      const latest = s.arc.slice(-2)
        .map(a => `${a.ep}화: ${a.from || "?"} → ${a.to}`)
        .join(", ");
      return `${name}: ${latest}`;
    })
    .join("\n");

  // ── 타임라인: 최근 3화 ──
  const tl     = (project.memory && project.memory.timeline) || [];
  const tlText = tl.slice(-3)
    .map(t => {
      const chars = t.characters && t.characters.length ? ` (${t.characters.join(", ")})` : "";
      return `${t.ep}화 [${t.type || "-"}] ${t.title || t.event}${chars}`;
    })
    .join("\n");

  // ── 연동된 원문 (파일/직접 입력 전문 그대로) ──
  const rawText = (project.memory && project.memory.rawText) || "";
  const summary = (project.memory && project.memory.summary) || "";
  // rawText가 있으면 원문 전체 사용, 없으면 에피소드 기반 요약만 사용
  const linkedText = rawText || "";

  const lines = [];
  if (world)        lines.push(`[세계관]\n${world}`);
  if (characters)   lines.push(`[캐릭터 현재 상태]\n${characters}`);
  if (arcLines)     lines.push(`[캐릭터 감정 변화 이력]\n${arcLines}`);
  if (linkedText)   lines.push(`[연동된 원문]\n${linkedText}`);
  if (tlText)       lines.push(`[최근 회차 흐름]\n${tlText}`);
  if (!linkedText && summary) lines.push(`[서사 흐름 요약]\n${summary}`);

  return lines.join("\n\n");
}

// ── 내부 헬퍼 ──

/**
 * synopsis/keyword 텍스트에서 project.characters 이름을 찾아 반환
 * characters_involved가 비어있을 때 fallback으로 사용
 */
function _inferCharactersFromText(text, characters) {
  if (!text || !characters.length) return [];
  return characters
    .filter(c => c.name && text.includes(c.name))
    .map(c => c.name);
}

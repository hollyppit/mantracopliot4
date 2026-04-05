/**
 * Mantra Copilot — Cloudflare Pages Worker (_worker.js)
 * API 요청은 여기서 처리, 나머지는 정적 파일 서빙
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-admin-password',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // API 라우팅
    if (path === '/api/chat' && request.method === 'POST') return handleChat(request, env, cors);
    if (path === '/api/youtube' && request.method === 'GET') return handleYoutube(url, env, cors);

    // 관리자 API
    if (path === '/api/references' && request.method === 'GET') return handleReferences(request, env, cors);
    if (path === '/api/upload' && request.method === 'POST') return handleUpload(request, env, cors);
    // 관리자 수정/삭제 (/api/references/:id)
    const refMatch = path.match(/^\/api\/references\/([^/]+)$/);
    if (refMatch) {
      if (request.method === 'PATCH') return handleRefUpdate(request, env, cors, refMatch[1]);
      if (request.method === 'DELETE') return handleRefDelete(request, env, cors, refMatch[1]);
    }

    if (path.startsWith('/api/')) {
      const userId = await verifyJWT(request, env);
      if (path === '/api/project/save' && request.method === 'POST') {
        if (!userId) return json({ error: '인증 필요' }, 401, cors);
        return handleSave(request, env, userId, cors);
      }
      if (path === '/api/project/list' && request.method === 'GET') {
        if (!userId) return json({ error: '인증 필요' }, 401, cors);
        return handleList(env, userId, cors);
      }
      if (path === '/api/project/load' && request.method === 'GET') {
        if (!userId) return json({ error: '인증 필요' }, 401, cors);
        return handleLoad(env, userId, url.searchParams.get('pid'), cors);
      }
      if (path === '/api/project/delete' && request.method === 'POST') {
        if (!userId) return json({ error: '인증 필요' }, 401, cors);
        return handleDelete(request, env, userId, cors);
      }
      return json({ error: '알 수 없는 경로' }, 404, cors);
    }

    // 정적 파일 서빙 (Pages assets)
    return env.ASSETS.fetch(request);
  },
};

async function handleYoutube(url, env, cors) {
  const q = url.searchParams.get('q');
  if (!q) return json({ items: [] }, 200, cors);
  const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&maxResults=5&type=video&key=${env.YOUTUBE_API_KEY}`;
  try {
    const res = await fetch(apiUrl);
    const data = await res.json();
    return json(data, res.status, cors);
  } catch (e) {
    return json({ items: [] }, 200, cors);
  }
}

async function handleChat(request, env, cors) {
  const body = await request.json();
  const model = body.model || 'gpt-4o-mini';
  const streamMode = body.stream === true;

  if (model.startsWith('claude-')) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: body.max_tokens || 1024, stream: streamMode, system: body.system || '당신은 유능한 AI 조수입니다.', messages: body.messages }),
    });
    if (res.status === 529 || res.status === 503) {
      return callOpenAI(body, env, cors, 'gpt-4o-mini', streamMode);
    }
    if (streamMode && res.ok) {
      return new Response(res.body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return json(await res.json(), res.status, cors);
  } else {
    return callOpenAI(body, env, cors, model, streamMode);
  }
}

async function callOpenAI(body, env, cors, model, streamMode = false) {
  const messages = [];
  if (body.system) messages.push({ role: 'system', content: body.system });
  if (body.messages) messages.push(...body.messages);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: body.temperature || 0.7, max_tokens: body.max_tokens || 1024 }),
  });
  const data = await res.json();
  if (streamMode) {
    const text = data.choices?.[0]?.message?.content || '';
    const sseBody = `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\ndata: [DONE]\n\n`;
    return new Response(sseBody, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
    });
  }
  return json(data, res.status, cors);
}

async function verifyJWT(request, env) {
  const token = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  if (!token) return null;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': env.SUPABASE_SERVICE_KEY },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user.id || null;
  } catch { return null; }
}

async function sbReq(env, method, table, opts = {}) {
  let url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const params = [];
  if (opts.filter) params.push(opts.filter);
  if (opts.select) params.push(`select=${opts.select}`);
  if (params.length) url += '?' + params.join('&');
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

async function handleSave(request, env, userId, cors) {
  const { pid, project } = await request.json();
  if (!pid || !project) return json({ error: 'pid, project 필요' }, 400, cors);
  const r = await sbReq(env, 'POST', 'projects', {
    body: {
      id: pid, user_id: userId,
      title: project.title || '제목 없음',
      genre: project.genre || '',
      synopsis: project.synopsis || '',
      routine_type: project.routineType || 'long',
      copilot_name: project.copilotName || '',
      answer_history: project.answerHistory || [],
      completed_at: project.completedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  });
  return r.ok ? json({ ok: true, pid }, 200, cors) : json({ error: '저장 실패' }, 500, cors);
}

async function handleList(env, userId, cors) {
  const r = await sbReq(env, 'GET', 'projects', {
    filter: `user_id=eq.${userId}&order=completed_at.desc`,
    select: 'id,title,genre,synopsis,routine_type,completed_at',
  });
  return json({ projects: r.data || [] }, 200, cors);
}

async function handleLoad(env, userId, pid, cors) {
  if (!pid) return json({ error: 'pid 필요' }, 400, cors);
  const r = await sbReq(env, 'GET', 'projects', { filter: `id=eq.${pid}&user_id=eq.${userId}` });
  if (!r.ok || !r.data?.length) return json({ error: '없음' }, 404, cors);
  return json({ project: r.data[0] }, 200, cors);
}

async function handleDelete(request, env, userId, cors) {
  const { pid } = await request.json();
  if (!pid) return json({ error: 'pid 필요' }, 400, cors);
  await sbReq(env, 'DELETE', 'projects', { filter: `id=eq.${pid}&user_id=eq.${userId}` });
  return json({ ok: true }, 200, cors);
}

// ── 관리자: 고증 자료 목록 ──
async function handleReferences(request, env, cors) {
  const adminCors = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password' };
  const password = request.headers.get('x-admin-password');
  if (!password || password !== env.ADMIN_PASSWORD) {
    return json({ error: '인증 실패' }, 401, adminCors);
  }
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/expert_references?select=*&order=created_at.desc&limit=100`,
      { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return json({ error: '조회 실패', detail: await res.text() }, 500, adminCors);
    return json({ data: await res.json() }, 200, adminCors);
  } catch (e) {
    return json({ error: '조회 중 오류', detail: e.message }, 500, adminCors);
  }
}

// ── 관리자: 고증 자료 업로드 ──
async function handleUpload(request, env, cors) {
  const adminCors = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password' };
  const password = request.headers.get('x-admin-password');
  if (!password || password !== env.ADMIN_PASSWORD) {
    return json({ error: '관리자 비밀번호가 올바르지 않습니다.' }, 401, adminCors);
  }
  let formData;
  try { formData = await request.formData(); } catch { return json({ error: 'FormData 파싱 실패' }, 400, adminCors); }
  const directText = formData.get('text');
  const file = formData.get('file');
  const sourceFilename = formData.get('filename') || (file ? file.name : '직접입력');
  let text = '';
  if (directText && directText.trim()) text = directText.trim();
  else if (file) text = await file.text();
  if (!text.trim()) return json({ error: '텍스트 또는 파일을 입력하세요.' }, 400, adminCors);

  const metaPrompt = `다음은 스토리 창작용 전문가 고증 자료입니다. 제목, 카테고리, 키워드만 추출하세요. JSON만 응답하세요.\n{ "title": "자료 제목", "category": "격투기기술/설화전설/시대배경/인물설정/기타 중 택1", "keywords": ["키워드1", "키워드2", "키워드3"] }`;
  const cleanPrompt = `다음 텍스트를 정갈하게 정리해주세요. 규칙:\n1. 내용을 절대 생략하거나 요약하지 마세요. 모든 정보를 빠짐없이 포함하세요.\n2. 문단과 소제목을 적절히 나누어 가독성을 높이세요.\n3. 오탈자를 교정하고 문장을 매끄럽게 다듬으세요.\n4. 불필요한 반복이나 군더더기만 제거하세요.\n5. 정리된 텍스트만 출력하세요. 설명이나 메타 코멘트는 붙이지 마세요.`;
  let parsed = null;
  let cleanedText = text; // 기본값: 원문 그대로

  if (env.ANTHROPIC_API_KEY) {
    try {
      // 메타데이터 추출
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 512, system: metaPrompt, messages: [{ role: 'user', content: text }] }),
      });
      if (res.ok) { const data = await res.json(); parsed = extractJSON(data.content?.[0]?.text || ''); }
      // 원문 정리 (별도 호출)
      const res2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 8192, system: cleanPrompt, messages: [{ role: 'user', content: text }] }),
      });
      if (res2.ok) { const d2 = await res2.json(); const ct = d2.content?.[0]?.text; if (ct && ct.length > 20) cleanedText = ct; }
    } catch (e) { console.error('Claude error:', e); }
  }
  if (!parsed && env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: metaPrompt }, { role: 'user', content: text }] }),
      });
      if (res.ok) { const data = await res.json(); parsed = extractJSON(data.choices?.[0]?.message?.content || ''); }
      // 원문 정리
      const res2 = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 8192, messages: [{ role: 'system', content: cleanPrompt }, { role: 'user', content: text }] }),
      });
      if (res2.ok) { const d2 = await res2.json(); const ct = d2.choices?.[0]?.message?.content; if (ct && ct.length > 20) cleanedText = ct; }
    } catch (e) { console.error('OpenAI error:', e); }
  }
  if (!parsed) return json({ error: 'AI 분석 결과를 파싱할 수 없습니다.' }, 500, adminCors);

  try {
    const sbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/expert_references`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=representation' },
      body: JSON.stringify({ title: parsed.title, category: parsed.category, content: cleanedText, keywords: parsed.keywords, source_filename: sourceFilename }),
    });
    if (!sbRes.ok) return json({ error: 'DB 저장 실패', detail: await sbRes.text() }, 500, adminCors);
    return json({ ok: true, data: await sbRes.json() }, 200, adminCors);
  } catch (e) {
    return json({ error: 'DB 저장 중 오류', detail: e.message }, 500, adminCors);
  }
}

// ── 관리자: 고증 자료 수정 ──
async function handleRefUpdate(request, env, cors, id) {
  const adminCors = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password' };
  const password = request.headers.get('x-admin-password');
  if (!password || password !== env.ADMIN_PASSWORD) return json({ error: '인증 실패' }, 401, adminCors);
  const body = await request.json();
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/expert_references?id=eq.${id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=minimal' }, body: JSON.stringify(body) }
    );
    if (!res.ok) return json({ error: '수정 실패', detail: await res.text() }, 500, adminCors);
    return json({ ok: true }, 200, adminCors);
  } catch (e) { return json({ error: '수정 중 오류', detail: e.message }, 500, adminCors); }
}

// ── 관리자: 고증 자료 삭제 ──
async function handleRefDelete(request, env, cors, id) {
  const adminCors = { ...cors, 'Access-Control-Allow-Headers': 'Content-Type, x-admin-password' };
  const password = request.headers.get('x-admin-password');
  if (!password || password !== env.ADMIN_PASSWORD) return json({ error: '인증 실패' }, 401, adminCors);
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/expert_references?id=eq.${id}`,
      { method: 'DELETE', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return json({ error: '삭제 실패', detail: await res.text() }, 500, adminCors);
    return json({ ok: true }, 200, adminCors);
  } catch (e) { return json({ error: '삭제 중 오류', detail: e.message }, 500, adminCors); }
}

function extractJSON(raw) {
  try { return JSON.parse(raw); } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
    return null;
  }
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

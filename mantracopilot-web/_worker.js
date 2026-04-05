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
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // API 라우팅
    if (path === '/api/chat' && request.method === 'POST') return handleChat(request, env, cors);
    if (path === '/api/youtube' && request.method === 'GET') return handleYoutube(url, env, cors);

    // 관리자 API
    if (path === '/api/references' && request.method === 'GET') return handleReferences(request, env, cors);
    if (path === '/api/upload' && request.method === 'POST') return handleUpload(request, env, cors);

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

  const systemPrompt = `다음은 스토리 창작용 전문가 고증 자료입니다. JSON만 응답하세요.\n{ "title": "자료 제목", "category": "격투기기술/설화전설/시대배경/인물설정/기타 중 택1", "content": "300자 이내 요약", "keywords": ["키워드1", "키워드2"] }`;
  let parsed = null;

  if (env.ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: systemPrompt, messages: [{ role: 'user', content: text }] }),
      });
      if (res.ok) { const data = await res.json(); parsed = extractJSON(data.content?.[0]?.text || ''); }
    } catch (e) { console.error('Claude error:', e); }
  }
  if (!parsed && env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: text }] }),
      });
      if (res.ok) { const data = await res.json(); parsed = extractJSON(data.choices?.[0]?.message?.content || ''); }
    } catch (e) { console.error('OpenAI error:', e); }
  }
  if (!parsed) return json({ error: 'AI 분석 결과를 파싱할 수 없습니다.' }, 500, adminCors);

  try {
    const sbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/expert_references`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Prefer': 'return=representation' },
      body: JSON.stringify({ title: parsed.title, category: parsed.category, content: parsed.content, keywords: parsed.keywords, source_filename: sourceFilename }),
    });
    if (!sbRes.ok) return json({ error: 'DB 저장 실패', detail: await sbRes.text() }, 500, adminCors);
    return json({ ok: true, data: await sbRes.json() }, 200, adminCors);
  } catch (e) {
    return json({ error: 'DB 저장 중 오류', detail: e.message }, 500, adminCors);
  }
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

/**
 * Mantra Copilot — Cloudflare Worker (Supabase 연동)
 *
 * wrangler.toml 환경변수:
 *   ANTHROPIC_API_KEY
 *   OPENAI_API_KEY
 *   SUPABASE_URL          (예: https://xxx.supabase.co)
 *   SUPABASE_SERVICE_KEY  (service_role key)
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

    // AI 채팅 (인증 불필요)
    if (path === '/api/chat' && request.method === 'POST') return handleChat(request, env, cors);

    // 이하 JWT 인증 필요
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
  },
};

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

async function handleChat(request, env, cors) {
  const body = await request.json();
  const model = body.model || 'claude-haiku-4-5-20251001';
  if (model.startsWith('claude-')) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: body.max_tokens || 1024, system: body.system || '당신은 유능한 AI 조수입니다.', messages: body.messages }),
    });
    // Anthropic 과부하 시 OpenAI로 자동 폴백
    if (res.status === 529 || res.status === 503 || res.status === 529) {
      return callOpenAI(body, env, cors, 'gpt-4o-mini');
    }
    return json(await res.json(), res.status, cors);
  } else {
    return callOpenAI(body, env, cors, body.model || 'gpt-4o-mini');
  }
}

async function callOpenAI(body, env, cors, model) {
  // system 필드를 OpenAI 메시지 배열 맨 앞에 삽입
  const messages = [];
  if (body.system) messages.push({ role: 'system', content: body.system });
  if (body.messages) messages.push(...body.messages);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: body.temperature || 0.7, max_tokens: body.max_tokens || 1024 }),
  });
  return json(await res.json(), res.status, cors);
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

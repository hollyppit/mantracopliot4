const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  try {
    const { table, card_id, text, source_index } = await context.request.json();
    if (!table || !card_id || !text) {
      return new Response(JSON.stringify({ error: 'table, card_id, text 필수' }), { status: 400, headers: corsHeaders });
    }

    // 1. Supabase auth로 user_token 검증
    const token = (context.request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
    if (!token) {
      return new Response(JSON.stringify({ error: '인증 토큰 필요' }), { status: 401, headers: corsHeaders });
    }
    const userRes = await fetch(`${context.env.SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': context.env.SUPABASE_ANON_KEY || context.env.SUPABASE_SERVICE_KEY },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: '인증 실패' }), { status: 401, headers: corsHeaders });
    }
    const authUser = await userRes.json();
    const userId = authUser.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: '사용자 확인 불가' }), { status: 401, headers: corsHeaders });
    }

    // 2. OpenAI 임베딩 생성
    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    });
    if (!embRes.ok) {
      const err = await embRes.text();
      return new Response(JSON.stringify({ error: '임베딩 생성 실패', detail: err }), { status: 500, headers: corsHeaders });
    }
    const embData = await embRes.json();
    const embedding = embData.data?.[0]?.embedding;
    if (!embedding) {
      return new Response(JSON.stringify({ error: '임베딩 데이터 없음' }), { status: 500, headers: corsHeaders });
    }

    // 3. user_embeddings 테이블에 upsert
    //    source_type = table ('plan'|'episode'|'character')
    //    source_project_id = card_id (projects.id)
    //    source_index = source_index || 0
    const idx = source_index || 0;
    const sbKey = context.env.SUPABASE_SERVICE_KEY;
    const sbUrl = context.env.SUPABASE_URL;

    // 기존 행 찾기
    const findRes = await fetch(
      `${sbUrl}/rest/v1/user_embeddings?user_id=eq.${userId}&source_type=eq.${table}&source_project_id=eq.${card_id}&source_index=eq.${idx}&select=id`,
      { headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}` } }
    );
    const existing = await findRes.json();

    const row = {
      user_id: userId,
      source_type: table,
      source_project_id: card_id,
      source_index: idx,
      title: text.slice(0, 100),
      content_text: text.slice(0, 4000),
      embedding: `[${embedding.join(',')}]`,
      updated_at: new Date().toISOString(),
    };

    let writeRes;
    if (existing && existing.length > 0) {
      writeRes = await fetch(`${sbUrl}/rest/v1/user_embeddings?id=eq.${existing[0].id}`, {
        method: 'PATCH',
        headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(row),
      });
    } else {
      writeRes = await fetch(`${sbUrl}/rest/v1/user_embeddings`, {
        method: 'POST',
        headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(row),
      });
    }

    if (!writeRes.ok) {
      const detail = await writeRes.text();
      return new Response(JSON.stringify({ error: '임베딩 저장 실패', detail }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

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
    const { message, messages: chatHistory } = await context.request.json();
    const userMsg = message || '';
    if (!userMsg) {
      return new Response(JSON.stringify({ error: 'message 필수' }), { status: 400, headers: corsHeaders });
    }

    // 1. user_token 검증
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

    // 2. message를 OpenAI 임베딩 변환
    const embRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: userMsg.slice(0, 4000) }),
    });
    if (!embRes.ok) {
      return new Response(JSON.stringify({ error: '임베딩 변환 실패' }), { status: 500, headers: corsHeaders });
    }
    const embData = await embRes.json();
    const queryEmbedding = embData.data?.[0]?.embedding;
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      return new Response(JSON.stringify({ error: '임베딩 결과가 비어 있습니다.' }), { status: 500, headers: corsHeaders });
    }

    // 3. Supabase RPC: match_user_data
    const sbKey = context.env.SUPABASE_SERVICE_KEY;
    const sbUrl = context.env.SUPABASE_URL;

    const rpcRes = await fetch(`${sbUrl}/rest/v1/rpc/match_user_data`, {
      method: 'POST',
      headers: { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query_embedding: `[${queryEmbedding.join(',')}]`,
        match_user_id: userId,
        match_threshold: 0.65,
        match_count: 5,
      }),
    });

    let ragResults = [];
    if (rpcRes.ok) {
      try {
        const parsed = await rpcRes.json();
        if (Array.isArray(parsed)) ragResults = parsed;
      } catch (e) { ragResults = []; }
    }

    // 4. 컨텍스트 문자열 조합
    const TYPE_LABELS = { plan: '기획안', episode: '회차개요', character: '캐릭터' };
    let contextStr = '';
    const referenced = [];
    if (ragResults.length > 0) {
      const items = ragResults.map(r => {
        const label = TYPE_LABELS[r.source_type] || r.source_type;
        referenced.push({ source: label, title: r.title || '(제목 없음)' });
        return `- (${label}) ${r.title}: ${(r.content_text || '').slice(0, 500)}`;
      });
      contextStr = `[사용자 작업실 자료]\n${items.join('\n')}`;
    }

    // 5. Claude API 호출
    const systemPrompt = `당신은 사용자의 창작 파트너입니다.
아래는 사용자가 직접 정리한 작업 자료입니다.
답변 시 반드시 이 자료를 우선 참고하세요.
자료에 언급되지 않은 내용은 '자료에 없는 내용이에요, 새로 설정할까요?' 라고 물어보세요.

${contextStr}`;

    // 대화 히스토리 구성 (최근 20턴으로 제한 — 토큰 폭주 방지)
    const userMessages = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory
        .filter(m => m && m.role !== 'system' && typeof m.content === 'string')
        .slice(-20)
        .forEach(m => userMessages.push(m));
    }
    if (!userMessages.length || userMessages[userMessages.length - 1]?.content !== userMsg) {
      userMessages.push({ role: 'user', content: userMsg });
    }

    // Claude 시도
    const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_API_KEY) {
      try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            messages: userMessages,
          }),
        });
        if (claudeRes.ok) {
          const data = await claudeRes.json();
          const text = data.content?.[0]?.text || '';
          if (text) {
            return new Response(JSON.stringify({ reply: text, referenced }), { status: 200, headers: corsHeaders });
          }
        }
      } catch (e) {
        console.error('RAG Claude error:', e);
      }
    }

    // OpenAI fallback
    const OPENAI_API_KEY = context.env.OPENAI_API_KEY;
    if (OPENAI_API_KEY) {
      try {
        const openaiMessages = [{ role: 'system', content: systemPrompt }, ...userMessages];
        const oRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages: openaiMessages }),
        });
        if (oRes.ok) {
          const data = await oRes.json();
          const text = data.choices?.[0]?.message?.content || '';
          if (text) {
            return new Response(JSON.stringify({ reply: text, referenced }), { status: 200, headers: corsHeaders });
          }
        }
      } catch (e) {
        console.error('RAG OpenAI error:', e);
      }
    }

    return new Response(JSON.stringify({ error: 'AI 호출 실패' }), { status: 500, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

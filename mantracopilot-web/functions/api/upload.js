export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    },
  });
}

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    'Content-Type': 'application/json',
  };

  const password = context.request.headers.get('x-admin-password');
  if (!password || password !== context.env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '관리자 비밀번호가 올바르지 않습니다.' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  let formData;
  try {
    formData = await context.request.formData();
  } catch {
    return new Response(JSON.stringify({ error: 'FormData 파싱 실패' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  // 텍스트 직접 입력 또는 파일 업로드
  const directTextRaw = formData.get('text');
  const directText = typeof directTextRaw === 'string' ? directTextRaw : '';
  const fileRaw = formData.get('file');
  const file = (fileRaw && typeof fileRaw === 'object' && typeof fileRaw.text === 'function') ? fileRaw : null;
  const filenameRaw = formData.get('filename');
  const sourceFilename = (typeof filenameRaw === 'string' && filenameRaw) || (file && file.name) || '직접입력';

  let text = '';
  if (directText.trim()) {
    text = directText.trim();
  } else if (file) {
    try {
      text = await file.text();
    } catch {
      return new Response(JSON.stringify({ error: '파일을 텍스트로 읽을 수 없습니다.' }), { status: 400, headers: corsHeaders });
    }
  }

  if (!text.trim()) {
    return new Response(JSON.stringify({ error: '텍스트 또는 파일을 입력하세요.' }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const systemPrompt = `다음은 스토리 창작용 전문가 고증 자료입니다. JSON만 응답하세요.
{ "title": "자료 제목", "category": "격투기기술/설화전설/시대배경/인물설정/기타 중 택1", "content": "300자 이내 요약", "keywords": ["키워드1", "키워드2"] }`;

  let parsed = null;

  // 1) Claude 시도
  const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;
  if (ANTHROPIC_API_KEY) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: text }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.content?.[0]?.text || '';
        parsed = extractJSON(raw);
      }
    } catch (e) {
      console.error('Claude error:', e);
    }
  }

  // 2) OpenAI 폴백
  if (!parsed && context.env.OPENAI_API_KEY) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
          ],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.content || '';
        parsed = extractJSON(raw);
      }
    } catch (e) {
      console.error('OpenAI error:', e);
    }
  }

  if (!parsed) {
    return new Response(JSON.stringify({ error: 'AI 분석 결과를 파싱할 수 없습니다.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  // Supabase 저장
  const SUPABASE_URL = context.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = context.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase 설정이 없습니다.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/expert_references`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        title: parsed.title,
        category: parsed.category,
        content: parsed.content,
        keywords: parsed.keywords,
        source_filename: sourceFilename,
      }),
    });

    if (!sbRes.ok) {
      const err = await sbRes.text();
      return new Response(JSON.stringify({ error: 'DB 저장 실패', detail: err }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const saved = await sbRes.json();
    return new Response(JSON.stringify({ ok: true, data: saved }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'DB 저장 중 오류', detail: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

function extractJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return null; }
    }
    return null;
  }
}

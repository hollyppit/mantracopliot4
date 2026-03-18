export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았습니다.' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const body = await context.request.json();
    const messages = body.messages || [];

    // system 메시지 분리 (Anthropic은 system을 별도 파라미터로 받음)
    const systemMsg = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: systemMsg ? systemMsg.content : '당신은 웹툰 작가를 돕는 창작 AI 비서입니다.',
        messages: userMessages,
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || '알 수 없는 오류' }), {
        status: anthropicRes.status,
        headers: corsHeaders,
      });
    }

    // index.html이 data.choices[0].message.content 형식으로 파싱하므로
    // Anthropic 응답을 OpenAI 형식으로 변환해서 반환
    const converted = {
      choices: [
        {
          message: {
            content: data.content?.[0]?.text || '',
          },
        },
      ],
    };

    return new Response(JSON.stringify(converted), {
      status: 200,
      headers: corsHeaders,
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// OPTIONS preflight 처리
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

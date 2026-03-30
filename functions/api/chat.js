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
    const streamMode = body.stream === true;

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
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        stream: streamMode,
        system: systemMsg ? systemMsg.content : '당신은 웹툰 작가를 돕는 창작 AI 비서입니다.',
        messages: userMessages,
      }),
    });

    if (!anthropicRes.ok) {
      const errData = await anthropicRes.json();
      return new Response(JSON.stringify({ error: errData.error?.message || '알 수 없는 오류' }), {
        status: anthropicRes.status,
        headers: corsHeaders,
      });
    }

    // 스트리밍 모드: Anthropic SSE를 그대로 클라이언트에 전달
    if (streamMode) {
      return new Response(anthropicRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 일반 모드: OpenAI 호환 형식으로 변환해서 반환
    const data = await anthropicRes.json();
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

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  const body = await context.request.json();
  const messages = body.messages || [];
  const streamMode = body.stream === true;

  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');

  // 🔵 1. Claude 시도
  const ANTHROPIC_API_KEY = context.env.ANTHROPIC_API_KEY;

  if (ANTHROPIC_API_KEY) {
    try {
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

      if (anthropicRes.ok) {
        // 스트리밍 모드
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

        const data = await anthropicRes.json();
        const text = data.content?.[0]?.text || '';
        if (text) {
          return new Response(JSON.stringify({
            choices: [{ message: { content: text } }],
          }), { status: 200, headers: corsHeaders });
        }
      }
    } catch (e) {
      console.error('Claude error:', e);
    }
  }

  // 🟢 2. OpenAI fallback
  const OPENAI_API_KEY = context.env.OPENAI_API_KEY;

  if (OPENAI_API_KEY) {
    try {
      const openaiMessages = [];
      if (systemMsg) openaiMessages.push({ role: 'system', content: systemMsg.content });
      openaiMessages.push(...userMessages);

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: openaiMessages,
        }),
      });

      if (openaiRes.ok) {
        const data = await openaiRes.json();
        const text = data.choices?.[0]?.message?.content || '';
        if (text) {
          return new Response(JSON.stringify({
            choices: [{ message: { content: text } }],
          }), { status: 200, headers: corsHeaders });
        }
      }
    } catch (e) {
      console.error('OpenAI error:', e);
    }
  }

  // 🔴 3. 최종 fallback
  return new Response(JSON.stringify({ error: 'API 키가 설정되지 않았거나 모든 AI 호출에 실패했습니다.' }), {
    status: 500,
    headers: corsHeaders,
  });
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

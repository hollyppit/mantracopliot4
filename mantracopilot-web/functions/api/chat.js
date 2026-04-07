export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: '잘못된 요청 본문(JSON 파싱 실패)' }), { status: 400, headers: corsHeaders });
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const streamMode = body?.stream === true;

  const systemMsgFromArr = messages.find(m => m && m.role === 'system');
  const systemMsg = systemMsgFromArr || (typeof body?.system === 'string' && body.system ? { role: 'system', content: body.system } : null);
  const userMessages = messages.filter(m => m && m.role !== 'system');

  if (userMessages.length === 0) {
    return new Response(JSON.stringify({ error: 'messages 배열에 user 메시지가 필요합니다.' }), { status: 400, headers: corsHeaders });
  }

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
          // 스트리밍 모드에서도 SSE 형식으로 반환
          if (streamMode) {
            const sseBody = `data: ${JSON.stringify({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })}\n\ndata: [DONE]\n\n`;
            return new Response(sseBody, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
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

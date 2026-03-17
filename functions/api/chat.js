export async function onRequest(context) {
  const ANTHROPIC_KEY = context.env.ANTHROPIC_API_KEY;
  const OPENAI_KEY = context.env.OPENAI_API_KEY;

  // POST 요청만 허용
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!ANTHROPIC_KEY && !OPENAI_KEY) {
    return new Response(JSON.stringify({ error: "API Key가 설정되지 않았습니다. Cloudflare 환경변수에 ANTHROPIC_API_KEY 또는 OPENAI_API_KEY를 등록하세요." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await context.request.json();

  let baseSystemMsg = body.messages?.find(m => m.role === "system")?.content || "당신은 웹소설 기획을 돕는 유능한 AI 조수입니다.";
  
  if (body.projectContext) {
    const ctx = body.projectContext;
    const historyStr = Array.isArray(ctx.answerHistory) 
      ? ctx.answerHistory.map(h => `- ${h.stepId || '요소'}: ${h.value}`).join('\n')
      : "";
    
    const contextInjection = `
[작가의 작품 정보]
제목: ${ctx.title || '제목 없음'}
장르: ${ctx.genre || '미지정'}
시놉시스: ${ctx.synopsis || '내용 없음'}
기획 요소:
${historyStr}
이 작품을 항상 기억하고 작가의 질문에 맥락을 반영해서 답변해.`;

    baseSystemMsg = `${contextInjection}\n\n${baseSystemMsg}`;
  }

  // ── 1순위: Anthropic Claude ──
  if (ANTHROPIC_KEY) {
    try {
      const userMessages = body.messages?.filter(m => m.role !== "system") || [];

      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: body.model || "claude-sonnet-4-5",
          max_tokens: body.max_tokens || 1024,
          system: baseSystemMsg,
          messages: userMessages
        })
      });

      if (anthropicResponse.ok) {
        const data = await anthropicResponse.json();
        // Anthropic 응답을 OpenAI 형식으로 변환해서 반환 (index.html이 그대로 파싱 가능하도록)
        const converted = {
          choices: [{
            message: {
              role: "assistant",
              content: data.content?.[0]?.text || ""
            }
          }]
        };
        return new Response(JSON.stringify(converted), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      console.error("Anthropic 호출 실패, OpenAI로 전환:", anthropicResponse.status);
    } catch (err) {
      console.error("Anthropic 연결 오류, OpenAI로 전환:", err.message);
    }
  }

  // ── 2순위: OpenAI GPT-4o (fallback) ──
  if (OPENAI_KEY) {
    try {
      // OpenAI 메시지 배열 업데이트 (시스템 프롬프트 반영)
      const messages = body.messages || [];
      const systemIdx = messages.findIndex(m => m.role === "system");
      if (systemIdx !== -1) {
        messages[systemIdx].content = baseSystemMsg;
      } else {
        messages.unshift({ role: "system", content: baseSystemMsg });
      }

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify({
          ...body,
          messages: messages
        })
      });

      const data = await openaiResponse.json();
      return new Response(JSON.stringify(data), {
        status: openaiResponse.status,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: "사용 가능한 API 키가 없습니다." }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequest(context) {
  const ANTHROPIC_KEY = context.env.ANTHROPIC_API_KEY;
  const OPENAI_KEY = context.env.OPENAI_API_KEY;

  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!ANTHROPIC_KEY && !OPENAI_KEY) {
    return new Response(JSON.stringify({ error: "API Key가 설정되지 않았습니다." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const body = await context.request.json();

  if (ANTHROPIC_KEY) {
    try {
      const systemMsg = body.messages?.find(m => m.role === "system")?.content || "당신은 웹소설 기획을 돕는 유능한 AI 조수입니다.";
      const userMessages = body.messages?.filter(m => m.role !== "system") || [];
      const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: body.max_tokens || 1024,
          system: systemMsg,
          messages: userMessages
        })
      });
      if (anthropicResponse.ok) {
        const data = await anthropicResponse.json();
        const converted = {
          choices: [{ message: { role: "assistant", content: data.content?.[0]?.text || "" } }]
        };
        return new Response(JSON.stringify(converted), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    } catch (err) {
      console.error("Anthropic 오류:", err.message);
    }
  }

  if (OPENAI_KEY) {
    try {
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_KEY}`
        },
        body: JSON.stringify(body)
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

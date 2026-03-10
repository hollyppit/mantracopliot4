export async function onRequest(context) {
  // context.env에 Cloudflare 환경 변수가 들어옵니다.
  const API_KEY = context.env.OPENAI_API_KEY;

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: "OpenAI API Key is not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  // POST 요청만 허용
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const body = await context.request.json();
    
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

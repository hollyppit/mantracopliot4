export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const body = await context.request.json();
    const apiKey = context.env.OPENAI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }), {
        status: 500, headers: corsHeaders,
      });
    }

    if (!body.text) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: body.text
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: 'OpenAI API error', detail: err }), {
        status: 502, headers: corsHeaders,
      });
    }

    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;
    if (!embedding) {
      return new Response(JSON.stringify({ error: '임베딩 데이터 없음' }), {
        status: 502, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ embedding }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}

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

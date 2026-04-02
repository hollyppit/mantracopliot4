export async function onRequestPost(context) {
  const body = await context.request.json();

  const apiKey = context.env.OPENAI_API_KEY;

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

  const data = await res.json();

  return new Response(JSON.stringify({
    embedding: data.data[0].embedding
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

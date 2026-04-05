// Cloudflare Pages Function — /api/youtube
// GET /api/youtube?q=검색어
// env.YOUTUBE_API_KEY 는 Cloudflare Pages 환경변수로 설정

export async function onRequestGet({ request, env }) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  if (!q) {
    return new Response(JSON.stringify({ error: 'q parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'YOUTUBE_API_KEY is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const ytUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&maxResults=4&relevanceLanguage=ko&key=${apiKey}`;

  try {
    const ytRes = await fetch(ytUrl);
    const data = await ytRes.json();

    return new Response(JSON.stringify(data), {
      status: ytRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to fetch YouTube data', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

// OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

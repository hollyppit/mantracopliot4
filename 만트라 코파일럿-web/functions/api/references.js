export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    },
  });
}

export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
    'Content-Type': 'application/json',
  };

  const password = context.request.headers.get('x-admin-password');
  if (!password || password !== context.env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: '인증 실패' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const SUPABASE_URL = context.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = context.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Supabase 설정이 없습니다.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/expert_references?select=*&order=created_at.desc&limit=100`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: '조회 실패', detail: err }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const data = await res.json();
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: '조회 중 오류', detail: e.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

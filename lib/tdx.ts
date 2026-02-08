import { createClient } from '@supabase/supabase-js';

export async function getTDXToken() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 從 DB 抓取
  const { data } = await supabase.from('tdx_token').select('*').eq('id', 1).single();

  // 判斷是否過期 (提早 5 分鐘換新)
  if (data && new Date(data.expires_at).getTime() > Date.now() + 300000) {
    return data.access_token;
  }

  const response = await fetch("https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.TDX_client_id!,
      client_secret: process.env.TDX_client_secret!
    })
  });
  const newToken = await response.json();

  const expiresAt = new Date(Date.now() + newToken.expires_in * 1000).toISOString();

  // 4. 更新回 DB
  await supabase.from('tdx_token').upsert({
    id: 1,
    access_token: newToken.access_token,
    expires_at: expiresAt
  });

  return newToken.access_token;
}
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Cria e configura o cliente Supabase para a aplicação
 * @returns {ReturnType<typeof createClient>} Cliente Supabase configurado
 * @throws {Error} Se as variáveis de ambiente não estiverem configuradas
 */
function createSupabaseClient(useServiceRole = false): ReturnType<typeof createClient> {
  // VALIDAÇÃO CRÍTICA - Edge Cases:
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  // Edge Case 1: Variáveis não definidas
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Variáveis de ambiente do Supabase não configuradas. ' +
      'Verifique SUPABASE_URL e SUPABASE_ANON_KEY'
    );
  }

  // Edge Case 2: URLs inválidas
  if (!supabaseUrl.startsWith('https://')) {
    throw new Error('SUPABASE_URL deve começar com https://');
  }

  // Edge Case 3: Chave muito curta (indicativo de erro)
  if (supabaseAnonKey.length < 20) {
    throw new Error('SUPABASE_ANON_KEY parece inválida (muito curta)');
  }

  // Edge Case 4: Configuração de autenticação para Edge Functions
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-application-name': 'Glass Engine Portfolio',
        'x-edge-function': 'true',
      },
    },
  };

  // Use service role key only when explicitly requested and available
  const key = useServiceRole && supabaseServiceKey ? supabaseServiceKey : supabaseAnonKey;
  
  if (useServiceRole && !supabaseServiceKey) {
    console.warn('Service role key requested but not available, falling back to anon key');
  }
  
  return createClient(supabaseUrl, key, options);
}

// CORS headers para Edge Functions
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * Handler principal para Edge Functions
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Create a new client instance for each request to avoid shared state issues
    const client = createSupabaseClient();
    
    // Adicionar headers de segurança
    const securityHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    };

    // Aqui você pode adicionar sua lógica de negócio
    // Exemplo: processar requisições da API
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Supabase Edge Function está funcionando',
        timestamp: new Date().toISOString()
      }), 
      { 
        headers: securityHeaders,
        status: 200 
      }
    );
    
  } catch (error) {
    console.error('Error in edge function:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Erro interno do servidor'
      }), 
      { 
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: error.message.includes('Variáveis de ambiente') ? 500 : 400 
      }
    );
  }
});

// Exportação para uso em outros contextos (se necessário)
export { createSupabaseClient };
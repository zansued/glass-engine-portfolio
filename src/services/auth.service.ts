import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface RequestData {
  action: 'signUp' | 'signIn';
  data: {
    email?: string;
    password?: string;
    fullName?: string;
    marketingConsent?: boolean;
  };
}

interface AuthResponse {
  success: boolean;
  message: string;
  data?: any;
}

const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): string | null => {
  if (typeof password !== 'string' || password.length < 8) {
    return 'A senha deve ter pelo menos 8 caracteres.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra maiúscula.';
  }
  if (!/[a-z]/.test(password)) {
    return 'A senha deve conter pelo menos uma letra minúscula.';
  }
  if (!/\d/.test(password)) {
    return 'A senha deve conter pelo menos um número.';
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'A senha deve conter pelo menos um caractere especial.';
  }
  return null;
};

const mapAuthError = (errorMessage: string): string => {
  switch (errorMessage) {
    case 'Invalid login credentials':
      return 'Email ou senha incorretos';
    case 'Email not confirmed':
      return 'Confirme seu email antes de fazer login';
    case 'User already registered':
      return 'Este email já está cadastrado';
    case 'Password should be at least 8 characters':
      return 'A senha deve ter pelo menos 8 caracteres';
    case 'Too many requests':
      return 'Muitas tentativas. Tente novamente mais tarde';
    default:
      return 'Erro de autenticação';
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, data }: RequestData = await req.json();

    switch (action) {
      case 'signUp': {
        const { email, password, fullName, marketingConsent } = data;

        if (!email || !password) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Email e senha são obrigatórios'
            } as AuthResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        if (!isValidEmail(email)) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Email inválido'
            } as AuthResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
          return new Response(
            JSON.stringify({
              success: false,
              message: passwordError
            } as AuthResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              marketing_consent: marketingConsent,
            },
          },
        });

        if (authError) {
          return new Response(
            JSON.stringify({
              success: false,
              message: mapAuthError(authError.message)
            } as AuthResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        if (authData.user) {
          const { error: profileError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              email,
              full_name: fullName,
              tier: 'free',
            });

          if (profileError) {
            console.error('Error creating user profile:', profileError);
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: authData,
            message: 'Conta criada com sucesso. Verifique seu email.'
          } as AuthResponse),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'signIn': {
        const { email, password } = data;

        if (!email || !password) {
          return new Response(
            JSON.stringify({
              success: false,
              message: 'Email e senha são obrigatórios'
            } as AuthResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          return new Response(
            JSON.stringify({
              success: false,
              message: mapAuthError(authError.message)
            } as AuthResponse),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: authData,
            message: 'Login realizado com sucesso.'
          } as AuthResponse),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({
            success: false,
            message: 'Ação não suportada'
          } as AuthResponse),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Erro interno do servidor'
      } as AuthResponse),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
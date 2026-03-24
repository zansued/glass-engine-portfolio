import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";
import { isEmail } from "https://esm.sh/validator@13.11.0";

// Types
interface EarlyAccessRequest {
  email: string;
  marketing_consent?: boolean;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface EarlyAccessResponse {
  success: boolean;
  message: string;
  data?: {
    email: string;
    id?: string;
    created_at?: string;
  };
  error?: {
    code: string;
    details?: string;
  };
}

interface EmailValidationResult {
  isValid: boolean;
  reason?: 'format' | 'domain' | 'disposable' | 'mx' | 'syntax';
  suggestions?: string[];
}

interface EarlyAccessRecord {
  id: string;
  email: string;
  marketing_consent: boolean;
  source: string;
  status: 'pending' | 'verified' | 'invited' | 'rejected';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGINS') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Configuration
const config = {
  maxRequestsPerEmail: 5,
  rateLimitWindow: 60 * 60 * 1000, // 1 hour in milliseconds
  requireMarketingConsent: false,
  allowedDomains: [] as string[], // Empty means all domains allowed
  blockedDomains: [
    'tempmail.com',
    'temp-mail.org',
    'guerrillamail.com',
    'mailinator.com',
    '10minutemail.com',
    'yopmail.com',
    'throwawaymail.com',
    'fakeinbox.com',
    'trashmail.com',
  ],
  maxRequestSize: 1024 * 10, // 10KB
};

// Email validation
function validateEmailFormat(email: string): EmailValidationResult {
  if (!email || typeof email !== 'string') {
    return { isValid: false, reason: 'syntax' };
  }

  const trimmedEmail = email.trim().toLowerCase();
  
  // Basic syntax validation
  if (!isEmail(trimmedEmail)) {
    return { isValid: false, reason: 'format' };
  }

  // Extract domain
  const domain = trimmedEmail.split('@')[1];
  
  // Check blocked domains
  if (config.blockedDomains.some(blocked => domain.includes(blocked))) {
    return { isValid: false, reason: 'disposable' };
  }

  // Check allowed domains if configured
  if (config.allowedDomains.length > 0 && !config.allowedDomains.includes(domain)) {
    return { isValid: false, reason: 'domain' };
  }

  return { isValid: true };
}

// Rate limiting using Supabase (persistent across instances)
async function checkRateLimit(supabase: any, email: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const now = Date.now();
  const windowStart = now - config.rateLimitWindow;
  
  try {
    // Check existing requests in the rate limit window
    const { data, error } = await supabase
      .from('early_access_requests')
      .select('created_at')
      .eq('email', email.toLowerCase())
      .gte('created_at', new Date(windowStart).toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Rate limit check error:', error);
      // Allow on database error to avoid blocking legitimate requests
      return { allowed: true };
    }

    if (data && data.length >= config.maxRequestsPerEmail) {
      // Calculate retry time based on oldest request in window
      const oldestRequest = new Date(data[data.length - 1].created_at).getTime();
      const retryAfter = Math.ceil((oldestRequest + config.rateLimitWindow - now) / 1000);
      return { allowed: false, retryAfter: Math.max(1, retryAfter) };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Rate limit check exception:', error);
    return { allowed: true };
  }
}

// Sanitize input
function sanitizeInput(data: EarlyAccessRequest): EarlyAccessRequest {
  const sanitized: EarlyAccessRequest = {
    email: data.email?.trim().toLowerCase() || '',
    marketing_consent: Boolean(data.marketing_consent),
    source: (data.source || 'unknown').slice(0, 100),
    metadata: {}
  };

  // Sanitize metadata
  if (data.metadata && typeof data.metadata === 'object') {
    const metadata = data.metadata as Record<string, unknown>;
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        sanitized.metadata![key] = value.slice(0, 500);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized.metadata![key] = value;
      }
    }
  }

  return sanitized;
}

// Create Supabase client
function createSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// Main handler
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Method not allowed',
        error: { code: 'METHOD_NOT_ALLOWED' }
      } as EarlyAccessResponse),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // Check content length
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > config.maxRequestSize) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Request too large',
          error: { code: 'REQUEST_TOO_LARGE' }
        } as EarlyAccessResponse),
        {
          status: 413,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    let requestData: EarlyAccessRequest;
    try {
      requestData = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid JSON payload',
          error: { code: 'INVALID_JSON' }
        } as EarlyAccessResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Sanitize input
    const sanitizedData = sanitizeInput(requestData);

    // Validate email
    const emailValidation = validateEmailFormat(sanitizedData.email);
    if (!emailValidation.isValid) {
      const reasonMap = {
        'format': 'Invalid email format',
        'domain': 'Email domain not allowed',
        'disposable': 'Disposable email addresses are not allowed',
        'syntax': 'Invalid email syntax'
      };
      
      return new Response(
        JSON.stringify({
          success: false,
          message: reasonMap[emailValidation.reason || 'format'] || 'Invalid email',
          error: { code: 'INVALID_EMAIL', details: emailValidation.reason }
        } as EarlyAccessResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check marketing consent if required
    if (config.requireMarketingConsent && !sanitizedData.marketing_consent) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Marketing consent is required',
          error: { code: 'CONSENT_REQUIRED' }
        } as EarlyAccessResponse),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create Supabase client
    const supabase = createSupabaseClient();

    // Check rate limit
    const rateLimit = await checkRateLimit(supabase, sanitizedData.email);
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          message: `Too many requests. Please try again in ${rateLimit.retryAfter} seconds.`,
          error: { code: 'RATE_LIMITED', details: `Retry after ${rateLimit.retryAfter}s` }
        } as EarlyAccessResponse),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': rateLimit.retryAfter?.toString() || '60'
          },
        }
      );
    }

    // Check if email already exists
    const { data: existingRecord } = await supabase
      .from('early_access_requests')
      .select('id, email, status, created_at')
      .eq('email', sanitizedData.email)
      .maybeSingle();

    if (existingRecord) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'You are already on the waitlist!',
          data: {
            email: existingRecord.email,
            id: existingRecord.id,
            created_at: existingRecord.created_at
          }
        } as EarlyAccessResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Insert new record
    const { data: newRecord, error: insertError } = await supabase
      .from('early_access_requests')
      .insert({
        email: sanitizedData.email,
        marketing_consent: sanitizedData.marketing_consent,
        source: sanitizedData.source,
        metadata: sanitizedData.metadata,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Failed to save request',
          error: { code: 'DATABASE_ERROR', details: insertError.message }
        } as EarlyAccessResponse),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Successfully joined the waitlist!',
        data: {
          email: newRecord.email,
          id: newRecord.id,
          created_at: newRecord.created_at
        }
      } as EarlyAccessResponse),
      {
        status: 201,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: { code: 'INTERNAL_ERROR' }
      } as EarlyAccessResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
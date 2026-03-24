import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve, type ConnInfo } from "https://deno.land/std@0.198.0/http/server.ts"; // Use a stable and recent Deno std version
import { z } from "https://esm.sh/zod@3.22.4";

// --- Type Definitions ---

// Input schema for early access request
const EarlyAccessSchema = z.object({
  email: z.string()
    .trim() // Trim whitespace from both ends
    .toLowerCase() // Convert to lowercase before validation
    .email('Invalid email format')
    .max(255, 'Email too long'),
  marketing_consent: z.boolean()
    .default(false)
    .optional(),
});

// Type generated from the Zod schema
type EarlyAccessRequestData = z.infer<typeof EarlyAccessSchema>;

// Success response type
export interface EarlyAccessSuccessResponse {
  success: true;
  message: string;
  data: {
    id: string;
    email: string;
    created_at: string;
  };
}

// Error response type structure
export interface EarlyAccessErrorResponseContent {
  code: string;
  message: string;
  details?: unknown; // Use 'unknown' for flexible error details
}

export interface EarlyAccessErrorResponse {
  success: false;
  error: EarlyAccessErrorResponseContent;
}

// Union type for all possible responses
export type EarlyAccessResponse = EarlyAccessSuccessResponse | EarlyAccessErrorResponse;

// --- Supabase Client Initialization ---

let supabase: SupabaseClient | undefined; // Lazily initialize Supabase client

function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error("Missing Supabase environment variables: SUPABASE_URL and SUPABASE_ANON_KEY are required.");
    }

    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // Important for Edge Functions
      },
    });
  }
  return supabase;
}

// --- CORS Headers Configuration ---

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*", // Be more specific in production
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// --- Helper Functions ---

/**
 * Validates the request body against the EarlyAccessSchema using Zod.
 * @param body The raw request body.
 * @returns An object indicating validity and parsed data or validation errors.
 */
function validateRequestBody(body: unknown):
  | { isValid: true; data: EarlyAccessRequestData }
  | { isValid: false; errors: z.ZodIssue[] } { // Use Zod's ZodIssue type for errors
  const parseResult = EarlyAccessSchema.safeParse(body);
  if (parseResult.success) {
    return { isValid: true, data: parseResult.data };
  } else {
    return { isValid: false, errors: parseResult.error.issues };
  }
}

/**
 * Checks if an email already exists in the 'early_access_registrations' table.
 * @param supabase The Supabase client instance.
 * @param email The email to check.
 * @returns True if the email exists, false otherwise.
 * @throws Error if a Supabase query error occurs.
 */
async function checkEmailExists(supabase: SupabaseClient, email: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('early_access_registrations')
    .select('email', { count: 'exact', head: true })
    .eq('email', email);

  if (error) {
    console.error('Error checking email existence:', error);
    throw new Error(`Failed to check email existence: ${error.message}`);
  }

  return count > 0;
}

/**
 * Inserts a new early access subscriber into the database.
 * @param supabase The Supabase client instance.
 * @param data The validated early access request data.
 * @returns The inserted subscriber data.
 * @throws Error if the database insert fails.
 */
async function createSubscriber(supabase: SupabaseClient, data: EarlyAccessRequestData): Promise<EarlyAccessSuccessResponse['data']> {
  const { data: subscriber, error } = await supabase
    .from('early_access_registrations')
    .insert([{
      email: data.email,
      marketing_consent: data.marketing_consent || false
    }])
    .select('id, email, created_at')
    .single();

  if (error) {
    console.error('Database insert failed:', error);
    throw new Error(`Failed to register for early access: ${error.message}`);
  }

  return subscriber;
}

// --- Main Handler ---

/**
 * Handles incoming HTTP requests for early access signup.
 */
serve(async (req: Request, _connInfo: ConnInfo) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS
    });
  }

  // Ensure only POST requests are processed beyond this point
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: 'Only POST requests are allowed.'
        }
      } as EarlyAccessErrorResponse),
      {
        status: 405,
        headers: CORS_HEADERS
      }
    );
  }

  try {
    const supabaseClient = getSupabaseClient(); // Initialize Supabase client

    const requestBody = await req.json();
    const validation = validateRequestBody(requestBody);

    if (!validation.isValid) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request payload.',
            details: validation.errors.map(err => ({ path: err.path, message: err.message }))
          }
        } as EarlyAccessErrorResponse),
        {
          status: 400,
          headers: CORS_HEADERS
        }
      );
    }

    const { data } = validation;

    // Check if email already exists
    const emailExists = await checkEmailExists(supabaseClient, data.email);
    if (emailExists) {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'This email is already registered for early access.'
          }
        } as EarlyAccessErrorResponse),
        {
          status: 409, // Conflict
          headers: CORS_HEADERS
        }
      );
    }

    // Create new subscriber
    const newSubscriber = await createSubscriber(supabaseClient, data);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Successfully registered for early access!',
        data: newSubscriber
      } as EarlyAccessSuccessResponse),
      {
        status: 201, // Created
        headers: CORS_HEADERS
      }
    );

  } catch (error) {
    console.error('Error processing early access request:', error);

    // Generic error response
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred.',
          details: error instanceof Error ? error.message : String(error)
        }
      } as EarlyAccessErrorResponse),
      {
        status: 500,
        headers: CORS_HEADERS
      }
    );
  }
});
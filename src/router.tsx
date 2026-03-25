import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Define an interface for the expected data structure from your Supabase table
interface UserProfile {
  id: string;
  username: string;
  email: string;
  created_at: string;
  // Add other fields as per your 'profiles' table schema
}

serve(async (req: Request) => {
  // CORS Headers for all responses
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Restrict this in production to your frontend's origin
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 1. Supabase Client Initialization
  // Ensure SUPABASE_URL and SUPABASE_ANON_KEY are set in your Edge Function environment variables.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY"); // Or SUPABASE_SERVICE_ROLE_KEY if needed

  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: "Supabase environment variables not set." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 2. Request Handling and Type Safety
  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: `Method ${req.method} Not Allowed` }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Allow": "GET",
        },
      },
    );
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(
      JSON.stringify({ error: "Missing userId query parameter." }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // 3. Supabase API Usage with Type Safety
  try {
    const { data: userProfile, error } = await supabase
      .from("profiles") // Replace 'profiles' with your actual table name
      .select<UserProfile>() // Specify fields to select with type
      .eq("id", userId)
      .single(); // Expecting a single record

    if (error) {
      console.error("Supabase query error:", error.message);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!userProfile) {
      return new Response(
        JSON.stringify({ error: "User profile not found." }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 4. Return successful response
    return new Response(
      JSON.stringify(userProfile),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("Deno Edge Function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
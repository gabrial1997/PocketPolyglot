/**
 * content-edit — Deno Edge Function (service_role, founder-gated).
 *
 * Verifies the caller's JWT → resolves user.id → re-checks
 * profiles.settings.editor === true SERVER-SIDE → validates table/columns →
 * applies the UPDATE as service_role.
 *
 * Security invariants:
 *   - The service_role key is read ONLY from Deno.env at runtime. It is NEVER
 *     logged, never returned in a response body, never embedded in code.
 *   - The founder gate is enforced here (server-side), independent of any
 *     client-side flag. Non-founders receive 403.
 *   - JWT verification uses the ANON client + the caller's Authorization header.
 *   - The founder check + content UPDATE run as service_role.
 */

// @deno-types="npm:@supabase/supabase-js@2"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateContentEdit } from '../_shared/contentEdit.ts';
import type { ContentEditRequest } from '../_shared/contentEdit.ts';

// ── CORS headers ──────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Pure handler (injected Deps — testable without a live runtime) ─────────────

export interface Deps {
  /** Verifies the JWT and returns the auth uid, or null if invalid/expired. */
  getUserId(jwt: string): Promise<string | null>;
  /** Returns true iff profiles.settings.editor === true for this user (service_role read). */
  isFounder(userId: string): Promise<boolean>;
  /** Applies the validated UPDATE as service_role. */
  applyUpdate(table: string, id: string, patch: Record<string, string>): Promise<void>;
}

export async function handleContentEdit(
  req: ContentEditRequest,
  jwt: string | null,
  deps: Deps,
): Promise<{ status: 200 | 400 | 401 | 403; body: unknown }> {
  // Step 1 — JWT must be present
  if (!jwt) {
    return { status: 401, body: { error: 'Missing or invalid authorization header' } };
  }

  // Step 2 — Verify the JWT and resolve user.id
  const userId = await deps.getUserId(jwt);
  if (!userId) {
    return { status: 401, body: { error: 'Invalid or expired JWT' } };
  }

  // Step 3 — Founder gate (the REAL gate — server-side, independent of client flag)
  const founder = await deps.isFounder(userId);
  if (!founder) {
    return { status: 403, body: { error: 'Forbidden: editor access required' } };
  }

  // Step 4 — Validate + sanitize the request (whitelist table/columns)
  let table: string;
  let id: string;
  let patch: Record<string, string>;
  try {
    ({ table, id, patch } = validateContentEdit(req));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 400, body: { error: message } };
  }

  // Step 5 — Apply the UPDATE as service_role
  await deps.applyUpdate(table, id, patch);
  return { status: 200, body: { ok: true } };
}

// ── Concrete serve() wrapper ──────────────────────────────────────────────────

Deno.serve(async (httpReq: Request): Promise<Response> => {
  // Handle CORS preflight
  if (httpReq.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  // Parse the Authorization header (Bearer <jwt>)
  const authHeader = httpReq.headers.get('Authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Parse body
  let reqBody: ContentEditRequest;
  try {
    reqBody = await httpReq.json() as ContentEditRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Build real Deps
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // IMPORTANT: supabaseServiceKey is NEVER logged or returned

  // Anon client — used only to verify the JWT
  const anonClient = createClient(supabaseUrl, supabaseAnonKey);

  // Service-role client — used for founder check + content UPDATE
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  const deps: Deps = {
    async getUserId(token: string): Promise<string | null> {
      const { data, error } = await anonClient.auth.getUser(token);
      if (error || !data.user) return null;
      return data.user.id;
    },

    async isFounder(userId: string): Promise<boolean> {
      const { data, error } = await serviceClient
        .from('profiles')
        .select('settings')
        .eq('id', userId)
        .maybeSingle();
      if (error || !data) return false;
      const row = data as { settings: { editor?: boolean } | null } | null;
      return row?.settings?.editor === true;
    },

    async applyUpdate(table: string, id: string, patchData: Record<string, string>): Promise<void> {
      const { error } = await serviceClient
        .from(table)
        .update(patchData)
        .eq('id', id);
      if (error) throw error;
    },
  };

  const { status, body } = await handleContentEdit(reqBody, jwt, deps);

  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  );
});

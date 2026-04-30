/**
 * Supabase global config + client bootstrap.
 * Replace placeholders when rotating to a new project:
 *   - YOUR_NEW_SUPABASE_URL
 *   - YOUR_NEW_ANON_KEY (or publishable key, if your SDK setup uses it)
 */
(function () {
    const SUPABASE_URL = 'https://vapqtrxppvgzgibpojkx.supabase.co'; // YOUR_NEW_SUPABASE_URL
    const SUPABASE_ANON_KEY =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhcHF0cnhwcHZnemdpYnBvamt4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODQ1MDcsImV4cCI6MjA5MzA2MDUwN30.3l2w339omtFpnHpLIzeS7r_cv7d0xmsWQCxj0XuI4bU'; // YOUR_NEW_ANON_KEY

    window.SSV_SUPABASE_URL = SUPABASE_URL;
    window.SSV_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

    function getPreferredStorage() {
        return localStorage.getItem('ssv_remember_me') === '1' ? localStorage : sessionStorage;
    }

    function createSupabaseClient(customStorage) {
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('Supabase SDK not loaded. Ensure @supabase/supabase-js is included first.');
        }
        return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                storage: customStorage || getPreferredStorage(),
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true,
            },
        });
    }

    // Globally available for all auth pages.
    window.createSupabaseClient = createSupabaseClient;
    window.supabaseClient = createSupabaseClient(getPreferredStorage());
})();

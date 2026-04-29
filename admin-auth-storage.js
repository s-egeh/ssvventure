/**
 * Shared auth persistence for SSV admin apps (dashboard, change-password, etc.).
 * Mirrors admin-auth.js: if "Remember this device" was used at login, `ssv_use_persistent_auth` is '1'
 * and the Supabase client should use localStorage; otherwise sessionStorage (tab-scoped session).
 */
(function () {
    window.ssvGetAuthStorage = function ssvGetAuthStorage() {
        return localStorage.getItem('ssv_use_persistent_auth') === '1' ? localStorage : sessionStorage;
    };
})();

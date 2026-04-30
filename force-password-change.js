(function () {
    const form = document.getElementById('forcePasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitBtn = document.getElementById('submitBtn');
    const errorBox = document.getElementById('errorBox');
    const successBox = document.getElementById('successBox');

    function setMessage(type, text) {
        errorBox.style.display = 'none';
        successBox.style.display = 'none';
        if (!text) return;
        const box = type === 'error' ? errorBox : successBox;
        box.textContent = text;
        box.style.display = 'block';
    }

    function setLoading(loading) {
        submitBtn.disabled = loading;
        submitBtn.textContent = loading ? 'Updating...' : 'Update Password';
    }

    async function getSessionOrRedirect(supabase) {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
            window.location.replace('admin-login.html');
            return null;
        }
        return data.session;
    }

    async function redirectAfterSessionLock(supabase) {
        let redirected = false;
        const fallbackId = window.setTimeout(function () {
            if (redirected) return;
            redirected = true;
            window.location.replace('admin-dashboard.html');
        }, 1500);

        const { data: listener } = supabase.auth.onAuthStateChange(function (event, session) {
            if (redirected) return;
            if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
                redirected = true;
                window.clearTimeout(fallbackId);
                window.location.replace('admin-dashboard.html');
            }
        });

        await supabase.auth.refreshSession().catch(function () {});

        // Cleanup listener after fallback period if no redirect event arrives.
        window.setTimeout(function () {
            if (listener?.subscription?.unsubscribe) {
                listener.subscription.unsubscribe();
            }
        }, 2200);
    }

    async function init() {
        if (!form) {
            console.error('force-password-change.js: #forcePasswordForm not found.');
            return;
        }
        if (!window.createSupabaseClient) {
            setMessage('error', 'Supabase config not loaded. Please refresh.');
            return;
        }

        const supabase = window.createSupabaseClient();
        window.supabaseClient = supabase;

        const activeSession = await getSessionOrRedirect(supabase);
        if (!activeSession) return;

        form.addEventListener('submit', async function (event) {
            event.preventDefault();
            setMessage('', '');

            const newPassword = newPasswordInput.value || '';
            const confirmPassword = confirmPasswordInput.value || '';

            if (newPassword.length < 8) {
                setMessage('error', 'New password must be at least 8 characters.');
                return;
            }
            if (newPassword !== confirmPassword) {
                setMessage('error', 'Passwords do not match.');
                return;
            }

            const stillActive = await getSessionOrRedirect(supabase);
            if (!stillActive) return;

            try {
                setLoading(true);
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;

                // Optional metadata flag to avoid another forced-reset loop on next login.
                await supabase.auth.updateUser({ data: { password_changed: true } }).catch(function () {});

                setMessage('ok', 'Password updated. Redirecting to dashboard...');
                await redirectAfterSessionLock(supabase);
            } catch (error) {
                setMessage('error', error?.message || 'Password update failed. Please try again.');
            } finally {
                setLoading(false);
            }
        });
    }

    void init();
})();

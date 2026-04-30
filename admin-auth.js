// admin-auth.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('adminLoginForm');
    if (!loginForm) return;

    const errorBox = document.getElementById('errorBox');
    const successBox = document.getElementById('successBox');
    const submitButton = document.getElementById('loginBtn');

    const setError = (message) => {
        if (successBox) successBox.style.display = 'none';
        if (errorBox) {
            errorBox.textContent = message;
            errorBox.style.display = 'block';
        } else {
            alert(message);
        }
    };

    const setSuccess = (message) => {
        if (errorBox) errorBox.style.display = 'none';
        if (successBox) {
            successBox.textContent = message;
            successBox.style.display = 'block';
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        if (!email || !password) {
            setError('Email and password are required.');
            return;
        }

        const originalBtnText = submitButton.innerText;
        submitButton.innerText = 'Authenticating...';
        submitButton.disabled = true;

        try {
            localStorage.setItem('ssv_remember_me', rememberMe ? '1' : '0');
            const storage = rememberMe ? localStorage : sessionStorage;
            const supabase = window.createSupabaseClient
                ? window.createSupabaseClient(storage)
                : window.supabaseClient;

            if (!supabase) throw new Error('Supabase client is not initialized.');

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setError(`Login Failed: ${error.message}`);
                return;
            }

            const user = data?.user || data?.session?.user;
            const mustChangePassword = user?.user_metadata?.password_changed === false;

            setSuccess('Login successful. Redirecting...');
            window.location.href = mustChangePassword
                ? 'force-password-change.html'
                : 'admin-dashboard.html';
        } catch (err) {
            console.error('An unexpected error occurred:', err);
            setError(err?.message || 'An error occurred connecting to the server.');
        } finally {
            submitButton.innerText = originalBtnText;
            submitButton.disabled = false;
        }
    });
});

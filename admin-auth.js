/**
 * SSV Admin login — "Remember this device" controls where Supabase persists the session:
 * - Checked:  localStorage (survives browser restarts). Sets ssv_use_persistent_auth for other admin pages.
 * - Unchecked: sessionStorage ONLY — session is cleared when the tab/window is closed. Stale local keys are removed.
 *
 * The Supabase client MUST be created with the correct `auth.storage` before signInWithPassword.
 */

const SUPABASE_URL = window.SSV_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SSV_SUPABASE_ANON_KEY || '';
const DEFAULT_PASSWORD = 'ssv2013';
const DEFAULT_LOGIN_BTN_HTML = '<span>Authenticate</span><i class="fa-solid fa-arrow-right-to-bracket"></i>';

function supabaseAuthStorageKey() {
    try {
        const host = new URL(SUPABASE_URL).hostname;
        const ref = host.split('.')[0];
        return ref ? `sb-${ref}-auth-token` : null;
    } catch {
        return null;
    }
}

/** Remove persisted Supabase session from localStorage (used when switching to tab-only sessions). */
function clearStaleLocalSupabaseSession() {
    const key = supabaseAuthStorageKey();
    if (key) localStorage.removeItem(key);
}

/** Remove persisted Supabase session from sessionStorage (used when switching to remembered sessions). */
function clearStaleSessionStorageSupabaseSession() {
    const key = supabaseAuthStorageKey();
    if (key) sessionStorage.removeItem(key);
}

function sanitizeEmail(input) {
    if (typeof input !== 'string') return '';
    return input.trim().replace(/\0/g, '');
}

function normalizePassword(input) {
    if (typeof input !== 'string') return '';
    return input.replace(/\0/g, '');
}

/**
 * Supabase Auth must use the chosen Storage API **before** signInWithPassword runs:
 * - Remember checked → localStorage (survives browser restarts).
 * - Unchecked → sessionStorage (cleared when tab/window closes — automatic logout).
 *
 * Example equivalent:
 * createClient(url, anon, {
 *   auth: {
 *     storage: sessionStorage,
 *     persistSession: true,
 *     autoRefreshToken: true,
 *     detectSessionInUrl: true,
 *   },
 * });
 */
function createSupabaseClient(storage) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    });
}

function setupPasswordToggles() {
    document.querySelectorAll('.password-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;

            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            btn.innerHTML = isHidden
                ? '<i class="fa-regular fa-eye-slash"></i>'
                : '<i class="fa-regular fa-eye"></i>';
            btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        });
    });
}

function clearMessages() {
    const errorBox = document.getElementById('error-message');
    const successBox = document.getElementById('success-message');
    if (errorBox) {
        errorBox.style.display = 'none';
        errorBox.innerText = '';
        errorBox.style.borderLeftColor = '';
    }
    if (successBox) {
        successBox.style.display = 'none';
        successBox.innerText = '';
    }
}

document.getElementById('adminLoginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const emailRaw = document.getElementById('email').value;
    const passwordRaw = document.getElementById('password').value;
    const rememberMe = document.getElementById('rememberDevice').checked;
    const errorBox = document.getElementById('error-message');
    const loginBtn = document.querySelector('.login-btn');

    const email = sanitizeEmail(emailRaw);
    const password = normalizePassword(passwordRaw);

    const recaptchaResponse = typeof grecaptcha !== 'undefined' ? grecaptcha.getResponse() : '';
    /*
    if (recaptchaResponse.length === 0) {
        showError("Please complete the Captcha to verify you are human.");
        return;
    }
    */

    loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';
    loginBtn.disabled = true;
    clearMessages();

    if (rememberMe) {
        localStorage.setItem('ssv_use_persistent_auth', '1');
        clearStaleSessionStorageSupabaseSession();
    } else {
        localStorage.removeItem('ssv_use_persistent_auth');
        clearStaleLocalSupabaseSession();
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        showError('Supabase is not linked. Ensure supabase-config.js is loaded before signing in.');
        loginBtn.innerHTML = DEFAULT_LOGIN_BTN_HTML;
        loginBtn.disabled = false;
        return;
    }

    /** @type {Storage} Tab-only vs remembered session — must match checkbox before createClient + signIn */
    const authStorage = rememberMe ? localStorage : sessionStorage;

    const supabase = createSupabaseClient(authStorage);

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) throw error;

        // v2 sometimes omits session on the response object; always resolve via getSession().
        let session = data?.session ?? null;
        if (!session) {
            const { data: sessWrap, error: sessErr } = await supabase.auth.getSession();
            if (sessErr) console.warn('SSV auth: getSession after login', sessErr);
            session = sessWrap?.session ?? null;
        }
        if (!session) {
            throw new Error(
                'Could not establish a browser session after login. Try enabling “Remember this device” or allow storage for this site.'
            );
        }

        // Brief pause so tokens flush to sessionStorage/localStorage before navigation.
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (password === DEFAULT_PASSWORD) {
            window.location.assign('force-password-change.html');
        } else {
            window.location.assign('admin-dashboard.html');
        }
    } catch (error) {
        showError(error.message || 'Invalid credentials or network error.');
        loginBtn.innerHTML = DEFAULT_LOGIN_BTN_HTML;
        loginBtn.disabled = false;
        if (typeof grecaptcha !== 'undefined') grecaptcha.reset();
    }
});

function showError(message) {
    clearMessages();
    const errorBox = document.getElementById('error-message');
    if (!errorBox) return;
    errorBox.innerText = message;
    errorBox.style.display = 'block';
}

function showSuccess(message) {
    clearMessages();
    const successBox = document.getElementById('success-message');
    if (!successBox) return;
    successBox.innerText = message;
    successBox.style.display = 'block';
}

async function handleForgotPassword(event) {
    event.preventDefault();

    const emailInput = document.getElementById('email');
    const email = sanitizeEmail(emailInput ? emailInput.value : '');
    const forgotPwdLink = document.querySelector('.forgot-pwd');
    if (forgotPwdLink) {
        forgotPwdLink.classList.add('is-loading');
        forgotPwdLink.textContent = 'Sending...';
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        showError('Supabase is not linked. Ensure supabase-config.js is loaded.');
        if (forgotPwdLink) {
            forgotPwdLink.classList.remove('is-loading');
            forgotPwdLink.textContent = 'Forgot Password?';
        }
        return;
    }

    if (!email) {
        showError('Enter your email first, then click "Forgot Password?"');
        if (forgotPwdLink) {
            forgotPwdLink.classList.remove('is-loading');
            forgotPwdLink.textContent = 'Forgot Password?';
        }
        return;
    }

    const redirectTo = new URL('force-password-change.html', window.location.href).toString();
    const supabase = createSupabaseClient(localStorage);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    if (error) {
        showError(error.message || 'Could not send reset link. Please try again.');
        if (forgotPwdLink) {
            forgotPwdLink.classList.remove('is-loading');
            forgotPwdLink.textContent = 'Forgot Password?';
        }
        return;
    }

    showSuccess('Password reset link sent. Check your email and open the link to set a new password.');
    if (forgotPwdLink) {
        forgotPwdLink.classList.remove('is-loading');
        forgotPwdLink.textContent = 'Forgot Password?';
    }
}

const forgotPwdLink = document.querySelector('.forgot-pwd');
if (forgotPwdLink) {
    forgotPwdLink.addEventListener('click', function (e) {
        void handleForgotPassword(e);
    });
}

setupPasswordToggles();

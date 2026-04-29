const SUPABASE_URL = window.SSV_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SSV_SUPABASE_ANON_KEY || '';

const authStorage =
    typeof window.ssvGetAuthStorage === 'function' ? window.ssvGetAuthStorage() : localStorage;
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});

const DEFAULT_PASSWORD = 'ssv2013';

/**
 * Basic sanitization: strip null bytes and normalize via text node so values
 * are safe when echoed with textContent (XSS-safe display paths).
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    const cleaned = input.replace(/\0/g, '');
    const div = document.createElement('div');
    div.textContent = cleaned;
    return div.textContent;
}

function showError(message) {
    const el = document.getElementById('error-message');
    const successEl = document.getElementById('success-message');
    successEl.style.display = 'none';
    successEl.textContent = '';
    el.textContent = message;
    el.style.display = 'block';
}

function hideError() {
    const el = document.getElementById('error-message');
    el.style.display = 'none';
    el.textContent = '';
}

function showSuccess(message) {
    const el = document.getElementById('success-message');
    const errEl = document.getElementById('error-message');
    errEl.style.display = 'none';
    errEl.textContent = '';
    el.textContent = message;
    el.style.display = 'block';
}

function setSubmitLoading(isLoading) {
    const btn = document.getElementById('submitBtn');
    const label = btn.querySelector('.btn-label');
    const arrow = btn.querySelector('.btn-arrow');
    if (isLoading) {
        btn.disabled = true;
        label.textContent = 'Updating...';
        arrow.className = 'fa-solid fa-circle-notch fa-spin btn-arrow';
    } else {
        btn.disabled = false;
        label.textContent = 'Update & Continue';
        arrow.className = 'fa-solid fa-arrow-right btn-arrow';
    }
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

function passwordStrengthLabel(passwordRaw) {
    const password = passwordRaw || '';
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 2) return { label: 'Too weak', cls: 'weak' };
    if (score <= 4) return { label: 'Medium', cls: 'medium' };
    return { label: 'Strong', cls: 'strong' };
}

function setupStrengthMeter() {
    const input = document.getElementById('newPassword');
    const target = document.getElementById('password-strength-value');
    if (!input || !target) return;

    const update = () => {
        const { label, cls } = passwordStrengthLabel(input.value);
        target.textContent = label;
        target.classList.remove('weak', 'medium', 'strong');
        target.classList.add(cls);
    };

    input.addEventListener('input', update);
    update();
}

async function ensureSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        console.error('Force password page loaded without active session.', error || 'No session');
        window.location.href = 'admin-login.html';
        return null;
    }
    return session;
}

async function init() {
    setupPasswordToggles();
    setupStrengthMeter();

    const session = await ensureSession();
    if (!session) return;

    const form = document.getElementById('forcePasswordForm');
    if (!form) return;

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        hideError();

        const activeSession = await ensureSession();
        if (!activeSession) return;

        const newPassword = sanitizeInput(document.getElementById('newPassword').value);
        const confirmPassword = sanitizeInput(document.getElementById('confirmPassword').value);

        if (newPassword === DEFAULT_PASSWORD) {
            showError('Your new password cannot be the default password. Please choose a different password.');
            return;
        }

        if (newPassword !== confirmPassword) {
            showError('New password and confirmation must match exactly.');
            return;
        }

        if (!newPassword.length) {
            showError('Please enter a new password.');
            return;
        }

        setSubmitLoading(true);

        try {
            const { data, error } = await supabase.auth.updateUser({ password: newPassword });
            console.log('Update response:', data, error);
            if (error) throw error;

            showSuccess('Password updated successfully. Redirecting to your dashboard...');
            setTimeout(() => {
                window.location.assign('admin-dashboard.html');
            }, 1500);
        } catch (updateError) {
            console.error('Password update failed:', updateError);
            showError(updateError.message || 'Could not update your password. Please try again.');
            setSubmitLoading(false);
        }
    });
}

void init();

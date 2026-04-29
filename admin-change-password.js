/**
 * Admin first-login password change — Supabase session required.
 * Never log password values.
 */

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

const SPECIAL_RE = /[!@#$%^&*]/;
const FORBIDDEN_SUBSTRINGS = ['ssv', '2013', 'password'];

function sanitizeEmailForDisplay(email) {
    if (typeof email !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = email.trim().slice(0, 320);
    return div.textContent;
}

/** Strip control chars / null bytes; do not alter intended password characters. */
function sanitizePasswordInput(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\0/g, '').slice(0, 128);
}

function passwordHasForbidden(pwd) {
    const lower = pwd.toLowerCase();
    return FORBIDDEN_SUBSTRINGS.some((frag) => lower.includes(frag));
}

function evaluatePasswordRules(pwd) {
    return {
        len: pwd.length >= 8,
        upper: /[A-Z]/.test(pwd),
        num: /[0-9]/.test(pwd),
        special: SPECIAL_RE.test(pwd),
        forbidden: pwd.length > 0 && !passwordHasForbidden(pwd),
    };
}

function allRulesMet(rules) {
    return rules.len && rules.upper && rules.num && rules.special && rules.forbidden;
}

function strengthTier(pwd, rules) {
    if (!pwd.length) return { pct: 0, label: '—', barClass: '' };

    let score = 0;
    if (rules.len) score += 20;
    if (rules.upper) score += 15;
    if (/[a-z]/.test(pwd)) score += 10;
    if (rules.num) score += 15;
    if (rules.special) score += 15;
    if (rules.forbidden) score += 10;
    if (pwd.length >= 12) score += 10;
    if (pwd.length >= 16) score += 5;

    const pct = Math.min(100, score);

    let label = 'Weak';
    let barClass = 'strength-weak';
    if (pct >= 86) {
        label = 'Very strong';
        barClass = 'strength-vstrong';
    } else if (pct >= 61) {
        label = 'Strong';
        barClass = 'strength-strong';
    } else if (pct >= 36) {
        label = 'Fair';
        barClass = 'strength-fair';
    } else {
        label = 'Weak';
        barClass = 'strength-weak';
    }

    return { pct, label, barClass };
}

function showError(message) {
    const errorBox = document.getElementById('error-message');
    errorBox.textContent = message;
    errorBox.style.display = 'block';
}

function hideError() {
    const errorBox = document.getElementById('error-message');
    errorBox.style.display = 'none';
    errorBox.textContent = '';
}

function isSessionExpiredError(err) {
    if (!err || typeof err.message !== 'string') return false;
    const m = err.message.toLowerCase();
    return (
        m.includes('jwt') ||
        (m.includes('session') && m.includes('expired')) ||
        m.includes('invalid refresh token') ||
        m.includes('not authenticated') ||
        err.status === 401
    );
}

function redirectToLogin() {
    window.location.href = 'admin-login.html';
}

function showSuccessToast() {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-message');
    msg.textContent = 'Password updated successfully.';
    toast.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => toast.classList.add('visible'));
}

function updateStrengthUI(pwd) {
    const rules = evaluatePasswordRules(pwd);
    const { pct, label, barClass } = strengthTier(pwd, rules);

    const bar = document.getElementById('strength-bar');
    const meter = bar.closest('.strength-meter');
    const labelEl = document.getElementById('strength-label');

    bar.style.width = `${pct}%`;
    meter.setAttribute('aria-valuenow', String(pct));

    const colors = {
        'strength-weak': '#ef4444',
        'strength-fair': '#f97316',
        'strength-strong': '#eab308',
        'strength-vstrong': '#22c55e',
    };
    bar.style.background = colors[barClass] || '#64748b';

    labelEl.textContent = pwd.length ? `Strength: ${label}` : 'Strength: —';

    document.querySelectorAll('.req-checklist li').forEach((li) => {
        const key = li.getAttribute('data-req');
        const ok = rules[key];
        const icon = li.querySelector('i');
        li.classList.toggle('met', !!ok);
        if (icon) {
            icon.className = ok ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
        }
    });
}

function updateMatchHint(newPwd, confirmPwd) {
    const hint = document.getElementById('match-hint');
    if (!confirmPwd.length) {
        hint.textContent = '';
        hint.classList.remove('ok', 'bad');
        return;
    }
    if (newPwd === confirmPwd) {
        hint.textContent = 'Passwords match';
        hint.classList.add('ok');
        hint.classList.remove('bad');
    } else {
        hint.textContent = 'Passwords do not match';
        hint.classList.add('bad');
        hint.classList.remove('ok');
    }
}

async function boot() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        redirectToLogin();
        return;
    }

    const emailInput = document.getElementById('adminEmail');
    emailInput.value = sanitizeEmailForDisplay(session.user.email || '');

    const newPwdEl = document.getElementById('newPassword');
    const confirmEl = document.getElementById('confirmPassword');

    newPwdEl.addEventListener('input', () => {
        hideError();
        const pwd = sanitizePasswordInput(newPwdEl.value);
        updateStrengthUI(pwd);
        updateMatchHint(pwd, sanitizePasswordInput(confirmEl.value));
    });

    confirmEl.addEventListener('input', () => {
        hideError();
        updateMatchHint(sanitizePasswordInput(newPwdEl.value), sanitizePasswordInput(confirmEl.value));
    });

    document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const { data: { session: activeSession }, error: sessErr } = await supabase.auth.getSession();
        if (sessErr || !activeSession) {
            redirectToLogin();
            return;
        }

        const newPassword = sanitizePasswordInput(newPwdEl.value);
        const confirmPassword = sanitizePasswordInput(confirmEl.value);
        const rules = evaluatePasswordRules(newPassword);

        if (!allRulesMet(rules)) {
            showError('Please meet all password requirements before continuing.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showError('New password and confirmation must match.');
            return;
        }

        const submitBtn = document.getElementById('submitBtn');
        submitBtn.disabled = true;
        submitBtn.querySelector('span').textContent = 'Updating…';

        const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });

        if (updateErr) {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Update password';
            if (isSessionExpiredError(updateErr)) {
                redirectToLogin();
                return;
            }
            showError(updateErr.message || 'Could not update password. Try again.');
            return;
        }

        const adminEmail = activeSession.user.email;
        const { error: dbErr } = await supabase
            .from('admins')
            .update({ password_changed: true })
            .eq('email', adminEmail);

        if (dbErr) {
            submitBtn.disabled = false;
            submitBtn.querySelector('span').textContent = 'Update password';
            if (isSessionExpiredError(dbErr)) {
                redirectToLogin();
                return;
            }
            showError(
                'Your password was updated, but we could not sync your profile. Please contact support or try signing in again.'
            );
            return;
        }

        showSuccessToast();
        setTimeout(() => {
            window.location.href = 'admin-dashboard.html';
        }, 1000);
    });
}

boot();

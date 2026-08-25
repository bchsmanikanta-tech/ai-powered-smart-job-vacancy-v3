/**
 * SMART JOB VACANCY FINDER - UI CONTROLLER & APP LOGIC
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------- ELEMENT REFERENCES ----------------
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const tabIndicator = document.querySelector('.tab-indicator');
    const loginContainer = document.getElementById('login-container');
    const registerContainer = document.getElementById('register-container');
    const switchToRegister = document.getElementById('switch-to-register');
    const switchToLogin = document.getElementById('switch-to-login');

    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    const btnSubmitLogin = document.getElementById('btn-submit-login');
    const btnSubmitRegister = document.getElementById('btn-submit-register');

    const regPasswordInput = document.getElementById('reg-password');
    const regConfirmPasswordInput = document.getElementById('reg-confirm-password');
    const meterFill = document.getElementById('meter-fill');
    const meterScore = document.getElementById('meter-score');



    // Supabase Modal & Status Elements
    const supabaseModal = document.getElementById('supabase-modal');
    const btnOpenSupabaseModal = document.getElementById('btn-open-supabase-modal');
    const btnCloseSupabase = document.getElementById('btn-close-supabase');
    const btnSaveSupabase = document.getElementById('btn-save-supabase');
    const btnDisconnectSupabase = document.getElementById('btn-disconnect-supabase');
    const sbUrlInput = document.getElementById('sb-url');
    const sbKeyInput = document.getElementById('sb-key');
    const statusDot = document.getElementById('supabase-status-dot');
    const statusText = document.getElementById('supabase-status-text');

    // Update Supabase Status in UI
    function refreshSupabaseStatus() {
        const creds = getSupabaseCredentials();
        if (creds.url && creds.key && window.auth && window.auth.isSupabaseConnected) {
            if (statusDot) statusDot.classList.add('connected');
            if (statusText) statusText.textContent = 'Supabase: Connected (Cloud DB Live)';
            if (sbUrlInput) sbUrlInput.value = creds.url;
            if (sbKeyInput) sbKeyInput.value = creds.key;
        } else {
            if (statusDot) statusDot.classList.remove('connected');
            if (statusText) statusText.textContent = 'Supabase: Local Mode (Click to Connect)';
        }
    }

    refreshSupabaseStatus();

    // Supabase Modal Events
    if (btnOpenSupabaseModal) {
        btnOpenSupabaseModal.addEventListener('click', () => {
            const creds = getSupabaseCredentials();
            if (sbUrlInput) sbUrlInput.value = creds.url || '';
            if (sbKeyInput) sbKeyInput.value = creds.key || '';
            if (supabaseModal) supabaseModal.classList.add('active');
        });
    }

    if (btnCloseSupabase) {
        btnCloseSupabase.addEventListener('click', () => {
            if (supabaseModal) supabaseModal.classList.remove('active');
        });
    }

    if (supabaseModal) {
        supabaseModal.addEventListener('click', (e) => {
            if (e.target === supabaseModal) supabaseModal.classList.remove('active');
        });
    }

    if (btnSaveSupabase) {
        btnSaveSupabase.addEventListener('click', async () => {
            const url = sbUrlInput.value.trim();
            const key = sbKeyInput.value.trim();

            if (!url || !key) {
                showToast('Please enter both Supabase Project URL and Anon API Key', 'error');
                return;
            }

            if (key.length < 10) {
                showToast('⚠️ Please enter a valid Supabase API Key', 'error');
                return;
            }

            saveSupabaseCredentials(url, key);
            if (window.auth) window.auth.setSupabaseConfig(url, key);

            btnSaveSupabase.textContent = 'Testing connection...';
            btnSaveSupabase.disabled = true;

            const testResult = typeof testSupabaseConnection === 'function' ? await testSupabaseConnection() : { success: window.auth && window.auth.isSupabaseConnected };

            btnSaveSupabase.textContent = 'Save & Test';
            btnSaveSupabase.disabled = false;

            if (testResult.success) {
                showToast('⚡ Successfully connected to Supabase Cloud Database!', 'success');
                refreshSupabaseStatus();
                if (supabaseModal) supabaseModal.classList.remove('active');
            } else {
                showToast(`Connection error: ${testResult.error || 'Check URL and Key'}`, 'error');
            }
        });
    }

    if (btnDisconnectSupabase) {
        btnDisconnectSupabase.addEventListener('click', () => {
            clearSupabaseCredentials();
            window.auth.setSupabaseConfig('', '');
            refreshSupabaseStatus();
            showToast('Disconnected from Supabase. Reverted to Local storage.', 'info');
            if (supabaseModal) supabaseModal.classList.remove('active');
        });
    }


    // Forgot Password Modal
    const forgotModal = document.getElementById('forgot-modal');
    const btnForgotPassword = document.getElementById('btn-forgot-password');
    const btnCloseForgot = document.getElementById('btn-close-forgot');
    const btnSendReset = document.getElementById('btn-send-reset');
    const forgotEmailInput = document.getElementById('forgot-email');

    // Role selector radios
    const roleCards = document.querySelectorAll('.role-card');

    // Social Login Buttons
    const socialButtons = document.querySelectorAll('.btn-social');

    // ---------------- TAB SWITCHING ----------------
    function activateTab(tab) {
        if (tab === 'login') {
            tabLogin.classList.add('active');
            tabRegister.classList.remove('active');
            tabIndicator.style.transform = 'translateX(0)';
            loginContainer.classList.add('active');
            registerContainer.classList.remove('active');
        } else {
            tabRegister.classList.add('active');
            tabLogin.classList.remove('active');
            tabIndicator.style.transform = 'translateX(100%)';
            registerContainer.classList.add('active');
            loginContainer.classList.remove('active');
        }
        clearAllErrors();
    }

    if (tabLogin) tabLogin.addEventListener('click', () => activateTab('login'));
    if (tabRegister) tabRegister.addEventListener('click', () => activateTab('register'));
    if (switchToRegister) switchToRegister.addEventListener('click', () => activateTab('register'));
    if (switchToLogin) switchToLogin.addEventListener('click', () => activateTab('login'));

    // ---------------- ROLE CARDS INTERACTION ----------------
    roleCards.forEach(card => {
        card.addEventListener('click', () => {
            roleCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    // ---------------- PASSWORD TOGGLE ----------------
    document.querySelectorAll('.toggle-password').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetInput = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            
            if (targetInput.type === 'password') {
                targetInput.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                targetInput.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });

    // ---------------- PASSWORD STRENGTH METER ----------------
    if (regPasswordInput) {
        regPasswordInput.addEventListener('input', () => {
            const val = regPasswordInput.value;
            const strength = evaluatePasswordStrength(val);
            updateStrengthMeter(strength);
        });
    }

    function evaluatePasswordStrength(pwd) {
        if (!pwd) return { score: 0, label: 'None', color: 'transparent', width: '0%' };
        let score = 0;
        if (pwd.length >= 8) score += 1;
        if (/[A-Z]/.test(pwd)) score += 1;
        if (/[0-9]/.test(pwd)) score += 1;
        if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

        switch (score) {
            case 1:
                return { score: 1, label: 'Weak', class: 'strength-weak', color: '#ef4444', width: '25%' };
            case 2:
                return { score: 2, label: 'Fair', class: 'strength-fair', color: '#f59e0b', width: '50%' };
            case 3:
                return { score: 3, label: 'Good', class: 'strength-good', color: '#38bdf8', width: '75%' };
            case 4:
                return { score: 4, label: 'Strong', class: 'strength-strong', color: '#10b981', width: '100%' };
            default:
                return { score: 0, label: 'Very Weak', class: 'strength-weak', color: '#ef4444', width: '15%' };
        }
    }

    function updateStrengthMeter(strength) {
        if (!meterFill || !meterScore) return;
        meterFill.style.width = strength.width;
        meterFill.style.backgroundColor = strength.color;
        meterScore.textContent = strength.label;
        meterScore.className = strength.class || 'strength-weak';
    }

    // ---------------- FORM SUBMISSIONS ----------------
    // 1. Sign In
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAllErrors();

            const emailInput = document.getElementById('login-email');
            const passwordInput = document.getElementById('login-password');
            const rememberMe = document.getElementById('remember-me').checked;

            let hasError = false;

            if (!emailInput.value.trim()) {
                setError('login-email', 'Please enter your email or username');
                hasError = true;
            }

            if (!passwordInput.value) {
                setError('login-password', 'Please enter your password');
                hasError = true;
            }

            if (hasError) return;

            // Loading state
            btnSubmitLogin.classList.add('loading');
            btnSubmitLogin.disabled = true;

            try {
                const response = await window.auth.login(emailInput.value, passwordInput.value, rememberMe);
                showToast(`Welcome back, ${response.user.fullName}!`, 'success');
                const dest = window.auth.getRoleRedirectUrl(response.user.role);
                setTimeout(() => {
                    window.location.href = dest;
                }, 900);
            } catch (err) {
                showToast(err.message, 'error');
                setError('login-password', err.message);
            } finally {
                btnSubmitLogin.classList.remove('loading');
                btnSubmitLogin.disabled = false;
            }
        });
    }

    // 2. Register
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearAllErrors();

            const fullname = document.getElementById('reg-fullname').value.trim();
            const phone = document.getElementById('reg-phone').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;
            const confirmPassword = document.getElementById('reg-confirm-password').value;
            const terms = document.getElementById('reg-terms').checked;
            const roleEl = document.querySelector('input[name="user-role"]:checked');
            const role = roleEl ? roleEl.value : 'seeker';

            let hasError = false;

            if (!fullname || fullname.length < 2) {
                setError('reg-fullname', 'Please enter your full name (at least 2 characters)');
                hasError = true;
            }

            if (!email || !isValidEmail(email)) {
                setError('reg-email', 'Please enter a valid email address');
                hasError = true;
            }

            if (!phone) {
                setError('reg-phone', 'Please enter a contact phone number');
                hasError = true;
            }

            if (!password || password.length < 8) {
                setError('reg-password', 'Password must be at least 8 characters long');
                hasError = true;
            }

            if (password !== confirmPassword) {
                setError('reg-confirm-password', 'Passwords do not match');
                hasError = true;
            }

            if (!terms) {
                setError('reg-terms', 'You must agree to the Terms of Service to continue');
                hasError = true;
            }

            if (hasError) return;

            btnSubmitRegister.classList.add('loading');
            btnSubmitRegister.disabled = true;

            try {
                const response = await window.auth.register({
                    fullName: fullname,
                    email: email,
                    phone: phone,
                    password: password,
                    role: role
                });

                showToast(`Account created successfully! Welcome, ${response.user.fullName}`, 'success');
                const dest = window.auth.getRoleRedirectUrl(response.user.role);
                setTimeout(() => {
                    window.location.href = dest;
                }, 1000);
            } catch (err) {
                showToast(err.message, 'error');
                setError('reg-email', err.message);
            } finally {
                btnSubmitRegister.classList.remove('loading');
                btnSubmitRegister.disabled = false;
            }
        });
    }



    // ---------------- SOCIAL LOGINS ----------------
    socialButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const provider = btn.textContent.trim();
            showToast(`Connecting with ${provider}... (Demo Authorization)`, 'info');
            setTimeout(() => {
                // Mock social login user
                const socialUser = {
                    id: 'usr_social_' + Date.now(),
                    fullName: `${provider} User`,
                    email: `user@${provider.toLowerCase()}.com`,
                    role: 'seeker'
                };
                window.auth.createSession(socialUser, true);
                showToast(`Successfully authorized via ${provider}!`, 'success');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 800);
            }, 600);
        });
    });

    // ---------------- FORGOT PASSWORD MODAL ----------------
    if (btnForgotPassword) {
        btnForgotPassword.addEventListener('click', () => {
            forgotModal.classList.add('active');
        });
    }

    if (btnCloseForgot) {
        btnCloseForgot.addEventListener('click', () => {
            forgotModal.classList.remove('active');
            clearError('forgot-email');
        });
    }

    if (forgotModal) {
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) {
                forgotModal.classList.remove('active');
            }
        });
    }

    if (btnSendReset) {
        btnSendReset.addEventListener('click', async () => {
            const email = forgotEmailInput.value.trim();
            if (!email || !isValidEmail(email)) {
                setError('forgot-email', 'Please provide a valid registered email');
                return;
            }

            try {
                const res = await window.auth.resetPassword(email);
                showToast(res.message, 'success');
                forgotModal.classList.remove('active');
                forgotEmailInput.value = '';
            } catch (err) {
                setError('forgot-email', err.message);
            }
        });
    }

    // ---------------- HELPERS & TOASTS ----------------
    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function setError(inputId, message) {
        const errorEl = document.getElementById(`${inputId}-error`);
        if (errorEl) {
            errorEl.textContent = message;
        }
        const inputEl = document.getElementById(inputId);
        if (inputEl) {
            inputEl.style.borderColor = 'var(--danger)';
        }
    }

    function clearError(inputId) {
        const errorEl = document.getElementById(`${inputId}-error`);
        if (errorEl) errorEl.textContent = '';
        const inputEl = document.getElementById(inputId);
        if (inputEl) inputEl.style.borderColor = '';
    }

    function clearAllErrors() {
        document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
        document.querySelectorAll('input').forEach(el => el.style.borderColor = '');
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'error') iconClass = 'fa-solid fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="${iconClass} toast-icon"></i>
            <span class="toast-msg">${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
});

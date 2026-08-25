/**
 * SMART JOB VACANCY FINDER - DUAL AUTHENTICATION ENGINE (SUPABASE + LOCAL FALLBACK)
 */

const AUTH_CONFIG = {
    STORAGE_USERS_KEY: 'smartjob_users_db',
    STORAGE_SESSION_KEY: 'smartjob_active_session',
    STORAGE_REMEMBER_KEY: 'smartjob_remember_user'
};

class AuthService {
    constructor() {
        this.supabaseClient = null;
        this.isSupabaseConnected = false;
        this.initSupabase();
        this.initLocalDatabase();
    }

    /**
     * Initialize Supabase client if valid keys are provided
     */
    initSupabase() {
        try {
            const creds = typeof getSupabaseCredentials === 'function' ? getSupabaseCredentials() : { url: '', key: '' };
            const isConfigured = typeof isSupabaseConfigured === 'function' ? isSupabaseConfigured() : (creds.url && creds.key && creds.key.length >= 10);

            if (creds.url && creds.key && window.supabase && isConfigured) {
                this.supabaseClient = window.supabase.createClient(creds.url, creds.key);
                this.isSupabaseConnected = true;
                console.log("⚡ Supabase Client connected successfully!");
                setTimeout(() => this.syncUsersFromSupabase(), 300);
            } else {
                this.isSupabaseConnected = false;
            }
        } catch (err) {
            console.warn("Supabase initialization failed, running in local mode:", err);
            this.isSupabaseConnected = false;
        }
    }

    /**
     * Updates Supabase credentials dynamically
     */
    setSupabaseConfig(url, key) {
        if (typeof saveSupabaseCredentials === 'function') {
            saveSupabaseCredentials(url, key);
        }
        this.initSupabase();
    }

    /**
     * Initializes local user database (clean production state with no mock/demo accounts)
     */
    initLocalDatabase() {
        const existing = localStorage.getItem(AUTH_CONFIG.STORAGE_USERS_KEY);
        if (!existing) {
            localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify([]));
        } else {
            // Automatically purge legacy demo users if previously cached
            try {
                const users = JSON.parse(existing);
                const filtered = users.filter(u => 
                    u.email !== 'seeker@example.com' && 
                    u.email !== 'recruiter@company.com' && 
                    u.email !== 'admin@smartjob.com' &&
                    !(u.id && String(u.id).startsWith('demo_')) &&
                    u.id !== 'usr_1' && u.id !== 'usr_2' && u.id !== 'usr_3'
                );
                if (filtered.length !== users.length) {
                    localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify(filtered));
                }
            } catch (e) {}
        }

        // Purge any active demo session
        const currentSession = this.getCurrentUser();
        if (currentSession && (
            currentSession.email === 'seeker@example.com' ||
            currentSession.email === 'recruiter@company.com' ||
            currentSession.email === 'admin@smartjob.com' ||
            (currentSession.id && String(currentSession.id).startsWith('demo_'))
        )) {
            this.logout();
        }
    }

    /**
     * Resets the entire local database, users, jobs, applications, and sessions
     */
    resetDatabase() {
        localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify([]));
        localStorage.removeItem(AUTH_CONFIG.STORAGE_SESSION_KEY);
        localStorage.removeItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
        localStorage.removeItem('smartjob_active_user');
        localStorage.setItem('smarthire_jobs', JSON.stringify([]));
        localStorage.setItem('smarthire_applications', JSON.stringify([]));
        localStorage.setItem('smarthire_saved_jobs', JSON.stringify([]));
        localStorage.setItem('smartjob_saved_jobs', JSON.stringify([]));
        localStorage.removeItem('smarthire_seeker_profiles');
        localStorage.setItem('smarthire_chat_db', JSON.stringify({}));
        console.log("🧹 Full database reset completed: All demo users, jobs, applications, and sessions wiped.");
    }

    /**
     * Helper to timeout network calls
     */
    async _withTimeout(promise, ms = 1500) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Network timeout')), ms);
        });
        try {
            return await Promise.race([promise, timeoutPromise]);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Register a new user (Supabase + Local Fail-Safe)
     */
    async register(userData) {
        const { fullName, email, phone, password, role } = userData;
        const normalizedEmail = email.trim().toLowerCase();

        let registeredUser = null;

        // 1. Direct Supabase Cloud Database Insert
        if (this.isSupabaseConnected && this.supabaseClient) {
            try {
                // Try Supabase Auth in parallel
                let authId = null;
                try {
                    const { data: authData, error: authError } = await this._withTimeout(
                        this.supabaseClient.auth.signUp({
                            email: normalizedEmail,
                            password: password,
                            options: {
                                data: {
                                    full_name: fullName.trim(),
                                    phone: phone ? phone.trim() : '',
                                    role: role || 'seeker'
                                }
                            }
                        }),
                        2500
                    );
                    if (!authError && authData?.user?.id) {
                        authId = authData.user.id;
                    }
                } catch (aErr) {
                    console.warn("Supabase auth signUp background notice:", aErr);
                }

                // Deterministic UUID for database row
                const finalUserId = authId || ((typeof toUUID === 'function') ? toUUID(normalizedEmail) : '11111111-2222-4333-8444-' + Date.now().toString(16).padEnd(12, '0').slice(0, 12));

                registeredUser = {
                    id: finalUserId,
                    fullName: fullName.trim(),
                    email: normalizedEmail,
                    phone: phone ? phone.trim() : '',
                    role: role || 'seeker'
                };

                // Direct insert to Supabase 'users' table
                const { data: dbData, error: dbErr } = await this.supabaseClient.from('users').upsert({
                    user_id: finalUserId,
                    name: registeredUser.fullName,
                    email: registeredUser.email,
                    password_hash: this._hash(password),
                    role: registeredUser.role,
                    status: 'active'
                }).select();

                if (dbErr) {
                    console.error("❌ Supabase 'users' table insert error:", dbErr.message || dbErr);
                    if (typeof showToast === 'function') {
                        showToast(`⚠️ Supabase Cloud DB: ${dbErr.message || 'Key unauthorized'}`, 'error');
                    }
                } else {
                    console.log("⚡ User stored in Supabase 'users' table!", dbData);
                }

                // Also populate job_seekers or companies table
                if (registeredUser.role === 'seeker') {
                    await this.supabaseClient.from('job_seekers').upsert({
                        user_id: finalUserId,
                        full_name: registeredUser.fullName,
                        email: registeredUser.email,
                        education: 'Bachelor Degree',
                        skills: ['General', 'Communication'],
                        experience_years: 'Fresher'
                    });
                } else if (registeredUser.role === 'employer') {
                    await this.supabaseClient.from('companies').upsert({
                        user_id: finalUserId,
                        company_name: registeredUser.fullName + ' Inc',
                        contact_phone: phone || '',
                        status: 'approved'
                    });
                }
            } catch (sbErr) {
                console.warn("Supabase registration process notice:", sbErr);
            }
        }

        // 2. Always persist in local database for seamless offline & backup login
        const users = this._getLocalUsers();
        const existingIdx = users.findIndex(u => u.email.toLowerCase() === normalizedEmail);

        const localUserObj = registeredUser || {
            id: 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            fullName: fullName.trim(),
            email: normalizedEmail,
            phone: phone ? phone.trim() : '',
            password: this._hash(password),
            role: role || 'seeker',
            createdAt: new Date().toISOString()
        };

        if (existingIdx >= 0) {
            users[existingIdx] = localUserObj;
        } else {
            users.push(localUserObj);
        }

        localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify(users));

        // Create active session
        this.createSession(localUserObj, true);

        return { 
            success: true, 
            user: this._sanitizeUser(localUserObj),
            message: `Account created successfully! Welcome, ${localUserObj.fullName}`
        };
    }

    /**
     * Login user (Production Authentication via Supabase / Local Database)
     */
    async login(emailOrUser, password, rememberMe = false) {
        const query = emailOrUser.trim().toLowerCase();

        // 1. Try Supabase Auth with strict 1.5s timeout
        if (this.isSupabaseConnected && this.supabaseClient) {
            try {
                const { data, error } = await this._withTimeout(
                    this.supabaseClient.auth.signInWithPassword({
                        email: query,
                        password: password
                    }),
                    1500
                );

                if (!error && data?.user) {
                    const metadata = data.user.user_metadata || {};
                    const user = {
                        id: data.user.id,
                        fullName: metadata.full_name || data.user.email.split('@')[0],
                        email: data.user.email,
                        phone: metadata.phone || '',
                        role: metadata.role || 'seeker'
                    };

                    this.createSession(user, rememberMe);
                    return { success: true, user };
                }
            } catch (sbErr) {
                console.log("Supabase signIn skipped to local fallback:", sbErr);
            }
        }

        // 2. Local Database Check
        const users = this._getLocalUsers();
        const user = users.find(u => 
            u.email.toLowerCase() === query || 
            (u.username && u.username.toLowerCase() === query)
        );

        if (user) {
            // Check if user is blocked/suspended
            if (user.status === 'blocked' || user.isBlocked === true) {
                throw new Error('This account has been suspended by the system administrator. Please contact support.');
            }

            const isHashedMatch = user.password === this._hash(password);
            
            if (isHashedMatch) {
                this.createSession(user, rememberMe);
                return { success: true, user: this._sanitizeUser(user) };
            } else {
                throw new Error('Incorrect password. Please check your password or try again.');
            }
        }

        // If account is not found in database or Supabase Auth
        throw new Error('Account not found. Please register first to create an account.');
    }

    /**
     * Social OAuth Login with Supabase
     */
    async loginWithOAuth(provider) {
        if (this.isSupabaseConnected && this.supabaseClient) {
            const { error } = await this.supabaseClient.auth.signInWithOAuth({
                provider: provider.toLowerCase(),
                options: {
                    redirectTo: window.location.origin + '/dashboard.html'
                }
            });
            if (error) throw new Error(error.message);
            return;
        }

        // Mock OAuth fallback
        const mockUser = {
            id: 'usr_oauth_' + Date.now(),
            fullName: `${provider} Demo User`,
            email: `demo_user@${provider.toLowerCase()}.com`,
            role: 'seeker'
        };
        this.createSession(mockUser, true);
        return mockUser;
    }

    /**
     * Reset Password
     */
    async resetPassword(email) {
        const normalized = email.trim().toLowerCase();

        if (this.isSupabaseConnected && this.supabaseClient) {
            const { error } = await this.supabaseClient.auth.resetPasswordForEmail(normalized, {
                redirectTo: window.location.origin + '/index.html'
            });
            if (error) throw new Error(error.message);
            return { success: true, message: `Password reset link sent by Supabase to ${normalized}` };
        }

        await this._delay(300);
        const users = this._getLocalUsers();
        const user = users.find(u => u.email.toLowerCase() === normalized);
        if (!user) {
            throw new Error('No account found matching this email address.');
        }
        return { success: true, message: `Password reset instructions sent to ${normalized}` };
    }

    /**
     * Session Storage & Checkers
     */
    createSession(user, rememberMe = false) {
        const sessionPayload = {
            user: this._sanitizeUser(user),
            token: 'jwt_' + Math.random().toString(36).substr(2) + Date.now(),
            loginTime: new Date().toISOString(),
            rememberMe: rememberMe
        };

        const serialized = JSON.stringify(sessionPayload);
        sessionStorage.setItem(AUTH_CONFIG.STORAGE_SESSION_KEY, serialized);

        if (rememberMe) {
            localStorage.setItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY, serialized);
        } else {
            localStorage.removeItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
        }
    }

    /**
     * Get redirect destination URL based on user role
     */
    getRoleRedirectUrl(role) {
        if (role === 'employer') return 'company-dashboard.html';
        if (role === 'admin') return 'admin-dashboard.html';
        return 'seeker-dashboard.html';
    }

    getCurrentUser() {
        try {
            let session = sessionStorage.getItem(AUTH_CONFIG.STORAGE_SESSION_KEY);
            if (!session) {
                session = localStorage.getItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
                if (session) {
                    sessionStorage.setItem(AUTH_CONFIG.STORAGE_SESSION_KEY, session);
                }
            }
            return session ? JSON.parse(session).user : null;
        } catch (e) {
            return null;
        }
    }

    async logout() {
        if (this.isSupabaseConnected && this.supabaseClient) {
            try {
                await this._withTimeout(this.supabaseClient.auth.signOut(), 800);
            } catch (e) {
                console.warn("Supabase signOut notice (proceeding with local logout):", e);
            }
        }
        sessionStorage.removeItem(AUTH_CONFIG.STORAGE_SESSION_KEY);
        localStorage.removeItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
        localStorage.removeItem('smartjob_active_user');
        window.location.replace('index.html');
    }

    /**
     * Synchronize users from Supabase cloud database to local storage
     */
    async syncUsersFromSupabase() {
        if (!this.isSupabaseConnected || !this.supabaseClient) return this._getLocalUsers();
        try {
            const { data, error } = await this.supabaseClient.from('users').select('*').order('created_at', { ascending: false });
            if (!error && Array.isArray(data)) {
                const cloudUsers = data.map(u => ({
                    id: u.user_id,
                    fullName: u.name,
                    email: u.email,
                    password: u.password_hash,
                    role: u.role || 'seeker',
                    status: u.status || 'active',
                    isBlocked: u.status === 'blocked',
                    createdAt: u.created_at
                }));

                const localUsers = this._getLocalUsers();
                const mergedMap = new Map();
                cloudUsers.forEach(u => mergedMap.set(u.email.toLowerCase(), u));
                localUsers.forEach(u => {
                    if (!mergedMap.has(u.email.toLowerCase())) {
                        mergedMap.set(u.email.toLowerCase(), u);
                    }
                });

                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify(mergedList));
                return mergedList;
            }
        } catch (e) {
            console.warn("Supabase users sync notice:", e);
        }
        return this._getLocalUsers();
    }

    /**
     * Retrieve all registered users from Supabase with fallback to local store
     */
    async getAllUsers() {
        return await this.syncUsersFromSupabase();
    }

    /**
     * Block or Unblock a user account by email
     */
    async toggleBlockUser(email) {
        const normalized = email.trim().toLowerCase();
        const users = this._getLocalUsers();
        const idx = users.findIndex(u => u.email.toLowerCase() === normalized);
        let newStatus = 'blocked';

        if (idx >= 0) {
            newStatus = users[idx].status === 'blocked' ? 'active' : 'blocked';
            users[idx].status = newStatus;
            users[idx].isBlocked = (newStatus === 'blocked');
            localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify(users));
        }

        // Also update Supabase cloud
        if (this.isSupabaseConnected && this.supabaseClient) {
            try {
                await this.supabaseClient
                    .from('users')
                    .update({ status: newStatus })
                    .eq('email', normalized);
            } catch (e) {
                console.warn("Supabase toggle block notice:", e);
            }
        }

        return { success: true, email: normalized, status: newStatus, isBlocked: newStatus === 'blocked' };
    }

    /**
     * Delete user account by email
     */
    async deleteUser(email) {
        const normalized = email.trim().toLowerCase();
        let users = this._getLocalUsers();
        users = users.filter(u => u.email.toLowerCase() !== normalized);
        localStorage.setItem(AUTH_CONFIG.STORAGE_USERS_KEY, JSON.stringify(users));

        if (this.isSupabaseConnected && this.supabaseClient) {
            try {
                await this.supabaseClient
                    .from('users')
                    .delete()
                    .eq('email', normalized);
            } catch (e) {
                console.warn("Supabase delete user notice:", e);
            }
        }

        return { success: true, email: normalized };
    }

    // Helpers
    _getLocalUsers() {
        try {
            return JSON.parse(localStorage.getItem(AUTH_CONFIG.STORAGE_USERS_KEY)) || [];
        } catch (e) {
            return [];
        }
    }

    _sanitizeUser(user) {
        const { password, ...safeUser } = user;
        return safeUser;
    }

    _hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return 'h_' + Math.abs(hash).toString(16) + '_sec';
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Instantiate global auth instance
window.auth = new AuthService();

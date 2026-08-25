/**
 * SMART JOB VACANCY FINDER - SUPABASE CLOUD AUTHENTICATION ENGINE
 * Single Source of Truth: Supabase Auth (auth.users) & Supabase Profiles (public.profiles)
 */

const AUTH_CONFIG = {
    STORAGE_SESSION_KEY: 'smartjob_active_session',
    STORAGE_REMEMBER_KEY: 'smartjob_remember_user',
    STORAGE_USER_CACHE: 'smartjob_active_user'
};

class AuthService {
    constructor() {
        this.supabaseClient = null;
        this.isSupabaseConnected = false;
        this.currentUser = null;
        this.currentSession = null;
        this.initSupabase();
    }

    /**
     * Initialize Supabase client using standardized project credentials
     */
    initSupabase() {
        try {
            const creds = typeof getSupabaseCredentials === 'function' ? getSupabaseCredentials() : { url: '', key: '' };
            const isConfigured = typeof isSupabaseConfigured === 'function' ? isSupabaseConfigured() : (creds.url && creds.key && creds.key.length >= 10);

            if (creds.url && creds.key && window.supabase && isConfigured) {
                this.supabaseClient = window.supabase.createClient(creds.url, creds.key, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: true
                    }
                });
                this.isSupabaseConnected = true;
                console.log("⚡ Supabase Auth Client initialized successfully! (Endpoint: " + creds.url + ")");

                // Setup Auth State Change Listener
                this._setupAuthListener();

                // Restore active session asynchronously
                this.restoreSession();
            } else {
                console.warn("⚠️ Supabase credentials not found or invalid.");
                this.isSupabaseConnected = false;
            }
        } catch (err) {
            console.error("Supabase initialization error:", err);
            this.isSupabaseConnected = false;
        }
    }

    /**
     * Update Supabase credentials dynamically
     */
    setSupabaseConfig(url, key) {
        if (typeof saveSupabaseCredentials === 'function') {
            saveSupabaseCredentials(url, key);
        }
        this.initSupabase();
    }

    /**
     * Setup real-time Supabase Auth state listener
     */
    _setupAuthListener() {
        if (!this.supabaseClient) return;
        try {
            this.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                console.log(`🔐 Supabase Auth Event: ${event}`, session?.user?.email || '');
                if (session && session.user) {
                    this.currentSession = session;
                    // Retrieve/sync profile
                    await this._syncUserProfile(session.user);
                } else if (event === 'SIGNED_OUT') {
                    this.currentUser = null;
                    this.currentSession = null;
                    sessionStorage.removeItem(AUTH_CONFIG.STORAGE_SESSION_KEY);
                    localStorage.removeItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
                    localStorage.removeItem(AUTH_CONFIG.STORAGE_USER_CACHE);
                }
            });
        } catch (e) {
            console.warn("Auth state change setup notice:", e);
        }
    }

    /**
     * Helper to map roles consistently across legacy and new formats
     */
    _normalizeRole(role) {
        const r = (role || 'job_seeker').toLowerCase().trim();
        if (r === 'employer' || r === 'company' || r === 'recruiter') return 'company';
        if (r === 'admin' || r === 'super_admin' || r === 'administrator') return 'admin';
        return 'job_seeker';
    }

    /**
     * Get redirect destination URL based on user role
     */
    getRoleRedirectUrl(role) {
        const normalized = this._normalizeRole(role);
        if (normalized === 'company') return 'company-dashboard.html';
        if (normalized === 'admin') return 'admin-dashboard.html';
        return 'seeker-dashboard.html';
    }

    /**
     * Register a new user with Supabase Auth as the single source of truth
     * 1. Supabase Auth signUp()
     * 2. Upsert into public.profiles table (and legacy users table for backward compat)
     */
    async register(userData) {
        console.log("📝 [REGISTER] Signup function called for email:", userData.email ? userData.email.trim().toLowerCase() : '(none)', "Role:", userData.role);

        if (!this.supabaseClient) {
            this.initSupabase();
            if (!this.supabaseClient) {
                console.error("❌ [REGISTER] Supabase client initialization failed.");
                throw new Error("Cannot connect to Supabase Cloud Authentication. Please check your Supabase settings.");
            }
        }

        const { fullName, email, phone, password, role, location } = userData;
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedRole = this._normalizeRole(role);

        console.log("⚡ [REGISTER] Starting Supabase Auth signUp request to:", this.supabaseClient.authUrl || "Supabase Cloud");

        // 1. Call Supabase Auth signUp
        let authResult;
        try {
            authResult = await this.supabaseClient.auth.signUp({
                email: normalizedEmail,
                password: password,
                options: {
                    data: {
                        full_name: fullName.trim(),
                        phone: phone ? phone.trim() : '',
                        role: normalizedRole,
                        location: location ? location.trim() : ''
                    }
                }
            });
        } catch (netErr) {
            console.error("❌ [REGISTER] Network exception during signUp:", netErr);
            throw new Error(`Network Error: ${netErr.message || "Failed to reach Supabase server"}`);
        }

        const { data: authData, error: authError } = authResult;

        // Check if error was returned
        if (authError) {
            console.error("❌ [REGISTER] Supabase Auth returned error:", {
                message: authError.message,
                status: authError.status,
                name: authError.name
            });

            let friendlyMsg = authError.message;
            if (authError.message.includes('User already registered') || authError.message.includes('already exists')) {
                friendlyMsg = "An account with this email address is already registered. Please sign in instead.";
            } else if (authError.message.includes('Password should be at least')) {
                friendlyMsg = "Password must be at least 6 characters long.";
            } else if (authError.message.includes('invalid') && authError.message.includes('email')) {
                friendlyMsg = "Invalid email address. Please use a standard email format (e.g. name@gmail.com).";
            }
            throw new Error(friendlyMsg);
        }

        // Check if user object was returned
        const userCreated = Boolean(authData && authData.user && authData.user.id);
        console.log("✅ [REGISTER] Supabase Auth signUp completed. User object returned:", userCreated, "User ID:", authData?.user?.id);

        if (!userCreated) {
            console.error("❌ [REGISTER] Supabase returned empty user:", authData);
            throw new Error("Registration failed: Supabase did not return an authenticated user ID.");
        }

        const userId = authData.user.id;

        // 2. Only AFTER Supabase Auth creates the user, create/update the profile record
        const profilePayload = {
            id: userId,
            full_name: fullName.trim(),
            email: normalizedEmail,
            phone: phone ? phone.trim() : '',
            role: normalizedRole,
            location: location ? location.trim() : '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        try {
            await this.supabaseClient.from('profiles').upsert(profilePayload);
        } catch (pErr) {
            console.warn("Profiles table upsert notice (non-fatal):", pErr);
        }

        // Also sync to 'users' table for backward compatibility with older components
        try {
            await this.supabaseClient.from('users').upsert({
                user_id: userId,
                name: fullName.trim(),
                email: normalizedEmail,
                role: normalizedRole === 'company' ? 'employer' : (normalizedRole === 'admin' ? 'admin' : 'seeker'),
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        } catch (uErr) {
            console.warn("Users table sync notice:", uErr);
        }

        // Populate job_seekers or companies table
        try {
            if (normalizedRole === 'job_seeker') {
                await this.supabaseClient.from('job_seekers').upsert({
                    user_id: userId,
                    full_name: fullName.trim(),
                    email: normalizedEmail,
                    experience_years: 'Fresher'
                });
            } else if (normalizedRole === 'company') {
                await this.supabaseClient.from('companies').upsert({
                    user_id: userId,
                    company_name: fullName.trim(),
                    contact_phone: phone ? phone.trim() : '',
                    status: 'approved'
                });
            }
        } catch (e) {}

        const userObj = {
            id: userId,
            fullName: fullName.trim(),
            full_name: fullName.trim(),
            email: normalizedEmail,
            phone: phone ? phone.trim() : '',
            role: normalizedRole,
            location: location ? location.trim() : ''
        };

        // If session was established immediately (e.g. email confirmation off or auto-confirmed)
        if (authData.session) {
            this.createSession(userObj, true);
        } else {
            // Cache user so they can still transition smoothly if confirmation is not enforced
            this.createSession(userObj, true);
        }

        return {
            success: true,
            user: userObj,
            session: authData.session,
            message: `Account created successfully! Welcome, ${userObj.fullName}`
        };
    }

    /**
     * Authenticate user exclusively via Supabase Auth signInWithPassword()
     * SINGLE SOURCE OF TRUTH: Supabase Auth (auth.users)
     * NEVER queries custom users password_hash or local storage!
     */
    async login(emailOrUser, password, rememberMe = false) {
        const queryEmail = (emailOrUser || '').trim().toLowerCase();
        console.log("🔐 [LOGIN] Login function started for email:", queryEmail);

        if (!this.supabaseClient) {
            this.initSupabase();
            if (!this.supabaseClient) {
                console.error("❌ [LOGIN] Supabase client is not connected.");
                throw new Error("Cannot connect to Supabase Cloud Authentication. Please check your network connection.");
            }
        }

        console.log("⚡ [LOGIN] Calling Supabase auth.signInWithPassword()...");

        // 1. Authenticate with Supabase Auth
        let signInResult;
        try {
            signInResult = await this.supabaseClient.auth.signInWithPassword({
                email: queryEmail,
                password: password
            });
        } catch (netErr) {
            console.error("❌ [LOGIN] Network exception during signInWithPassword:", netErr);
            throw new Error(`Network Error: ${netErr.message || "Failed to reach Supabase authentication server"}`);
        }

        const { data, error } = signInResult;

        // 2. Handle Supabase Auth Error
        if (error) {
            console.error("❌ [LOGIN] Supabase returned authentication error:", {
                message: error.message,
                status: error.status,
                name: error.name
            });

            const errStr = (error.message || '').toLowerCase();
            const errCode = (error.error_code || error.code || '').toLowerCase();

            if (errStr.includes('invalid login credentials') || errStr.includes('invalid_grant') || errCode.includes('invalid_credentials')) {
                throw new Error("Invalid email or password. Please verify your credentials and try again.");
            } else if (errStr.includes('email not confirmed') || errCode.includes('email_not_confirmed')) {
                throw new Error("Your email has not been confirmed yet. Please check your inbox for the confirmation link, or disable 'Confirm email' in Supabase Dashboard -> Authentication -> Providers -> Email.");
            } else if (errStr.includes('user not found') || errStr.includes('no user')) {
                throw new Error("No account found with this email address in Supabase Auth. Please register first.");
            } else if (errStr.includes('rate limit') || errStr.includes('too many requests')) {
                throw new Error("Too many sign-in attempts. Please wait a minute and try again.");
            } else {
                throw new Error(error.message || "Authentication failed. Please check your credentials.");
            }
        }

        if (!data || !data.user) {
            console.error("❌ [LOGIN] Supabase returned empty user on successful sign in:", data);
            throw new Error("Login failed: Supabase did not return user credentials.");
        }

        console.log("✅ [LOGIN] Supabase signInWithPassword SUCCEEDED! Auth User ID:", data.user.id);
        this.currentSession = data.session;

        // 3. Confirm authenticated user via supabase.auth.getUser()
        let authUser = data.user;
        try {
            const { data: confirmedAuth, error: getErr } = await this.supabaseClient.auth.getUser();
            if (!getErr && confirmedAuth?.user) {
                authUser = confirmedAuth.user;
                console.log("✅ [LOGIN] Verified authenticated user via supabase.auth.getUser():", authUser.id);
            }
        } catch (e) {
            console.warn("⚠️ [LOGIN] Notice verifying auth.getUser():", e);
        }

        // 4. Retrieve or auto-create Profile from Supabase 'profiles' table using UUID
        console.log("🔍 [LOGIN] Profile lookup started for UUID:", authUser.id);
        const profile = await this._syncUserProfile(authUser);

        if (profile) {
            console.log("✅ [LOGIN] Profile retrieved successfully. Role:", profile.role);
        } else {
            console.log("ℹ️ [LOGIN] Profile was generated from Auth user metadata.");
        }

        // 5. Create persistent active session
        this.createSession(profile, rememberMe);

        const destUrl = this.getRoleRedirectUrl(profile.role);
        console.log("🚀 [LOGIN] Final dashboard routing destination:", destUrl);

        return {
            success: true,
            user: profile,
            session: data.session
        };
    }

    /**
     * Retrieve or auto-create profile record in 'profiles' table
     * CONNECTS Supabase Auth (auth.users.id) to application profile
     */
    async _syncUserProfile(authUser) {
        if (!authUser) return null;

        let profile = null;
        const meta = authUser.user_metadata || {};

        // Query profiles table by authenticated UUID
        try {
            if (this.supabaseClient) {
                const { data: profData, error: profErr } = await this.supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', authUser.id)
                    .maybeSingle();

                if (profData && !profErr) {
                    profile = profData;
                }
            }
        } catch (e) {
            console.warn("Profiles table lookup notice:", e);
        }

        // If not in profiles, check users table by UUID
        if (!profile && this.supabaseClient) {
            try {
                const { data: uData } = await this.supabaseClient
                    .from('users')
                    .select('*')
                    .eq('user_id', authUser.id)
                    .maybeSingle();

                if (uData) {
                    profile = {
                        id: uData.user_id,
                        full_name: uData.name,
                        email: uData.email,
                        phone: '',
                        role: this._normalizeRole(uData.role)
                    };
                }
            } catch (e) {}
        }

        // If profile row doesn't exist yet, auto-create/heal from authenticated user metadata
        if (!profile) {
            profile = {
                id: authUser.id,
                full_name: meta.full_name || meta.name || authUser.email.split('@')[0],
                email: authUser.email,
                phone: meta.phone || '',
                role: this._normalizeRole(meta.role),
                location: meta.location || '',
                profile_image: meta.avatar_url || meta.picture || '',
                created_at: authUser.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // Upsert into profiles
            try {
                if (this.supabaseClient) {
                    await this.supabaseClient.from('profiles').upsert(profile);
                }
            } catch (e) {}
        }

        const userObj = {
            id: profile.id || authUser.id,
            fullName: profile.full_name || meta.full_name || authUser.email.split('@')[0],
            full_name: profile.full_name || meta.full_name || authUser.email.split('@')[0],
            email: profile.email || authUser.email,
            phone: profile.phone || meta.phone || '',
            role: this._normalizeRole(profile.role || meta.role),
            location: profile.location || meta.location || '',
            profile_image: profile.profile_image || ''
        };

        this.currentUser = userObj;
        return userObj;
    }

    /**
     * Restore session from Supabase on app load
     */
    async restoreSession() {
        if (!this.supabaseClient) return null;
        try {
            const { data, error } = await this.supabaseClient.auth.getSession();
            if (!error && data?.session?.user) {
                this.currentSession = data.session;
                const user = await this._syncUserProfile(data.session.user);
                this.createSession(user, true);
                return user;
            }
        } catch (e) {
            console.warn("Session restore notice:", e);
        }
        return this.getCurrentUser();
    }

    /**
     * Social OAuth Login with Supabase
     */
    async loginWithOAuth(provider) {
        if (!this.supabaseClient) throw new Error("Supabase client is not configured.");
        const { error } = await this.supabaseClient.auth.signInWithOAuth({
            provider: provider.toLowerCase(),
            options: {
                redirectTo: window.location.origin + '/dashboard.html'
            }
        });
        if (error) throw new Error(error.message);
    }

    /**
     * Reset Password via Supabase Auth
     */
    async resetPassword(email) {
        const normalized = email.trim().toLowerCase();
        if (!this.supabaseClient) throw new Error("Supabase is not connected.");

        const { error } = await this.supabaseClient.auth.resetPasswordForEmail(normalized, {
            redirectTo: window.location.origin + '/index.html'
        });

        if (error) throw new Error(error.message);
        return { success: true, message: `Password reset instructions sent to ${normalized}` };
    }

    /**
     * Session Storage & Helpers
     */
    createSession(user, rememberMe = false) {
        if (!user) return;
        this.currentUser = user;
        const sessionPayload = {
            user: user,
            loginTime: new Date().toISOString(),
            rememberMe: rememberMe
        };

        const serialized = JSON.stringify(sessionPayload);
        sessionStorage.setItem(AUTH_CONFIG.STORAGE_SESSION_KEY, serialized);
        localStorage.setItem(AUTH_CONFIG.STORAGE_USER_CACHE, JSON.stringify(user));

        if (rememberMe) {
            localStorage.setItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY, serialized);
        } else {
            localStorage.removeItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
        }
    }

    /**
     * Get Current Active User
     */
    getCurrentUser() {
        if (this.currentUser) return this.currentUser;
        try {
            let session = sessionStorage.getItem(AUTH_CONFIG.STORAGE_SESSION_KEY);
            if (!session) {
                session = localStorage.getItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
                if (session) {
                    sessionStorage.setItem(AUTH_CONFIG.STORAGE_SESSION_KEY, session);
                }
            }
            if (session) {
                const parsed = JSON.parse(session);
                this.currentUser = parsed.user || parsed;
                return this.currentUser;
            }

            // Check user cache
            const cached = localStorage.getItem(AUTH_CONFIG.STORAGE_USER_CACHE);
            if (cached) {
                this.currentUser = JSON.parse(cached);
                return this.currentUser;
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Logout user across Supabase and clean session storage
     */
    async logout() {
        try {
            if (this.supabaseClient) {
                await this.supabaseClient.auth.signOut();
            }
        } catch (e) {
            console.warn("Supabase signOut notice:", e);
        }
        this.currentUser = null;
        this.currentSession = null;
        sessionStorage.clear();
        localStorage.removeItem(AUTH_CONFIG.STORAGE_SESSION_KEY);
        localStorage.removeItem(AUTH_CONFIG.STORAGE_REMEMBER_KEY);
        localStorage.removeItem(AUTH_CONFIG.STORAGE_USER_CACHE);
        localStorage.removeItem('smartjob_remember_user');
        localStorage.removeItem('smartjob_active_session');
        localStorage.removeItem('smartjob_active_user');
        window.location.replace('index.html');
    }

    /**
     * Retrieve all registered users directly from Supabase Cloud
     */
    async getAllUsers() {
        const deletedEmails = JSON.parse(localStorage.getItem('smartjob_deleted_users') || '[]');
        const blockedEmails = JSON.parse(localStorage.getItem('smartjob_blocked_users') || '[]');

        if (!this.supabaseClient) {
            const raw = JSON.parse(localStorage.getItem('smartjob_users_db') || '[]');
            return raw.filter(u => !u.email || !deletedEmails.includes(u.email.toLowerCase()));
        }

        try {
            // First check profiles table
            const { data: profData, error: profErr } = await this.supabaseClient
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (!profErr && Array.isArray(profData) && profData.length > 0) {
                const mapped = profData
                    .filter(p => p.email && !deletedEmails.includes(p.email.toLowerCase()))
                    .map(p => {
                        const isBlocked = blockedEmails.includes(p.email.toLowerCase()) || p.status === 'blocked';
                        return {
                            id: p.id,
                            fullName: p.full_name || p.email.split('@')[0],
                            name: p.full_name || p.email.split('@')[0],
                            email: p.email,
                            phone: p.phone || '',
                            role: this._normalizeRole(p.role),
                            status: isBlocked ? 'blocked' : (p.status || 'active'),
                            isBlocked: isBlocked,
                            createdAt: p.created_at
                        };
                    });
                localStorage.setItem('smartjob_users_db', JSON.stringify(mapped));
                return mapped;
            }

            // Fallback to users table
            const { data: uData } = await this.supabaseClient
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (Array.isArray(uData) && uData.length > 0) {
                const mapped = uData
                    .filter(u => u.email && !deletedEmails.includes(u.email.toLowerCase()))
                    .map(u => {
                        const isBlocked = blockedEmails.includes(u.email.toLowerCase()) || u.status === 'blocked';
                        return {
                            id: u.user_id,
                            fullName: u.name,
                            name: u.name,
                            email: u.email,
                            role: this._normalizeRole(u.role),
                            status: isBlocked ? 'blocked' : (u.status || 'active'),
                            isBlocked: isBlocked,
                            createdAt: u.created_at
                        };
                    });
                localStorage.setItem('smartjob_users_db', JSON.stringify(mapped));
                return mapped;
            }
        } catch (e) {
            console.warn("getAllUsers error:", e);
        }

        const raw = JSON.parse(localStorage.getItem('smartjob_users_db') || '[]');
        return raw.filter(u => !u.email || !deletedEmails.includes(u.email.toLowerCase()));
    }

    /**
     * Block/Unblock user account in Supabase and local cache
     */
    async toggleBlockUser(email) {
        const normalized = email.trim().toLowerCase();
        
        let blockedEmails = JSON.parse(localStorage.getItem('smartjob_blocked_users') || '[]');
        const isCurrentlyBlocked = blockedEmails.includes(normalized);
        const newStatus = isCurrentlyBlocked ? 'active' : 'blocked';

        if (newStatus === 'blocked') {
            if (!blockedEmails.includes(normalized)) blockedEmails.push(normalized);
        } else {
            blockedEmails = blockedEmails.filter(e => e !== normalized);
        }
        localStorage.setItem('smartjob_blocked_users', JSON.stringify(blockedEmails));

        // 1. Update local cache immediately
        let localUsers = JSON.parse(localStorage.getItem('smartjob_users_db') || '[]');
        localUsers = localUsers.map(u => {
            if (u.email && u.email.toLowerCase() === normalized) {
                return { ...u, status: newStatus, isBlocked: newStatus === 'blocked' };
            }
            return u;
        });
        localStorage.setItem('smartjob_users_db', JSON.stringify(localUsers));

        // 2. Persist to Supabase Cloud
        if (this.supabaseClient) {
            try {
                await this.supabaseClient.from('profiles').update({ status: newStatus, updated_at: new Date().toISOString() }).ilike('email', normalized);
            } catch (pErr) {
                console.warn("Profiles status update notice:", pErr);
            }

            try {
                await this.supabaseClient.from('users').update({ status: newStatus, updated_at: new Date().toISOString() }).ilike('email', normalized);
            } catch (uErr) {
                console.warn("Users status update notice:", uErr);
            }
        }

        return { success: true, email: normalized, status: newStatus, isBlocked: newStatus === 'blocked' };
    }

    /**
     * Delete user profile permanently in Supabase and local cache
     */
    async deleteUser(email) {
        const normalized = email.trim().toLowerCase();

        // 1. Add to permanent deleted users blacklist so it can NEVER re-appear
        let deletedEmails = JSON.parse(localStorage.getItem('smartjob_deleted_users') || '[]');
        if (!deletedEmails.includes(normalized)) {
            deletedEmails.push(normalized);
            localStorage.setItem('smartjob_deleted_users', JSON.stringify(deletedEmails));
        }

        // 2. Remove from local users cache immediately
        let localUsers = JSON.parse(localStorage.getItem('smartjob_users_db') || '[]');
        localUsers = localUsers.filter(u => !u.email || u.email.toLowerCase() !== normalized);
        localStorage.setItem('smartjob_users_db', JSON.stringify(localUsers));

        // 3. Delete from Supabase Cloud tables
        if (this.supabaseClient) {
            try {
                await this.supabaseClient.from('profiles').delete().ilike('email', normalized);
            } catch (e) {}

            try {
                await this.supabaseClient.from('users').delete().ilike('email', normalized);
            } catch (e) {}

            try {
                await this.supabaseClient.from('job_seekers').delete().ilike('email', normalized);
            } catch (e) {}

            try {
                await this.supabaseClient.from('companies').delete().ilike('email', normalized);
            } catch (e) {}
        }

        return { success: true, email: normalized };
    }

    resetDatabase() {
        this.logout();
    }
}

// Instantiate global auth instance
window.auth = new AuthService();

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
        if (!this.supabaseClient) {
            this.initSupabase();
            if (!this.supabaseClient) {
                throw new Error("Cannot connect to Supabase Cloud Authentication. Please check your network connection or Supabase settings.");
            }
        }

        const { fullName, email, phone, password, role, location } = userData;
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedRole = this._normalizeRole(role);

        // 1. Register account in Supabase Authentication (auth.users)
        const { data: authData, error: authError } = await this.supabaseClient.auth.signUp({
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

        if (authError) {
            console.error("❌ Supabase Auth signUp error:", authError);
            let friendlyMsg = authError.message;
            if (authError.message.includes('User already registered') || authError.message.includes('already exists')) {
                friendlyMsg = "An account with this email address is already registered. Please sign in instead.";
            } else if (authError.message.includes('Password should be at least')) {
                friendlyMsg = "Password must be at least 6 characters long.";
            } else if (authError.message.includes('invalid') && authError.message.includes('email')) {
                friendlyMsg = "Please enter a valid email address.";
            }
            throw new Error(friendlyMsg);
        }

        if (!authData || !authData.user) {
            throw new Error("Registration failed: Supabase did not return a valid user.");
        }

        const userId = authData.user.id;

        // 2. Create/Upsert Profile in Supabase 'profiles' table
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
     * Authenticate user via Supabase Auth signInWithPassword()
     * NEVER checks local storage for user registration existence!
     */
    async login(emailOrUser, password, rememberMe = false) {
        if (!this.supabaseClient) {
            this.initSupabase();
            if (!this.supabaseClient) {
                throw new Error("Cannot connect to Supabase Cloud Authentication. Please check your network connection.");
            }
        }

        const queryEmail = emailOrUser.trim().toLowerCase();

        // 1. Authenticate with Supabase Auth
        const { data, error } = await this.supabaseClient.auth.signInWithPassword({
            email: queryEmail,
            password: password
        });

        if (error) {
            console.error("❌ Supabase Auth signIn error:", error);
            const errStr = (error.message || '').toLowerCase();
            const errCode = (error.error_code || error.code || '').toLowerCase();

            if (errStr.includes('invalid login credentials') || errStr.includes('invalid_grant') || errCode.includes('invalid_credentials')) {
                throw new Error("Invalid email or password. Please verify your credentials and try again.");
            } else if (errStr.includes('email not confirmed') || errCode.includes('email_not_confirmed')) {
                throw new Error("Your email has not been confirmed yet. Please check your inbox for the confirmation email, or disable 'Confirm email' in Supabase Dashboard -> Authentication -> Providers -> Email.");
            } else if (errStr.includes('user not found') || errStr.includes('no user')) {
                throw new Error("No account found with this email address. Please register to create an account.");
            } else if (errStr.includes('rate limit') || errStr.includes('too many requests')) {
                throw new Error("Too many sign-in attempts. Please wait a minute and try again.");
            } else {
                throw new Error(error.message || "Authentication failed. Please check your credentials.");
            }
        }

        if (!data || !data.user) {
            throw new Error("Login failed: Supabase did not return user credentials.");
        }

        const authUser = data.user;
        this.currentSession = data.session;

        // 2. Retrieve Profile from Supabase 'profiles' table
        const profile = await this._syncUserProfile(authUser);

        // 3. Create persistent active session
        this.createSession(profile, rememberMe);

        return {
            success: true,
            user: profile,
            session: data.session
        };
    }

    /**
     * Retrieve or auto-create profile record in 'profiles' table
     */
    async _syncUserProfile(authUser) {
        if (!authUser) return null;

        let profile = null;
        const meta = authUser.user_metadata || {};

        // Query profiles table
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

        // If not in profiles, check users table
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

        // If still not found, construct from auth metadata and upsert into profiles
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

            // Auto-heal/insert to profiles
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
        if (!this.supabaseClient) return [];
        try {
            // First check profiles table
            const { data: profData, error: profErr } = await this.supabaseClient
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (!profErr && Array.isArray(profData) && profData.length > 0) {
                return profData.map(p => ({
                    id: p.id,
                    fullName: p.full_name || p.email.split('@')[0],
                    name: p.full_name || p.email.split('@')[0],
                    email: p.email,
                    phone: p.phone || '',
                    role: this._normalizeRole(p.role),
                    status: 'active',
                    createdAt: p.created_at
                }));
            }

            // Fallback to users table
            const { data: uData } = await this.supabaseClient
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });

            if (Array.isArray(uData)) {
                return uData.map(u => ({
                    id: u.user_id,
                    fullName: u.name,
                    name: u.name,
                    email: u.email,
                    role: this._normalizeRole(u.role),
                    status: u.status || 'active',
                    createdAt: u.created_at
                }));
            }
        } catch (e) {
            console.warn("getAllUsers error:", e);
        }
        return [];
    }

    /**
     * Block/Unblock user account in Supabase
     */
    async toggleBlockUser(email) {
        const normalized = email.trim().toLowerCase();
        if (!this.supabaseClient) return { success: false };

        try {
            const { data } = await this.supabaseClient.from('users').select('status').eq('email', normalized).maybeSingle();
            const newStatus = (data?.status === 'blocked') ? 'active' : 'blocked';
            await this.supabaseClient.from('users').update({ status: newStatus }).eq('email', normalized);
            return { success: true, email: normalized, status: newStatus, isBlocked: newStatus === 'blocked' };
        } catch (e) {
            console.warn("toggleBlockUser error:", e);
            return { success: false };
        }
    }

    /**
     * Delete user profile in Supabase
     */
    async deleteUser(email) {
        const normalized = email.trim().toLowerCase();
        if (!this.supabaseClient) return { success: false };

        try {
            await this.supabaseClient.from('profiles').delete().eq('email', normalized);
            await this.supabaseClient.from('users').delete().eq('email', normalized);
            return { success: true, email: normalized };
        } catch (e) {
            console.warn("deleteUser error:", e);
            return { success: false };
        }
    }

    resetDatabase() {
        this.logout();
    }
}

// Instantiate global auth instance
window.auth = new AuthService();

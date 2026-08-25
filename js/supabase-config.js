// Global Helper: Convert string IDs into valid RFC-4122 UUID format required by PostgreSQL
function toUUID(str) {
    if (!str) return '00000000-0000-4000-8000-000000000000';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
        return str;
    }
    let hash1 = 0, hash2 = 0;
    for (let i = 0; i < str.length; i++) {
        hash1 = ((hash1 << 5) - hash1) + str.charCodeAt(i);
        hash1 |= 0;
        hash2 = ((hash2 << 7) - hash2) + str.charCodeAt(i);
        hash2 |= 0;
    }
    const h1 = Math.abs(hash1).toString(16).padStart(8, '0').slice(0, 8);
    const h2 = Math.abs(hash2).toString(16).padStart(8, '0').slice(0, 8);
    const h3 = Math.abs(hash1 ^ hash2).toString(16).padStart(8, '0').slice(0, 8);
    return `${h1}-a1b2-4c3d-8e4f-${(h2 + h3).slice(0, 12)}`;
}
window.toUUID = toUUID;

const SUPABASE_CONFIG = {
    // Supabase Project URL (Active Production: smartjobvacancy)
    SUPABASE_URL: 'https://abudctbfxcjjtamzvwaf.supabase.co',
    
    // Supabase Public Anon JWT API Key
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFidWRjdGJmeGNqanRhbXp2d2FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDU2NDgsImV4cCI6MjEwMjk4MTY0OH0.Hq_sTwsbeoiApGDNDT4sD0s7WwSkOd6WNHrEYm6WPKs',
    
    USERS_TABLE: 'users',
    JOBS_TABLE: 'jobs',
    APPLICATIONS_TABLE: 'applications'
};

// Retrieve credentials (checking localStorage override first)
function getSupabaseCredentials() {
    const savedUrl = localStorage.getItem('supabase_url');
    const savedKey = localStorage.getItem('supabase_anon_key');
    
    const url = (savedUrl && savedUrl.trim().startsWith('https://')) ? savedUrl.trim() : SUPABASE_CONFIG.SUPABASE_URL;
    const key = (savedKey && savedKey.trim().startsWith('eyJ')) ? savedKey.trim() : SUPABASE_CONFIG.SUPABASE_ANON_KEY;

    return { url, key };
}

// Validate if credentials match Supabase URL & non-empty Key format
function isSupabaseConfigured() {
    const { url, key } = getSupabaseCredentials();
    const isUrlValid = /^https:\/\/[a-z0-9-]+\.supabase\.(co|net)$/i.test(url);
    const isKeyValid = typeof key === 'string' && key.trim().length >= 15;
    return isUrlValid && isKeyValid;
}

// Save credentials to localStorage
function saveSupabaseCredentials(url, key) {
    if (url) localStorage.setItem('supabase_url', url.trim());
    if (key) localStorage.setItem('supabase_anon_key', key.trim());
    if (window.auth && typeof window.auth.initSupabase === 'function') {
        window.auth.initSupabase();
    }
}

// Clear credentials
function clearSupabaseCredentials() {
    localStorage.removeItem('supabase_url');
    localStorage.removeItem('supabase_anon_key');
}

// Diagnostic: Test connection to Supabase database
async function testSupabaseConnection() {
    const creds = getSupabaseCredentials();
    if (!creds.url || !creds.key) {
        return { success: false, error: "Supabase URL or Anon Key is missing." };
    }
    if (!window.supabase) {
        return { success: false, error: "Supabase JS library (supabase.js) is not loaded in the window context." };
    }

    try {
        const client = window.supabase.createClient(creds.url, creds.key);
        const { data, error } = await client.from('jobs').select('count', { count: 'exact', head: true });
        if (error) {
            return { success: false, error: `Supabase Error (${error.code || 'API Error'}): ${error.message}` };
        }
        return { success: true, message: "Successfully connected to Supabase PostgreSQL database!", count: data };
    } catch (err) {
        return { success: false, error: err.message || "Network exception while connecting to Supabase." };
    }
}


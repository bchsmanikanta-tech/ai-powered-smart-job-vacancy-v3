/**
 * SmartHire AI - Dual-Engine Database Persistence Service
 * Supabase PostgreSQL Cloud Sync + LocalStorage Fail-Safe Fallback
 */

(function () {
    const STORAGE_KEYS = {
        APPLICATIONS: 'smarthire_applications',
        JOBS: 'smarthire_jobs',
        PROFILES: 'smarthire_seeker_profiles',
        SAVED_JOBS: 'smarthire_saved_jobs'
    };

    // Helper: Convert string IDs into valid RFC-4122 UUID format required by PostgreSQL
    function toUUID(str) {
        if (!str) return '00000000-0000-4000-8000-000000000000';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
            return str;
        }
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        const hex = Math.abs(hash).toString(16).padStart(8, '0');
        return `${hex.slice(0, 8)}-1111-4111-8111-${hex.padEnd(12, '0').slice(0, 12)}`;
    }

    class DatabaseService {
        constructor() {
            this.supabase = null;
            this.initLocalStore();
        }

        getSupabase() {
            if (window.auth && window.auth.supabaseClient && window.auth.isSupabaseConnected) {
                this.supabase = window.auth.supabaseClient;
            } else if (window.supabase && typeof getSupabaseCredentials === 'function') {
                const creds = getSupabaseCredentials();
                if (creds.url && creds.key && creds.key.length >= 10) {
                    try {
                        this.supabase = window.supabase.createClient(creds.url, creds.key);
                    } catch (e) {
                        this.supabase = null;
                    }
                }
            }
            return this.supabase;
        }

        initLocalStore() {
            // Auto purge legacy mock/sample jobs
            const existingJobs = localStorage.getItem(STORAGE_KEYS.JOBS);
            if (!existingJobs || existingJobs.includes('job_python_vizag') || existingJobs.includes('job_react_remote')) {
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.APPLICATIONS)) {
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify([]));
            }
            if (!localStorage.getItem(STORAGE_KEYS.SAVED_JOBS)) {
                localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify([]));
            }
        }

        clearAllData() {
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify([]));
            localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify([]));
            localStorage.removeItem(STORAGE_KEYS.PROFILES);
            console.log("🧹 All local jobs and application data cleared!");
        }

        // ==========================================
        // 1. APPLICATIONS
        // ==========================================
        async saveApplication(appData) {
            const newApp = {
                id: 'app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                jobTitle: appData.jobTitle || 'Software Engineer',
                company: appData.company || 'TechCorp Global',
                fullName: appData.fullName,
                email: appData.email,
                phone: appData.phone || '',
                location: appData.location || 'Visakhapatnam',
                qualification: appData.qualification || 'B.Tech / Diploma',
                college: appData.college || '',
                passYear: appData.passYear || '2026',
                cgpa: appData.cgpa || '',
                skills: appData.skills || 'Python, Django, SQL',
                experience: appData.experience || 'Fresher',
                expectedSalary: appData.expectedSalary || '₹30,000/mo',
                resumeName: appData.resumeName || 'Resume.pdf',
                coverLetter: appData.coverLetter || '',
                aiMatch: appData.aiMatch || 92,
                status: 'Applied',
                appliedAt: new Date().toISOString()
            };

            // 1. Persist to Local Storage
            const apps = this.getApplications();
            apps.unshift(newApp);
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));

            // 2. Insert into Supabase Applications PostgreSQL Table
            const client = this.getSupabase();
            if (client) {
                try {
                    const rawJobId = appData.jobId || newApp.id;
                    const rawSeekerId = window.auth?.getCurrentUser()?.id || newApp.email;

                    const payload = {
                        application_id: toUUID(newApp.id),
                        job_id: toUUID(rawJobId),
                        seeker_id: toUUID(rawSeekerId),
                        job_title: newApp.jobTitle,
                        company: newApp.company,
                        full_name: newApp.fullName,
                        email: newApp.email,
                        phone: newApp.phone,
                        location: newApp.location,
                        qualification: newApp.qualification,
                        college: newApp.college,
                        pass_year: String(newApp.passYear),
                        cgpa: String(newApp.cgpa),
                        skills: typeof newApp.skills === 'string' ? newApp.skills : JSON.stringify(newApp.skills),
                        experience: newApp.experience,
                        expected_salary: newApp.expectedSalary,
                        resume_name: newApp.resumeName,
                        cover_letter: newApp.coverLetter,
                        ai_match_score: newApp.aiMatch,
                        status: 'Applied',
                        notes: `Applicant: ${newApp.fullName} (${newApp.email}) - Qualification: ${newApp.qualification}`
                    };

                    const { data, error } = await client.from('applications').insert([payload]).select();

                    if (error) {
                        console.error("❌ Supabase Applications Insert Error:", error.message || error);
                        if (typeof showToast === 'function') {
                            showToast(`⚠️ Supabase Applications: ${error.message || 'Key unauthorized'}`, 'error');
                        }
                    } else {
                        console.log("⚡ Application successfully stored in Supabase cloud table!", data);
                    }
                } catch (sbErr) {
                    console.warn("Supabase application insert exception:", sbErr);
                }
            }

            return newApp;
        }

        getApplications() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.APPLICATIONS)) || [];
            } catch (e) {
                return [];
            }
        }

        async fetchApplicationsFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getApplications();
            try {
                const { data, error } = await client.from('applications').select('*').order('applied_date', { ascending: false });
                if (error) {
                    console.warn("Supabase applications fetch error:", error);
                    return this.getApplications();
                }
                return data || [];
            } catch (e) {
                return this.getApplications();
            }
        }

        async updateApplicationStatus(appId, newStatus) {
            const apps = this.getApplications();
            const idx = apps.findIndex(a => a.id === appId);
            if (idx >= 0) {
                apps[idx].status = newStatus;
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    const { error } = await client.from('applications').update({ status: newStatus }).eq('application_id', toUUID(appId));
                    if (error) console.warn("Supabase update error:", error.message);
                } catch (e) {
                    console.log("Supabase status update notice:", e);
                }
            }
            return true;
        }

        // ==========================================
        // 2. JOB VACANCIES (EMPLOYER POSTINGS)
        // ==========================================
        async saveJob(jobData) {
            const newJob = {
                id: 'job_' + Date.now(),
                title: jobData.title,
                company: jobData.company || 'TechCorp Global',
                location: jobData.location || 'Visakhapatnam',
                salary: jobData.salary || '₹30,000 - ₹50,000/mo',
                skills: Array.isArray(jobData.skills) ? jobData.skills : (jobData.skills ? jobData.skills.split(',').map(s => s.trim()) : ['General']),
                description: jobData.description || 'Job description',
                workMode: jobData.workMode || 'Hybrid',
                status: 'active',
                createdAt: new Date().toISOString()
            };

            // 1. Save locally
            const jobs = this.getJobs();
            jobs.unshift(newJob);
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));

            // 2. Insert into Supabase Jobs PostgreSQL Table
            const client = this.getSupabase();
            if (client) {
                try {
                    const { data, error } = await client.from('jobs').insert([{
                        job_id: toUUID(newJob.id),
                        company_name: newJob.company,
                        title: newJob.title,
                        description: newJob.description,
                        salary: newJob.salary,
                        location: newJob.location,
                        work_mode: newJob.workMode,
                        skills: newJob.skills,
                        status: 'active'
                    }]).select();

                    if (error) {
                        console.error("❌ Supabase Jobs Insert Error:", error.message || error);
                    } else {
                        console.log("⚡ Vacancy successfully stored in Supabase PostgreSQL jobs table!", data);
                    }
                } catch (sbErr) {
                    console.warn("Supabase job insert notice:", sbErr);
                }
            }

            return newJob;
        }

        getJobs() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.JOBS)) || [];
            } catch (e) {
                return [];
            }
        }

        async fetchJobsFromSupabase() {
            const client = this.getSupabase();
            if (!client) return this.getJobs();
            try {
                const { data, error } = await client.from('jobs').select('*').order('created_at', { ascending: false });
                if (error || !data) {
                    console.warn("Supabase jobs fetch notice:", error);
                    return this.getJobs();
                }
                // Map Supabase fields to app schema
                const cloudJobs = data.map(j => ({
                    id: j.job_id || 'job_' + Date.now(),
                    title: j.title,
                    company: j.company_name || 'TechCorp Global',
                    location: j.location,
                    salary: j.salary,
                    skills: j.skills || [],
                    description: j.description,
                    workMode: j.work_mode || 'On-site',
                    status: j.status || 'active',
                    createdAt: j.created_at
                }));
                return cloudJobs;
            } catch (e) {
                return this.getJobs();
            }
        }

        // ==========================================
        // 3. SEEKER PROFILE & RESUME METADATA
        // ==========================================
        async saveSeekerProfile(profileData) {
            const current = this.getSeekerProfile() || {};
            const updated = { ...current, ...profileData, updatedAt: new Date().toISOString() };
            localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(updated));

            const client = this.getSupabase();
            if (client && window.auth?.getCurrentUser()?.id) {
                try {
                    const seekerUserId = toUUID(window.auth.getCurrentUser().id);
                    const { data, error } = await client.from('job_seekers').upsert({
                        user_id: seekerUserId,
                        education: profileData.education || '',
                        skills: Array.isArray(profileData.skills) ? profileData.skills : (profileData.skills ? profileData.skills.split(',').map(s => s.trim()) : []),
                        experience_years: profileData.experience || 'Fresher',
                        location: profileData.location || '',
                        expected_salary: profileData.expectedSalary || '',
                        ats_score: profileData.atsScore || 89
                    }).select();

                    if (error) {
                        console.error("❌ Supabase Seeker Profile Upsert Error:", error.message || error);
                    } else {
                        console.log("⚡ Candidate profile stored in Supabase 'job_seekers' table!", data);
                    }
                } catch (e) {
                    console.log("Supabase profile sync notice:", e);
                }
            }

            return updated;
        }

        getSeekerProfile() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES)) || null;
            } catch (e) {
                return null;
            }
        }

        // ==========================================
        // 4. SAVED JOBS (SUPABASE POSTGRESQL + LOCAL)
        // ==========================================
        getSavedJobs() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_JOBS) || localStorage.getItem('smartjob_saved_jobs') || '[]');
            } catch (e) {
                return [];
            }
        }

        async saveJobCloud(jobId, jobData, seekerEmail = '') {
            let saved = this.getSavedJobs();
            const idStr = String(jobId);
            if (!saved.includes(idStr)) {
                saved.push(idStr);
                localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify(saved));
                localStorage.setItem('smartjob_saved_jobs', JSON.stringify(saved));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    const seekerId = toUUID(seekerEmail || window.auth?.getCurrentUser()?.email || 'seeker_default');
                    const dbJobId = toUUID(idStr);
                    const savedId = toUUID((seekerEmail || 'seeker') + '_' + idStr);

                    const { data, error } = await client.from('saved_jobs').upsert({
                        saved_id: savedId,
                        seeker_id: seekerId,
                        job_id: dbJobId,
                        job_title: jobData?.title || 'Job Opening',
                        company: jobData?.company || 'Company',
                        saved_date: new Date().toISOString()
                    }).select();

                    if (error) {
                        console.warn("Supabase saved_jobs insert notice:", error.message || error);
                    } else {
                        console.log("⚡ Saved job synced with Supabase 'saved_jobs' database table!", data);
                    }
                } catch (e) {
                    console.log("Supabase saved_jobs notice:", e);
                }
            }
            return saved;
        }

        async removeSavedJobCloud(jobId, seekerEmail = '') {
            let saved = this.getSavedJobs();
            const idStr = String(jobId);
            saved = saved.filter(id => id !== idStr);
            localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify(saved));
            localStorage.setItem('smartjob_saved_jobs', JSON.stringify(saved));

            const client = this.getSupabase();
            if (client) {
                try {
                    const seekerId = toUUID(seekerEmail || window.auth?.getCurrentUser()?.email || 'seeker_default');
                    const dbJobId = toUUID(idStr);
                    await client.from('saved_jobs').delete().match({ seeker_id: seekerId, job_id: dbJobId });
                    console.log("⚡ Removed saved job from Supabase 'saved_jobs' table!");
                } catch (e) {
                    console.log("Supabase remove saved notice:", e);
                }
            }
            return saved;
        }

        async syncSavedJobsFromSupabase(seekerEmail = '') {
            const client = this.getSupabase();
            if (!client) return this.getSavedJobs();

            try {
                const seekerId = toUUID(seekerEmail || window.auth?.getCurrentUser()?.email || 'seeker_default');
                const { data, error } = await client.from('saved_jobs').select('*').eq('seeker_id', seekerId);
                if (!error && Array.isArray(data)) {
                    const cloudSavedIds = data.map(d => String(d.job_id));
                    const localSaved = this.getSavedJobs();
                    const merged = Array.from(new Set([...localSaved, ...cloudSavedIds]));
                    localStorage.setItem(STORAGE_KEYS.SAVED_JOBS, JSON.stringify(merged));
                    localStorage.setItem('smartjob_saved_jobs', JSON.stringify(merged));
                    return merged;
                }
            } catch (e) {
                console.log("Supabase sync saved_jobs error:", e);
            }
            return this.getSavedJobs();
        }
    }

    window.db = new DatabaseService();
    console.log("📦 SmartHire Dual-Engine Database Service Ready!");
})();


/**
 * SmartHire AI - Dual-Engine Permanent Database Persistence Service
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

    class DatabaseService {
        constructor() {
            this.supabase = null;
            this.initLocalStore();
            // Automatically synchronize from cloud database on startup
            setTimeout(() => this.syncAllFromSupabase(), 200);
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
            if (!localStorage.getItem(STORAGE_KEYS.JOBS)) {
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
            localStorage.setItem('smartjob_saved_jobs', JSON.stringify([]));
            localStorage.setItem('smartjob_users_db', JSON.stringify([]));
            localStorage.setItem('smarthire_chat_db', JSON.stringify({}));
            localStorage.removeItem(STORAGE_KEYS.PROFILES);
            localStorage.removeItem('smartjob_active_session');
            localStorage.removeItem('smartjob_remember_user');
            localStorage.removeItem('smartjob_active_user');
            if (window.auth && typeof window.auth.resetDatabase === 'function') {
                window.auth.resetDatabase();
            }
            console.log("🧹 All local database tables, users, jobs, and applications wiped clean!");
        }

        // ==========================================
        // 1. APPLICATIONS
        // ==========================================
        async saveApplication(appData) {
            const rawId = appData.id || ('app_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
            const applicantName = appData.fullName || appData.applicantName || 'Candidate';
            const applicantEmail = appData.email || appData.applicantEmail || '';
            const matchScore = Number(appData.matchScore || appData.aiMatch || 90);

            const newApp = {
                id: rawId,
                jobId: appData.jobId || rawId,
                jobTitle: appData.jobTitle || 'Software Engineer',
                company: appData.company || 'TechCorp Global',
                fullName: applicantName,
                applicantName: applicantName,
                email: applicantEmail,
                applicantEmail: applicantEmail,
                phone: appData.phone || '',
                location: appData.location || appData.city || 'Visakhapatnam',
                city: appData.city || appData.location || 'Visakhapatnam',
                qualification: appData.qualification || 'B.Tech / Diploma',
                college: appData.college || '',
                passYear: appData.passYear || '2026',
                cgpa: appData.cgpa || '',
                skills: appData.skills || 'Python, Django, SQL',
                experience: appData.experience || 'Fresher',
                expectedSalary: appData.expectedSalary || '₹30,000/mo',
                resumeName: appData.resumeName || 'Resume.pdf',
                coverLetter: appData.coverLetter || '',
                aiMatch: matchScore,
                matchScore: matchScore,
                status: appData.status || 'Applied',
                appliedAt: appData.appliedAt || new Date().toISOString()
            };

            // 1. Persist to Local Storage
            const apps = this.getApplications();
            const existingIdx = apps.findIndex(a => a.id === newApp.id || (a.jobId === newApp.jobId && a.email?.toLowerCase() === newApp.email?.toLowerCase()));
            if (existingIdx >= 0) {
                apps[existingIdx] = newApp;
            } else {
                apps.unshift(newApp);
            }
            localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(apps));

            // 2. Insert into Supabase Applications PostgreSQL Table
            const client = this.getSupabase();
            if (client) {
                try {
                    const rawSeekerId = window.auth?.getCurrentUser()?.id || newApp.email;

                    const payload = {
                        application_id: toUUID(newApp.id),
                        job_id: toUUID(newApp.jobId),
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
                        ai_match_score: newApp.matchScore,
                        status: newApp.status,
                        notes: `Applicant: ${newApp.fullName} (${newApp.email}) - Qualification: ${newApp.qualification}`
                    };

                    const { data, error } = await client.from('applications').upsert([payload]).select();

                    if (error) {
                        console.error("❌ Supabase Applications Save Error:", error.message || error);
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
                if (error || !data) {
                    console.warn("Supabase applications fetch error:", error);
                    return this.getApplications();
                }

                const cloudApps = data.map(a => ({
                    id: a.application_id,
                    jobId: a.job_id,
                    jobTitle: a.job_title,
                    company: a.company,
                    applicantName: a.full_name,
                    fullName: a.full_name,
                    applicantEmail: a.email,
                    email: a.email,
                    phone: a.phone,
                    location: a.location,
                    city: a.location,
                    qualification: a.qualification,
                    college: a.college,
                    passYear: a.pass_year,
                    cgpa: a.cgpa,
                    skills: a.skills,
                    experience: a.experience,
                    expectedSalary: a.expected_salary,
                    resumeName: a.resume_name,
                    coverLetter: a.cover_letter,
                    matchScore: a.ai_match_score,
                    aiMatch: a.ai_match_score,
                    status: a.status || 'Applied',
                    appliedAt: a.applied_date
                }));

                // Merge with local applications
                const localApps = this.getApplications();
                const mergedMap = new Map();
                cloudApps.forEach(a => mergedMap.set(String(a.id), a));
                localApps.forEach(a => {
                    if (!mergedMap.has(String(a.id))) mergedMap.set(String(a.id), a);
                });

                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.APPLICATIONS, JSON.stringify(mergedList));
                return mergedList;
            } catch (e) {
                return this.getApplications();
            }
        }

        async updateApplicationStatus(appId, newStatus) {
            const apps = this.getApplications();
            const idx = apps.findIndex(a => String(a.id) === String(appId));
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
            const rawId = jobData.id || ('job_' + Date.now());
            const newJob = {
                id: rawId,
                title: jobData.title,
                company: jobData.company || 'TechCorp Global',
                location: jobData.location || 'Visakhapatnam',
                salary: jobData.salary || '₹30,000 - ₹50,000/mo',
                type: jobData.type || jobData.workMode || 'Full-time',
                workMode: jobData.workMode || jobData.type || 'Hybrid',
                experience: jobData.experience || 'Fresher (Entry Level)',
                skills: Array.isArray(jobData.skills) ? jobData.skills : (jobData.skills ? String(jobData.skills).split(',').map(s => s.trim()).filter(Boolean) : ['General']),
                description: jobData.description || 'Job description',
                status: jobData.status || 'active',
                createdAt: jobData.createdAt || new Date().toISOString()
            };

            // 1. Save locally
            const jobs = this.getJobs();
            const existingIdx = jobs.findIndex(j => String(j.id) === String(newJob.id));
            if (existingIdx >= 0) {
                jobs[existingIdx] = newJob;
            } else {
                jobs.unshift(newJob);
            }
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));

            // 2. Insert/Upsert into Supabase Jobs PostgreSQL Table
            const client = this.getSupabase();
            if (client) {
                try {
                    const payload = {
                        job_id: toUUID(newJob.id),
                        company_name: newJob.company,
                        title: newJob.title,
                        description: newJob.description,
                        salary: newJob.salary,
                        location: newJob.location,
                        work_mode: newJob.workMode,
                        skills: newJob.skills,
                        status: 'active'
                    };

                    const { data, error } = await client.from('jobs').upsert([payload]).select();

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

        async updateJob(jobId, updatedFields) {
            const jobs = this.getJobs();
            const idx = jobs.findIndex(j => String(j.id) === String(jobId));
            if (idx >= 0) {
                jobs[idx] = { ...jobs[idx], ...updatedFields };
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));
            }

            const client = this.getSupabase();
            if (client) {
                try {
                    const updatePayload = {};
                    if (updatedFields.title) updatePayload.title = updatedFields.title;
                    if (updatedFields.company) updatePayload.company_name = updatedFields.company;
                    if (updatedFields.location) updatePayload.location = updatedFields.location;
                    if (updatedFields.salary) updatePayload.salary = updatedFields.salary;
                    if (updatedFields.description) updatePayload.description = updatedFields.description;
                    if (updatedFields.workMode) updatePayload.work_mode = updatedFields.workMode;
                    if (updatedFields.skills) updatePayload.skills = Array.isArray(updatedFields.skills) ? updatedFields.skills : updatedFields.skills.split(',').map(s => s.trim());

                    await client.from('jobs').update(updatePayload).eq('job_id', toUUID(jobId));
                } catch (e) {
                    console.warn("Supabase updateJob notice:", e);
                }
            }
            return true;
        }

        async deleteJob(jobId) {
            let jobs = this.getJobs();
            jobs = jobs.filter(j => String(j.id) !== String(jobId));
            localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));

            const client = this.getSupabase();
            if (client) {
                try {
                    const uuid = toUUID(jobId);
                    await client.from('jobs').delete().eq('job_id', uuid);
                    await client.from('applications').delete().eq('job_id', uuid);
                    console.log("⚡ Job deleted from Supabase cloud table!");
                } catch (e) {
                    console.warn("Supabase deleteJob notice:", e);
                }
            }
            return true;
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

                const cloudJobs = data.map(j => ({
                    id: j.job_id,
                    title: j.title,
                    company: j.company_name || 'TechCorp Global',
                    location: j.location,
                    salary: j.salary,
                    skills: j.skills || [],
                    description: j.description,
                    workMode: j.work_mode || 'On-site',
                    type: j.work_mode || 'Full-time',
                    status: j.status || 'active',
                    createdAt: j.created_at
                }));

                // Merge cloud and local jobs
                const localJobs = this.getJobs();
                const mergedMap = new Map();
                cloudJobs.forEach(j => mergedMap.set(String(j.id), j));
                localJobs.forEach(j => {
                    if (!mergedMap.has(String(j.id))) mergedMap.set(String(j.id), j);
                });

                const mergedList = Array.from(mergedMap.values());
                localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(mergedList));
                return mergedList;
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
                        skills: Array.isArray(profileData.skills) ? profileData.skills : (profileData.skills ? String(profileData.skills).split(',').map(s => s.trim()) : []),
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

        // ==========================================
        // 5. UNIFIED ALL-TABLE CLOUD SYNC
        // ==========================================
        async syncAllFromSupabase() {
            try {
                await Promise.allSettled([
                    this.fetchJobsFromSupabase(),
                    this.fetchApplicationsFromSupabase(),
                    window.auth?.syncUsersFromSupabase?.()
                ]);
                console.log("🔄 Dual-Engine Database fully synced with Supabase PostgreSQL cloud!");
            } catch (err) {
                console.warn("Database full sync exception:", err);
            }
        }
    }

    window.db = new DatabaseService();
    window.resetFullDatabase = function() {
        if (window.db) window.db.clearAllData();
        if (window.auth) window.auth.resetDatabase();
    };
    console.log("📦 SmartHire Dual-Engine Database Service Ready!");
})();

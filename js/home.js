/**
 * SMART HIRE AI - HOME PAGE CONTROLLER & AI SEARCH ENGINE
 */

document.addEventListener('DOMContentLoaded', () => {
    // ---------------- DYNAMIC JOBS DATABASE ----------------
    function getHomeJobs() {
        if (window.db && typeof window.db.getJobs === 'function') {
            const dbJobs = window.db.getJobs();
            if (dbJobs && dbJobs.length > 0) {
                return dbJobs.map(j => ({
                    id: j.id,
                    title: j.title,
                    company: j.company || 'TechCorp Global',
                    location: j.location || 'Visakhapatnam',
                    type: j.workMode || 'Full-time',
                    experience: 'Fresher / Experienced',
                    salaryMonthly: j.salary || 'Competitive',
                    salaryNumeric: 30000,
                    category: 'Software Engineering',
                    aiMatch: 95,
                    iconClass: 'fa-solid fa-briefcase',
                    skills: Array.isArray(j.skills) ? j.skills : (j.skills ? String(j.skills).split(',') : ['General']),
                    description: j.description || 'Job opening published by verified employer.',
                    requirements: ['Bachelor Degree / Diploma in relevant discipline', 'Good communication & technical problem solving']
                }));
            }
        }
        return [];
    }

    const JOBS_DATA = getHomeJobs();

    // ---------------- RENDER JOBS ----------------
    const jobsContainer = document.getElementById('jobs-container');

    function renderJobs(jobsList) {
        if (!jobsContainer) return;
        jobsContainer.innerHTML = '';

        if (jobsList.length === 0) {
            jobsContainer.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: rgba(18,26,44,0.5); border-radius: 16px; border: 1px dashed var(--border-glass);">
                    <i class="fa-solid fa-magnifying-glass" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 14px;"></i>
                    <h3 style="font-size: 1.2rem; color: #fff; margin-bottom: 6px;">No exact job matches found</h3>
                    <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 16px;">Try adjusting your keywords, location, or prompt.</p>
                    <button class="btn-primary" id="btn-reset-filters" style="padding: 8px 20px; font-size: 0.84rem;">Reset All Filters</button>
                </div>
            `;
            const resetBtn = document.getElementById('btn-reset-filters');
            if (resetBtn) resetBtn.addEventListener('click', () => renderJobs(JOBS_DATA));
            return;
        }

        jobsList.forEach(job => {
            const card = document.createElement('div');
            card.className = 'job-post-card glass-panel';
            card.innerHTML = `
                <div>
                    <div class="job-header-row">
                        <div class="job-co-badge">
                            <i class="${job.iconClass}"></i>
                        </div>
                        <div class="match-percentage-badge">
                            <i class="fa-solid fa-bolt"></i> ${job.aiMatch}% AI Match
                        </div>
                    </div>
                    
                    <h3 class="job-post-title">${job.title}</h3>
                    <div class="job-co-name">
                        <i class="fa-regular fa-building"></i> ${job.company}
                    </div>

                    <div class="job-meta-row">
                        <div class="job-meta-item">
                            <i class="fa-solid fa-location-dot"></i> ${job.location}
                        </div>
                        <div class="job-meta-item">
                            <i class="fa-solid fa-user-graduate"></i>
                            <span class="${job.experience === 'Fresher' ? 'exp-badge-green' : ''}">🟢 ${job.experience}</span>
                        </div>
                    </div>

                    <div class="job-skills-tags">
                        ${job.skills.map(s => `<span class="tag">${s}</span>`).join('')}
                    </div>
                </div>

                <div class="job-card-actions-row">
                    <div class="job-salary-monthly">
                        💰 ${job.salaryMonthly}
                    </div>
                    <button class="btn-view-job" data-id="${job.id}">
                        View Job
                    </button>
                </div>
            `;
            jobsContainer.appendChild(card);
        });

        // Attach event listeners to "View Job" buttons
        document.querySelectorAll('.btn-view-job').forEach(btn => {
            btn.addEventListener('click', () => {
                const jobId = btn.getAttribute('data-id');
                openJobModal(jobId);
            });
        });
    }

    renderJobs(JOBS_DATA);

    // ---------------- AI SEARCH PROMPT HANDLER ----------------
    const aiSearchInput = document.getElementById('ai-search-prompt');
    const btnAiSearch = document.getElementById('btn-ai-search');
    const chipButtons = document.querySelectorAll('.chip-item');

    function executeAiSearch(query) {
        if (!query) {
            renderJobs(JOBS_DATA);
            return;
        }

        const q = query.toLowerCase();

        // Match algorithms across title, company, location, skills, experience, and category
        const filtered = JOBS_DATA.filter(job => {
            const combined = `${job.title} ${job.company} ${job.location} ${job.category} ${job.experience} ${job.skills.join(' ')}`.toLowerCase();
            const words = q.split(' ').filter(w => w.length > 2 && !['and', 'the', 'for', 'want', 'with', 'in', 'completed'].includes(w));
            return words.some(word => combined.includes(word)) || 
                   (q.includes('vizag') && job.location.toLowerCase().includes('visakhapatnam')) ||
                   (q.includes('frontend') && (job.title.toLowerCase().includes('react') || job.category.includes('Web')));
        });

        // Recalculate AI score ranking
        const scored = (filtered.length > 0 ? filtered : JOBS_DATA).map(job => {
            let scoreBoost = 0;
            if ((q.includes('fresher') || q.includes('diploma')) && job.experience === 'Fresher') scoreBoost += 8;
            if ((q.includes('visakhapatnam') || q.includes('vizag')) && job.location.toLowerCase().includes('visakhapatnam')) scoreBoost += 10;
            if (q.includes('python') && job.title.toLowerCase().includes('python')) scoreBoost += 12;
            if ((q.includes('react') || q.includes('frontend')) && job.title.toLowerCase().includes('react')) scoreBoost += 12;
            return { ...job, aiMatch: Math.min(99, job.aiMatch + scoreBoost) };
        }).sort((a, b) => b.aiMatch - a.aiMatch);

        renderJobs(scored);

        showToast(`AI analyzed prompt and paired ${scored.length} matching vacancies`, 'info');
    }

    if (btnAiSearch && aiSearchInput) {
        btnAiSearch.addEventListener('click', () => executeAiSearch(aiSearchInput.value.trim()));
        aiSearchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeAiSearch(aiSearchInput.value.trim());
        });
    }

    chipButtons.forEach(chip => {
        chip.addEventListener('click', () => {
            const promptText = chip.getAttribute('data-prompt');
            if (aiSearchInput) aiSearchInput.value = promptText;
            executeAiSearch(promptText);
        });
    });

    // ---------------- QUICK SEARCH FILTER ----------------
    const btnQuickSearch = document.getElementById('btn-quick-search');
    if (btnQuickSearch) {
        btnQuickSearch.addEventListener('click', () => {
            const keyword = (document.getElementById('quick-keyword')?.value || '').toLowerCase().trim();
            const location = (document.getElementById('quick-location')?.value || '').toLowerCase().trim();
            const experience = document.getElementById('quick-experience')?.value || 'all';
            const salary = parseInt(document.getElementById('quick-salary')?.value || '0', 10);

            const filtered = JOBS_DATA.filter(job => {
                const matchKw = !keyword || `${job.title} ${job.skills.join(' ')} ${job.company}`.toLowerCase().includes(keyword);
                const matchLoc = !location || job.location.toLowerCase().includes(location);
                const matchExp = experience === 'all' || job.experience === experience;
                const matchSal = isNaN(salary) || salary === 0 || job.salaryNumeric >= salary;
                return matchKw && matchLoc && matchExp && matchSal;
            });

            renderJobs(filtered);
            document.getElementById('featured-jobs')?.scrollIntoView({ behavior: 'smooth' });
            showToast(`Found ${filtered.length} matching jobs`, 'info');
        });
    }

    // ---------------- CATEGORY PILLS & CARDS ----------------
    const categoryPills = document.querySelectorAll('#category-pills .pill-btn');
    categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
            categoryPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const filter = pill.getAttribute('data-filter');
            if (filter === 'all') {
                renderJobs(JOBS_DATA);
            } else if (filter === 'Fresher') {
                renderJobs(JOBS_DATA.filter(j => j.experience === 'Fresher'));
            } else if (filter === 'Visakhapatnam') {
                renderJobs(JOBS_DATA.filter(j => j.location.includes('Visakhapatnam')));
            } else if (filter === 'Remote') {
                renderJobs(JOBS_DATA.filter(j => j.type === 'Remote' || j.location.includes('Remote')));
            }
        });
    });

    document.querySelectorAll('.category-card').forEach(card => {
        card.addEventListener('click', () => {
            const cat = card.getAttribute('data-cat');
            const matched = JOBS_DATA.filter(j => j.category === cat);
            renderJobs(matched.length > 0 ? matched : JOBS_DATA);
            document.getElementById('featured-jobs')?.scrollIntoView({ behavior: 'smooth' });
            showToast(`Filtered for: ${cat}`, 'info');
        });
    });

    // ---------------- JOB DETAILS MODAL ----------------
    const jobDetailsModal = document.getElementById('job-details-modal');
    const modalJobTitle = document.getElementById('modal-job-title');
    const modalJobBody = document.getElementById('modal-job-body');
    const btnCloseJobModal = document.getElementById('btn-close-job-modal');

    function openJobModal(jobId) {
        const job = JOBS_DATA.find(j => j.id === jobId);
        if (!job || !jobDetailsModal) return;

        modalJobTitle.innerHTML = `<i class="fa-solid fa-briefcase highlight"></i> ${job.title}`;
        modalJobBody.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="font-size: 1.1rem; color: #fff;">${job.company}</h4>
                    <span class="match-percentage-badge"><i class="fa-solid fa-bolt"></i> ${job.aiMatch}% AI Match</span>
                </div>
                <p style="color: var(--text-muted); font-size: 0.88rem; line-height: 1.6; margin-bottom: 14px;">${job.description}</p>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: rgba(15,23,42,0.6); padding: 14px; border-radius: 10px; margin-bottom: 18px;">
                    <div><strong>Location:</strong> <span style="color: var(--accent);">${job.location}</span></div>
                    <div><strong>Experience:</strong> 🟢 ${job.experience}</div>
                    <div><strong>Compensation:</strong> <span style="color: #38bdf8; font-weight: 700;">${job.salaryMonthly}</span></div>
                    <div><strong>Work Mode:</strong> ${job.type}</div>
                </div>

                <h5 style="color: #fff; font-size: 0.95rem; margin-bottom: 8px;">Key Requirements:</h5>
                <ul style="color: var(--text-muted); font-size: 0.86rem; padding-left: 20px; line-height: 1.6; margin-bottom: 20px;">
                    ${job.requirements.map(r => `<li>${r}</li>`).join('')}
                </ul>

                <button class="btn-primary w-full" id="btn-submit-job-application">
                    <i class="fa-solid fa-paper-plane"></i>
                    <span>1-Click AI Apply Now</span>
                </button>
            </div>
        `;

        jobDetailsModal.classList.add('active');

        document.getElementById('btn-submit-job-application')?.addEventListener('click', () => {
            const user = window.auth?.getCurrentUser();
            if (!user) {
                jobDetailsModal.classList.remove('active');
                openAuthModal('login');
                showToast('Please sign in to submit your job application', 'info');
            } else {
                showToast(`Application successfully sent to ${job.company}! Opening your application tracker...`, 'success');
                jobDetailsModal.classList.remove('active');
                setTimeout(() => {
                    window.location.href = 'seeker-dashboard.html';
                }, 700);
            }
        });
    }

    if (btnCloseJobModal) {
        btnCloseJobModal.addEventListener('click', () => jobDetailsModal.classList.remove('active'));
    }

    // ---------------- AUTH MODAL & NAVIGATION ----------------
    const authModal = document.getElementById('auth-modal');
    const btnCloseAuth = document.getElementById('btn-close-auth');
    const navBtnLogin = document.getElementById('nav-btn-login');
    const navBtnRegister = document.getElementById('nav-btn-register');
    const modalTabLogin = document.getElementById('modal-tab-login');
    const modalTabRegister = document.getElementById('modal-tab-register');
    const modalLoginContainer = document.getElementById('modal-login-container');
    const modalRegisterContainer = document.getElementById('modal-register-container');
    const tabIndicator = authModal ? authModal.querySelector('.tab-indicator') : null;

    function openAuthModal(tab = 'login') {
        if (!authModal) return;
        authModal.classList.add('active');
        switchModalTab(tab);
    }

    function switchModalTab(tab) {
        if (tab === 'login') {
            modalTabLogin?.classList.add('active');
            modalTabRegister?.classList.remove('active');
            modalLoginContainer?.classList.add('active');
            modalRegisterContainer?.classList.remove('active');
            if (tabIndicator) tabIndicator.style.transform = 'translateX(0)';
        } else {
            modalTabRegister?.classList.add('active');
            modalTabLogin?.classList.remove('active');
            modalRegisterContainer?.classList.add('active');
            modalLoginContainer?.classList.remove('active');
            if (tabIndicator) tabIndicator.style.transform = 'translateX(100%)';
        }
    }

    if (navBtnLogin) navBtnLogin.addEventListener('click', () => openAuthModal('login'));
    if (navBtnRegister) navBtnRegister.addEventListener('click', () => openAuthModal('register'));
    if (btnCloseAuth) btnCloseAuth.addEventListener('click', () => authModal.classList.remove('active'));
    if (modalTabLogin) modalTabLogin.addEventListener('click', () => switchModalTab('login'));
    if (modalTabRegister) modalTabRegister.addEventListener('click', () => switchModalTab('register'));

    document.querySelectorAll('.trigger-login').forEach(el => el.addEventListener('click', () => openAuthModal('login')));
    document.querySelectorAll('.trigger-register').forEach(el => el.addEventListener('click', () => openAuthModal('register')));
    document.getElementById('btn-register-company')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('btn-cta-post-job')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('btn-cta-find-jobs')?.addEventListener('click', () => {
        document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' });
    });

    // Check logged in user to update navbar
    const currentUser = window.auth?.getCurrentUser();
    if (currentUser) {
        const navAuthSection = document.getElementById('nav-auth-section');
        if (navAuthSection) {
            navAuthSection.innerHTML = `
                <a href="dashboard.html" class="btn-primary" style="padding: 8px 18px; font-size: 0.86rem; text-decoration: none;">
                    <i class="fa-solid fa-gauge"></i> Dashboard (${currentUser.fullName.split(' ')[0]})
                </a>
            `;
        }
    }

    // Modal Login Submission
    const modalLoginForm = document.getElementById('modal-login-form');
    if (modalLoginForm) {
        modalLoginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('modal-login-email').value.trim();
            const password = document.getElementById('modal-login-password').value;
            const submitBtn = document.getElementById('btn-modal-submit-login');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
            }

            try {
                const res = await window.auth.login(email, password, true);
                showToast(`Welcome back, ${res.user.fullName}! Redirecting...`, 'success');
                const dest = window.auth.getRoleRedirectUrl(res.user.role);
                setTimeout(() => {
                    window.location.href = dest;
                }, 400);
            } catch (err) {
                showToast(err.message, 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span class="btn-text">Sign In</span> <i class="fa-solid fa-arrow-right btn-icon"></i>';
                }
            }
        });
    }

    // Modal Register Submission
    const modalRegisterForm = document.getElementById('modal-register-form');
    if (modalRegisterForm) {
        modalRegisterForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fullName = document.getElementById('modal-reg-fullname').value.trim();
            const email = document.getElementById('modal-reg-email').value.trim();
            const password = document.getElementById('modal-reg-password').value;
            const roleEl = document.querySelector('input[name="modal-user-role"]:checked');
            const role = roleEl ? roleEl.value : 'seeker';
            const submitBtn = document.getElementById('btn-modal-submit-reg');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
            }

            try {
                const res = await window.auth.register({ fullName, email, password, role });
                showToast(res.message || `Welcome to SmartHire AI, ${res.user.fullName}!`, 'success');
                const dest = window.auth.getRoleRedirectUrl(res.user.role);
                setTimeout(() => {
                    window.location.href = dest;
                }, 1200);
            } catch (err) {
                showToast(err.message, 'error');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span class="btn-text">Create Account</span> <i class="fa-solid fa-check btn-icon"></i>';
                }
            }
        });
    }


    // ---------------- AI RESUME SCANNER MODAL ----------------
    const resumeModal = document.getElementById('resume-modal');
    const btnScanResumeTrigger = document.getElementById('btn-scan-resume-trigger');
    const footerResumeScan = document.getElementById('footer-resume-scan');
    const btnCloseResume = document.getElementById('btn-close-resume');
    const resumeDropzone = document.getElementById('resume-dropzone');
    const resumeFileInput = document.getElementById('resume-file-input');
    const resumeResult = document.getElementById('resume-analysis-result');
    const btnAiMatchModal = document.getElementById('btn-ai-match-modal');

    function openResumeScanner() {
        if (resumeModal) {
            resumeModal.classList.add('active');
            if (resumeResult) resumeResult.style.display = 'none';
        }
    }

    if (btnScanResumeTrigger) btnScanResumeTrigger.addEventListener('click', openResumeScanner);
    if (footerResumeScan) footerResumeScan.addEventListener('click', openResumeScanner);
    if (btnAiMatchModal) btnAiMatchModal.addEventListener('click', openResumeScanner);
    if (btnCloseResume) btnCloseResume.addEventListener('click', () => resumeModal.classList.remove('active'));

    if (resumeDropzone && resumeFileInput) {
        resumeDropzone.addEventListener('click', () => resumeFileInput.click());
        resumeFileInput.addEventListener('change', () => {
            if (resumeFileInput.files.length > 0) {
                showToast(`Analyzing ${resumeFileInput.files[0].name} with AI...`, 'info');
                setTimeout(() => {
                    if (resumeResult) resumeResult.style.display = 'block';
                }, 1200);
            }
        });
    }

    document.getElementById('btn-view-matched-jobs')?.addEventListener('click', () => {
        resumeModal.classList.remove('active');
        executeAiSearch('Python React Developer freshers Visakhapatnam');
    });

    // ---------------- SUPABASE STATUS & MODAL ----------------
    const supabaseModal = document.getElementById('supabase-modal');
    const btnOpenSupabaseModal = document.getElementById('btn-open-supabase-modal');
    const btnCloseSupabase = document.getElementById('btn-close-supabase');
    const btnSaveSupabase = document.getElementById('btn-save-supabase');
    const btnDisconnectSupabase = document.getElementById('btn-disconnect-supabase');
    const sbUrlInput = document.getElementById('sb-url');
    const sbKeyInput = document.getElementById('sb-key');

    if (btnOpenSupabaseModal) {
        btnOpenSupabaseModal.addEventListener('click', () => {
            const creds = getSupabaseCredentials();
            if (sbUrlInput) sbUrlInput.value = creds.url || '';
            if (sbKeyInput) sbKeyInput.value = creds.key || '';
            supabaseModal?.classList.add('active');
        });
    }

    if (btnCloseSupabase) btnCloseSupabase.addEventListener('click', () => supabaseModal?.classList.remove('active'));

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
                showToast('⚡ Connected to Supabase Cloud Database!', 'success');
                supabaseModal?.classList.remove('active');
            } else {
                showToast(`Supabase Notice: ${testResult.error || 'Saved for offline fallback.'}`, 'warning');
                supabaseModal?.classList.remove('active');
            }
        });
    }

    if (btnDisconnectSupabase) {
        btnDisconnectSupabase.addEventListener('click', () => {
            clearSupabaseCredentials();
            window.auth.setSupabaseConfig('', '');
            showToast('Disconnected from Supabase Cloud. Local mode active.', 'info');
            supabaseModal?.classList.remove('active');
        });
    }

    // ---------------- MOBILE MENU TOGGLE ----------------
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const navMenu = document.getElementById('nav-menu');
    if (mobileBtn && navMenu) {
        mobileBtn.addEventListener('click', () => {
            navMenu.classList.toggle('open');
        });
    }

    // ---------------- HELPER TOASTS ----------------
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        let iconClass = type === 'success' ? 'fa-solid fa-circle-check' : (type === 'error' ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-info');

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

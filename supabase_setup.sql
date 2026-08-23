-- ====================================================================
-- SMART JOB VACANCY FINDER SYSTEM - SCHEMA & RLS SETUP
-- Database: PostgreSQL / Supabase
-- ====================================================================

-- 1. Users Table (Core Auth & Roles)
CREATE TABLE IF NOT EXISTS public.users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'seeker',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. JobSeekers Table (Candidate Profile & Resume)
CREATE TABLE IF NOT EXISTS public.job_seekers (
    seeker_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    full_name VARCHAR(255),
    email VARCHAR(255),
    education VARCHAR(255),
    skills TEXT[],
    certifications TEXT[],
    experience_years VARCHAR(50) DEFAULT 'Fresher',
    projects TEXT,
    location VARCHAR(255),
    expected_salary VARCHAR(100),
    preferred_role VARCHAR(255),
    resume_url TEXT,
    ats_score INTEGER DEFAULT 89,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Companies Table (Recruiter & Verification Status)
CREATE TABLE IF NOT EXISTS public.companies (
    company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    company_name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    description TEXT,
    website VARCHAR(255),
    location VARCHAR(255),
    industry VARCHAR(100),
    contact_phone VARCHAR(50),
    status VARCHAR(50) DEFAULT 'approved',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Jobs Table (Vacancies Posted by Companies)
CREATE TABLE IF NOT EXISTS public.jobs (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    company_name VARCHAR(255) DEFAULT 'TechCorp Global',
    title VARCHAR(255) NOT NULL,
    description TEXT,
    responsibilities TEXT,
    requirements TEXT,
    skills TEXT[],
    salary VARCHAR(100),
    location VARCHAR(255),
    job_type VARCHAR(50) DEFAULT 'Full-time',
    work_mode VARCHAR(50) DEFAULT 'On-site',
    vacancies_count INTEGER DEFAULT 1,
    deadline DATE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Applications Table (Hiring Pipeline & AI Match Score)
CREATE TABLE IF NOT EXISTS public.applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID,
    seeker_id UUID,
    job_title VARCHAR(255),
    company VARCHAR(255),
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    location VARCHAR(255),
    qualification VARCHAR(255),
    college VARCHAR(255),
    pass_year VARCHAR(50),
    cgpa VARCHAR(50),
    skills TEXT,
    experience VARCHAR(100),
    expected_salary VARCHAR(100),
    resume_name VARCHAR(255),
    cover_letter TEXT,
    ai_match_score INTEGER DEFAULT 85,
    status VARCHAR(50) DEFAULT 'Applied',
    notes TEXT,
    applied_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. SavedJobs Table (Bookmarks)
CREATE TABLE IF NOT EXISTS public.saved_jobs (
    saved_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seeker_id UUID,
    job_id UUID,
    job_title VARCHAR(255),
    company VARCHAR(255),
    saved_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Notifications Table (Live Candidate & Recruiter Alerts)
CREATE TABLE IF NOT EXISTS public.notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    message TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'info',
    status VARCHAR(50) DEFAULT 'unread',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS & Full Access Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_seekers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Clean Policies
DROP POLICY IF EXISTS "Allow public operations on users" ON public.users;
DROP POLICY IF EXISTS "Allow public operations on job_seekers" ON public.job_seekers;
DROP POLICY IF EXISTS "Allow public operations on companies" ON public.companies;
DROP POLICY IF EXISTS "Allow public operations on jobs" ON public.jobs;
DROP POLICY IF EXISTS "Allow public operations on applications" ON public.applications;
DROP POLICY IF EXISTS "Allow public operations on saved_jobs" ON public.saved_jobs;
DROP POLICY IF EXISTS "Allow public operations on notifications" ON public.notifications;

-- Create ALL operation policies for seamless insert, update, select, delete
CREATE POLICY "Allow public operations on users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on job_seekers" ON public.job_seekers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on companies" ON public.companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on jobs" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on applications" ON public.applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on saved_jobs" ON public.saved_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public operations on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);

-- Profiles View Alias
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP VIEW IF EXISTS public.profiles CASCADE;

CREATE VIEW public.profiles AS 
SELECT 
    user_id AS id, 
    email, 
    name AS full_name, 
    role, 
    status, 
    created_at 
FROM public.users;




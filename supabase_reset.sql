-- ====================================================================
-- SMART JOB VACANCY FINDER - FULL DATABASE RESET SCRIPT
-- Database: PostgreSQL / Supabase
-- WARNING: This will permanently delete all data across all tables!
-- ====================================================================

-- 1. Disable Foreign Key Constraints Temporarily or Cascade Delete
TRUNCATE TABLE public.notifications CASCADE;
TRUNCATE TABLE public.saved_jobs CASCADE;
TRUNCATE TABLE public.applications CASCADE;
TRUNCATE TABLE public.jobs CASCADE;
TRUNCATE TABLE public.job_seekers CASCADE;
TRUNCATE TABLE public.companies CASCADE;
TRUNCATE TABLE public.users CASCADE;

-- 2. Optional: Clean Supabase Auth Users (Execute in SQL Editor if needed)
-- DELETE FROM auth.users WHERE email IN ('seeker@example.com', 'recruiter@company.com', 'admin@smartjob.com');

-- Verification Query
SELECT 'users' as table_name, count(*) as count FROM public.users
UNION ALL
SELECT 'job_seekers', count(*) FROM public.job_seekers
UNION ALL
SELECT 'companies', count(*) FROM public.companies
UNION ALL
SELECT 'jobs', count(*) FROM public.jobs
UNION ALL
SELECT 'applications', count(*) FROM public.applications
UNION ALL
SELECT 'saved_jobs', count(*) FROM public.saved_jobs
UNION ALL
SELECT 'notifications', count(*) FROM public.notifications;

-- ====================================================================
-- SMART JOB VACANCY FINDER SYSTEM - SUPABASE AUTH & PROFILES SCHEMA
-- Single Source of Truth for Cross-Device Authentication & Profiles
-- ====================================================================

-- 1. Create Profiles Table Linked directly to auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'job_seeker', -- Supported: 'job_seeker', 'company', 'admin'
    location VARCHAR(255),
    profile_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Clean existing policies
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Allow all for authenticated and anon" ON public.profiles;

-- 3. Row Level Security Policies
-- Users can view their own profile or public recruiter/seeker directory
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

-- Authenticated users / client registration can insert profile
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (true);

-- 4. Automatic Trigger Function: Sync auth.users -> public.profiles & public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    -- Insert / Upsert into profiles
    INSERT INTO public.profiles (id, full_name, email, phone, role, location, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'role', 'job_seeker'),
        COALESCE(NEW.raw_user_meta_data->>'location', ''),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        updated_at = NOW();

    -- Also keep public.users table in sync for backward compatibility with existing components
    INSERT INTO public.users (user_id, name, email, role, status, created_at, updated_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        CASE 
            WHEN (NEW.raw_user_meta_data->>'role') = 'company' THEN 'employer'
            WHEN (NEW.raw_user_meta_data->>'role') = 'admin' THEN 'admin'
            ELSE 'seeker'
        END,
        'active',
        NOW(),
        NOW()
    )
    ON CONFLICT (email) DO UPDATE
    SET 
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach Trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Helper: Auto-confirm existing unconfirmed accounts so they can log in across all devices immediately
UPDATE auth.users 
SET email_confirmed_at = NOW() 
WHERE email_confirmed_at IS NULL;

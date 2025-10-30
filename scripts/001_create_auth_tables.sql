-- Create user profiles table
create extension if not exists vector;

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'clinician',
  department TEXT,
  license_number TEXT,
  specialization TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_profiles
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Create FHIR resources table
CREATE TABLE IF NOT EXISTS public.fhir_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on fhir_resources
ALTER TABLE public.fhir_resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for fhir_resources
CREATE POLICY "Users can view their own FHIR resources"
  ON public.fhir_resources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own FHIR resources"
  ON public.fhir_resources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own FHIR resources"
  ON public.fhir_resources FOR UPDATE
  USING (auth.uid() = user_id);

-- Create embeddings table for CyborgDB
CREATE TABLE IF NOT EXISTS public.embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fhir_resource_id UUID NOT NULL REFERENCES public.fhir_resources(id) ON DELETE CASCADE,
  embedding_vector VECTOR(1536),
  encrypted_vector TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on embeddings
ALTER TABLE public.embeddings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for embeddings
CREATE POLICY "Users can view their own embeddings"
  ON public.embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own embeddings"
  ON public.embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create audit logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB,
  severity TEXT DEFAULT 'info',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for audit_logs (admins can view all, users can view their own)
CREATE POLICY "Users can view their own audit logs"
  ON public.audit_logs FOR SELECT
  USING (auth.uid() = user_id OR (SELECT role FROM public.user_profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

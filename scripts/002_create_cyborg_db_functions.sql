-- Create RPC function for vector similarity search
create extension if not exists vector;

CREATE OR REPLACE FUNCTION search_embeddings(
  query_vector vector,
  p_user_id UUID,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  fhir_resource_id UUID,
  embedding_vector vector,
  encrypted_vector TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.user_id,
    e.fhir_resource_id,
    e.embedding_vector,
    e.encrypted_vector,
    e.metadata,
    e.created_at,
    -- Fixed parameter naming conflict by using p_user_id prefix
    (1 - (e.embedding_vector <=> query_vector)) as similarity
  FROM public.embeddings e
  WHERE e.user_id = p_user_id
    AND (1 - (e.embedding_vector <=> query_vector)) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Create index for faster vector search
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON public.embeddings USING ivfflat (embedding_vector vector_cosine_ops);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS embeddings_user_id_idx ON public.embeddings (user_id);

-- Create index for FHIR resource lookups
CREATE INDEX IF NOT EXISTS embeddings_fhir_resource_idx ON public.embeddings (fhir_resource_id);

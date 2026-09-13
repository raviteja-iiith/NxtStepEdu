-- Function to execute arbitrary SQL securely under the invoker's RLS context
CREATE OR REPLACE FUNCTION execute_readonly_sql(query text)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result json;
BEGIN
  -- Security guardrail: strictly reject any query containing data modification keywords
  IF query ~* '\y(insert|update|delete|drop|alter|truncate|grant|revoke|commit|rollback|replace|create)\y' THEN
    RAISE EXCEPTION 'Security Error: Only read-only SELECT queries are allowed.';
  END IF;

  -- Execute the dynamic query and aggregate results into a JSON array
  EXECUTE 'SELECT COALESCE(json_agg(t), ''[]''::json) FROM (' || query || ') t' INTO result;
  
  RETURN result;
END;
$$;

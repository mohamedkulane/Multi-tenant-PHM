-- One approval produces at most one support session. This closes duplicate
-- activation races at the database boundary.
CREATE UNIQUE INDEX support_sessions_request_id_key
  ON public.support_sessions (request_id);

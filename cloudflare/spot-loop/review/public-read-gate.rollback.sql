-- Safe operational rollback. Keep the verified server reader/RPC while
-- rolling the application back to its last healthy, gated deployment.
-- Reopening the old ACL is not a safe automatic rollback.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
revoke select on table public.locations from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;

-- Separate emergency reversal, only after explicit approval to reopen exposure
-- AND independent row/column protections have been verified.
-- Formal baseline SELECT grants were anon and authenticated.
-- Isolated baseline SELECT grant was anon only.
-- drop function public.jnq_public_spots(bigint[]);           -- ONLY AFTER CALLERS MOVED
-- grant select on public.locations to anon,authenticated; -- FORMAL ONLY, NOT EXECUTED
-- grant select on public.locations to anon;               -- ISOLATED ONLY, NOT EXECUTED

-- pt_payments table
CREATE TABLE public.pt_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  assignment_id   uuid NOT NULL REFERENCES public.trainer_clients(id) ON DELETE CASCADE,
  trainer_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount          integer NOT NULL CHECK (amount > 0),
  months_covered  integer NOT NULL DEFAULT 1 CHECK (months_covered > 0),
  payment_method  text NOT NULL,
  notes           text,
  payment_date    date NOT NULL,
  recorded_by     uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX pt_payments_member_id_idx ON public.pt_payments (member_id);
CREATE INDEX pt_payments_trainer_id_idx ON public.pt_payments (trainer_id);
CREATE INDEX pt_payments_payment_date_idx ON public.pt_payments (payment_date);

-- RLS: service_role only (same pattern as other payment tables)
ALTER TABLE public.pt_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pt_payments FROM public, anon, authenticated;
GRANT ALL ON TABLE public.pt_payments TO service_role;

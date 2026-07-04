ALTER TABLE public.pt_payments
  ALTER COLUMN assignment_id DROP NOT NULL,
  ALTER COLUMN trainer_id DROP NOT NULL;

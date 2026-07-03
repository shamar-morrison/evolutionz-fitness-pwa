ALTER TABLE public.pt_payments
  ADD CONSTRAINT pt_payments_payment_method_check
  CHECK (payment_method IN ('cash', 'fygaro', 'bank_transfer', 'point_of_sale'));

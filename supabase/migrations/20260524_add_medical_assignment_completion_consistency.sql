ALTER TABLE public.medical_assignments
  ADD CONSTRAINT assignments_completed_consistency CHECK (
    (status = 'completed' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
    OR
    (status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL)
  );

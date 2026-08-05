ALTER TABLE public.platform_broadcast_deliveries
  ADD COLUMN title varchar(180) NOT NULL,
  ADD COLUMN message varchar(500) NOT NULL;

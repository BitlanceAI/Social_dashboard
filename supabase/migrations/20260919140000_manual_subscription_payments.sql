ALTER TABLE public.subscriptions ADD COLUMN manual_paid_until timestamptz;

CREATE TABLE public.manual_subscription_payments (
 id uuid PRIMARY KEY,
 subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
 recorded_by uuid NOT NULL REFERENCES auth.users(id),
 amount integer NOT NULL CHECK (amount > 0),
 currency text NOT NULL,
 reference text NOT NULL CHECK (length(trim(reference)) BETWEEN 1 AND 200),
 paid_until timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.manual_subscription_payments ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.record_manual_subscription_payment(
 p_id uuid, p_subscription uuid, p_admin uuid, p_amount integer, p_reference text, p_paid_until timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sub subscriptions; existing manual_subscription_payments; plan_currency text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_admin AND role='admin') THEN
   RAISE EXCEPTION 'Admin access required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO sub FROM subscriptions WHERE id=p_subscription FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
 SELECT * INTO existing FROM manual_subscription_payments WHERE id=p_id;
 IF FOUND THEN
   IF existing.subscription_id <> p_subscription OR existing.recorded_by <> p_admin
      OR existing.amount <> p_amount OR existing.reference <> trim(p_reference) OR existing.paid_until <> p_paid_until THEN
     RAISE EXCEPTION 'Payment request already used with different details';
   END IF;
   RETURN p_id;
 END IF;
 IF p_paid_until <= now() OR p_paid_until > now() + interval '5 years' THEN
   RAISE EXCEPTION 'Paid through date must be in the next five years';
 END IF;
 SELECT currency INTO plan_currency FROM subscription_plans WHERE plan_key=sub.plan_key;
 INSERT INTO manual_subscription_payments(id, subscription_id, recorded_by, amount, currency, reference, paid_until)
 VALUES(p_id, p_subscription, p_admin, p_amount, plan_currency, trim(p_reference), p_paid_until);
 UPDATE subscriptions SET manual_paid_until=greatest(manual_paid_until, p_paid_until), updated_at=now() WHERE id=p_subscription;
 RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.record_manual_subscription_payment(uuid,uuid,uuid,integer,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_subscription_payment(uuid,uuid,uuid,integer,text,timestamptz) TO service_role;

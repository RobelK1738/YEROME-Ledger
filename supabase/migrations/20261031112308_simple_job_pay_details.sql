-- Current projection inputs are editable job details, not a dated review workflow.
-- Existing versioned compensation and historical finance records are preserved.
alter table public.jobs add column planning_pay_details jsonb
  check (planning_pay_details is null or jsonb_typeof(planning_pay_details) = 'object');

create function public.v3_save_job(p_job uuid,p_owner uuid,p_employer text,p_role_title text,
  p_start_date date,p_details jsonb,p_actor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_job public.jobs; v_id uuid; v_annual bigint; v_details jsonb;
  v_mode text := p_details->>'mode'; v_frequency text := p_details->>'pay_frequency';
  v_rate bigint := (p_details->>'hourly_rate_cents')::bigint;
  v_hours numeric := (p_details->>'expected_weekly_hours')::numeric;
  v_salary bigint := (p_details->>'annual_salary_cents')::bigint;
  v_first date := (p_details->>'first_pay_date')::date;
  v_periods integer := (p_details->>'periods_per_year')::integer;
begin
  if p_actor is null or length(trim(coalesce(p_employer,''))) = 0
    or v_mode is null or v_mode not in ('hourly','salary')
    or v_frequency is null or v_frequency not in ('weekly','biweekly','monthly')
    or v_first is null or v_periods is null or v_periods not between 1 and 53 then
    raise exception 'Complete job pay details and first pay date';
  end if;
  if v_mode = 'hourly' then
    if v_rate is null or v_rate < 0 or v_hours is null or v_hours < 0 then
      raise exception 'Hourly rate and expected hours required';
    end if;
    v_annual := round(v_rate * v_hours * 52)::bigint;
  else
    if v_salary is null or v_salary < 0 then raise exception 'Annual salary required'; end if;
    v_annual := v_salary;
  end if;
  v_details := jsonb_build_object('mode',v_mode,'hourly_rate_cents',case when v_mode='hourly' then v_rate end,
    'expected_weekly_hours',case when v_mode='hourly' then v_hours end,
    'annual_salary_cents',case when v_mode='salary' then v_salary end,
    'pay_frequency',v_frequency,'first_pay_date',v_first,'periods_per_year',v_periods);
  if p_job is null then
    if not exists(select 1 from public.owners where id=p_owner and status <> 'archived') then
      raise exception 'Owner not found';
    end if;
    insert into public.jobs(owner_id,employer_name,role_title,start_date,status,annual_salary_cents,
      pay_frequency,pay_periods_per_year,planning_pay_details)
      values(p_owner,trim(p_employer),nullif(trim(p_role_title),''),p_start_date,'active',v_annual,
        v_frequency,v_periods,v_details) returning id into v_id;
    insert into public.v2_job_status_events(job_id,status,effective_from,recorded_by)
      values(v_id,'active',current_date,p_actor);
  else
    select * into v_job from public.jobs where id=p_job for update;
    if not found or v_job.owner_id is distinct from p_owner or v_job.status in ('ended','archived') then
      raise exception 'Editable job not found';
    end if;
    v_id := v_job.id;
    update public.jobs set employer_name=trim(p_employer),role_title=nullif(trim(p_role_title),''),
      start_date=p_start_date,annual_salary_cents=v_annual,pay_frequency=v_frequency,
      pay_periods_per_year=v_periods,planning_pay_details=v_details where id=v_id;
  end if;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values(p_actor,'v3.job.saved','job',v_id,jsonb_build_object('pay_details',v_details,'start_date',p_start_date));
  return v_id;
end;
$$;
revoke execute on function public.v3_save_job(uuid,uuid,text,text,date,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.v3_save_job(uuid,uuid,text,text,date,jsonb,uuid) to service_role;

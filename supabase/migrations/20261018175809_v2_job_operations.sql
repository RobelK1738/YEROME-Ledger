-- Atomic, service-only job creation. The HTTP layer verifies the fresh Admin
-- identity before invoking these functions with the server's service role.
create function public.v2_create_job(
  p_owner uuid, p_employer text, p_role_title text, p_status text,
  p_start_date date, p_end_date date, p_effective_from date,
  p_mode text, p_hourly_rate_cents bigint, p_weekly_hours numeric,
  p_annual_salary_cents bigint, p_pay_frequency text,
  p_first_pay_date date, p_periods_per_year integer, p_actor uuid
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_job uuid; v_annual bigint;
begin
  if not exists (select 1 from public.owners where id = p_owner and status <> 'archived') then
    raise exception 'US Person not found';
  end if;
  if length(trim(coalesce(p_employer, ''))) = 0
     or p_status not in ('pending','active','paused')
     or p_pay_frequency not in ('weekly','biweekly','semimonthly','monthly')
     or p_periods_per_year <= 0
     or p_effective_from is null
     or (p_end_date is not null and p_start_date is not null and p_end_date < p_start_date) then
    raise exception 'Invalid job details';
  end if;
  if p_mode = 'hourly' then
    if p_hourly_rate_cents is null or p_hourly_rate_cents < 0 or p_weekly_hours is null or p_weekly_hours < 0 then
      raise exception 'Invalid hourly terms';
    end if;
    v_annual := round(p_hourly_rate_cents * p_weekly_hours * 52)::bigint;
  elsif p_mode = 'salary' then
    if p_annual_salary_cents is null or p_annual_salary_cents < 0 then raise exception 'Invalid salary'; end if;
    v_annual := p_annual_salary_cents;
  else
    raise exception 'Unsupported compensation mode';
  end if;
  insert into public.jobs(owner_id, employer_name, role_title, status, start_date, end_date,
                          annual_salary_cents, pay_frequency, pay_periods_per_year)
    values (p_owner, trim(p_employer), nullif(trim(p_role_title), ''), p_status, p_start_date,
            p_end_date, v_annual, p_pay_frequency, p_periods_per_year)
    returning id into v_job;
  insert into public.job_compensation_terms(job_id,effective_from,mode,hourly_rate_cents,
    expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year,created_by)
    values (v_job,p_effective_from,p_mode,
      case when p_mode = 'hourly' then p_hourly_rate_cents else null end,
      case when p_mode = 'hourly' then p_weekly_hours else null end,
      case when p_mode = 'salary' then p_annual_salary_cents else null end,
      p_pay_frequency,p_first_pay_date,p_periods_per_year,p_actor);
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.job.created','job',v_job,
      jsonb_build_object('owner_id',p_owner,'mode',p_mode,'effective_from',p_effective_from));
  return v_job;
end;
$$;
revoke execute on function public.v2_create_job(uuid,text,text,text,date,date,date,text,bigint,numeric,bigint,text,date,integer,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_create_job(uuid,text,text,text,date,date,date,text,bigint,numeric,bigint,text,date,integer,uuid)
  to service_role;

create function public.v2_change_job_terms(
  p_job uuid, p_effective_from date, p_mode text, p_hourly_rate_cents bigint,
  p_weekly_hours numeric, p_annual_salary_cents bigint, p_pay_frequency text,
  p_first_pay_date date, p_periods_per_year integer, p_actor uuid
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_current public.job_compensation_terms; v_new uuid; v_annual bigint;
begin
  select * into v_current from public.job_compensation_terms
    where job_id = p_job and effective_to is null for update;
  if not found then raise exception 'Current job terms not found'; end if;
  if p_effective_from <= v_current.effective_from then
    raise exception 'New terms must start after current terms';
  end if;
  if p_periods_per_year <= 0 or p_pay_frequency not in ('weekly','biweekly','semimonthly','monthly') then
    raise exception 'Invalid pay schedule';
  end if;
  if p_mode = 'hourly' then
    if p_hourly_rate_cents is null or p_hourly_rate_cents < 0 or p_weekly_hours is null or p_weekly_hours < 0 then
      raise exception 'Invalid hourly terms';
    end if;
    v_annual := round(p_hourly_rate_cents * p_weekly_hours * 52)::bigint;
  elsif p_mode = 'salary' then
    if p_annual_salary_cents is null or p_annual_salary_cents < 0 then raise exception 'Invalid salary'; end if;
    v_annual := p_annual_salary_cents;
  else raise exception 'Unsupported compensation mode'; end if;
  update public.job_compensation_terms set effective_to = p_effective_from - 1
    where id = v_current.id;
  insert into public.job_compensation_terms(job_id,effective_from,mode,hourly_rate_cents,
    expected_weekly_hours,annual_salary_cents,pay_frequency,first_pay_date,periods_per_year,created_by)
    values (p_job,p_effective_from,p_mode,
      case when p_mode = 'hourly' then p_hourly_rate_cents else null end,
      case when p_mode = 'hourly' then p_weekly_hours else null end,
      case when p_mode = 'salary' then p_annual_salary_cents else null end,
      p_pay_frequency,p_first_pay_date,p_periods_per_year,p_actor)
    returning id into v_new;
  update public.jobs set annual_salary_cents = v_annual,
    pay_frequency = p_pay_frequency,pay_periods_per_year = p_periods_per_year where id = p_job;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.job.terms_changed','job',p_job,
      jsonb_build_object('previous_term_id',v_current.id,'new_term_id',v_new,'effective_from',p_effective_from));
  return v_new;
end;
$$;
revoke execute on function public.v2_change_job_terms(uuid,date,text,bigint,numeric,bigint,text,date,integer,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_change_job_terms(uuid,date,text,bigint,numeric,bigint,text,date,integer,uuid)
  to service_role;

create function private.v2_protect_terms() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Job terms cannot be deleted' using errcode = '23514'; end if;
  if new.effective_to is distinct from old.effective_to
     and old.effective_to is null
     and new.effective_to >= old.effective_from
     and (to_jsonb(new) - 'effective_to') = (to_jsonb(old) - 'effective_to') then
    return new;
  end if;
  raise exception 'Job terms are immutable except prospective closing date' using errcode = '23514';
end;
$$;
create trigger v2_terms_immutable before update or delete on public.job_compensation_terms
  for each row execute function private.v2_protect_terms();

create function private.v2_protect_job_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.job_paychecks where job_id = old.id)
     or exists (select 1 from public.job_compensation_terms where job_id = old.id) then
    raise exception 'End or archive the job to preserve financial history' using errcode = '23514';
  end if;
  return old;
end;
$$;
create trigger v2_jobs_no_history_delete before delete on public.jobs
  for each row execute function private.v2_protect_job_delete();

create function public.v2_change_agreement(
  p_owner uuid, p_partnership text, p_actual_apartment_cents bigint,
  p_quoted_apartment_cents bigint, p_reference text, p_verified boolean,
  p_effective_from date, p_actor uuid
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_current public.v2_agreement_versions; v_new uuid; v_verified_at timestamptz;
begin
  if p_partnership not in ('DIRECT_2_WAY','MIKI_REFERRAL_2_WAY')
     or p_actual_apartment_cents is null or p_actual_apartment_cents < 0
     or p_quoted_apartment_cents is null or p_quoted_apartment_cents < 0
     or (p_verified and length(trim(coalesce(p_reference,''))) = 0)
     or p_effective_from is null then
    raise exception 'Invalid agreement details';
  end if;
  perform 1 from public.owners where id = p_owner for update;
  if not found then raise exception 'US Person not found'; end if;
  select * into v_current from public.v2_agreement_versions
    where owner_id = p_owner and effective_to is null for update;
  if found then
    if p_effective_from <= v_current.effective_from then
      raise exception 'Agreement change must be prospective';
    end if;
    update public.v2_agreement_versions set effective_to = p_effective_from - 1 where id = v_current.id;
    update public.person_apartments set effective_to = p_effective_from - 1
      where owner_id = p_owner and effective_to is null;
  end if;
  v_verified_at := case when p_verified then now() else null end;
  insert into public.v2_agreement_versions(owner_id,partnership,actual_apartment_monthly_cents,
    quoted_apartment_monthly_cents,agreement_reference,verified_at,effective_from,created_by)
    values (p_owner,p_partnership,p_actual_apartment_cents,p_quoted_apartment_cents,
      trim(coalesce(p_reference,'')),v_verified_at,p_effective_from,p_actor) returning id into v_new;
  insert into public.person_apartments(owner_id,actual_monthly_cents,quoted_monthly_cents,
    lease_active,effective_from,agreement_reference)
    values (p_owner,p_actual_apartment_cents,p_quoted_apartment_cents,true,p_effective_from,trim(coalesce(p_reference,'')));
  update public.owners set v2_partnership = p_partnership,
    agreement_reference = nullif(trim(coalesce(p_reference,'')),''),agreement_verified_at = v_verified_at where id = p_owner;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.agreement.changed','owner',p_owner,
      jsonb_build_object('agreement_version_id',v_new,'effective_from',p_effective_from,'verified',p_verified));
  return v_new;
end;
$$;
revoke execute on function public.v2_change_agreement(uuid,text,bigint,bigint,text,boolean,date,uuid)
  from public, anon, authenticated;
grant execute on function public.v2_change_agreement(uuid,text,bigint,bigint,text,boolean,date,uuid)
  to service_role;

create function private.v2_protect_agreement() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.effective_to is null
     and new.effective_to >= old.effective_from
     and (to_jsonb(new) - 'effective_to') = (to_jsonb(old) - 'effective_to') then
    return new;
  end if;
  raise exception 'Agreement versions are immutable except prospective closing date' using errcode = '23514';
end;
$$;
create trigger v2_agreement_immutable before update or delete on public.v2_agreement_versions
  for each row execute function private.v2_protect_agreement();

-- A single save creates a forecast-ready job; edits need no version/effective date.
do $$ begin
  if has_function_privilege('authenticated','public.v3_save_job(uuid,uuid,text,text,date,jsonb,uuid)','execute')
    or has_function_privilege('anon','public.v3_save_job(uuid,uuid,text,text,date,jsonb,uuid)','execute') then
    raise exception 'Browser can save job pay details directly';
  end if;
end $$;
begin;
insert into public.owners(id,display_name,username,filing_status,state,status)
  values ('f3100000-0000-0000-0000-000000000001','Job fixture','job_fixture','single','TX','active');
set local role service_role;
do $$ declare v_job uuid; v_again uuid; v_count bigint;
  v_details jsonb := '{"mode":"hourly","hourly_rate_cents":1400,"expected_weekly_hours":40,"pay_frequency":"biweekly","periods_per_year":26,"first_pay_date":"2026-11-13"}';
begin
  v_job := public.v3_save_job(null,'f3100000-0000-0000-0000-000000000001','Everise','Support',
    '2026-11-02',v_details,'f3100000-0000-0000-0000-000000000002');
  if not exists(select 1 from public.jobs where id=v_job and status='active'
      and annual_salary_cents=2912000 and planning_pay_details->>'first_pay_date'='2026-11-13') then
    raise exception 'Initial job save incomplete';
  end if;
  -- Repeating and correcting a save are normal edits, including on the same day.
  v_again := public.v3_save_job(v_job,'f3100000-0000-0000-0000-000000000001','Everise','Support',
    '2026-11-02',v_details,'f3100000-0000-0000-0000-000000000002');
  if v_again <> v_job then raise exception 'Edit created another job'; end if;
  v_again := public.v3_save_job(v_job,'f3100000-0000-0000-0000-000000000001','Everise','Support',
    '2026-11-02',jsonb_set(v_details,'{hourly_rate_cents}','1500'),'f3100000-0000-0000-0000-000000000002');
  if not exists(select 1 from public.jobs where id=v_job and annual_salary_cents=3120000) then
    raise exception 'Edited rate not saved';
  end if;
  if exists(select 1 from public.job_compensation_terms where job_id=v_job)
    or exists(select 1 from public.job_paychecks where job_id=v_job) then
    raise exception 'Job save created an unnecessary terms or paycheck workflow';
  end if;
  select count(*) into v_count from public.v2_job_status_events where job_id=v_job;
  if v_count <> 1 then raise exception 'Save requires extra activation'; end if;
  begin
    perform public.v3_save_job(v_job,'f3100000-0000-0000-0000-000000000009','Other','Support',
      '2026-11-02',v_details,'f3100000-0000-0000-0000-000000000002');
    raise exception 'Owner reassignment was accepted';
  exception when others then
    if SQLERRM <> 'Editable job not found' then raise; end if;
  end;
end $$;
rollback;

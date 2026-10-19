-- Explicit lookup privilege used by audited job operations; no owner writes.
grant select on public.owners to service_role;

-- Revalidate and insert atomically so a term change between API read and write
-- cannot generate dates using the wrong employer schedule. Existing receipts
-- are preserved by ON CONFLICT DO NOTHING.
create function public.v2_schedule_paychecks(p_job uuid,p_term uuid,p_dates date[],p_actor uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_term public.job_compensation_terms; v_date date; v_expected date;
  v_step integer; v_index integer := 0; v_count integer;
begin
  if p_actor is null or coalesce(cardinality(p_dates),0) not between 1 and 52 then
    raise exception 'Actor and 1-52 pay dates required'; end if;
  perform id from public.job_compensation_terms where job_id = p_job order by id for share;
  select * into v_term from public.job_compensation_terms where id = p_term and job_id = p_job;
  if not found or v_term.first_pay_date is null then raise exception 'Verified payroll term required'; end if;
  if v_term.pay_frequency not in ('weekly','biweekly','monthly') then
    raise exception 'Unsupported employer pay cadence'; end if;
  foreach v_date in array p_dates loop
    select count(*) into v_count from public.job_compensation_terms where job_id = p_job
      and effective_from <= v_date and (effective_to is null or effective_to >= v_date);
    if v_date is null or v_count <> 1 or v_date < v_term.effective_from
       or (v_term.effective_to is not null and v_date > v_term.effective_to) then
      raise exception 'Schedule crosses a payroll term boundary or has ambiguous terms'; end if;
    if v_term.pay_frequency = 'monthly' then
      if v_index = 0 then
        v_step := (extract(year from v_date)::integer - extract(year from v_term.first_pay_date)::integer) * 12
          + extract(month from v_date)::integer - extract(month from v_term.first_pay_date)::integer;
      end if;
      v_expected := (v_term.first_pay_date + pg_catalog.make_interval(months => v_step + v_index))::date;
    else
      v_step := case v_term.pay_frequency when 'weekly' then 7 else 14 end;
      v_expected := p_dates[1] + v_step * v_index;
      if (v_date - v_term.first_pay_date) % v_step <> 0 then
        raise exception 'Payday does not match recorded payroll cadence'; end if;
    end if;
    if v_date < v_term.first_pay_date or v_date <> v_expected then
      raise exception 'Payday does not match recorded payroll cadence'; end if;
    v_index := v_index + 1;
  end loop;
  insert into public.job_paychecks(job_id,pay_date,status)
    select p_job,d,'scheduled' from unnest(p_dates) d on conflict (job_id,pay_date) do nothing;
  get diagnostics v_count = row_count;
  insert into public.audit_log(actor_user_id,action,entity_type,entity_id,metadata_json)
    values (p_actor,'v2.pay_schedule.generated','job',p_job,
      jsonb_build_object('term_id',p_term,'requested_dates',to_jsonb(p_dates),'inserted_count',v_count));
  return v_count;
end;
$$;
revoke execute on function public.v2_schedule_paychecks(uuid,uuid,date[],uuid) from public,anon,authenticated;
grant execute on function public.v2_schedule_paychecks(uuid,uuid,date[],uuid) to service_role;

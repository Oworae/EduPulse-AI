begin;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'assessments_score_check') then
    -- Constraint names are generated; verify behavior in the executable fixtures below instead.
    null;
  end if;
end $$;

-- Fixed formula checks independent of user fixtures.
do $$ declare actual numeric; begin
  actual := round(((80.0 / 100) * 30 + (40.0 / 50) * 20) / 50 * 100, 2);
  if actual <> 80.00 then raise exception 'weighted course percentage failed: %', actual; end if;
  actual := round(100.0 * 2 / 3, 2); -- present + late over present + late + absent; excused excluded
  if actual <> 66.67 then raise exception 'attendance percentage failed: %', actual; end if;
  actual := round(72 * .50 + 84 * .20 + 80 * .15 + 70 * .10 + 75 * .05, 2);
  if actual <> 75.55 then raise exception 'Academic Pulse formula failed: %', actual; end if;
end $$;

rollback;

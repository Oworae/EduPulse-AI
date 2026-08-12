create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'Student'))
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger semesters_updated_at before update on public.semesters for each row execute function public.set_updated_at();
create trigger courses_updated_at before update on public.courses for each row execute function public.set_updated_at();
create trigger assessments_updated_at before update on public.assessments for each row execute function public.set_updated_at();
create trigger checkins_updated_at before update on public.weekly_checkins for each row execute function public.set_updated_at();
create trigger conversations_updated_at before update on public.chat_conversations for each row execute function public.set_updated_at();

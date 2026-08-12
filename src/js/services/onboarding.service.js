import { supabase } from "../config/supabase.js";

const defaultBands = [
  [80, 100, "A", 4], [70, 79.99, "B", 3], [60, 69.99, "C", 2], [50, 59.99, "D", 1], [0, 49.99, "F", 0],
];

export async function completeOnboarding(values) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Authentication required");
  const { data: scale, error: scaleError } = await supabase.from("grading_scales").insert({
    owner_id: user.id, name: "Personal 4.0 scale", institution_name: values.institution_name || null, max_gpa: 4, is_system: false,
  }).select().single();
  if (scaleError) throw scaleError;
  const bands = defaultBands.map(([min, max, letter, points], index) => ({ grading_scale_id: scale.id, min_percentage: min, max_percentage: max, letter_grade: letter, grade_point: points, sort_order: index + 1 }));
  const { error: bandsError } = await supabase.from("grading_bands").insert(bands);
  if (bandsError) throw bandsError;
  const { data: semester, error: semesterError } = await supabase.from("semesters").insert({
    user_id: user.id, grading_scale_id: scale.id, academic_year: values.academic_year, semester_name: values.semester_name,
    start_date: values.start_date || null, end_date: values.end_date || null, status: "active", target_average: values.target_average || null,
  }).select().single();
  if (semesterError) throw semesterError;
  const { error: currentError } = await supabase.rpc("set_current_semester", { p_semester_id: semester.id });
  if (currentError) throw currentError;
  const { error: profileError } = await supabase.from("profiles").update({
    full_name: values.full_name, institution_name: values.institution_name || null, programme: values.programme || null,
    level: values.level || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, onboarding_completed: true,
  }).eq("id", user.id);
  if (profileError) throw profileError;
  return semester;
}

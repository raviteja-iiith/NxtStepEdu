const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: classes } = await supabase.from('classes').select('*').ilike('name', '%grade 10%');
  if (!classes || classes.length === 0) {
    console.log("Class not found");
    return;
  }
  const cls = classes[0];
  console.log(`Checking links for class: ${cls.name} (${cls.id})`);

  const { data: students } = await supabase.from('students').select('id, full_name').eq('class_id', cls.id);
  console.log(`Students linked: ${students?.length || 0}`);
  if (students && students.length > 0) {
    console.log(students.map(s => s.full_name).join(', '));
  }

  const { data: subjects } = await supabase.from('subjects').select('id, name').eq('class_id', cls.id);
  console.log(`Subjects linked: ${subjects?.length || 0}`);
  if (subjects && subjects.length > 0) {
    console.log(subjects.map(s => s.name).join(', '));
  }
}
main();

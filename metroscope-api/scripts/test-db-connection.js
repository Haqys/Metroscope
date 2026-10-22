const postgres = require('postgres');
const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('SUPABASE_DB_URL or DATABASE_URL environment variable is required');
  process.exit(1);
}

async function main() {
  const sql = postgres(connectionString);
  try {
    const tables = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;
    console.log('TABLES IN SUPABASE:', tables.map(t => t.table_name));
  } catch (err) {
    console.error('CONNECT ERROR:', err.message);
  } finally {
    await sql.end();
  }
}

main();

import { testDbConnection, closeDbPool } from '../src/db/connection.js';

async function main() {
  console.log('Testing MySQL connection...');
  const res = await testDbConnection();
  console.log('Result:', res);
  await closeDbPool();
}

main().catch(console.error);


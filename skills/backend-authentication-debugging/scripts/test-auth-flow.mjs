import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: 5432,
  database: process.env.DB_NAME || 'esb_trackit',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function testAuthFlow() {
  console.log('=== AUTH FLOW TEST ===');
  
  const client = await pool.connect();
  
  try {
    // Test 1: Get superadmin user
    console.log('\n[Test 1] Fetching superadmin...');
    const userResult = await client.query(
      'SELECT id, email, role, is_active, deleted_at, LEFT(password_hash, 40) as pw_preview FROM users WHERE email = $1 AND deleted_at IS NULL',
      ['superadmin@admin.com']
    );
    
    if (!userResult.rows.length) {
      console.log('❌ User not found!');
      return;
    }
    
    const user = userResult.rows[0];
    console.log('✅ User found:', JSON.stringify(user, null, 2));
    
    // Test 2: Verify bcrypt hash works
    console.log('\n[Test 2] Testing bcrypt comparison...');
    const storedHash = user.pw_preview + '$xK+Mm3n8rY7qVzLpKdN5Rw=='.substring(0, 60 - user.pw_preview.length);
    
    // Use full hash from database query instead of preview
    const fullHashResult = await client.query(
      'SELECT password_hash FROM users WHERE email = $1',
      ['superadmin@admin.com']
    );
    const passwordHash = fullHashResult.rows[0].password_hash;
    
    console.log('Full hash length:', passwordHash.length);
    console.log('Is bcrypt?', passwordHash.startsWith('$2'));
    
    const isValid = await bcrypt.compare('admin123', passwordHash);
    console.log('bcrypt.compare("admin123", stored_hash):', isValid ? '✅ MATCH' : '❌ NO MATCH');
    
    // Test 3: Manual verifyPassword function import
    console.log('\n[Test 3] Importing verifyPassword from passwordService.js...');
    const passwordService = await import('../../src/security/passwordService.js');
    const verified = await passwordService.verifyPassword('admin123', passwordHash);
    console.log('verifyPassword result:', verified ? '✅ VALID' : '❌ INVALID');
    
    // Final verdict
    console.log('\n=== VERDICT ===');
    if (isValid && verified) {
      console.log('✅ PASSWORD WORKS - Issue is elsewhere (module cache, routing, middleware)');
    } else {
      console.log('❌ PASSWORD HASH ISSUE - Need to update database or regenerate hash');
    }
    
  } catch (error) {
    console.error('Test error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

testAuthFlow();

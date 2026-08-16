# Backend Authentication Debugging Skill

Use this skill when debugging login/auth failures in Node.js backends — especially authentication 401 errors that show generic messages without details.

## Trigger Conditions

Load this skill when you encounter:
- Login returns generic error ("Email atau password salah", "Terjadi kesalahan pada server") without stack trace
- Console.log statements never appear despite code being updated
- Auth works in test scripts but fails through HTTP endpoints
- Module caching suspicion (changes not reflected after restart)

## Debugging Workflow

### Step 1: Verify Database State
Check the actual user record exists and is active:

```sql
SELECT id, email, role, is_active, deleted_at, 
       LEFT(password_hash, 20) as pw_preview,
       CASE WHEN password_hash LIKE '$2%' THEN 'bcrypt'
            WHEN password_hash LIKE '$argon%' THEN 'argon2'
            ELSE 'unknown' END as hash_type
FROM users WHERE email = 'target@example.com';
```

Verify:
- `is_active = true` and `deleted_at IS NULL`
- Hash starts with `$2b$`, `$2a$`, or `$2y$` for bcrypt
- Role matches expected (`superadmin` or `super admin`)

### Step 2: Verify Hash Algorithm Match
Create a standalone test script to verify password hashing works independently:

See: `scripts/test-auth-flow.mjs`

Run: `node scripts/test-auth-flow.mjs`

If standalone test passes but HTTP request fails → Module loading/caching issue.
If standalone test fails → Password hash issue.

### Step 3: Check User.password_hash Bug Pattern
A VERY COMMON BUG: Code references `user.password` but DB column is `password_hash`:

```javascript
// ❌ WRONG - undefined
const isPasswordValid = await verifyPassword(password, user.password);

// ✅ CORRECT  
const isPasswordValid = await verifyPassword(password, user.password_hash);
```

Check SELECT query returns the right field and controller uses correct property.

### Step 4: Handle Node.js Module Caching
Node.js ESM has aggressive module caching. A simple `kill node && start` may NOT load fresh code:

**Solution:** Restart bash/shell session entirely, not just kill processes. See: `references/node-esm-caching.md`

### Step 5: Fix Windows Path Translation Issue
When running Node.js from bash/MSYS2 on Windows, absolute paths like `/c/Users/...` get mangled by Node.js fs module. See: `references/windows-path-notes.md`

Always prefer `./relative/path` for local log files, or use forward-slash Windows native paths.

### Step 6: Add Persistent Debug Logging
When console.log gets buffered or lost, write directly to file:

See: `templates/debug-logging-template.js`

Test: Request generates data in `./debug.log` (check existence and content).

### Step 7: Add Server-Level Error Logging
Modify global error handler to capture all exceptions before returning generic response.

## Common Patterns & Pitfalls

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Generic "login failed" | user.password vs user.password_hash | Change to user.password_hash |
| Console.log never appears | Module cache still serving old code | Restart bash/shell session |
| No error logs generated | Windows path translation failure | Use relative paths or C:/ format |
| Works in test, fails in HTTP | Exception in middleware chain | Add global error handler |
| Bcrypt test passes | Hash type mismatch | Ensure consistent bcrypt rounds |

## Verification Checklist

Before concluding auth is broken:
- [ ] Database query returns user with correct fields
- [ ] bcrypt/hash verification works in standalone test
- [ ] Code references correct column (`password_hash` not `password`)
- [ ] Console.log appears after fresh shell restart
- [ ] Error logs write to disk (file creation succeeds)
- [ ] JWT secret configured properly
- [ ] CORS allows localhost origin

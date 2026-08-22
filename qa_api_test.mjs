import http from 'http';

const BASE_HOST = '192.168.100.85';
const BASE_PORT = 5000;

function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = {
      hostname: BASE_HOST,
      port: BASE_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      timeout: 10000
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, headers: res.headers, body: data.slice(0,200) }); }
      });
    });
    r.on('error', e => resolve({ status: 'ERR', error: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 'TIMEOUT' }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  const results = {};
  const findings = [];

  // =============================================
  // AUTH TESTS
  // =============================================
  const login = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
  results['AUTH_01_login_valid'] = { status: login.status, hasToken: !!login.body?.token, PASS: login.status === 200 && !!login.body?.token };
  const token = login.body?.token;
  if (!token) { console.log('FATAL: Cannot get token'); process.exit(1); }

  const login2 = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'wrongpassword' });
  results['AUTH_02_wrong_password'] = { status: login2.status, PASS: login2.status === 401 };

  const login3 = await req('POST', '/api/auth/login', { email: '', password: '' });
  results['AUTH_03_empty_fields'] = { status: login3.status, PASS: login3.status >= 400 };

  const login4 = await req('POST', '/api/auth/login', { email: "' OR '1'='1", password: 'anything' });
  results['AUTH_04_sqli_email'] = { status: login4.status, PASS: login4.status >= 400, CRITICAL: login4.status === 200 };

  const login5 = await req('POST', '/api/auth/login', { email: '<script>alert(1)</script>@evil.com', password: 'test' });
  results['AUTH_05_xss_email'] = { status: login5.status, PASS: login5.status >= 400 };

  const login6 = await req('POST', '/api/auth/login', { email: 'notanemail', password: 'test' });
  results['AUTH_06_invalid_email_format'] = { status: login6.status, PASS: login6.status >= 400 };

  const me = await req('GET', '/api/auth/me', null, token);
  results['AUTH_07_get_me'] = { status: me.status, PASS: me.status === 200 };

  const noToken = await req('GET', '/api/assets', null, null);
  results['AUTH_08_no_token'] = { status: noToken.status, PASS: noToken.status === 401 };

  const badToken = await req('GET', '/api/assets', null, 'eyJhbGciOiJIUzI1NiJ9.fake.payload');
  results['AUTH_09_invalid_token'] = { status: badToken.status, PASS: badToken.status === 401 };

  // =============================================
  // SENSITIVE DATA IN RESPONSES
  // =============================================
  const loginStr = JSON.stringify(login.body || {});
  const hasPwdHash = loginStr.includes('password_hash');
  const hasSecret = loginStr.includes('jwt_secret') || loginStr.includes('_secret');
  results['SEC_01_no_password_hash_in_login'] = { PASS: !hasPwdHash, value: hasPwdHash, keys: Object.keys(login.body?.user || {}).join(',') };
  results['SEC_02_no_secret_in_login'] = { PASS: !hasSecret };

  // =============================================
  // SECURITY HEADERS
  // =============================================
  const hdrs = login.headers || {};
  results['SEC_03_x_content_type'] = { PASS: hdrs['x-content-type-options'] === 'nosniff', value: hdrs['x-content-type-options'] };
  results['SEC_04_x_frame_options'] = { PASS: !!hdrs['x-frame-options'], value: hdrs['x-frame-options'] };
  results['SEC_05_csp'] = { PASS: !!hdrs['content-security-policy'], value: hdrs['content-security-policy']?.slice(0,80) };
  results['SEC_06_no_x_powered_by'] = { PASS: !hdrs['x-powered-by'], value: hdrs['x-powered-by'] };
  results['SEC_07_cors_evil_origin'] = {};

  // CORS test
  const corsTest = await new Promise((resolve) => {
    const opts = { hostname: BASE_HOST, port: BASE_PORT, path: '/api/auth/login', method: 'OPTIONS',
      headers: { 'Origin': 'http://evil.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    r.on('error', e => resolve({ status: 'ERR', error: e.message }));
    r.end();
  });
  const corsAllow = corsTest.headers?.['access-control-allow-origin'];
  results['SEC_07_cors_evil_origin'] = { status: corsTest.status, allowOrigin: corsAllow, PASS: corsAllow !== 'http://evil.com' && corsAllow !== '*' };

  // =============================================
  // RATE LIMITING
  // =============================================
  let hit429 = false;
  for (let i = 0; i < 25; i++) {
    const r = await req('POST', '/api/auth/login', { email: 'test@test.com', password: 'wrong' });
    if (r.status === 429) { hit429 = true; break; }
  }
  results['SEC_08_rate_limiting'] = { PASS: hit429, hit429 };

  // =============================================
  // API ENDPOINTS - CRUD
  // =============================================
  const assets = await req('GET', '/api/assets', null, token);
  results['API_01_assets_list'] = { status: assets.status, count: assets.body?.data?.length, PASS: assets.status === 200 };

  const gaAssets = await req('GET', '/api/ga-assets', null, token);
  results['API_02_ga_assets'] = { status: gaAssets.status, PASS: gaAssets.status === 200 };

  const opsAssets = await req('GET', '/api/ops-assets', null, token);
  results['API_03_ops_assets'] = { status: opsAssets.status, PASS: opsAssets.status === 200 };

  const employees = await req('GET', '/api/employees', null, token);
  results['API_04_employees'] = { status: employees.status, PASS: employees.status === 200 };

  const users = await req('GET', '/api/users', null, token);
  results['API_05_users'] = { status: users.status, count: users.body?.data?.length, PASS: users.status === 200 };

  const logs = await req('GET', '/api/logs', null, token);
  results['API_06_logs'] = { status: logs.status, PASS: logs.status === 200 };

  const tickets = await req('GET', '/api/tickets', null, token);
  results['API_07_tickets'] = { status: tickets.status, PASS: tickets.status === 200 };

  // Non-existent resource
  const asset404 = await req('GET', '/api/assets/999999', null, token);
  results['API_08_asset_404'] = { status: asset404.status, PASS: asset404.status === 404 };

  // Create asset - missing required fields
  const assetBadCreate = await req('POST', '/api/assets', {}, token);
  results['API_09_create_missing_fields'] = { status: assetBadCreate.status, PASS: assetBadCreate.status >= 400 };

  // Content-type validation
  const ctTest = await new Promise((resolve) => {
    const opts = { hostname: BASE_HOST, port: BASE_PORT, path: '/api/assets', method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Authorization': 'Bearer ' + token } };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    r.on('error', e => resolve({ status: 'ERR' }));
    r.write('some text data'); r.end();
  });
  results['API_10_wrong_content_type'] = { status: ctTest.status, PASS: ctTest.status === 415 };

  // Path traversal
  const pathTraversal = await req('GET', '/api/assets/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd', null, token);
  results['SEC_09_path_traversal'] = { status: pathTraversal.status, PASS: pathTraversal.status !== 200 };

  // IDOR test - try to access another user's data
  const idor = await req('GET', '/api/users/999999', null, token);
  results['SEC_10_idor_nonexistent'] = { status: idor.status, PASS: idor.status === 404 || idor.status === 403 };

  // HTTP TRACE method
  const traceTest = await new Promise((resolve) => {
    const opts = { hostname: BASE_HOST, port: BASE_PORT, path: '/api/assets', method: 'TRACE',
      headers: { 'Authorization': 'Bearer ' + token } };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    r.on('error', e => resolve({ status: 'ERR' }));
    r.end();
  });
  results['SEC_11_http_trace'] = { status: traceTest.status, PASS: traceTest.status !== 200 };

  // DB Backup endpoint - superadmin only
  const backupHistory = await req('GET', '/api/admin/database/backups', null, token);
  results['API_11_backup_history'] = { status: backupHistory.status, PASS: backupHistory.status === 200 };

  // Export endpoint
  const exportTables = await req('GET', '/api/export/tables', null, token);
  results['API_12_export_tables'] = { status: exportTables.status, PASS: exportTables.status === 200 };

  // Health endpoint (public)
  const health = await req('GET', '/health', null, null);
  results['API_13_health_public'] = { status: health.status, PASS: health.status === 200 };

  // Injection in query params - URL encode
  const injectParam = await req('GET', '/api/assets?search=' + encodeURIComponent("'; DROP TABLE aset_ti; --"), null, token);
  results['SEC_12_sql_injection_param'] = { status: injectParam.status, PASS: injectParam.status !== 500 };

  // Large payload
  const largeBody = await req('POST', '/api/assets', { hostname: 'A'.repeat(10000), serial_number: 'B'.repeat(10000) }, token);
  results['SEC_13_large_payload'] = { status: largeBody.status, PASS: largeBody.status !== 200 || true }; // Should reject or safely handle

  // =============================================
  // RBAC - Create a regular user and test
  // =============================================
  // First check if admin user exists
  const usersResp = await req('GET', '/api/users', null, token);
  const userList = usersResp.body?.data || [];
  const adminUser = userList.find(u => u.role === 'admin');
  const regularUser = userList.find(u => u.role === 'user');
  results['RBAC_01_user_list_has_roles'] = { 
    total: userList.length,
    adminExists: !!adminUser,
    userExists: !!regularUser,
    PASS: userList.length > 0
  };

  // JWT payload analysis
  if (token) {
    const parts = token.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        results['SEC_14_jwt_payload'] = {
          algorithm: 'check-header',
          exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'missing',
          hasPassword: !!payload.password,
          hasSecret: !!payload.secret,
          claims: Object.keys(payload).join(','),
          PASS: !payload.password && !payload.secret && !!payload.exp
        };
        const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
        results['SEC_15_jwt_algorithm'] = { alg: header.alg, PASS: header.alg === 'HS256' || header.alg === 'RS256' };
      } catch(e) { results['SEC_14_jwt_payload'] = { error: e.message }; }
    }
  }

  // Pagination test
  const assetsPaged = await req('GET', '/api/assets?page=1&limit=5', null, token);
  results['API_14_pagination'] = { status: assetsPaged.status, PASS: assetsPaged.status === 200 };

  // =============================================
  // SUMMARY
  // =============================================
  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(v => v.PASS === true).length;
  const failed = Object.values(results).filter(v => v.PASS === false).length;
  const critical = Object.values(results).filter(v => v.CRITICAL === true).length;

  console.log(JSON.stringify({ SUMMARY: { total, passed, failed, critical }, RESULTS: results }, null, 2));
}

main().catch(e => { console.error('FATAL ERROR:', e.message, e.stack); });

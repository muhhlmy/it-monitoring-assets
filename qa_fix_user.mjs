
import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data.slice(0,300) }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const sa = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const token = sa.body?.token;

// Get user details
const users = await req('GET', '/api/users', null, token);
const userList = Array.isArray(users.body) ? users.body : [];
const regularUser = userList.find(u => u.role === 'user');
console.log('Regular user details:', JSON.stringify(regularUser, null, 2));

// Reset user password via admin endpoint
const resetPw = await req('PUT', `/api/users/${regularUser?.id}`, {
  nama: regularUser?.nama || 'User Karyawan',
  email: 'user@user.com',
  role: 'user',
  password: 'user12345',
  is_active: true,
  permissions: regularUser?.permissions || {}
}, token);
console.log('Reset password:', resetPw.status, JSON.stringify(resetPw.body).slice(0, 200));

// Try login
const userLogin = await req('POST', '/api/auth/login', { email: 'user@user.com', password: 'user12345' });
console.log('User login after reset:', userLogin.status, !!userLogin.body?.token);

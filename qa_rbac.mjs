
import http from 'http';
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const opts = { hostname: '192.168.100.85', port: 5000, path, method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, timeout: 10000 };
    const r = http.request(opts, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data.slice(0,500) }); } });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const sa = await req('POST', '/api/auth/login', { email: 'superadmin@admin.com', password: 'admin123' });
const token = sa.body?.token;

// Full users list
const users = await req('GET', '/api/users', null, token);
const list = Array.isArray(users.body) ? users.body : users.body?.data || [];
console.log('API returns array:', Array.isArray(users.body));
console.log('Users:');
list.forEach(u => console.log(`  id=${u.id} email=${u.email} role=${u.role} active=${u.is_active}`));

// Login as regular user (id=3)
const userLogin = await req('POST', '/api/auth/login', { email: 'user@user.com', password: 'admin123' });
console.log('user login status:', userLogin.status, 'error:', userLogin.body?.error?.code);

// Try admin123 from the list
const usernames = list.map(u => ({ email: u.email, id: u.id, role: u.role }));
console.log('All users:', JSON.stringify(usernames));

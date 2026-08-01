INSERT INTO karyawan (
    nik, nama_karyawan, email_kantor, lokasi_kerja, status_karyawan,
    jabatan, folder_karyawan, tingkat_jabatan, departemen, direktorat,
    tanggal_mulai_bekerja, jenis_perjanjian_kerja, status_kepegawaian
) VALUES
    ('EMP-001', 'Andi Pratama', 'andi.pratama@esb.co.id', 'Jakarta HQ', 'Aktif', 'IT Support Specialist', 'andi-pratama', 'Staff', 'Information Technology', 'Technology', '2021-02-15', 'PKWTT', 'Tetap'),
    ('EMP-002', 'Siti Rahmawati', 'siti.rahmawati@esb.co.id', 'Jakarta HQ', 'Aktif', 'Finance Analyst', 'siti-rahmawati', 'Staff', 'Finance', 'Finance', '2022-06-01', 'PKWTT', 'Tetap'),
    ('EMP-003', 'Budi Santoso', 'budi.santoso@esb.co.id', 'Bandung Office', 'Aktif', 'Sales Supervisor', 'budi-santoso', 'Supervisor', 'Sales', 'Commercial', '2020-08-10', 'PKWTT', 'Tetap'),
    ('EMP-004', 'Dewi Lestari', 'dewi.lestari@esb.co.id', 'Surabaya Office', 'Aktif', 'HR Business Partner', 'dewi-lestari', 'Manager', 'Human Resources', 'People', '2019-03-18', 'PKWTT', 'Tetap'),
    ('EMP-005', 'Rizky Maulana', 'rizky.maulana@esb.co.id', 'Jakarta HQ', 'Aktif', 'Backend Developer', 'rizky-maulana', 'Staff', 'Product Engineering', 'Technology', '2023-01-09', 'PKWT', 'Kontrak'),
    ('EMP-006', 'Nadia Putri', 'nadia.putri@esb.co.id', 'Bandung Office', 'Aktif', 'UI/UX Designer', 'nadia-putri', 'Staff', 'Product Design', 'Technology', '2023-05-22', 'PKWT', 'Kontrak'),
    ('EMP-007', 'Fajar Hidayat', 'fajar.hidayat@esb.co.id', 'Jakarta HQ', 'Aktif', 'Network Engineer', 'fajar-hidayat', 'Senior Staff', 'Infrastructure', 'Technology', '2018-11-05', 'PKWTT', 'Tetap'),
    ('EMP-008', 'Maya Sari', 'maya.sari@esb.co.id', 'Surabaya Office', 'Aktif', 'Account Executive', 'maya-sari', 'Staff', 'Sales', 'Commercial', '2024-02-12', 'PKWT', 'Kontrak')
ON CONFLICT (nik) DO UPDATE SET
    nama_karyawan = EXCLUDED.nama_karyawan,
    email_kantor = EXCLUDED.email_kantor,
    lokasi_kerja = EXCLUDED.lokasi_kerja,
    status_karyawan = EXCLUDED.status_karyawan,
    jabatan = EXCLUDED.jabatan,
    tingkat_jabatan = EXCLUDED.tingkat_jabatan,
    departemen = EXCLUDED.departemen,
    direktorat = EXCLUDED.direktorat,
    tanggal_mulai_bekerja = EXCLUDED.tanggal_mulai_bekerja,
    jenis_perjanjian_kerja = EXCLUDED.jenis_perjanjian_kerja,
    status_kepegawaian = EXCLUDED.status_kepegawaian,
    diperbarui_pada = CURRENT_TIMESTAMP;

INSERT INTO aset_ti (
    nomor_seri, label_aset, spesifikasi, id_karyawan, tipe_perangkat,
    merek, model, status_aset, kondisi_aset, catatan_aset
)
SELECT seed.nomor_seri, seed.label_aset, seed.spesifikasi, k.id_karyawan,
       seed.tipe_perangkat, seed.merek, seed.model, seed.status_aset,
       seed.kondisi_aset, seed.catatan_aset
FROM (VALUES
    ('PF3A9K21', 'ESB-LAP-001', 'Intel Core i7-1260P, RAM 16 GB, SSD 512 GB', 'EMP-001', 'Laptop', 'Lenovo', 'ThinkPad T14 Gen 3', 'Digunakan', 'Baik', 'Perangkat kerja tim IT'),
    ('5CG2458K7D', 'ESB-LAP-002', 'Intel Core i5-1235U, RAM 16 GB, SSD 512 GB', 'EMP-002', 'Laptop', 'HP', 'ProBook 440 G9', 'Digunakan', 'Baik', NULL),
    ('8GHK2X3', 'ESB-LAP-003', 'Apple M2, RAM 16 GB, SSD 512 GB', 'EMP-006', 'Laptop', 'Apple', 'MacBook Air M2', 'Digunakan', 'Baru', 'Unit desain produk'),
    ('DL-7090-014', 'ESB-DES-001', 'Intel Core i7-10700, RAM 16 GB, SSD 512 GB', 'EMP-003', 'Desktop', 'Dell', 'OptiPlex 7090', 'Digunakan', 'Baik', NULL),
    ('SRV-R740-01', 'ESB-SRV-001', 'Dual Xeon Silver, RAM 128 GB, RAID 10 4 TB', NULL, 'Server', 'Dell', 'PowerEdge R740', 'Digunakan', 'Baik', 'Server virtualisasi utama'),
    ('PRN-M404-07', 'ESB-PRN-001', 'Laser monochrome, duplex, ethernet', NULL, 'Printer', 'HP', 'LaserJet Pro M404dn', 'Tersedia', 'Baik', 'Area finance lantai 3'),
    ('MON-U2422-11', 'ESB-MON-001', '24 inci IPS Full HD USB-C', 'EMP-005', 'Monitor', 'Dell', 'UltraSharp U2422HE', 'Digunakan', 'Baik', NULL),
    ('MON-L24-019', 'ESB-MON-002', '24 inci IPS Full HD', NULL, 'Monitor', 'Lenovo', 'L24i-30', 'Tersedia', 'Baru', 'Stok perangkat baru'),
    ('NET-C9200-1', 'ESB-NET-001', '24-port Gigabit PoE managed switch', NULL, 'Network Device', 'Cisco', 'Catalyst 9200L', 'Digunakan', 'Baik', 'Core switch lantai 2'),
    ('ASU-X415-22', 'ESB-LAP-004', 'Intel Core i5-1135G7, RAM 8 GB, SSD 512 GB', 'EMP-008', 'Laptop', 'Asus', 'ExpertBook X415', 'Maintenance', 'Perlu Servis', 'Penggantian baterai'),
    ('ACR-A515-05', 'ESB-LAP-005', 'AMD Ryzen 5 5500U, RAM 8 GB, SSD 256 GB', NULL, 'Laptop', 'Acer', 'Aspire 5', 'Rusak', 'Rusak Berat', 'Kerusakan mainboard'),
    ('UPS-SMC-003', 'ESB-UPS-001', 'UPS 1500 VA line-interactive', NULL, 'Lainnya', 'APC', 'Smart-UPS C 1500', 'Tersedia', 'Cukup', 'Baterai masih layak pakai')
) AS seed(nomor_seri, label_aset, spesifikasi, nik, tipe_perangkat, merek, model, status_aset, kondisi_aset, catatan_aset)
LEFT JOIN karyawan k ON k.nik = seed.nik
ON CONFLICT (label_aset) DO UPDATE SET
    nomor_seri = EXCLUDED.nomor_seri,
    spesifikasi = EXCLUDED.spesifikasi,
    id_karyawan = EXCLUDED.id_karyawan,
    tipe_perangkat = EXCLUDED.tipe_perangkat,
    merek = EXCLUDED.merek,
    model = EXCLUDED.model,
    status_aset = EXCLUDED.status_aset,
    kondisi_aset = EXCLUDED.kondisi_aset,
    catatan_aset = EXCLUDED.catatan_aset,
    diperbarui_pada = CURRENT_TIMESTAMP;

-- User sengaja tidak dibuat dari seed data. Provisioning akun harus memakai
-- workflow operasional dengan password acak yang di-hash setelah recovery gate
-- dan rollout bcrypt selesai; credential tidak boleh disimpan di repository.

-- Seed log_riwayat_aset table
INSERT INTO log_riwayat_aset (id_aset, label_aset, aksi, perubahan, oleh_pengguna) VALUES
    (1, 'ESB-LAP-001', 'TAMBAH', 'Aset baru didaftarkan dengan nomor seri PF3A9K21', 'Admin IT'),
    (2, 'ESB-LAP-002', 'TAMBAH', 'Aset baru didaftarkan dengan nomor seri 5CG2458K7D', 'Admin IT'),
    (1, 'ESB-LAP-001', 'UBAH', 'Kondisi: Baru -> Baik, Status: Tersedia -> Digunakan', 'Siti Rahma');

-- Seed log_audit_login table
INSERT INTO log_audit_login (nama_pengguna, email, aktifitas, ip_address, browser) VALUES
    ('Admin IT', 'admin@esb.co.id', 'LOGIN', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0'),
    ('Siti Rahma', 'siti.rahma@esb.co.id', 'LOGIN', '192.168.1.10', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605'),
    ('Andi Specialist', 'andi.pratama@esb.co.id', 'LOGIN', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0');

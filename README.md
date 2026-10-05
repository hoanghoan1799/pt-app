# PT App

Ứng dụng giao bài tập theo tuần: **admin (PT)** tạo user và giao bài tập theo từng ngày (video YouTube), **user** chỉ cần nhập đúng tên để xem lịch tập của mình. Thiết kế mobile-first cho iPhone 12 → iPhone 17 Pro Max.

## Tính năng

**User** (`/`)

- Đăng nhập bằng tên (không phân biệt hoa/thường, có dấu hay không dấu).
- Nhớ đăng nhập: cookie tự gia hạn mỗi lần mở app (400 ngày), nên lần sau vào thẳng lịch tập. Tên cũng được lưu trên máy để điền sẵn nếu cookie bị xóa. Chỉ khi bấm **Đăng xuất** mới phải nhập lại.
- Lịch theo tuần (T2 → CN), mặc định mở hôm nay, chuyển tuần trước/sau.
- Mỗi bài tập: video YouTube phát ngay trong trang, số hiệp × số lần, mô tả.
- Ngày không có bài hiển thị "Ngày nghỉ".
- **Đánh dấu đã tập** từng bài (hôm nay hoặc ngày đã qua; bấm lại để bỏ). Có thanh tiến độ ngày/tuần, dấu ✓ trên ngày đã tập xong.

**Admin** (`/admin`)

- Đăng nhập bằng tài khoản + mật khẩu riêng (lưu trong DB, mật khẩu hash bằng scrypt). Tạo bằng `npm run admin:create`.
- **Dashboard** (`/admin`) theo tuần: số user, số user đang tập, % hoàn thành, số bài đã tập; danh sách user kèm tiến độ, lần tập gần nhất và nhãn "Chưa có lịch"; nhật ký hoạt động gần đây.
- Thêm (nút + trên dashboard) / xóa user.
- Trang từng user: tiến độ tuần, bài nào đã tập lúc nào, lịch sử tập.
- Giao bài theo ngày cho từng user: tiêu đề + ghi chú của ngày; mỗi bài có tên, link YouTube (preview ngay khi dán), số hiệp, số lần/thời gian, mô tả.
- Sửa, xóa, sắp xếp thứ tự bài tập.
- Sao chép cả tuần sang tuần khác hoặc sang user khác.
- "Xem như user" (biểu tượng con mắt) để xem trước đúng màn hình user thấy.

## Chạy local

```bash
npm install
cp .env.example .env.local   # sửa SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
npm run db:push              # tạo bảng trong local.db (SQLite)
npm run admin:create         # tạo tài khoản admin từ ADMIN_USERNAME / ADMIN_PASSWORD
npm run dev
```

Mở http://localhost:3000 (user) và http://localhost:3000/admin/login (admin). Trang user không có link sang admin.

Tạo thêm admin hoặc đổi mật khẩu (chạy lại với cùng username sẽ đặt lại mật khẩu):

```bash
npm run admin:create -- <username> <mật-khẩu>
```

Để mở trên iPhone cùng mạng Wi-Fi, dùng địa chỉ `Network` mà `next dev` in ra.

## Scripts

| Lệnh                   | Việc                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `npm run dev`          | Dev server                                                  |
| `npm run build`        | Build production                                            |
| `npm test`             | Unit test (Vitest)                                          |
| `npm run lint`         | ESLint (0 warning)                                          |
| `npm run typecheck`    | TypeScript                                                  |
| `npm run db:push`      | Đồng bộ schema `db/schema.ts` vào DB                        |
| `npm run db:setup`     | Tạo bảng + admin đầu tiên (tự chạy khi build trên Vercel)   |
| `npm run db:studio`    | Xem dữ liệu bằng Drizzle Studio                             |
| `npm run admin:create` | Tạo admin / đặt lại mật khẩu                                |
| `npm run db:seed-demo` | Tạo user "Demo" có lịch + bài đã tập (`-- --remove` để xóa) |

## Phân quyền

| Khu   | Đường dẫn                   | Ai vào được                                                                         |
| ----- | --------------------------- | ----------------------------------------------------------------------------------- |
| User  | `/` (nhập tên), `/workouts` | User đã đăng nhập. Admin vào sẽ bị chuyển về `/admin`.                              |
| Admin | `/admin/login`, `/admin/**` | Admin đã đăng nhập. User vào (kể cả trang login admin) sẽ bị chuyển về `/workouts`. |

Bảo vệ 3 lớp: `proxy.ts` (kiểm tra cookie và điều hướng), layout của route group `(user)/(protected)` và `admin/(protected)` (kiểm tra với DB), và từng server action (`requireAdmin`). Trang admin có `noindex`.

## Công nghệ

Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, Tailwind CSS 4, Drizzle ORM + libSQL (SQLite), `jose` (cookie session), Zod, vaul (bottom sheet), sonner (toast), lucide-react (icon).

## Cấu trúc

```text
app/                 routes (mỏng, chỉ ghép các feature)
features/
  auth/              đăng nhập user/admin, đăng xuất
  members/           quản lý user (admin)
  workouts/          lịch tuần, bài tập, YouTube, sao chép tuần, đánh dấu đã tập
  dashboard/         thống kê tiến độ và hoạt động cho admin
components/          layout + UI dùng chung (header, bottom sheet, nút submit)
services/            session, guard, truy vấn user dùng chung
db/                  schema + kết nối Drizzle
```

## Deploy lên Vercel (Turso)

1. Vercel → project → **Storage** → kết nối database Turso. Integration tự thêm `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` (app đọc 2 biến này trước, rồi mới tới `DATABASE_URL`/`DATABASE_AUTH_TOKEN`).
2. Vercel → **Settings → Environment Variables** (Production + Preview):

   | Biến                 | Giá trị                                                 |
   | -------------------- | ------------------------------------------------------- |
   | `SESSION_SECRET`     | chuỗi ngẫu nhiên ≥ 32 ký tự (`openssl rand -base64 32`) |
   | `ADMIN_USERNAME`     | tài khoản admin đầu tiên (3–32 ký tự a-z 0-9 . _ -)     |
   | `ADMIN_PASSWORD`     | mật khẩu admin đầu tiên (≥ 8 ký tự)                     |
   | `HEALTH_CHECK_TOKEN` | (tuỳ chọn) ≥ 16 ký tự, để xem chi tiết `/api/health`    |

   Không cần `DATABASE_URL` trên Vercel; nếu có, đừng để `file:local.db`.

3. **Redeploy**. Bước `prebuild` tự chạy `scripts/setup-database.ts`: tạo/cập nhật bảng trên Turso và tạo admin từ `ADMIN_USERNAME`/`ADMIN_PASSWORD` nếu database chưa có admin nào (admin đã có thì không bị ghi đè).
4. Kiểm tra: mở `https://<domain>/api/health?token=<HEALTH_CHECK_TOKEN>` — phải là `"status": "ok"`.

## Xử lý lỗi

- Lỗi kỹ thuật (thiếu biến môi trường, database chưa tạo bảng, mất kết nối…) **không làm crash app**: form/toast hiện thông báo chung _"Đã có lỗi xảy ra. Vui lòng thử lại sau."_ kèm **mã tham chiếu**. Trên production không bao giờ hiện chi tiết kỹ thuật cho user.
- Chi tiết nằm trong **Vercel → Logs**, mỗi lỗi một dòng `[pt-app] <hành động> failed · <MÃ LỖI>` kèm `referenceId`/`digest` trùng với mã user thấy.
- Mã lỗi: `CONFIG_MISSING`, `CONFIG_INVALID`, `DB_FILE_UNAVAILABLE`, `DB_NOT_MIGRATED`, `DB_AUTH_FAILED`, `DB_UNREACHABLE`, `UNKNOWN`.
- Ở môi trường dev, form/toast hiện luôn nguyên nhân và mã lỗi để debug nhanh.

## Giới hạn hiện tại

- User vào bằng tên, không có mật khẩu: ai biết tên của người khác thì xem được lịch của người đó.
- Chưa có rate limit đăng nhập admin theo IP (chỉ có độ trễ khi sai mật khẩu).

# PT App

Ứng dụng giao bài tập theo tuần: **admin (PT)** tạo user và giao bài tập theo từng ngày (video YouTube), **user** chỉ cần nhập đúng tên để xem lịch tập của mình. Thiết kế mobile-first cho iPhone 12 → iPhone 17 Pro Max.

## Tính năng

**User** (`/`)

- Đăng nhập bằng tên (không phân biệt hoa/thường, có dấu hay không dấu).
- Nhớ đăng nhập: cookie tự gia hạn mỗi lần mở app (400 ngày), nên lần sau vào thẳng lịch tập. Tên cũng được lưu trên máy để điền sẵn nếu cookie bị xóa. Chỉ khi bấm **Đăng xuất** mới phải nhập lại.
- Lịch theo tuần (T2 → CN), mặc định mở hôm nay, chuyển tuần trước/sau.
- Mỗi bài tập: video YouTube phát ngay trong trang, số hiệp × số lần, mô tả.
- Ngày không có bài hiển thị "Ngày nghỉ".

**Admin** (`/admin`)

- Đăng nhập bằng mật khẩu trong `ADMIN_PASSWORD`.
- Thêm / xóa user.
- Giao bài theo ngày cho từng user: tiêu đề + ghi chú của ngày; mỗi bài có tên, link YouTube (preview ngay khi dán), số hiệp, số lần/thời gian, mô tả.
- Sửa, xóa, sắp xếp thứ tự bài tập.
- Sao chép cả tuần sang tuần khác hoặc sang user khác.
- "Xem như user" (biểu tượng con mắt) để xem trước đúng màn hình user thấy.

## Chạy local

```bash
npm install
cp .env.example .env.local   # sửa ADMIN_PASSWORD và SESSION_SECRET
npm run db:push              # tạo bảng trong local.db (SQLite)
npm run dev
```

Mở http://localhost:3000 (user) và http://localhost:3000/admin (admin).

Để mở trên iPhone cùng mạng Wi-Fi, dùng địa chỉ `Network` mà `next dev` in ra.

## Scripts

| Lệnh                | Việc                                 |
| ------------------- | ------------------------------------ |
| `npm run dev`       | Dev server                           |
| `npm run build`     | Build production                     |
| `npm test`          | Unit test (Vitest)                   |
| `npm run lint`      | ESLint (0 warning)                   |
| `npm run typecheck` | TypeScript                           |
| `npm run db:push`   | Đồng bộ schema `db/schema.ts` vào DB |
| `npm run db:studio` | Xem dữ liệu bằng Drizzle Studio      |

## Công nghệ

Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, Tailwind CSS 4, Drizzle ORM + libSQL (SQLite), `jose` (cookie session), Zod, vaul (bottom sheet), sonner (toast), lucide-react (icon).

## Cấu trúc

```text
app/                 routes (mỏng, chỉ ghép các feature)
features/
  auth/              đăng nhập user/admin, đăng xuất
  members/           quản lý user (admin)
  workouts/          lịch tuần, bài tập, YouTube, sao chép tuần
components/          layout + UI dùng chung (header, bottom sheet, nút submit)
services/            session, guard, truy vấn user dùng chung
db/                  schema + kết nối Drizzle
```

## Deploy

SQLite file không dùng được trên Vercel. Tạo database [Turso](https://turso.tech) rồi đặt:

```bash
DATABASE_URL=libsql://<db>.turso.io
DATABASE_AUTH_TOKEN=<token>
ADMIN_PASSWORD=<mật khẩu mạnh>
SESSION_SECRET=<chuỗi ngẫu nhiên ≥ 32 ký tự>
```

Sau đó chạy `npm run db:push` với các biến trên để tạo bảng.

## Giới hạn hiện tại

- User vào bằng tên, không có mật khẩu: ai biết tên của người khác thì xem được lịch của người đó.
- Một mật khẩu admin chung, chưa có rate limit theo IP.
- Chưa có đánh dấu "đã tập xong" hay theo dõi tiến độ.

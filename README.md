# PT App

Ứng dụng giao bài tập theo tuần: **admin (PT)** tạo user và giao bài tập theo từng ngày (video YouTube), **user** đăng nhập bằng email + mật khẩu do PT cấp để xem lịch tập của mình. Thiết kế mobile-first cho iPhone 12 → iPhone 17 Pro Max.

## Tính năng

**User** (`/`)

- Đăng nhập bằng email + mật khẩu (email không phân biệt hoa/thường). PT tạo tài khoản kèm email; mật khẩu tạo sẵn chỉ hiện **một lần** khi tạo (hoặc khi PT đặt lại) để PT gửi cho học viên.
- Giữ đăng nhập: cookie tự gia hạn mỗi lần mở app (400 ngày), nên lần sau vào thẳng lịch tập. Chỉ khi chọn **Đăng xuất** trong menu tài khoản (app hỏi lại trước khi thoát) hoặc PT đặt lại mật khẩu mới phải nhập lại. Trình duyệt/trình quản lý mật khẩu sẽ nhớ email và mật khẩu.
- **Đổi mật khẩu**: mở menu **tài khoản** (biểu tượng người ở góc phải thanh tiêu đề) → **Đổi mật khẩu** (`/account/password`), nhập mật khẩu hiện tại, mật khẩu mới (8-128 ký tự, khác mật khẩu cũ) và nhập lại. Đổi xong app quay về **Lịch tập** và hiện thông báo; các thiết bị khác sẽ bị đăng xuất.
- **Quên mật khẩu**: liên hệ PT để đặt lại. PT sẽ đặt mật khẩu mới trong trang user và gửi lại cho bạn.
- Đăng nhập sai 5 lần trong 15 phút sẽ bị khóa 15 phút.
- **Thanh tiêu đề** (cả user và PT): menu **bánh răng** chọn giao diện **Sáng / Tối / Hệ thống** (lưu bằng cookie, áp dụng ngay từ server nên không bị nháy) và bật/tắt **thông báo đẩy**; menu **tài khoản** có **Đổi mật khẩu** và **Đăng xuất**. Mọi thao tác xóa/ghi đè/đăng xuất đều hỏi lại bằng hộp thoại trong app, không dùng hộp thoại của trình duyệt.
- **Ngôn ngữ**: menu **bánh răng** có mục **Ngôn ngữ** chọn Tiếng Việt (mặc định), English hoặc 中文 (tiếng Trung giản thể). Lựa chọn lưu bằng cookie và, khi đã đăng nhập, lưu theo tài khoản để thiết bị khác tự theo; thông báo đẩy gửi theo ngôn ngữ của người nhận.
- Lịch theo tuần (T2 → CN), mặc định mở hôm nay, chuyển tuần trước/sau.
- Mỗi bài tập: video YouTube phát ngay trong trang, số hiệp × số lần, mô tả.
- Ngày không có bài hiển thị "Ngày nghỉ".
- **Đánh dấu đã tập** từng bài (hôm nay hoặc ngày đã qua; bấm lại để bỏ). Có thanh tiến độ ngày/tuần, dấu ✓ trên ngày đã tập xong.
- **Dinh dưỡng** (tab dưới cùng): xem mục tiêu carb/protein/fat mỗi ngày (gram, quy đổi lạng) và lời dặn của PT; ghi từng bữa đã ăn (món + gram ước lượng) cho hôm nay hoặc ngày đã qua; tiến độ trong ngày (còn thiếu/đạt/vượt) và bảng tổng kết tuần. Thẻ **Yêu cầu bữa ăn** (số bữa, món thích/không ăn) mở sẵn khi chưa nhập gì, đã nhập rồi thì thu gọn, bấm tiêu đề để mở/đóng.
  - Thứ tự màn hình: **lịch tuần** (chấm xanh = đã đánh dấu đủ các bữa, vàng = đánh dấu một số bữa, xám = chưa có plan hoặc chưa đánh dấu; có chú thích màu) → **Mục tiêu trong ngày** (calo một thanh, Carb/Protein/Fat là ba vòng tròn kèm "đã ăn / mục tiêu g" và còn/vượt) → **Plan bữa ăn**.
  - Bữa đã đánh dấu **Đạt** có nền xanh; mục **Đã ăn thêm ngoài plan** chỉ hiện ở bữa có món ăn thêm.
- **Chỉ số của bạn & TDEE** (tab Tổng kết, dưới biểu đồ cân nặng): user tự nhập giới tính, tuổi, chiều cao, cân nặng, mức vận động, mục tiêu để xem BMR/TDEE. Nếu mục tiêu dinh dưỡng đang "tự tính từ TDEE" (hoặc chưa có), nó được tính lại ngay; nếu PT đã nhập tay thì giữ nguyên.
- **Tổng kết** (tab thứ 3): tuần tập luyện (buổi/bài đã tập từng ngày) và dinh dưỡng (gram từng ngày so với mục tiêu, số ngày ghi/đạt, kcal TB). Bấm vào ngày để mở chi tiết.
- **Cân nặng theo tuần** (đầu tab Tổng kết): user ghi "cân hôm nay" (mỗi ngày 1 số, ghi lại thì thay), biểu đồ trung bình theo tuần trong 12 tuần (chạm để xem từng tuần, có dạng bảng), thay đổi so với tuần trước và cả kỳ. Cân mới nhất cập nhật luôn chỉ số cơ thể/TDEE; mục tiêu "tự tính từ TDEE" được tính lại theo.
- **Nhắn tin với PT** (tab **Nhắn tin**, chỉ hiện khi PT đã bật chat cho bạn): nhắn tin trực tiếp với PT, tin mới hiện gần như ngay lập tức. Số trên tab là số tin chưa đọc. Tiêu đề hiện tên PT trả lời gần nhất. Khi PT tạm khoá, bạn vẫn xem được lịch sử nhưng không gửi được tin.
  - **Thông báo tin nhắn**: lần đầu vào tab **Nhắn tin** (user) hoặc hộp thư `/admin/messages` (PT) sẽ có thẻ "Bật thông báo"; bấm **Bật thông báo** rồi cho phép trình duyệt. Bấm **Để sau** thì thẻ không hiện lại. Thông báo không chứa nội dung tin nhắn.
  - iPhone/iPad (iOS 16.4 trở lên): phải **Thêm vào MH chính** trước, rồi mở app từ màn hình chính mới bật được thông báo. Cần cấu hình `VAPID_*` và `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (xem bảng biến môi trường).
- **Cài app (PWA)**: cài PT App lên màn hình chính để mở như app thật. Android/Chrome: bấm **Cài đặt** ở banner phía trên thanh tab. iPhone/iPad: bấm nút **Chia sẻ** rồi chọn **Thêm vào MH chính**. Mở link từ Zalo/Facebook thì cần mở lại bằng Safari hoặc Chrome. Bấm **Để sau** để ẩn banner 14 ngày. Lưu ý: app trên màn hình chính của iPhone có bộ nhớ riêng nên phải đăng nhập lại một lần. Khi mất mạng, app chỉ hiện thông báo "Không có kết nối mạng" (không lưu lịch tập hay dữ liệu cá nhân offline).

**Admin** (`/admin`)

- Đăng nhập bằng tài khoản + mật khẩu riêng (lưu trong DB, mật khẩu hash bằng scrypt). Tạo bằng `pnpm admin:create`.
- **App PT Admin**: mở `/admin` trên điện thoại rồi **Thêm vào MH chính** (iPhone) hoặc **Cài đặt ứng dụng** (menu Chrome) để có icon riêng "PT Admin" mở thẳng vào dashboard, tách biệt với app của học viên.
- **Dashboard** (`/admin`) theo tuần: số user, số user đang tập, % hoàn thành, số bài đã tập; danh sách user kèm tiến độ, lần tập gần nhất và nhãn "Chưa có lịch"; nhật ký hoạt động gần đây.
- Khu **Thao tác** trên dashboard có ba ô: **Thêm user**, **Thư viện món**, **Tin nhắn** (kèm số tin chưa đọc). Thẻ user có huy hiệu tin chưa đọc riêng. Thêm user mở một tờ nhập có nhãn rõ ràng và nút gửi cố định; tạo xong, mật khẩu một lần và nút **Sao chép** hiện ngay đầu tờ.
- Xóa user.
- Thanh tiêu đề admin: biểu tượng tin nhắn (có số chưa đọc cập nhật trực tiếp), menu bánh răng (giao diện, thông báo đẩy) và menu tài khoản (đăng xuất có hỏi lại).
- Trang từng user: tiến độ tuần, bài nào đã tập lúc nào, lịch sử tập.
- Tab **Dinh dưỡng** của từng user: đặt mục tiêu gram/ngày cho carb, protein, fat + lời dặn (áp dụng từ hôm nay, ngày cũ giữ mục tiêu cũ); xem nhật ký ăn, tổng kết ngày/tuần. Dashboard hiện số ngày user đã ghi nhật ký ăn.
- **TDEE**: admin nhập giới tính, tuổi, chiều cao, cân nặng, mức vận động, mục tiêu (giảm mỡ / giữ cân / tăng cơ) → app tính BMR (Mifflin-St Jeor), TDEE, calo mục tiêu (−20% / 0 / +10%) và chia macro (protein 2,2 / 1,8 / 2,0 g/kg, fat 25% calo, carb phần còn lại), rồi tự điền vào mục tiêu dinh dưỡng từ hôm nay (có thể bỏ tick để tự nhập tay). Mục tiêu hiển thị kèm kcal và món tương đương (≈ lạng cơm chín, lạng ức gà, thìa dầu).
- Mỗi mục tiêu có nhãn nguồn: **Tự tính từ TDEE** (tự cập nhật khi chỉ số thay đổi) hoặc **PT nhập tay** (không bị ghi đè khi user sửa chỉ số).
- Tab **Tổng kết** của từng user: giống màn tổng kết của user.
- Giao bài theo ngày cho từng user: tiêu đề + ghi chú của ngày; mỗi bài có tên, link YouTube (preview ngay khi dán), số hiệp, số lần/thời gian, mô tả.
- Sửa, xóa, sắp xếp thứ tự bài tập.
- Sao chép cả tuần sang tuần khác hoặc sang user khác.
- Sao chép plan bữa ăn sang ngày khác bằng lịch tháng (T2 đầu tuần): ngày đã qua bị khóa, hôm nay và ngày mai có nhãn, chọn nhiều ngày, ngày đã có plan sẽ hỏi trước khi ghi đè.
- **Tin nhắn**: chat mặc định tắt. Bật/khoá chat cho từng user bằng công tắc trong tab **Tin nhắn** của user đó (khoá thì giữ lịch sử, hai bên đều không gửi được). Hộp thư chung `/admin/messages` liệt kê các cuộc trò chuyện kèm số tin chưa đọc; số chưa đọc cập nhật trực tiếp không cần tải lại, và khi có Ably thì hiện "đang nhập…" ở hai phía.
- "Xem như user" (biểu tượng con mắt) để xem trước đúng màn hình user thấy.

## Chạy local

```bash
corepack enable              # một lần, để dùng đúng pnpm trong packageManager
pnpm install
cp apps/web/.env.example apps/web/.env.local   # sửa SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
pnpm db:push                 # tạo bảng trong apps/web/local.db (SQLite)
pnpm admin:create            # tạo tài khoản admin từ ADMIN_USERNAME / ADMIN_PASSWORD
pnpm dev                     # build @pt/contracts rồi chạy web
```

Repo là monorepo pnpm: `apps/web` (Next.js), `apps/api` (NestJS, đang là bộ khung) và `packages/contracts` (schema Zod dùng chung). Các lệnh `db:*` và `admin:create` ở root chuyển sang `@pt/web`.

Mở http://localhost:3000 (user) và http://localhost:3000/admin/login (admin). Trang user không có link sang admin.

Tạo thêm admin hoặc đổi mật khẩu (chạy lại với cùng username sẽ đặt lại mật khẩu):

```bash
pnpm admin:create <username> <mật-khẩu>
```

Để mở trên iPhone cùng mạng Wi-Fi, dùng địa chỉ `Network` mà `next dev` in ra.

## Scripts

| Lệnh                | Việc                                                        |
| ------------------- | ----------------------------------------------------------- |
| `pnpm dev`          | Dev server web (build `@pt/contracts` trước)                |
| `pnpm dev:api`      | Dev server API NestJS (http://localhost:4000/v1/health)     |
| `pnpm verify`       | test + lint + typecheck cho mọi workspace                   |
| `pnpm build`        | Build production (contracts rồi web)                        |
| `pnpm test`         | Unit test (Vitest)                                          |
| `pnpm lint`         | ESLint (0 warning)                                          |
| `pnpm typecheck`    | TypeScript                                                  |
| `pnpm db:push`      | Đồng bộ schema `apps/web/db/schema.ts` vào DB               |
| `pnpm db:setup`     | Tạo bảng + admin đầu tiên (tự chạy khi build trên Vercel)   |
| `pnpm db:studio`    | Xem dữ liệu bằng Drizzle Studio                             |
| `pnpm admin:create` | Tạo admin / đặt lại mật khẩu                                |
| `pnpm db:seed-demo` | Tạo user "Demo" có lịch + bài đã tập (`-- --remove` để xóa) |

## Phân quyền

| Khu   | Đường dẫn                                                | Ai vào được                                                                         |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| User  | `/` (email + mật khẩu), `/workouts`, `/account/password` | User đã đăng nhập. Admin vào sẽ bị chuyển về `/admin`.                              |
| Admin | `/admin/login`, `/admin/**`                              | Admin đã đăng nhập. User vào (kể cả trang login admin) sẽ bị chuyển về `/workouts`. |

Bảo vệ 3 lớp: `apps/web/proxy.ts` (kiểm tra cookie và điều hướng), layout của route group `(user)/(protected)` và `admin/(protected)` (kiểm tra với DB), và từng server action (`requireAdmin`). Trang admin có `noindex`.

## Công nghệ

Next.js 16 (App Router, Server Actions, `proxy.ts`), React 19, Tailwind CSS 4, Drizzle ORM + libSQL (SQLite), `jose` (cookie session), Zod, vaul (bottom sheet), sonner (toast), lucide-react (icon).

## Cấu trúc

```text
apps/web/            Next.js (xem bên dưới)
apps/api/            NestJS API (bộ khung, /v1/health)
packages/contracts/  schema Zod + giới hạn dùng chung cho web và API
docker-compose.yml   PostgreSQL 17 + API (docker compose up -d --build db api)

apps/web/
  app/               routes (mỏng, chỉ ghép các feature)
  features/
    auth/              đăng nhập user/admin, đăng xuất
    members/           quản lý user (admin)
    workouts/          lịch tuần, bài tập, YouTube, sao chép tuần, đánh dấu đã tập
    dashboard/         thống kê tiến độ và hoạt động cho admin
    nutrition/         mục tiêu dinh dưỡng, nhật ký ăn, tổng kết ngày/tuần
  components/          layout + UI dùng chung (header, bottom sheet, nút submit)
  services/            session, guard, truy vấn user dùng chung
  db/                  schema + kết nối Drizzle
```

## Deploy lên Vercel (Turso)

1. Vercel → project → **Storage** → kết nối database Turso. Integration tự thêm `TURSO_DATABASE_URL` và `TURSO_AUTH_TOKEN` (app đọc 2 biến này trước, rồi mới tới `DATABASE_URL`/`DATABASE_AUTH_TOKEN`).
2. Vercel → **Settings → Environment Variables** (Production + Preview):

   | Biến                 | Giá trị                                                                                   |
   | -------------------- | ----------------------------------------------------------------------------------------- |
   | `SESSION_SECRET`     | chuỗi ngẫu nhiên ≥ 32 ký tự (`openssl rand -base64 32`)                                   |
   | `ADMIN_USERNAME`     | tài khoản admin đầu tiên (3–32 ký tự a-z 0-9 . \_ -)                                      |
   | `ADMIN_PASSWORD`     | mật khẩu admin đầu tiên (≥ 8 ký tự)                                                       |
   | `HEALTH_CHECK_TOKEN` | (tuỳ chọn) ≥ 16 ký tự, để xem chi tiết `/api/health`                                      |
   | `ABLY_API_KEY`       | (tuỳ chọn) key Ably cho chat realtime; thiếu thì chat tự chuyển sang hỏi lại mỗi vài giây |

   Không cần `DATABASE_URL` trên Vercel; nếu có, đừng để `file:local.db`.

3. **Redeploy**. `pnpm build` (web) chạy `apps/web/scripts/setup-database.ts` trước `next build`: tạo/cập nhật bảng trên Turso và tạo admin từ `ADMIN_USERNAME`/`ADMIN_PASSWORD` nếu database chưa có admin nào (admin đã có thì không bị ghi đè).
4. Kiểm tra: mở `https://<domain>/api/health?token=<HEALTH_CHECK_TOKEN>` — phải là `"status": "ok"`.

## Xử lý lỗi

- Lỗi kỹ thuật (thiếu biến môi trường, database chưa tạo bảng, mất kết nối…) **không làm crash app**: form/toast hiện thông báo chung _"Đã có lỗi xảy ra. Vui lòng thử lại sau."_ kèm **mã tham chiếu**. Trên production không bao giờ hiện chi tiết kỹ thuật cho user.
- Chi tiết nằm trong **Vercel → Logs**, mỗi lỗi một dòng `[pt-app] <hành động> failed · <MÃ LỖI>` kèm `referenceId`/`digest` trùng với mã user thấy.
- Mã lỗi: `CONFIG_MISSING`, `CONFIG_INVALID`, `DB_FILE_UNAVAILABLE`, `DB_NOT_MIGRATED`, `DB_AUTH_FAILED`, `DB_UNREACHABLE`, `UNKNOWN`.
- Ở môi trường dev, form/toast hiện luôn nguyên nhân và mã lỗi để debug nhanh.

## Giới hạn hiện tại

- Chưa có chức năng tự quên/đặt lại mật khẩu qua email: user phải nhờ PT đặt lại.
- Chưa có rate limit đăng nhập admin theo IP (chỉ có độ trễ khi sai mật khẩu).

import type { Metadata } from "next";

import { OfflineRetryButton } from "@/features/pwa/components/OfflineRetryButton";

export const metadata: Metadata = { title: "Không có kết nối mạng" };

// Precached by public/sw.js and shown only when a navigation fails because the
// network is down. Static and public: it holds no user data.
const OfflinePage = () => (
  <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
    <h1 className="text-xl font-bold">Không có kết nối mạng</h1>
    <p className="mt-2 text-sm text-muted">
      Hãy kiểm tra Wi-Fi hoặc dữ liệu di động rồi thử lại. Lịch tập của bạn sẽ
      hiện ra khi có mạng.
    </p>
    <OfflineRetryButton />
  </main>
);

export default OfflinePage;

import { ROUTES } from "@/constants/routes";
import { ChatThreadSkeleton } from "@/features/chat/components/ChatThreadSkeleton";

export default function Loading() {
  return <ChatThreadSkeleton backHref={ROUTES.ADMIN_MESSAGES} />;
}

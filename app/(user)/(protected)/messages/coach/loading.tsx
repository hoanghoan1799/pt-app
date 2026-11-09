import { PageSkeleton } from "@/components/common/PageSkeleton";
import { ChatThreadSkeleton } from "@/features/chat/components/ChatThreadSkeleton";

export default function Loading() {
  return (
    <PageSkeleton hasHeader={false}>
      <ChatThreadSkeleton />
    </PageSkeleton>
  );
}

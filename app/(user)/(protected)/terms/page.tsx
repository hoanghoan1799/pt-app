import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TermsContent } from "@/features/social/components/TermsContent";
import { TermsAcceptButton } from "@/features/social/components/TermsGate";
import { TERMS_VERSION } from "@/features/social/constants/social";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Điều khoản sử dụng" };

const TermsPage = async () => {
  const user = await requireUser();
  const accepted = hasAcceptedTerms(user);

  return (
    <>
      <AppHeader
        eyebrow="Mạng xã hội"
        title="Điều khoản"
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <TermsContent />
        {accepted ? (
          <p className="text-center text-sm text-muted">
            Bạn đã đồng ý điều khoản (phiên bản {TERMS_VERSION}).
          </p>
        ) : (
          <TermsAcceptButton />
        )}
      </main>
    </>
  );
};

export default TermsPage;

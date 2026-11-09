import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { TermsContent } from "@/features/social/components/TermsContent";
import { TermsAcceptButton } from "@/features/social/components/TermsGate";
import { TERMS_VERSION } from "@/features/social/constants/social";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.terms");

  return { title: t("metaTitle") };
};

const TermsPage = async () => {
  const user = await requireUser();
  const accepted = hasAcceptedTerms(user);
  const t = await getTranslations("pages.terms");

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <TermsContent />
        {accepted ? (
          <p className="text-center text-sm text-muted">
            {t("accepted", { version: TERMS_VERSION })}
          </p>
        ) : (
          <TermsAcceptButton />
        )}
      </main>
    </>
  );
};

export default TermsPage;

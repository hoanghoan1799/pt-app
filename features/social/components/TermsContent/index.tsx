import { CARD } from "@/constants/styles";
import {
  TERMS_INTRO,
  TERMS_SECTIONS,
  TERMS_TITLE,
} from "@/features/social/constants/terms";

// The terms text; static, so server pages and the accept gate both use it.
export const TermsContent = () => (
  <article className={`${CARD} space-y-5 p-5`}>
    <header className="space-y-2">
      <h2 className="text-lg font-bold text-fg">{TERMS_TITLE}</h2>
      <p className="text-sm text-muted">{TERMS_INTRO}</p>
    </header>
    {TERMS_SECTIONS.map((section) => (
      <section key={section.title} className="space-y-2">
        <h3 className="font-semibold text-fg">{section.title}</h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-fg">
          {section.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    ))}
  </article>
);

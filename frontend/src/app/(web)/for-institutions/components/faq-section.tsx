import { FaqAccordion } from "../../components/faq-accordion";
import { FAQS } from "../static/for-institutions-content";

export function FaqSection() {
  return <FaqAccordion faqs={FAQS} />;
}

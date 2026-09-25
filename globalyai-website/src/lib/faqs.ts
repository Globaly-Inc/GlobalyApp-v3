/**
 * The FAQ content, kept out of the section component so the server can read it.
 *
 * layout.tsx emits these as FAQPage structured data. A "use client" module
 * hands a server component a client reference rather than the array itself, so
 * the data has to live somewhere neither side owns.
 */
export const FAQS = [
  {
    q: "What is GlobalyAI?",
    a: "A dedicated AI counselor that lives on your institution's website. It is configured around your own content: programs, admissions requirements, tuition, policies and FAQs. It guides prospective students through a conversation rather than returning a list of links.",
  },
  {
    q: "How is it different from a normal website chatbot?",
    a: "Most website chatbots are built to deflect support questions, so they answer once and close the conversation down. GlobalyAI is built to move a prospective student forward: it asks clarifying questions, carries context across the whole conversation, and works toward a next step.",
  },
  {
    q: "What content does GlobalyAI use?",
    a: "The material your institution provides and approves: your program information, entry requirements, tuition pages, policies, campus detail and FAQs. It is designed to answer from that knowledge rather than from the open internet.",
  },
  {
    q: "Can we control what the AI says?",
    a: "Yes. You decide what content it works from, the tone it uses, what it should not attempt to answer, the consent wording it carries, and the point at which it hands a question to a person. Your team reviews the experience privately before it goes live.",
  },
  {
    q: "Can it understand our programs and admissions process?",
    a: "It is configured around them during setup, and reviewed with your team before launch. Where a question goes beyond what your content covers, an edge case in a policy for example, it is designed to hand over to your admissions team rather than guess.",
  },
  {
    q: "Does it replace our admissions team?",
    a: "No. It extends how many students your team can engage, handling repeat questions and out-of-hours inquiries. It does not assess applications or make admissions decisions.",
  },
  {
    q: "Can it capture inquiries?",
    a: "Yes. Name and email are requested naturally at the right point in the conversation, rather than behind a separate form the visitor has to find.",
  },
  {
    q: "What information does the admissions team receive?",
    a: "A summary of the conversation: who it was, what they asked about, the context they shared about themselves, where the conversation stalled, and a suggested next step, sent to whoever you nominate when the chat ends.",
  },
  {
    q: "Can it be embedded into our existing website?",
    a: "Yes. It is added with a single snippet on the pages you choose, and works alongside your existing site and CMS. There is no migration or redesign involved.",
  },
  {
    q: "How does implementation work?",
    a: "Five steps: we learn how you recruit, connect and configure your approved content, your team reviews it privately, it goes live on the pages you picked, and we review real conversations with you on a regular cadence.",
  },
  {
    q: "How do you handle student data?",
    a: "Inquiries, contact details and transcripts belong to your institution and are exportable at any time. Your assistant and data sit in a dedicated workspace, and conversation data is not used to train foundation models, sold, or used for advertising. You set the retention window, and these terms are put in writing in an agreement and data processing addendum before launch.",
  },
];

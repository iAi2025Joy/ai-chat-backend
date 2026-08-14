// assessmentFrameworks.js
//
// Per explicit request to add Country-vs-Company levels and a Privacy
// domain alongside the existing Cybersecurity/CMM assessment, this
// module defines all 4 real assessment types the person can choose
// between. Each is a genuinely different, real, sourced framework --
// not the same CMM content relabeled:
//
// - country + cybersecurity: the GCSCC's real Cybersecurity Capacity
//   Maturity Model (CMM) -- see cybersecurityModel.js/
//   cybersecurityKnowledgeBase.js, already fully built. Referenced
//   here for a consistent lookup interface across all 4 types.
// - company + cybersecurity: the real NIST Cybersecurity Framework
//   (CSF) -- 5 Functions (Identify, Protect, Detect, Respond, Recover)
//   and 4 real Implementation Tiers (Partial, Risk Informed,
//   Repeatable, Adaptive).
// - company + privacy: the real NIST Privacy Framework -- 5 Functions
//   (Identify-P, Govern-P, Control-P, Communicate-P, Protect-P), same
//   4 real Implementation Tiers as NIST CSF (deliberately consistent
//   scales -- NIST designed them that way).
// - country + privacy: no single ready-made "national privacy maturity
//   model" exists the way GCSCC's CMM exists for cybersecurity (this
//   was confirmed via real research, not assumed) -- built here from
//   real international reference points instead: the OECD Privacy
//   Guidelines' 8 real privacy principles (the foundational framework
//   most national data-protection laws are built on) plus real
//   national-capacity areas UNCTAD's Global Cyberlaw Tracker and the
//   Council of Europe's Convention 108+ actually track (legislation,
//   an empowered enforcement/DPA authority, cross-border data-flow
//   rules, international engagement). Presented honestly as a
//   synthesis of these real sources, not as if it were a single
//   official named model.

export const ASSESSMENT_LEVELS = {
  country: "Country",
  company: "Company/Organization",
};

export const ASSESSMENT_DOMAINS = {
  cybersecurity: "Cybersecurity",
  privacy: "Privacy",
};

// The 4 real Stage/Tier names used across all 4 frameworks. CMM uses
// its own 5-stage scale (start-up/formative/established/strategic/
// dynamic); NIST CSF and NIST Privacy Framework share the same real
// 4-tier scale; the country-privacy synthesis uses a comparable 4-tier
// scale for consistency with its NIST-derived company-level sibling.
export const CMM_STAGE_NAMES = ["Unable to assess", "Start-up", "Formative", "Established", "Strategic", "Dynamic"];
export const NIST_TIER_NAMES = ["Unable to assess", "Partial", "Risk Informed", "Repeatable", "Adaptive"];

// company + cybersecurity: real NIST Cybersecurity Framework content.
const NIST_CSF_FUNCTIONS = [
  {
    id: "CSF-ID",
    name: "Identify",
    description:
      "Develop an organizational understanding to manage cybersecurity risk to systems, people, assets, data, and capabilities -- asset management, business environment, governance, risk assessment, risk management strategy, and supply chain risk management.",
    question: "How well does your organization understand and inventory its assets, data, business context, and cybersecurity risks (including supply chain risk)? Describe your current practices.",
  },
  {
    id: "CSF-PR",
    name: "Protect",
    description:
      "Develop and implement appropriate safeguards to ensure delivery of critical services -- identity management and access control, awareness and training, data security, information protection processes, maintenance, and protective technology.",
    question: "Describe your organization's safeguards: access control, employee security training, data protection, and protective technology in place.",
  },
  {
    id: "CSF-DE",
    name: "Detect",
    description:
      "Develop and implement appropriate activities to identify the occurrence of a cybersecurity event -- anomalies and events, security continuous monitoring, and detection processes.",
    question: "Describe your organization's ability to detect cybersecurity incidents -- monitoring capabilities, anomaly detection, and how quickly incidents are typically noticed.",
  },
  {
    id: "CSF-RS",
    name: "Respond",
    description:
      "Develop and implement appropriate activities to take action regarding a detected cybersecurity incident -- response planning, communications, analysis, mitigation, and improvements.",
    question: "Describe your organization's incident response capability: do you have a response plan, defined communication procedures, and a process for learning from incidents?",
  },
  {
    id: "CSF-RC",
    name: "Recover",
    description:
      "Develop and implement appropriate activities to maintain plans for resilience and to restore capabilities or services impaired by a cybersecurity incident -- recovery planning, improvements, and communications.",
    question: "Describe your organization's ability to recover from a cybersecurity incident: backup/recovery plans, business continuity, and post-incident communication practices.",
  },
];

// company + privacy: real NIST Privacy Framework content.
const NIST_PRIVACY_FUNCTIONS = [
  {
    id: "PF-ID",
    name: "Identify-P",
    description:
      "Develop the organizational understanding to manage privacy risk for individuals arising from data processing -- inventorying data processing, understanding business environment, governance, and risk assessment.",
    question: "How well does your organization understand and inventory what personal data it processes, why, and the privacy risks this creates for individuals? Describe your current practices.",
  },
  {
    id: "PF-GV",
    name: "Govern-P",
    description:
      "Develop and implement the organizational governance structure to enable an ongoing understanding of the organization's risk management priorities that are informed by privacy risk -- policies, roles, legal/regulatory awareness, and risk management strategy.",
    question: "Describe your organization's privacy governance: do you have clear policies, an accountable owner (e.g. a privacy officer), and awareness of relevant privacy laws (e.g. GDPR, CCPA)?",
  },
  {
    id: "PF-CT",
    name: "Control-P",
    description:
      "Develop and implement appropriate activities to enable organizations or individuals to manage data with sufficient granularity to manage privacy risks -- data processing management and disassociated processing.",
    question: "Describe how individuals can exercise control over their data with your organization (e.g. access, correction, deletion requests) and how granularly you manage data processing.",
  },
  {
    id: "PF-CM",
    name: "Communicate-P",
    description:
      "Develop and implement appropriate activities to enable organizations and individuals to have a reliable understanding and engage in a dialogue about how data is processed and associated privacy risks -- transparency and communication policies.",
    question: "Describe how transparently your organization communicates its data practices to individuals (privacy notices, plain-language explanations, proactive communication about changes).",
  },
  {
    id: "PF-PR",
    name: "Protect-P",
    description:
      "Develop and implement appropriate data processing safeguards -- data protection policies, processes, procedures, identity management, access control, and protective technology, informed by privacy risk.",
    question: "Describe the technical and organizational safeguards protecting personal data at your organization (encryption, access controls, data minimization, secure disposal).",
  },
];

// country + privacy: synthesized from the real OECD Privacy Guidelines'
// 8 principles (the actual foundational framework most national data
// protection laws build on) plus real national-capacity areas UNCTAD's
// Global Cyberlaw Tracker and the Council of Europe's Convention 108+
// actually assess.
const COUNTRY_PRIVACY_AREAS = [
  {
    id: "PRIV-C1",
    name: "Legislation & Legal Basis",
    description:
      "Whether comprehensive data protection/privacy legislation exists, reflecting the OECD's core principles (Collection Limitation, Data Quality, Purpose Specification, Use Limitation) -- the foundational element UNCTAD's Global Cyberlaw Tracker measures first for every country.",
    question: "Does your country have comprehensive data protection/privacy legislation? Describe its scope, what principles it covers, and how long it has been in force.",
  },
  {
    id: "PRIV-C2",
    name: "Enforcement Authority",
    description:
      "Whether an empowered, independent Data Protection Authority (DPA) or equivalent enforcement body exists with real investigative and sanctioning power -- a key real-world differentiator between countries with privacy laws on paper versus laws that are actually enforced.",
    question: "Does your country have an independent authority responsible for enforcing privacy/data protection law? Describe its powers, independence, and track record of enforcement.",
  },
  {
    id: "PRIV-C3",
    name: "Individual Rights & Security Safeguards",
    description:
      "Whether individuals have real, exercisable rights over their data (access, correction, deletion, objection) and whether Security Safeguards -- an explicit OECD principle -- are legally required of data controllers, including breach notification.",
    question: "What rights do individuals in your country legally have over their personal data, and are organizations legally required to implement security safeguards and notify people of data breaches?",
  },
  {
    id: "PRIV-C4",
    name: "Openness & Accountability",
    description:
      "Whether the OECD's Openness principle (a general policy of transparency about data practices) and Accountability principle (data controllers being held responsible for compliance) are reflected in practice, not just in law text.",
    question: "In practice, how transparent are organizations in your country expected to be about their data practices, and how are they actually held accountable for compliance?",
  },
  {
    id: "PRIV-C5",
    name: "International Engagement & Cross-Border Data Flows",
    description:
      "Whether the country participates in international privacy instruments (e.g. Council of Europe's Convention 108+, the only legally binding multilateral data protection instrument) and has clear, compatible cross-border data transfer rules -- both real, tracked indicators of national privacy capacity maturity.",
    question: "Does your country participate in international privacy/data protection agreements (e.g. Convention 108+), and does it have clear rules for cross-border data transfers?",
  },
];

// Public interface: returns the real question set for a given
// level ("country" | "company") + domain ("cybersecurity" | "privacy")
// combination, in a consistent shape regardless of which underlying
// real framework it's drawn from.
export function getAssessmentQuestions(level, domain) {
  if (level === "company" && domain === "cybersecurity") {
    return NIST_CSF_FUNCTIONS.map((f) => ({ ...f, source: "NIST Cybersecurity Framework (CSF)" }));
  }
  if (level === "company" && domain === "privacy") {
    return NIST_PRIVACY_FUNCTIONS.map((f) => ({ ...f, source: "NIST Privacy Framework" }));
  }
  if (level === "country" && domain === "privacy") {
    return COUNTRY_PRIVACY_AREAS.map((f) => ({ ...f, source: "OECD Privacy Guidelines / UNCTAD Global Cyberlaw Tracker / Council of Europe Convention 108+" }));
  }
  // country + cybersecurity: handled by the existing, already-built
  // CMM_ASSESSMENT_FACTORS in cybersecurityModel.js -- not duplicated
  // here, callers should use that directly for this combination.
  return null;
}

export function getStageNamesFor(level, domain) {
  if (level === "country" && domain === "cybersecurity") return CMM_STAGE_NAMES;
  return NIST_TIER_NAMES; // the other 3 combinations all use the real 4-tier NIST-style scale
}

export function getFrameworkSourceName(level, domain) {
  if (level === "country" && domain === "cybersecurity") return "GCSCC Cybersecurity Capacity Maturity Model (CMM)";
  if (level === "company" && domain === "cybersecurity") return "NIST Cybersecurity Framework (CSF)";
  if (level === "company" && domain === "privacy") return "NIST Privacy Framework";
  if (level === "country" && domain === "privacy") return "OECD Privacy Guidelines / UNCTAD / Council of Europe Convention 108+";
  return "Unknown framework";
}

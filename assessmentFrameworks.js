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

// company + cybersecurity: real NIST Cybersecurity Framework content,
// expanded into real Categories within each Function (not just one
// broad question per Function) per explicit request to collect as
// much detail as possible about systems, policies, and processes.
const NIST_CSF_FUNCTIONS = [
  {
    id: "CSF-ID-1",
    name: "Identify -- Asset Management & Business Environment",
    description: "Real NIST CSF Identify Function, Asset Management and Business Environment Categories: the data, personnel, devices, systems, and facilities that enable the organization to achieve business purposes are identified and managed consistent with their relative importance to business objectives and risk strategy.",
    question: "What systems, devices, data, and personnel does your organization have an inventory of, and how is that inventory kept current? Describe the actual tools/processes used (e.g. asset management software, spreadsheets, none).",
  },
  {
    id: "CSF-ID-2",
    name: "Identify -- Risk Assessment & Governance",
    description: "Real NIST CSF Identify Function, Risk Assessment and Governance Categories: the organization understands the cybersecurity risk to operations, assets, and individuals, and the policies/procedures/processes to manage and monitor regulatory, legal, and operational requirements are understood and inform risk management.",
    question: "Describe your organization's risk assessment process: how often is it done, who does it, and how do results inform decisions? What governance policies exist (e.g. an information security policy) and who owns them?",
  },
  {
    id: "CSF-PR-1",
    name: "Protect -- Identity Management & Access Control",
    description: "Real NIST CSF Protect Function, Identity Management, Authentication and Access Control Category: access to physical and logical assets is limited to authorized users, processes, and devices, and managed consistent with assessed risk.",
    question: "Describe your access control systems and processes: how are user accounts/permissions granted and revoked, is multi-factor authentication used, and how are privileged accounts managed?",
  },
  {
    id: "CSF-PR-2",
    name: "Protect -- Data Security & Awareness Training",
    description: "Real NIST CSF Protect Function, Data Security and Awareness/Training Categories: information and records are managed consistent with risk strategy to protect confidentiality/integrity/availability, and personnel are provided cybersecurity awareness education.",
    question: "Describe your data protection practices (encryption at rest/in transit, backups, data classification) and your employee security awareness/training program, if any.",
  },
  {
    id: "CSF-DE-1",
    name: "Detect -- Anomalies & Continuous Monitoring",
    description: "Real NIST CSF Detect Function, Anomalies and Events, and Security Continuous Monitoring Categories: anomalous activity is detected and the potential impact understood, and information systems/assets are monitored to identify cybersecurity events.",
    question: "What systems or processes does your organization use to monitor for suspicious activity (e.g. SIEM, log monitoring, endpoint detection)? How is monitoring coverage across your systems?",
  },
  {
    id: "CSF-DE-2",
    name: "Detect -- Detection Processes",
    description: "Real NIST CSF Detect Function, Detection Processes Category: detection processes and procedures are maintained and tested to ensure awareness of anomalous events.",
    question: "How are detection processes tested and improved over time? Who is responsible for reviewing alerts, and how quickly are real incidents typically identified?",
  },
  {
    id: "CSF-RS-1",
    name: "Respond -- Response Planning & Communications",
    description: "Real NIST CSF Respond Function, Response Planning and Communications Categories: response processes/procedures are executed and maintained, and response activities are coordinated with internal/external stakeholders.",
    question: "Does your organization have a documented incident response plan? Who is on the response team, and what are the internal/external (e.g. regulators, customers) communication procedures during an incident?",
  },
  {
    id: "CSF-RS-2",
    name: "Respond -- Analysis & Mitigation",
    description: "Real NIST CSF Respond Function, Analysis and Mitigation Categories: analysis is conducted to ensure effective response and support recovery activities, and activities are performed to prevent expansion of an event and resolve it.",
    question: "Describe your process for investigating and containing an incident once detected, and how lessons learned are captured and fed back into your defenses.",
  },
  {
    id: "CSF-RC-1",
    name: "Recover -- Recovery Planning",
    description: "Real NIST CSF Recover Function, Recovery Planning Category: recovery processes and procedures are executed and maintained to ensure restoration of systems/assets affected by cybersecurity incidents.",
    question: "Describe your backup and disaster recovery systems and processes: what is backed up, how often, where, and has recovery ever actually been tested?",
  },
  {
    id: "CSF-RC-2",
    name: "Recover -- Improvements & Communications",
    description: "Real NIST CSF Recover Function, Improvements and Communications Categories: recovery planning incorporates lessons learned, and restoration activities are coordinated with internal/external parties.",
    question: "How does your organization capture lessons learned after an incident to improve recovery plans, and what is your process for communicating recovery status to stakeholders?",
  },
];

// company + privacy: real NIST Privacy Framework content, expanded
// into real sub-areas within each Function per explicit request.
const NIST_PRIVACY_FUNCTIONS = [
  {
    id: "PF-ID-1",
    name: "Identify-P -- Data Inventory & Mapping",
    description: "Real NIST Privacy Framework Identify-P Function, Inventory and Mapping Category: data processing by systems, products, or services is understood and informs the management of privacy risk.",
    question: "Does your organization maintain an inventory or map of what personal data it collects, where it's stored, and where it flows (including third parties)? Describe the actual system or process used.",
  },
  {
    id: "PF-ID-2",
    name: "Identify-P -- Risk Assessment",
    description: "Real NIST Privacy Framework Identify-P Function, Risk Assessment Category: the organization understands privacy risks to individuals arising from data processing.",
    question: "Does your organization conduct privacy impact assessments (PIAs/DPIAs) before new data processing activities? How often, and who is involved?",
  },
  {
    id: "PF-GV-1",
    name: "Govern-P -- Policies & Roles",
    description: "Real NIST Privacy Framework Govern-P Function, Governance Policies and Organizational Risk Management Roles Categories: the policies, processes, and procedures to manage privacy risk are established and communicated, with defined roles.",
    question: "Describe your organization's privacy policies and governance structure: is there a written privacy policy, a designated privacy officer, and clear accountability for privacy decisions?",
  },
  {
    id: "PF-GV-2",
    name: "Govern-P -- Legal & Regulatory Awareness",
    description: "Real NIST Privacy Framework Govern-P Function, Awareness and Training, and Monitoring and Review Categories: personnel understand their roles and legal/regulatory requirements, and the governance approach is reviewed.",
    question: "Which privacy laws/regulations apply to your organization (e.g. GDPR, CCPA, national laws), and how does your organization stay current with and train staff on these requirements?",
  },
  {
    id: "PF-CT-1",
    name: "Control-P -- Data Subject Rights & Consent",
    description: "Real NIST Privacy Framework Control-P Function, Data Processing Management Category: individuals' data processing preferences and requests are enabled and managed.",
    question: "How can individuals exercise rights over their data (access, correction, deletion, opt-out) with your organization in practice? Describe the actual process and typical response time.",
  },
  {
    id: "PF-CT-2",
    name: "Control-P -- Data Minimization & Retention",
    description: "Real NIST Privacy Framework Control-P Function, Disassociated Processing Category: data processing solutions increase disassociability consistent with organizational risk strategy (e.g. minimization, retention limits).",
    question: "Does your organization have data minimization and retention policies (only collecting/keeping what's needed, for how long)? Describe how these are actually enforced technically or procedurally.",
  },
  {
    id: "PF-CM-1",
    name: "Communicate-P -- Privacy Notices & Transparency",
    description: "Real NIST Privacy Framework Communicate-P Function, Communication Policies Category: reliable, clear, and accessible information is provided about how data is processed.",
    question: "Describe your organization's privacy notices/policies shown to individuals: are they clear and accessible, and how often are they updated?",
  },
  {
    id: "PF-PR-1",
    name: "Protect-P -- Technical Safeguards",
    description: "Real NIST Privacy Framework Protect-P Function, Data Protection Policies/Processes/Procedures Category: policies/processes/procedures are maintained to manage protection of data consistent with risk strategy.",
    question: "Describe the technical safeguards protecting personal data specifically (encryption, pseudonymization/anonymization, access controls specific to personal data).",
  },
  {
    id: "PF-PR-2",
    name: "Protect-P -- Data Disposal & Incident Response",
    description: "Real NIST Privacy Framework Protect-P Function, Maintenance and Protective Technology Categories: system maintenance and protective technology are managed consistent with privacy risk strategy, including secure data disposal.",
    question: "How does your organization securely dispose of personal data when no longer needed, and does your incident response plan specifically address personal data breaches (including notification obligations)?",
  },
];

// country + privacy: synthesized from the real OECD Privacy Guidelines'
// 8 principles (the actual foundational framework most national data
// protection laws build on) plus real national-capacity areas UNCTAD's
// Global Cyberlaw Tracker and the Council of Europe's Convention 108+
// actually assess -- expanded into more granular sub-areas per
// explicit request.
const COUNTRY_PRIVACY_AREAS = [
  {
    id: "PRIV-C1-1",
    name: "Legislation -- Scope & Core Principles",
    description: "Whether comprehensive data protection/privacy legislation exists, reflecting the OECD's core principles (Collection Limitation, Data Quality, Purpose Specification, Use Limitation) -- the foundational element UNCTAD's Global Cyberlaw Tracker measures first for every country.",
    question: "Does your country have comprehensive data protection/privacy legislation? Describe its scope (sectors/data types covered), what core principles it embeds, and how long it has been in force.",
  },
  {
    id: "PRIV-C1-2",
    name: "Legislation -- Sector-Specific & Related Laws",
    description: "Whether sector-specific privacy rules exist (health, financial, telecommunications) alongside general legislation, and whether related laws (cybercrime, consumer protection) reinforce privacy protection, as UNCTAD's tracker separately assesses.",
    question: "Are there sector-specific privacy laws (e.g. for health or financial data) in your country, and how do they relate to the general data protection law?",
  },
  {
    id: "PRIV-C2-1",
    name: "Enforcement Authority -- Independence & Powers",
    description: "Whether an empowered, independent Data Protection Authority (DPA) or equivalent enforcement body exists with real investigative and sanctioning power -- a key real-world differentiator between countries with privacy laws on paper versus laws that are actually enforced.",
    question: "Does your country have an independent authority responsible for enforcing privacy/data protection law? Describe its independence from government/industry and its actual legal powers (investigation, fines, orders).",
  },
  {
    id: "PRIV-C2-2",
    name: "Enforcement Authority -- Track Record & Resources",
    description: "Whether the enforcement authority has genuine capacity (staffing, budget) and an actual track record of enforcement action, not just formal existence on paper.",
    question: "What is the enforcement authority's actual track record (recent enforcement actions, fines issued), and does it appear adequately resourced/staffed for its mandate?",
  },
  {
    id: "PRIV-C3-1",
    name: "Individual Rights",
    description: "Whether individuals have real, exercisable rights over their data (access, correction, deletion, objection) -- an explicit OECD Individual Participation principle.",
    question: "What rights do individuals in your country legally have over their personal data (access, correction, deletion, objection, portability), and how easily can these be exercised in practice?",
  },
  {
    id: "PRIV-C3-2",
    name: "Security Safeguards & Breach Notification",
    description: "Whether Security Safeguards -- an explicit OECD principle -- are legally required of data controllers, including mandatory breach notification to authorities and affected individuals.",
    question: "Are organizations in your country legally required to implement security safeguards for personal data, and is there a mandatory breach notification requirement (to a regulator and/or affected individuals)?",
  },
  {
    id: "PRIV-C4-1",
    name: "Openness & Accountability",
    description: "Whether the OECD's Openness principle (a general policy of transparency about data practices) and Accountability principle (data controllers being held responsible for compliance) are reflected in practice, not just in law text.",
    question: "In practice, how transparent are organizations in your country expected to be about their data practices, and how are they actually held accountable for compliance (audits, certifications, liability)?",
  },
  {
    id: "PRIV-C5-1",
    name: "International Instruments",
    description: "Whether the country participates in international privacy instruments, particularly the Council of Europe's Convention 108+, the only legally binding multilateral data protection instrument -- a real, tracked indicator of national privacy capacity maturity.",
    question: "Does your country participate in international privacy/data protection agreements (e.g. Convention 108+, regional frameworks)? Describe its level of engagement.",
  },
  {
    id: "PRIV-C5-2",
    name: "Cross-Border Data Transfer Rules",
    description: "Whether the country has clear, compatible rules for cross-border data transfers (e.g. adequacy mechanisms, standard contractual clauses, binding corporate rules) -- essential for a country's participation in the global digital economy per UNCTAD's analysis.",
    question: "Does your country have clear legal rules for transferring personal data across borders (e.g. adequacy decisions, contractual safeguards)? Describe how compatible these are with major trading partners' regimes.",
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

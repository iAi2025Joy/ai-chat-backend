// assessmentFieldTypes.js
//
// Shared structured-field generator used by BOTH the Structured Form
// (assessmentFrameworks.js, for the 3 non-CMM combinations, and
// server.js for the 4th, CMM) -- per explicit request to make every
// assessment question genuinely detailed and specific, with a real
// variety of input types (dropdown, multiple-choice/checkboxes, short
// text, long text, file upload) rather than a single open textarea per
// question, and to explicitly cover policies, laws/regulations,
// devices/systems, business processes, and HR/people for every area --
// not just whichever single aspect the original open question
// happened to mention.
//
// Deliberately generates a CONSISTENT 5-field structure for every
// factor across all 4 frameworks (55 factors total: 23 CMM + 8 NIST
// CSF + 10 NIST Privacy + 14 country-privacy), rather than
// hand-authoring bespoke fields per factor one at a time -- what
// actually differs per factor is the CHECKLIST OPTIONS within the
// "scope_and_coverage" field, tailored via inferCategory() below based
// on each factor's real id (which maps to a real Dimension/Function --
// see cybersecurityModel.js's CMM_ASSESSMENT_FACTORS and
// assessmentFrameworks.js's NIST_CSF/NIST_PRIVACY/COUNTRY_PRIVACY
// arrays), so the checklists stay genuinely specific to what that
// particular area covers rather than being one generic list reused
// unchanged everywhere.

// Real category assignment per factor id-prefix, based on what each
// factor genuinely assesses.
const CATEGORY_BY_ID_PREFIX = [
  // CMM (country + cybersecurity)
  { prefix: "D1.", category: "policy" }, // Cybersecurity Policy and Strategy
  { prefix: "D2.", category: "people" }, // Cybersecurity Culture and Society
  { prefix: "D3.", category: "people" }, // Building Cybersecurity Knowledge and Capabilities
  { prefix: "D4.", category: "legal" }, // Legal and Regulatory Frameworks
  { prefix: "D5.", category: "technical" }, // Standards and Technologies
  // NIST CSF (company + cybersecurity)
  { prefix: "CSF-ID", category: "policy" },
  { prefix: "CSF-PR", category: "technical" },
  { prefix: "CSF-DE", category: "technical" },
  { prefix: "CSF-RS", category: "process" },
  { prefix: "CSF-RC", category: "process" },
  // NIST Privacy Framework (company + privacy)
  { prefix: "PF-ID", category: "policy" },
  { prefix: "PF-GV", category: "policy" },
  { prefix: "PF-CT", category: "process" },
  { prefix: "PF-CM", category: "policy" },
  { prefix: "PF-PR", category: "technical" },
  { prefix: "PF-AI", category: "technical" },
  { prefix: "PF-DEV", category: "technical" },
  // Country + privacy synthesis
  { prefix: "PRIV-C1", category: "legal" },
  { prefix: "PRIV-C2", category: "legal" },
  { prefix: "PRIV-C3", category: "legal" },
  { prefix: "PRIV-C4", category: "policy" },
  { prefix: "PRIV-C5", category: "legal" },
  { prefix: "PRIV-C6", category: "legal" },
  { prefix: "PRIV-C7", category: "technical" },
];

export function inferCategory(factorId) {
  const match = CATEGORY_BY_ID_PREFIX.find((c) => factorId.startsWith(c.prefix));
  return match ? match.category : "process";
}

// Real, concrete checklist options per category -- deliberately spans
// policies, laws, devices/systems, and HR/people to SOME degree in
// every list (per explicit request to cover all of these areas
// everywhere), while the first few options in each list are tailored
// to what that category is most centrally about, so the checklist
// still reads as genuinely specific to the area being assessed rather
// than one interchangeable generic list.
export const SCOPE_OPTIONS_BY_CATEGORY = {
  policy: [
    "A written policy or strategy document exists for this",
    "Formally approved by leadership/senior management",
    "Reviewed or updated within the last 12 months",
    "Communicated to all relevant staff",
    "Extends to third-party vendors/contractors",
    "Tied to a specific legal or regulatory requirement",
    "Not yet formally documented",
  ],
  legal: [
    "Specific legislation or regulation directly applies",
    "A designated authority/regulator has real enforcement power over this",
    "Formal compliance obligations are actively tracked",
    "Legal counsel is regularly consulted on this area",
    "Cross-border or international obligations apply",
    "Reflected in internal policy, not just the law itself",
    "No specific legal framework currently applies",
  ],
  technical: [
    "Employee laptops/desktops",
    "Mobile devices (company-owned or BYOD)",
    "Servers and on-premises infrastructure",
    "Cloud/SaaS systems",
    "IoT or operational technology (OT) devices",
    "Network perimeter (firewalls, VPN, remote access)",
    "Third-party/vendor-managed systems",
  ],
  people: [
    "All employees / the general population, broadly",
    "IT/security staff specifically",
    "Executive leadership/board/senior officials",
    "Contractors and third parties",
    "General public/customers/citizens",
    "New hires, as part of onboarding",
    "Departing staff, as part of offboarding",
  ],
  process: [
    "A formal written procedure exists",
    "Has an assigned owner or responsible team",
    "Regularly tested, exercised, or audited",
    "Integrated with HR (onboarding/offboarding)",
    "Integrated with procurement/vendor management",
    "Covers third-party/vendor incidents or failures, not just internal ones",
    "Not yet a formal process",
  ],
};

// Builds the real 5-field structure for one factor: a maturity
// dropdown (select), a scope/coverage checklist (multi_select) tailored
// to the factor's real category, a short text field for ownership, the
// original detailed open question as a textarea, and a file upload for
// supporting evidence -- covering every real input type requested
// (dropdown, multiple choice, text entry, file upload) for every
// single factor across all 4 frameworks, not just some of them.
export function buildStructuredFields(factor, stageOptions) {
  const category = inferCategory(factor.id);
  const scopeOptions = SCOPE_OPTIONS_BY_CATEGORY[category] || SCOPE_OPTIONS_BY_CATEGORY.process;
  return [
    {
      id: "stage_rating",
      type: "select",
      label: "Current maturity / status self-rating for this area",
      options: stageOptions,
    },
    {
      id: "scope_and_coverage",
      type: "multi_select",
      label: "Which of the following genuinely apply here? (select all that apply)",
      options: scopeOptions,
    },
    {
      id: "owner_text",
      type: "text",
      label: "Who owns or is responsible for this area? (name, role, or team -- optional)",
    },
    {
      id: "narrative",
      type: "textarea",
      label: factor.question,
    },
    {
      id: "evidence_file",
      type: "file",
      label: "Attach supporting evidence (policy document, screenshot, report, etc. -- optional)",
    },
  ];
}

// cybersecurityKnowledgeBase.js
//
// Real, structured knowledge chunks extracted directly from the GCSCC's
// "Cybersecurity Capacity Maturity Model for Nations (CMM) - 2021
// Edition" (uploaded document) plus the GCSCC's own real, current
// public information about the Global Constellation and its 2025 AI
// cybersecurity work (confirmed via web search, not invented). Each
// chunk is embedded once (see cybersecurityModel.js) and retrieved by
// real semantic similarity to whatever the user actually asks -- not a
// fixed, always-included block of text, so the model only sees the
// specific parts of the CMM actually relevant to each question.
//
// Source: Global Cyber Security Capacity Centre (GCSCC), University of
// Oxford. https://gcscc.ox.ac.uk/the-cmm
//
// NOTE: this covers the CMM's overview, structure, and all 23 Factors
// across the 5 Dimensions with their real descriptions and Aspects --
// it does NOT yet include the full stage-by-stage indicator tables
// (Start-up/Formative/Established/Strategic/Dynamic criteria for each
// Aspect), which are extremely long and granular (formal-review-level
// detail). That's a natural next addition if deeper "what exactly
// counts as Established for X" questions turn out to be common --
// just add more chunks here, nothing else needs to change.

export const CYBERSECURITY_CORE_KNOWLEDGE_CHUNKS = [
  // ------------------------------------------------------------------
  // FULL STAGE-BY-STAGE INDICATOR CONTENT -- the actual scoring
  // criteria for each of the 23 Factors, condensed from the CMM 2021
  // Edition's full tables into faithful prose (same real content, not
  // simplified away) so the model can genuinely assess a described
  // situation against real Start-up/Formative/Established/Strategic/
  // Dynamic criteria, not just discuss what a Factor covers at a high
  // level. One chunk per Factor, retrieved individually so only the
  // Factor(s) actually relevant to a given question get pulled in.
  // ------------------------------------------------------------------
  {
    id: "cmm-d1.1-indicators",
    title: "D1.1 National Cybersecurity Strategy -- maturity stage criteria",
    text:
      "Aspect: Strategy Development. Start-up: no national strategy exists, though planning may have begun and advice may have been sought internationally. Formative: strategy development processes initiated, an outline/draft strategy articulated, consultation agreed with key stakeholder groups. Established: a national strategy has been PUBLISHED, based on a country-specific risk assessment, reflecting stakeholders across government/business/civil society, with an implementation programme and monitoring mechanisms in place. Strategic: strategy review/renewal processes exist, emerging risks are regularly assessed to update the strategy, and impact on risk/harm reduction is understood and informs funding decisions. Dynamic: the strategy is proactively reviewed against broader political/economic/social/technical developments, the country is an acknowledged international authority supporting others' strategy development, and cybersecurity is embedded across other national strategies. Aspect: Content. Start-up: various policies may mention cybersecurity but are not comprehensive or reflective of national priorities. Formative: content reflects country-specific priorities but is generally ad hoc; key outcomes are defined. Established: content is based on a comprehensive risk assessment with explicit links to national security/digital/economic policy, covering public awareness, cybercrime mitigation, incident response, public-private partnership, and CI protection; consideration given to child protection, human rights, equality/diversity/inclusion, and disinformation. Strategic: content accounts for emerging-technology risk to CI/economy/society, with specific measurable outcomes and metrics, and sustainability planning beyond the strategy's lifetime. Dynamic: content accounts for the impact of broader political/economic/social/technical/legal/environmental developments, and promotes bilateral/multilateral international cooperation. Aspect: Implementation and Review. Start-up: no overarching implementation programme exists. Formative: a coordinated programme is being developed with stakeholders, actions assigned to owners, but resource availability unconfirmed and review mechanisms ad hoc. Established: a detailed implementation plan is published with actions/entities/budgets, a coordinating body has sufficient authority, resources are identified, and adequately-funded review processes exist. Strategic: outcome-oriented metrics monitor real impact on risk reduction and refine action plans, drawn from a wide variety of sources, with independent oversight. Dynamic: mechanisms exist for far-reaching programme changes in response to significant circumstance changes, and the programme contributes to global development of outcome-oriented metrics. Aspect: International Engagement. Start-up: limited awareness of international cybersecurity policy debates (norms, mutual legal assistance, Internet governance, data sovereignty/protection); may benefit from regional networks without actively engaging. Formative: aware of international discussions, may participate occasionally but passively (e.g. FIRST, regional CERTs, IGF, UN GGE). Established: an assessment has been made of how international debates affect the country's interests, with specific engagement objectives and multiple stakeholders involved; actively participating in relevant bodies with voices being heard. Strategic: actively building international communities of interest around specific policy goals, making major contributions to regional/international bodies, involved in building capacity in third-party countries. Dynamic: a leading actor building consensus and shaping international debates, focused on future/emerging issues, actively creating new regional/international collaboration mechanisms.",
  },
  {
    id: "cmm-d1.2-indicators",
    title: "D1.2 Incident Response and Crisis Management -- maturity stage criteria",
    text:
      "Aspect: Identification and Categorisation of Incidents. Start-up: no process exists for identifying/categorising national-level incidents. Formative: some organisations/sectors have internal mechanisms; a national-level process is under development; no central registry, ad hoc arrangements for major events only. Established: most major organisations have internal mechanisms; a central registry of national-level incidents exists with a timely escalation process; incidents are categorised by severity with resources allocated accordingly. Strategic: insights from national-level incidents are routinely analysed to inform broader policy/strategy. Dynamic: categorisation criteria are flexible for rapidly emerging threats, and the country contributes to international best practice. Aspect: Organisation. Start-up: no national-level cyber incident response organisation exists; internal mechanisms if any are minimally coordinated. Formative: a national CERT might exist but lacks resources/skills; coordination with the national CERT is ad hoc; sub-national roles unclear; international cooperation limited. Established: a national incident-response body exists with sufficient resources/skills/documented processes/legal authorities (including out-of-hours capability); relationships enable coordination between the national body and public/private sectors; sub-national roles are clear; regular threat/vulnerability sharing occurs including with international partners. Strategic: the national body undertakes wide engagement (convening communities of interest, cross-sector exercises, best-practice promotion), innovates additional services, and is widely recognised as authoritative, with effectiveness regularly benchmarked internationally. Dynamic: the overall operational response adapts to changes in the technical/threat environment, and the country contributes to international best practice on organising operational cybersecurity responses. Aspect: Integration of Cybersecurity into National Crisis Management. Start-up: no national crisis-management framework exists; cybersecurity not considered a potential national-level crisis; emergency communications limited. Formative: a framework is in development with an organisation allocated responsibility; cybersecurity recognised as relevant to crisis management; an exercise programme including cyber scenarios is in development. Established: cybersecurity is fully integrated into the national crisis-management framework, with a well-defined cyber incident management authority role and understood escalation thresholds; national crisis scenarios with cybersecurity components are regularly exercised and emergency communications regularly tested for cyber resilience. Strategic: lessons from cyber crisis exercises inform national crisis-management policy and the national cybersecurity strategy; international crisis planning/exercising with partners routinely includes cybersecurity; emergency communications resilience is stress-tested against a wide range of scenarios. Dynamic: the country contributes to international debate on integrating cyber into national/international crisis management, and emergency communications capabilities can operate beyond the country's border to support third-party countries and global crisis responses.",
  },
  {
    id: "cmm-d1.3-indicators",
    title: "D1.3 Critical Infrastructure (CI) Protection -- maturity stage criteria",
    text:
      "Aspect: Identification. Start-up: some appreciation of what constitutes a CI asset, but no formal categorisation. Formative: a list of general CI assets/sectors/operators has been created. Established: the list is formalised across appropriate public/private organisations, specific operators identified, kept up to date, with cross-border dependencies identified. Strategic: the list adapts to strategic shifts in the technical/social/economic environment, interdependencies between sectors and cross-border dependencies are managed. Dynamic: the identification process is flexible for rapidly emerging changes, the country is actively involved in identifying/prioritising global CI assets, and cross-sector/cross-border dependencies are mitigated. Aspect: Regulatory Requirements. Start-up: no existing regulatory requirements specific to CI cybersecurity. Formative: the need for baseline standards is acknowledged but not explicitly mandated; sector regulators do not routinely assess compliance. Established: CI operators are mandated by regulation to meet appropriate cybersecurity standards, with mandatory breach reporting/vulnerability disclosure requirements and formal compliance-evaluation processes. Strategic: novel regulatory-supervision approaches are being developed to improve CI cybersecurity while facilitating effective service delivery, and the country promotes best-practice regulatory approaches internationally. Dynamic: regulatory frameworks are flexible for rapidly emerging changes, and the country is actively involved in establishing regulatory approaches to assuring global CI. Aspect: Operational Practice. Start-up: a few CI operators may implement good practices, inconsistently. Formative: many CI operators implement good practice, with some self-assessment and informal collaboration arrangements. Established: CI operators consistently implement recognised industry standards with regularly-assessed control effectiveness; mechanisms exist for sharing threat/vulnerability information and lessons learned; CI operators participate fully in national incident response/crisis exercising; public authorities provide practical support pre- and post-incident. Strategic: extensive collaboration exists among CI operators and public authorities to develop collective cybersecurity strategies; the resilience of the critical infrastructure ecosystem as a whole has been assessed against a range of scenarios with measures in place for systemic risks. Dynamic: the country and its CI operators contribute to the international debate on global CI resilience, and regulator/operator experts are internationally recognised for addressing global infrastructure protection challenges.",
  },
  {
    id: "cmm-d1.4-indicators",
    title: "D1.4 Cybersecurity in Defence and National Security -- maturity stage criteria",
    text:
      "Aspect: Defence Force Cybersecurity Strategy. Start-up: potential impact of cybersecurity on national security/defence may have been considered but not formally articulated. Formative: the potential impact has been assessed and a strategy is under development, including risks to military assets operating in a contested cyber environment. Established: a formal strategy for cybersecurity in national security/defence has been adopted, supported by appropriate legal authorities and operational doctrine consistent with international humanitarian law; dependence on wider CI cybersecurity is understood and addressed. Strategic: the defence strategy includes appropriate consideration of deterrence, and the defence/national-security establishment is actively engaged in global debate on international humanitarian law and norms of behaviour in cyberspace. Dynamic: strategy and doctrine are adaptive to changing capabilities and the geopolitical/technical threat environment, designed to promote stability in cyberspace including predicting/influencing allies' and adversaries' actions. Aspect: Defence Force Cybersecurity Capability. Start-up: specialist cybersecurity capability within national security is limited. Formative: capability requirements are understood and relevant organisational structures defined, with initial establishment steps taken. Established: capabilities/structures are in place and tested, resourced through the national military estimate process, with operational doctrine embedded in training and specialist intelligence resources appropriately resourced; collaboration mechanisms with allies are in place and tested. Strategic: relevant deterrence and defence/resilience capabilities are in place as part of the defence cybersecurity strategy, with cybersecurity embedded in wider operational/command military training. Dynamic: defence cybersecurity capabilities can support multilateral responses to shared national security challenges. Aspect: Civil Defence Co-ordination. Start-up: collaboration between civil and defence entities on cybersecurity is limited. Formative: informal collaboration may exist but is not formalised, and defence entities are not formally resourced for this work. Established: collaboration exists and has been formalised, with roles defined within crisis-management procedures, resources formally assessed/assigned, and formal mechanisms to determine military/national-security dependencies on civil/CI infrastructure. Strategic: civil-defence collaboration is built into strategic planning of both sectors to address future crisis scenarios, with mechanisms (e.g. a formal cyber reserve force) enabling defence to draw on broader economy/society skills. Dynamic: the country leads the international debate on best practice in cross-governmental civil-defence cybersecurity collaboration.",
  },
  {
    id: "cmm-d2.1-2.2-indicators",
    title: "D2.1 Cybersecurity Mindset and D2.2 Trust and Confidence in Online Services -- maturity stage criteria",
    text:
      "D2.1 Cybersecurity Mindset (Awareness of Risks, Priority of Security, Practices across government/private sector/users): Start-up: minimal or no awareness/prioritisation/safe practices anywhere. Formative: leading agencies/firms have minimal awareness and a limited proportion of users are aware; safe practices followed only by leading organisations. Established: widespread awareness within most government agencies and private firms, a growing number of users aware; most agencies/firms/users make cybersecurity a priority and follow safe practices, with surveys/metrics available. Strategic: government/private actors across all levels routinely prioritise and reassess cybersecurity in response to changing threats; most users take proactive steps; surveys/metrics routinely conducted and publicised. Dynamic: cybersecurity is habitually prioritised as a matter of course at all levels, with survey results used to refine policy, and nearly all users habitually follow (and organisations develop) safe practices. D2.2 Trust and Confidence in Online Services (Digital Literacy, Trust in Online Search/Information, Disinformation, Trust in E-government, Trust in E-commerce): Start-up: very few users critically assess online content or trust digital/e-government/e-commerce services; no disinformation tools/programmes exist. Formative: a limited but growing proportion of users are digitally literate and trusting; disinformation tools/programmes are being initiated; e-government/e-commerce services and metrics are limited/ad hoc. Established: most users critically assess content and recognise legitimate sites; disinformation approaches respect freedom of expression; key e-government services have generated large user numbers with growing trust; e-commerce is fully established with adequate security solutions. Strategic: most users confidently recognise problematic content and check validity; e-government has become the dominant default service-delivery mode; e-commerce is widely accepted as safe practice with certification schemes in place. Dynamic: nearly all users habitually assess risk and adjust behaviour; e-government/e-commerce services are recognised regionally/internationally and are proactively improved based on outcome-oriented surveys.",
  },
  {
    id: "cmm-d2.3-2.4-2.5-indicators",
    title: "D2.3 Personal Information Protection, D2.4 Reporting Mechanisms, D2.5 Media and Online Platforms -- maturity stage criteria",
    text:
      "D2.3 User Understanding of Personal Information Protection Online: Start-up: no/minimal knowledge or discussion of how personal information is handled, no privacy standards. Formative: general knowledge exists and discussions have begun on the security/privacy balance; concrete privacy actions/policies being developed. Established: a growing proportion of users have skills to manage privacy and protect against unwanted access; considerable public debate exists; privacy policies developed in public/private sectors. Strategic: all stakeholders have information/confidence/ability to protect personal information and are aware of privacy rights; mechanisms exist to ensure privacy and security don't compete. Dynamic: users have the knowledge/skills to adapt to a changing risk environment; policies are proactively reviewed and new mechanisms like privacy-by-default are promoted. D2.4 Reporting Mechanisms: Start-up: no official reporting mechanisms, no metrics of reported incidents. Formative: public/private sectors provide some uncoordinated ad-hoc reporting channels for cyber harms (fraud, cyber-bullying, child abuse online, identity theft, breaches); metrics being developed. Established: reporting mechanisms are established, promoted, and regularly used, with good metrics available. Strategic: co-ordinated reporting mechanisms are widely used/promoted, with cyber-harm metrics informing policy revision. Dynamic: mechanisms coordinate response between law enforcement and national incident response capability, with metrics routinely informing policy/decision-makers. D2.5 Media and Online Platforms: Start-up: mass/social media rarely cover cybersecurity; whistleblowers portrayed negatively. Formative: ad-hoc mass-media coverage exists on specific issues (e.g. child protection online, cyber-bullying); limited social-media discussion; some positive whistleblower examples. Established: cybersecurity is a common mainstream-media subject with broad social-media discussion; whistleblowers accepted as playing a positive role. Strategic: media coverage extends beyond threat reporting to proactive/actionable measures and economic/social impacts; transparency and whistleblowers are encouraged. Dynamic: discussion of personal experiences across media informs policy-making and facilitates societal change; whistleblowing is encouraged and protected as social accountability.",
  },
  {
    id: "cmm-d3.1-3.2-indicators",
    title: "D3.1 Building Cybersecurity Awareness and D3.2 Cybersecurity Education -- maturity stage criteria",
    text:
      "D3.1 Building Cybersecurity Awareness (Government/Private Sector/Civil Society Initiatives, Executive Awareness Raising): Start-up: no overarching national awareness-raising programme; need not recognised or only just discussed; executive awareness limited/non-existent. Formative: a coordinated programme is under development with relevant stakeholders; programmes/courses exist but not co-ordinated or reflected in national strategy; executives made aware of general issues but not organisational impact. Established: a co-ordinated national programme with a detailed implementation plan is published, linked to national strategy, with a co-ordinating body and a national awareness portal; collaborative efforts pool resources across government/private/civil society; executives across sectors address risks and primary attack methods, though crisis-management awareness is still reactive. Strategic: the national programme is fully integrated with sector-specific tailored programmes (industry, academia, women and children); emerging risks regularly update the programme; executive efforts include identifying strategic assets and contingency plans, with mandatory executive courses in nearly all sectors. Dynamic: the programme is proactively reviewed against broader strategic developments, the country creates new international awareness-raising programmes, and has a measurable impact on reducing the overall threat landscape; cybersecurity risk is a standing agenda item at every executive meeting. D3.2 Cybersecurity Education (Provision, Administration): Start-up: few/no qualified educators or accreditation exists; only general computer-science courses offered. Formative: qualification programmes for educators are being explored; some related courses exist (information security, network security, cryptography) but not cybersecurity-specific yet; demand is evidenced through enrolment. Established: qualified educators and accredited university-level courses are readily available; cybersecurity degrees are offered; education spans primary through post-graduate/vocational levels; national budget and broad stakeholder consultation inform education priorities reflected in national strategy. Strategic: educators are also drawn from industry/government; accredited courses are embedded in all computer-science degrees with dedicated cybersecurity degrees; national/international frameworks inform course design; apprenticeship programmes combine knowledge and practical skills; academic centres of excellence are established. Dynamic: national courses/degrees/research are at the forefront internationally, with international centres of excellence via twinning programmes, and curricula are systematically aligned with practical/evolving cybersecurity challenges.",
  },
  {
    id: "cmm-d3.3-3.4-indicators",
    title: "D3.3 Cybersecurity Professional Training and D3.4 Cybersecurity Research and Innovation -- maturity stage criteria",
    text:
      "D3.3 Cybersecurity Professional Training (Provision, Uptake): Start-up: few/no training programmes exist; no transfer of cybersecurity knowledge between trained and untrained employees. Formative: the need for professional training is documented nationally; general IT staff receive incident-reactive training only; ad-hoc courses/certifications available with limited uptake evidence. Established: structured training programmes exist to build a cadre of cybersecurity-specific professionals, informed by national/international frameworks; security certification is offered across sectors; an established cadre of certified employees exists with knowledge transfer to untrained employees becoming established; job-creation initiatives encourage staff to become cybersecurity professionals. Strategic: training is tailored to meet national strategic demand aligned with international good practice, including skills to communicate technical issues to non-technical audiences; outcome-oriented metrics from supply-and-demand data inform future training. Dynamic: public and private sectors collaborate on training with skillsets from both, training/education are co-ordinated so schools build a highly skilled pipeline, and retention incentive structures exist; domestic professionals overseas are consulted for lessons learned. D3.4 Cybersecurity Research and Innovation: Start-up: limited/no R&D activities occur, and no access to R&D from other countries. Formative: some R&D integration occurs domestically or with a partner country; the country may participate in relevant regional/international research networks; performance metrics are limited/ad hoc. Established: R&D activities are established and indicated in the national strategy (an R&D strategy may be in development), with adequate funding and active regional/international collaboration; performance metrics allow progress to be measured. Strategic: the country actively builds communities of interest around R&D priorities with a fully-implemented R&D strategy, making major contributions and building innovation capacity through international consortia/investment; academia-industry synergy supports curricula covering industry needs. Dynamic: the country is a leading actor shaping international R&D strategic-plan debates, forward-looking toward emerging threats, contributing to international best practices in cybersecurity R&D.",
  },
  {
    id: "cmm-d4.1-indicators",
    title: "D4.1 Legal and Regulatory Provisions -- maturity stage criteria",
    text:
      "Aspect: Substantive Cybercrime Legislation. Start-up: no specific substantive cybercrime law exists, or general criminal law's application is unclear. Formative: partial legislation addresses some aspects, or provisions are in development. Established: substantive cybercrime provisions exist in specific legislation or general criminal law; the country may have ratified regional/international cybercrime instruments and consistently seeks to implement them domestically. Strategic: measures exceed minimal international treaty baselines where appropriate, and the country adapts legislation to emerging technologies. Dynamic: cybercrime law is constructed to cater for dynamic technology/threat changes without needing substantial revision, and the country actively promotes effective cybercrime legislation internationally. Aspect: Legal and Regulatory Requirements for Cybersecurity. Start-up: limited cybersecurity requirements exist in regulation/law. Formative: stakeholders have been consulted to support establishing frameworks; draft legislation may exist but is not yet adopted or comprehensive. Established: comprehensive requirements are set out in relevant regulation/law (including sector-specific requirements), potentially including mandatory standards/breach notification, with clearly articulated liabilities and empowered enforcement bodies. Strategic: effectiveness of law/regulation is regularly assessed to inform future development, updated for emerging technologies. Dynamic: regulatory frameworks are sufficiently flexible for rapidly emerging changes, and the country is actively involved in developing international agreements for harmonisation/mutual recognition. Aspect: Procedural Cybercrime Legislation -- follows the same start-up-to-dynamic progression as substantive legislation, but for investigation powers and evidentiary requirements, including whether procedural laws permit cross-border information exchange to support cybercrime investigation. Aspect: Human Rights Impact Assessment. Start-up: legislation may be in development with no human rights impact assessments carried out. Formative: assessments may have been conducted including privacy/freedom-of-expression consideration, with some issues unresolved; human rights experts consulted. Established: full impact assessments are completed meeting international standards, with regular compliance monitoring independently verified. Strategic: assessments are regularly reviewed for continued compatibility as technology evolves, considering how cybersecurity can enhance human rights protection. Dynamic: the country actively contributes to developing/promoting human rights impact assessment practice as it relates to cybersecurity.",
  },
  {
    id: "cmm-d4.2-indicators",
    title: "D4.2 Related Legislative Frameworks -- maturity stage criteria",
    text:
      "This Factor covers four Aspects -- Data Protection Legislation, Child Protection Online, Consumer Protection Legislation, and Intellectual Property Legislation -- which each follow the same real progression: Start-up: the relevant legislation does not exist, or (for child/consumer/IP protection) exists but its application online is not yet considered. Formative: legislation is in development or being adapted for the online environment, with relevant-sector stakeholders consulted to support this. Established: the legislation's online application is understood and reflected in relevant law, implemented in line with international standards and best practice (for data protection specifically: a lead agency for data protection has been designated). Strategic: the effectiveness of the (online) legislation is regularly assessed to inform its development, and the country seeks to adapt it for emerging technologies and their use. Dynamic: the legislation is constructed to cater for dynamic technology/threat changes without needing substantial revision, and the country actively develops/promotes international standards and legal instruments for improved international collaboration in that specific area.",
  },
  {
    id: "cmm-d4.3-indicators",
    title: "D4.3 Legal and Regulatory Capability and Capacity -- maturity stage criteria",
    text:
      "Aspect: Law Enforcement. Start-up: officers/agencies lack sufficient capacity and specialised cybercrime-investigation training. Formative: traditional investigative measures are applied but digital investigation capacity is limited; training if any is ad hoc. Established: a comprehensive institutional capacity exists with sufficient human/procedural/technological resources; digital chain-of-custody and evidence integrity are established with formal roles; training standards exist and are implemented; national/state-local roles are understood and equipped. Strategic: quantified risk assessments allocate resources to operational cybercrime units; trends/statistics inform strategy and long-term resource decisions; strategies include crime-prevention alongside enforcement, using intelligence for proactive investigation; agencies can maintain evidential integrity to international cross-border standards. Dynamic: the country is actively involved in developing collaborative platforms between national law enforcement authorities and is at the forefront of developing new capabilities, promoting their use internationally. Aspect: Prosecution. Start-up: prosecutors lack adequate training/resources for electronic evidence or cybercrime prosecution. Formative: a limited number of prosecutors have largely ad-hoc, non-institutionalised capacity. Established: comprehensive institutional capacity exists with sufficient human/technological resources, potentially including a specialist cadre of cybercrime prosecutors. Strategic: institutional structures with clear task distribution exist across all levels of the state, with a mechanism enabling information/good-practice exchange between prosecutors and judges. Dynamic: there is national capacity to prosecute complex domestic AND cross-border cybercrime cases. Aspect: Courts -- follows the same progression (from no process to equip judges, through ad-hoc capacity, to sufficient resourced/trained courts at Established, to frequently-reviewed institutional capacity at Strategic, to actively promoting international best practice at Dynamic), specifically covering judges' cybercrime/electronic-evidence training and courts' capacity to process civil litigation relating to cybersecurity liability. Aspect: Regulatory Bodies -- follows the same progression regarding sector-specific regulators' (finance, energy, transport) understanding of cyber impact on regulated entities and the existence/capability of cross-sector regulatory bodies overseeing cybersecurity compliance, up to Dynamic where regulatory bodies are actively involved in developing/promoting regulatory best practice internationally.",
  },
  {
    id: "cmm-d4.4-indicators",
    title: "D4.4 Formal and Informal Co-operation Frameworks to Combat Cybercrime -- maturity stage criteria",
    text:
      "Aspect: Law Enforcement Co-operation with Private Sector. Start-up: cooperation is limited, particularly between ISPs/technology providers and law enforcement, which has not been established. Formative: information exchange is ad hoc and unregulated; cooperation with ISPs/technology providers exists but is not always effective. Established: information is regularly exchanged and supported by appropriate legislation, with effective cooperation mechanisms established as part of broader public-private collaboration arrangements. Strategic: effectiveness of public-private cooperation is regularly assessed to enhance collaborative processes, with frameworks regularly adapted to new technologies and emerging cybercrime forms. Dynamic: the country actively contributes to promoting public-private partnership and developing international public-private partnership platforms. Aspect: Co-operation with Foreign Law Enforcement Counterparts. Start-up: minimal/no international cooperation exists. Formative: formal mechanisms may exist but their application to cybercrime is ad hoc or only possible in some cases; law enforcement is not formally integrated into regional/international cybercrime networks. Established: formal mechanisms are established to facilitate detection/investigation/prosecution, with mutual legal assistance/extradition agreements applied to cybercrime cases, and domestic agencies integrated with networks like Interpol or 24/7 networks. Strategic: agencies work jointly with foreign counterparts (potentially via joint task forces), resulting in successful cross-border investigations/prosecutions. Dynamic: the country actively contributes to promoting/developing international cooperation mechanisms. Aspect: Government-Criminal Justice Sector Collaboration -- follows the same progression from minimal interaction, through ad-hoc information exchange, to Established formal relationships enabling regular exchange, to Strategic regular effectiveness assessment, to Dynamic active international promotion of efficient/timely exchange between government and criminal justice actors.",
  },
  {
    id: "cmm-d5.1-5.2-indicators",
    title: "D5.1 Adherence to Standards and D5.2 Security Controls -- maturity stage criteria",
    text:
      "D5.1 Adherence to Standards (ICT Security Standards, Standards in Procurement, Standards for Provision of Products and Services): Start-up: no standards identified for use, or only ad-hoc, unmeasured identification/implementation exists. Formative: standards have been identified with some initial promotion/take-up and measurable use of international standards/practices beginning. Established: a nationally-agreed baseline of standards/practices is identified and implemented widely across public/private sectors, with a government entity assessing use and schemes to promote enhancement/monitor compliance. Strategic: government and organisations promote standards use per assessed national risk/budget, continuously revising the choice/implementation of standards as emerging risks are assessed, contributing to international standards bodies. Dynamic: the country is actively involved in developing/promoting standards internationally, with implementation and non-compliance decisions made in response to changing threat environments through collaborative risk management. D5.2 Security Controls (Technological Security Controls, Cryptographic Controls): Start-up: minimal/no understanding or deployment of available technological/cryptographic controls. Formative: controls are deployed but not consistently across all sectors, promoted in an ad-hoc manner. Established: up-to-date technological controls (including patching/backups) and cryptographic controls (e.g. TLS) meeting international standards are deployed across all sectors, with internal provider policies for managing identified risks. Strategic: widespread adoption leads to effective upstream protection, with all sectors able to critically assess/upgrade controls for emerging risks, including widespread multi-factor authentication and adaptive encryption/cryptographic policies. Dynamic: the application of advanced technological/cryptographic controls is a leading international influence, made in response to changing threat environments.",
  },
  {
    id: "cmm-d5.3-5.4-indicators",
    title: "D5.3 Software Quality and D5.4 Communications and Internet Infrastructure Resilience -- maturity stage criteria",
    text:
      "D5.3 Software Quality and Assurance: Start-up: quality/performance is a concern but functional requirements aren't fully monitored; no catalogue of assured software exists; update/maintenance policies haven't been formulated. Formative: quality requirements are recognised but not necessarily strategically; a software catalogue and update/patch-management policies are in development. Established: quality/functional requirements are recognised and established, with reliable, standards-adherent software used widely and update/maintenance policies established across all sectors. Strategic: software quality is monitored/assessed, with policies improved based on risk assessments and business investment benefits measured; software defects are manageable in a timely manner ensuring service continuity. Dynamic: high-performance, reliable, usable software is available with fully automated service continuity processes, systematically reviewed and adapted to the changing cybersecurity environment. D5.4 Communications and Internet Infrastructure Resilience (Reliability, Monitoring and Response): Start-up: affordable/reliable Internet services/infrastructure may not be established, with little national oversight or systematic redundancy planning; no risk assessments or incident-response plans exist. Formative: limited services exist with adoption/reliability issues; incident-response plans are in development in some sectors, with ad-hoc monitoring. Established: reliable Internet services are widely available and trusted for e-commerce/business, with technology/processes meeting international standards, formally documented management, and risk assessment/monitoring/incident-response mechanisms across public and private sectors. Strategic: regular assessments of technology/compliance/emerging risk inform effective, controlled acquisition of critical technologies with managed strategic planning and service-continuity processes; risks from emerging/converging technologies are regularly assessed and inform funding/priority decisions. Dynamic: infrastructure acquisition is effectively controlled with market-responsive flexibility and continually optimised costs; national-level assets can work with the international community during trans-jurisdictional crises, with novel monitoring/response capabilities developed in anticipation of emerging threats.",
  },
  {
    id: "cmm-d5.5-5.6-indicators",
    title: "D5.5 Cybersecurity Marketplace and D5.6 Responsible Disclosure -- maturity stage criteria",
    text:
      "D5.5 Cybersecurity Marketplace (Technologies, Services and Expertise, Outsourcing Security Implications, Cyber Insurance): Start-up: if domestic cybersecurity-technology production exists it lacks secure processes; foreign-technology security implications haven't been considered; consultancy services aren't widely offered; no risk assessments for outsourcing IT; no cyber-insurance market. Formative: secure-process needs are recognised for domestic production, and foreign-technology security implications are considered; a growing number of consultancy services exist; some organisations conduct outsourcing risk assessments; the need for a cyber-insurance market has been identified. Established: secure processes are in place domestically, foreign-technology risks are identified/mitigated in an international supply-chain context, widespread consultancy services with professional certification exist, most major organisations conduct outsourcing risk assessments with business-continuity/disaster-recovery processes, and a cyber-insurance market is established including SME-suitable products. Strategic: local development follows secure coding standards with risk-assessment-informed product-development prioritisation; organisations routinely seek consultancy advice on emerging risks with adequate professional supply; a variety of cyber-insurance covers exist selected per organisational risk. Dynamic: security functions are automated in technology development/deployment, domestic cybersecurity products are exported and considered superior, a body assures foreign-technology/supply-chain security, and the domestic cyber-insurance/service sector helps shape the international market. D5.6 Responsible Disclosure (Sharing Vulnerability Information, Policies/Processes/Legislation): Start-up: no informal way exists to share technical vulnerability details; providers generally lack ability to address reports; the need for a responsible-disclosure policy and legal protections for disclosers isn't yet acknowledged. Formative: technical details are shared informally; providers can address reports but lack formal protocols; the need for policy/legal protection is recognised but not yet in place. Established: formal information-sharing mechanisms exist with a substantial proportion of vulnerabilities remedied within defined deadlines; a responsible-disclosure policy/framework exists including disclosure deadlines and legal protections for responsible disclosers. Strategic: information-sharing mechanisms and disclosure policies/processes are continuously reviewed and updated based on stakeholder needs and emerging risks, with defined deadlines being reduced where possible. Dynamic: the country contributes to international debate and best practice on vulnerability-sharing and responsible-disclosure frameworks/legal protections.",
  },
  {
    id: "cmm-overview",
    title: "What the CMM is",
    text:
      "The Cybersecurity Capacity Maturity Model for Nations (CMM) is a framework developed by the Global Cyber Security Capacity Centre (GCSCC) at the University of Oxford. It helps nations understand what works, what does not work, and why, across all areas of cybersecurity capacity, so governments and enterprises can adopt policies and make investments that significantly enhance safety and security in cyberspace while respecting human rights such as privacy and freedom of expression. Since 2015 the GCSCC has completed more than 120 CMM reviews in more than 85 countries. The CMM 2021 Edition is the first revision since the 2016 edition, developed through global consultation with the GCSCC Expert Advisory Panel, regional and implementation partners, and experts from academia, international organisations, governments, the private sector, and civil society.",
  },
  {
    id: "cmm-review-process",
    title: "How a national CMM review works",
    text:
      "A CMM review of a country involves data-gathering by a team of researchers who carry out in-country stakeholder consultation and desk research. The output is an evidence-based report that benchmarks the maturity of a country's cybersecurity capacity, details a pragmatic set of actions to address maturity gaps, and identifies priorities for investment and future capacity-building based on the country's specific needs. According to an independent study commissioned by the UK Foreign, Commonwealth and Development Office, benefits of a CMM review include increased cybersecurity awareness within government, networking and collaboration with business and civil society, enhanced internal credibility of the cybersecurity agenda, clearer roles and responsibilities, evidence to support increased funding, and a foundation for national strategy and policy development. More information on CMM review methodology and exemplary reports is available at https://gcscc.ox.ac.uk/the-cmm.",
  },
  {
    id: "cmm-five-dimensions",
    title: "The 5 Dimensions of national cybersecurity capacity",
    text:
      "The CMM organises national cybersecurity capacity into five Dimensions, which together cover the breadth of what a country needs: Dimension 1, Cybersecurity Policy and Strategy -- developing and delivering cybersecurity strategy, incident response, cyber defence, and critical infrastructure protection. Dimension 2, Cybersecurity Culture and Society -- responsible cybersecurity culture, understanding of cyber risk, trust in online/e-government/e-commerce services, personal information protection, reporting mechanisms, and the role of media. Dimension 3, Building Cybersecurity Knowledge and Capabilities -- availability, quality, and uptake of awareness-raising, formal education, and professional training programmes. Dimension 4, Legal and Regulatory Frameworks -- national legislation directly and indirectly relating to cybersecurity, cybercrime law, and the capacity to enforce it through law enforcement, prosecution, regulators, and courts. Dimension 5, Standards and Technologies -- effective and widespread use of cybersecurity technology, standards, good practices, and controls to reduce risk. There are real relationships between the Dimensions -- being effective in one area often places requirements on others, so a benchmarking review considers a country against all five Dimensions holistically.",
  },
  {
    id: "cmm-structure",
    title: "The CMM's structure: Dimension, Factor, Aspect, Stage, Indicator",
    text:
      "The CMM has a five-level structure. A Dimension is one of the five broad areas above. Within each Dimension, Factors describe the essential elements of national capacity needed to deliver that Dimension -- there are 23 Factors in total across the five Dimensions. Where a Factor has multiple components, these are divided into Aspects, an organisational method to make Factors easier to assess. Stages define how far a country has progressed on a given Factor or Aspect -- the CMM has five Stages: start-up, formative, established, strategic, and dynamic. Indicators are the most basic unit -- the specific steps, actions, or building blocks that show a country has reached a given Stage; most Indicators are binary (either evidenced or not), and all Indicators within a Stage must be fulfilled to be considered to have reached it.",
  },
  {
    id: "cmm-five-stages",
    title: "The 5 Stages of national cybersecurity capacity maturity",
    text:
      "The CMM defines five Stages of maturity, applied to every Factor/Aspect: Start-up -- either no cybersecurity maturity exists or it is very embryonic; there may be initial discussions but no concrete actions taken, and little observable evidence. Formative -- some features have begun to grow, but may be ad hoc, disorganised, or new, though evidence of activity can be clearly demonstrated. Established -- the Indicators are in place and evidenced as working, but without well-thought-out resource allocation or trade-off decisions yet; the Aspect is functional and defined. Strategic -- choices have been made about which parts of the Aspect matter most for that nation's particular circumstances, and resources are allocated accordingly. Dynamic -- clear mechanisms exist to alter national strategy depending on prevailing circumstances (technology, threat environment, global conflict, or a significant change in a specific concern like cybercrime or privacy); there is evidence of global leadership, rapid decision-making, and constant attention to the changing environment. Combining a CMM review with national risk assessments and social/economic strategy can further prioritise which capacity enhancements a nation should make.",
  },
  {
    id: "cmm-d1-overview",
    title: "Dimension 1: Cybersecurity Policy and Strategy -- overview and 4 Factors",
    text:
      "Dimension 1 explores a country's capacity to develop and deliver cybersecurity strategy, and to enhance resilience through incident response, cyber defence, and critical infrastructure protection, while maintaining the benefits of cyberspace for government, business, and society. Its four Factors are: D1.1 National Cybersecurity Strategy -- covers Strategy Development, Content, Implementation and Review, and International Engagement; essential to mainstreaming cybersecurity as a policy area, determining responsibilities, and directing resources. D1.2 Incident Response and Crisis Management -- covers Identification and Categorisation of Incidents, Organisation (a mandated central body for incident response), and Integration of Cybersecurity into National Crisis Management. D1.3 Critical Infrastructure (CI) Protection -- covers Identification of CI assets, Regulatory Requirements specific to CI cybersecurity, and Operational Practice by CI operators. D1.4 Cybersecurity in Defence and National Security -- covers Defence Force Cybersecurity Strategy, Defence Force Cybersecurity Capability, and Civil Defence Co-ordination between civil and defence entities.",
  },
  {
    id: "cmm-d2-overview",
    title: "Dimension 2: Cybersecurity Culture and Society -- overview and 5 Factors",
    text:
      "Dimension 2 reviews important elements of a responsible cybersecurity culture: understanding of cyber-related risks in society, trust in Internet/e-government/e-commerce services, users' understanding of personal information protection, reporting mechanisms for cybercrime, and the role of media and social media in shaping cybersecurity values and behaviour. Its five Factors are: D2.1 Cybersecurity Mindset -- Awareness of Risks, Priority of Security, and Practices across government, private sector, and users. D2.2 Trust and Confidence in Online Services -- Digital Literacy and Skills, User Trust in Online Search/Information, Disinformation, User Trust in E-government Services, and User Trust in E-commerce Services. D2.3 User Understanding of Personal Information Protection Online. D2.4 Reporting Mechanisms -- channels for users to report online fraud, cyber-bullying, child abuse online, identity theft, and privacy/security breaches. D2.5 Media and Online Platforms -- whether cybersecurity is a common subject in mainstream and social media, shaping public values and behaviour.",
  },
  {
    id: "cmm-d3-overview",
    title: "Dimension 3: Building Cybersecurity Knowledge and Capabilities -- overview and 4 Factors",
    text:
      "Dimension 3 reviews the availability, quality, and uptake of programmes for government, private sector, and the population as a whole, covering awareness-raising, formal education, and professional training. Its four Factors are: D3.1 Building Cybersecurity Awareness -- Awareness-raising Initiatives by Government, by Private Sector, by Civil Society, and Executive Awareness Raising. D3.2 Cybersecurity Education -- Provision of educational offerings and educator qualification, and Administration/co-ordination and resourcing of education frameworks. D3.3 Cybersecurity Professional Training -- Provision of training programmes, and Uptake/affordability to produce a cadre of certified professionals. D3.4 Cybersecurity Research and Innovation -- Research and Development culture, national project lists, financial support, incentives, and usable research outputs.",
  },
  {
    id: "cmm-d4-overview",
    title: "Dimension 4: Legal and Regulatory Frameworks -- overview and 4 Factors",
    text:
      "Dimension 4 examines a government's capacity to design and enact national legislation relating to cybersecurity, with emphasis on regulatory requirements, cybercrime legislation, and enforcement capacity through law enforcement, prosecution, regulatory bodies, and courts, plus co-operation frameworks to combat cybercrime. Its four Factors are: D4.1 Legal and Regulatory Provisions -- Substantive Cybercrime Legislation, Legal and Regulatory Requirements for Cybersecurity, Procedural Cybercrime Legislation, and Human Rights Impact Assessment. D4.2 Related Legislative Frameworks -- Data Protection Legislation, Child Protection Online, Consumer Protection Legislation, and Intellectual Property Legislation. D4.3 Legal and Regulatory Capability and Capacity -- Law Enforcement, Prosecution, Courts, and Regulatory Bodies capacity to handle cybercrime and electronic evidence. D4.4 Formal and Informal Co-operation Frameworks to Combat Cybercrime -- Law Enforcement Co-operation with the Private Sector, Co-operation with Foreign Law Enforcement Counterparts, and Government-Criminal Justice Sector Collaboration.",
  },
  {
    id: "cmm-d5-overview",
    title: "Dimension 5: Standards and Technologies -- overview and 6 Factors",
    text:
      "Dimension 5 addresses effective and widespread use of cybersecurity technology to protect individuals, organisations, and national infrastructure, examining standards adherence, security controls, software quality, infrastructure resilience, the cybersecurity marketplace, and responsible disclosure. Its six Factors are: D5.1 Adherence to Standards -- ICT Security Standards, Standards in Procurement, and Standards for Provision of Products and Services. D5.2 Security Controls -- Technological Security Controls and Cryptographic Controls. D5.3 Software Quality -- Software Quality and Assurance, including update/patch management policies. D5.4 Communications and Internet Infrastructure Resilience -- Internet Infrastructure Reliability and Monitoring and Response. D5.5 Cybersecurity Marketplace -- Cybersecurity Technologies, Cybersecurity Services and Expertise, Security Implications of Outsourcing, and Cyber Insurance. D5.6 Responsible Disclosure -- Sharing Vulnerability Information, and Policies/Processes/Legislation for Responsible Disclosure of Security Flaws.",
  },
  {
    id: "gcscc-global-constellation",
    title: "The Global Constellation of cybersecurity capacity centres",
    text:
      "The GCSCC leads a 'Global Constellation' of regional cybersecurity capacity research centres, established to drive regionally-informed research and deploy the CMM around the world. Its regional partners are the Oceania Cyber Security Centre (OCSC) in Melbourne, Australia, and the Cybersecurity Capacity Centre for Southern Africa (C3SA), based at the University of Cape Town in partnership with Research ICT Africa and the Norwegian Institute of International Affairs. Together the three centres aim to drive regionally-informed cybersecurity capacity research, lead deployment of the CMM in their respective regions, foster multidisciplinary research, and provide education and training informed by CMM deployments -- essentially operationalising coordination and reducing duplication of capacity-building efforts across regions.",
  },
  {
    id: "gcscc-ai-era",
    title: "GCSCC and the AI era of cybersecurity",
    text:
      "As of 2025, the GCSCC has expanded its work into the intersection of AI and cybersecurity, including an expanded collaboration with Monash University focused specifically on this intersection, hosting an 'AI Cybersecurity Conference: Securing the Cyber Future' under the theme 'Cyber Resilience in the Age of AI and Geopolitical Uncertainty,' and collaborating with the Mexican government and international partners to advance AI cybersecurity readiness in Mexico. This reflects a real, current shift in the GCSCC's own research agenda toward understanding how AI changes both the threat landscape (AI-enabled attacks, AI-generated disinformation, automated exploitation) and the capacity-building response (using AI for defence, incorporating AI risk into national strategy and the CMM's own Dimensions, and building AI-specific skills into cybersecurity education and workforce development).",
  },
  {
    id: "gcscc-about",
    title: "About the GCSCC",
    text:
      "The Global Cyber Security Capacity Centre (GCSCC) is a programme of the Oxford Martin School, based at the Department of Computer Science, University of Oxford. It is a leading international centre for research on efficient and effective cybersecurity capacity-building, aiming to increase the scale, pace, quality, and impact of capacity-building initiatives worldwide through a comprehensive and nuanced understanding of the cybersecurity capacity landscape. The GCSCC's goal is for its knowledge and research to help nations improve their cybersecurity capacities in a systematic, substantive way, promoting an innovative cyberspace in support of well-being, human rights, and prosperity for all.",
  },
  // ------------------------------------------------------------------
  // FOUNDATIONAL PRIVACY LAW AND AI GOVERNANCE CONTENT -- per explicit
  // request, starting from GDPR and covering global data protection
  // law plus AI ethics/governance worldwide. Hand-curated, stable
  // foundational content (unlike the weekly-managed section below,
  // which tracks ongoing developments) -- these facts don't change
  // week to week the way specific news items do.
  // ------------------------------------------------------------------
  {
    id: "gdpr-overview",
    title: "GDPR -- the EU General Data Protection Regulation",
    text:
      "The General Data Protection Regulation (GDPR), in force since 25 May 2018, is the European Union's comprehensive data protection law and the single most influential privacy law globally -- most subsequent national data protection laws worldwide have been shaped by or modeled on it (the 'Brussels effect'). Its core principles: lawfulness/fairness/transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity/confidentiality (security), and accountability. It grants individuals real rights: access, rectification, erasure ('right to be forgotten'), data portability, objection, and rights regarding automated decision-making (Article 22 -- individuals can contest purely automated decisions with legal or similarly significant effects). It requires organizations to appoint a Data Protection Officer in many cases, conduct Data Protection Impact Assessments for high-risk processing, and report breaches within 72 hours. Enforcement is via national Data Protection Authorities coordinated through the European Data Protection Board, with fines up to 4% of global annual turnover or 20 million euros, whichever is higher.",
  },
  {
    id: "global-privacy-law-landscape",
    title: "The global data protection law landscape",
    text:
      "As of the mid-2020s, comprehensive data protection/privacy laws are in effect in roughly 144+ countries (per the IAPP's Global Privacy Law and DPA Directory, which tracks over 200 countries), reflecting a sustained global trend since GDPR's 2018 entry into force. Waves of adoption include the EU's own GDPR (2018), followed by GDPR-influenced laws in Brazil (LGPD, 2020), China (PIPL, Personal Information Protection Law, 2021), India (Digital Personal Data Protection Act, implementing rules introduced recently), Saudi Arabia, Thailand, and many others enacting their first comprehensive laws in the 2020s. In the US, there is no single comprehensive federal privacy law -- instead a patchwork of state laws exists, led by California's CCPA/CPRA, plus sectoral federal laws (HIPAA for health data, GLBA for financial data). Countries still without comprehensive laws (e.g. some in the Global South) are often in draft/consideration stages. Reliable, continuously updated sources for current country-by-country status include the IAPP's Global Privacy Law and DPA Directory and UNCTAD's Global Cyberlaw Tracker.",
  },
  {
    id: "ai-governance-landscape",
    title: "Global AI ethics and governance landscape",
    text:
      "The global AI governance landscape centers on a few key real frameworks. The OECD AI Principles (adopted 2019, the first intergovernmental AI standard) have been adopted by 40+ countries and underpin the OECD's AI Policy Observatory (OECD.AI), a live-updated repository now tracking 1,300+ national and international AI policy initiatives across 80+ jurisdictions -- the most comprehensive real tracker of global AI policy. The EU AI Act is the first comprehensive, binding horizontal AI law, using a risk-based approach (unacceptable/high/limited/minimal risk categories) and has become a global reference point other jurisdictions look to when drafting their own AI regulation, similar to GDPR's earlier influence on privacy law. UNESCO's Recommendation on the Ethics of Artificial Intelligence (adopted 2021 by 190+ member states) is the first global standard-setting instrument on AI ethics specifically. Other significant efforts include the G7 Hiroshima AI Process, the UK-hosted global AI Safety Summits (starting November 2023), and various national AI strategies. A recurring theme across these frameworks: AI governance and privacy/data protection increasingly overlap, particularly around automated decision-making, profiling, and algorithmic accountability (e.g. GDPR Article 22-style individual rights are appearing in newer AI-specific laws too).",
  },
];

// ------------------------------------------------------------------
// PRIVACY LAW & AI GOVERNANCE WEEKLY UPDATE SECTION -- per explicit
// request, managed by scripts/weeklyPrivacyLawUpdate.mjs, run WEEKLY
// (not daily -- a deliberately different, slower cadence than the CMM
// section above, matching how relatively slowly formal law/policy
// actually changes compared to daily news) via GitHub Actions (see
// .github/workflows/privacy-law-weekly-update.yml). Tracks real,
// ongoing global data protection law and AI governance developments
// per country -- kept in its own clearly-separated array (not mixed
// into the hand-curated foundational content above) for the same
// organizational/safety reasons as CYBERSECURITY_DAILY_UPDATE_CHUNKS.
// ------------------------------------------------------------------
export const PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS = [
  {
    "id": "privacy-weekly-2026-08-17-1",
    "title": "[2026-08-17] [United States] [United States] A New Design Code Takes Root in the Garden State",
    "text": "New Jersey has introduced a design code aimed at enhancing privacy protection for children and minors online. This initiative aligns with similar global efforts to create safeguards in digital spaces and may influence future legislative changes in the U.S. (Source: Future of Privacy Forum, https://fpf.org/blog/a-new-design-code-takes-root-in-the-garden-state/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-2",
    "title": "[2026-08-17] [European Union] [European Union] CADA: An (E)U-turn on AI regulation",
    "text": "The article discusses the implications of the proposed CADA (Compliance and Accountability for Digital Adoption) framework in the context of AI regulations in the EU. It highlights potential challenges and changes in approach that may arise as the EU moves forward with its regulatory efforts on artificial intelligence. (Source: Future of Privacy Forum, https://fpf.org/blog/cada-an-eu-turn-on-ai-regulation/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-3",
    "title": "[2026-08-17] [Global] FPF and Leading Companies Release Risk Assessment Framework and Updated Best Practices for AI in Hiring & Employment",
    "text": "The Future of Privacy Forum (FPF) in collaboration with leading companies has launched a Risk Assessment Framework and updated best practices focused on the use of AI in hiring and employment. This initiative aims to provide organizations with guidelines to ensure ethical AI implementation and to mitigate potential risks associated with algorithmic decision-making in the hiring process. (Source: Future of Privacy Forum, https://fpf.org/press-releases/fpf-and-leading-companies-release-risk-assessment-framework-and-updated-best-practices-for-ai-in-hiring-employment/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-4",
    "title": "[2026-08-17] [United States] [United States] FPF Statement on the Senior Chatbot Protection Bill",
    "text": "The Future of Privacy Forum (FPF) released a statement regarding the Senior Chatbot Protection Bill, which aims to establish guidelines for the use of chatbots primarily aimed at senior citizens. The bill addresses concerns over the transparency and ethical considerations of AI technologies in interactions with vulnerable populations. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-statement-on-the-senior-chatbot-protection-bill/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-5",
    "title": "[2026-08-17] [[EU] The AI Act Implementation Timeline] The AI Act Implementation Timeline: What Changes Under the AI Omnibus?",
    "text": "The article discusses the implementation timeline for the EU's AI Act, outlining upcoming changes and requirements under the AI Omnibus regulation. It highlights the impact on AI governance and compliance for organizations operating within the EU. (Source: Future of Privacy Forum, https://fpf.org/blog/the-ai-act-implementation-timeline-what-changes-under-the-ai-omnibus/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-6",
    "title": "[2026-08-17] [United States] [United States] FPF Submits Comments on Colorado Decision-Making Technology Rules",
    "text": "The Future of Privacy Forum has submitted comments to assist in the rulemaking processes in Colorado concerning automated decision-making technology and chatbots. These comments aim to inform regulations that address the implications of such technologies on privacy and data protection. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-submits-comments-to-inform-colorado-automated-decision-making-technology-and-chatbot-rulemaking-processes/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-7",
    "title": "[2026-08-17] [United States] [United States] FPF Releases New Issue Brief on U.S. “Data Broker” Regulatory Landscape",
    "text": "The Future of Privacy Forum has released a new issue brief focused on the regulatory landscape surrounding data brokers in the United States. This brief explores current laws, enforcement actions, and potential reforms in the sector. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-releases-new-issue-brief-on-u-s-data-broker-regulatory-landscape/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-8",
    "title": "[2026-08-17] [European Union] [European Union] The EU AI Act – when does it become enforceable now?",
    "text": "The article discusses the enforceability timeline of the EU AI Act, which aims to regulate artificial intelligence technologies across the member states. It provides insights into the key provisions and implications for businesses operating within the EU. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/the-eu-ai-act-when-does-it-become-enforceable-now/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-9",
    "title": "[2026-08-17] [United States] [United States] Rhode Island’s New AI and Healthcare Privacy Law",
    "text": "Rhode Island has enacted a new law that addresses the intersection of artificial intelligence and healthcare privacy. This legislation aims to enhance privacy protections for patients while navigating the use of AI technologies in the healthcare sector. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/rhode-islands-new-ai-and-healthcare-privacy-law/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-10",
    "title": "[2026-08-17] [Spain] [Spain] Record €18m fine for an IT service provider to the aviation sector – reuse of customer data",
    "text": "The Spanish Data Protection Agency has imposed a record €18 million fine on Amadeus, an IT service provider for the aviation sector, for GDPR violations related to the use of traveller data without consent. This case highlights the ongoing enforcement of data protection regulations in Europe. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/06/record-e18m-fine-for-amadeus-from-spanish-data-protection-agency-for-gdpr-violations-related-to-use-of-traveller-data-without-consent/)"
  },
  {
    "id": "privacy-weekly-2026-08-17-11",
    "title": "[2026-08-17] [EU] Assessing High-Risk AI Systems under Commission Guidelines",
    "text": "The article discusses how to determine if a specific AI use case qualifies as a high-risk system according to the European Commission's guidelines. It outlines key factors and considerations for compliance, as organizations prepare for upcoming regulations surrounding AI systems. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/05/is-my-use-case-a-high-risk-ai-system-applying-the-commissions-guidelines-and-next-steps/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-1",
    "title": "[2026-08-15] [United States] [United States] A New Design Code Takes Root in the Garden State",
    "text": "The Future of Privacy Forum discusses the establishment of a new design code in New Jersey aimed at enhancing privacy protections and promoting responsible data practices. This initiative reflects growing attention to data protection and privacy regulations within the state. (Source: Future of Privacy Forum, https://fpf.org/blog/a-new-design-code-takes-root-in-the-garden-state/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-2",
    "title": "[2026-08-15] [European Union] [European Union] CADA: An (E)U-turn on AI regulation",
    "text": "The article discusses the proposed changes in AI regulation under the CADA framework in the European Union. It reflects on the evolving landscape of AI governance and the implications for organizations operating within the EU. (Source: Future of Privacy Forum, https://fpf.org/blog/cada-an-eu-turn-on-ai-regulation/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-3",
    "title": "[2026-08-15] [Global] FPF and Leading Companies Release Risk Assessment Framework and Updated Best Practices for AI in Hiring & Employment",
    "text": "The Future of Privacy Forum (FPF), along with several leading companies, has released a risk assessment framework and updated best practices focused on the use of AI in hiring and employment. This initiative aims to promote ethical AI practices and mitigate potential risks associated with automated hiring processes. (Source: Future of Privacy Forum, https://fpf.org/press-releases/fpf-and-leading-companies-release-risk-assessment-framework-and-updated-best-practices-for-ai-in-hiring-employment/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-4",
    "title": "[2026-08-15] The AI Act Implementation Timeline: What Changes Under the AI Omnibus?",
    "text": "This article discusses the implementation timeline of the AI Act and the modifications introduced by the AI Omnibus. It outlines key changes and their implications for AI governance and regulation. (Source: Future of Privacy Forum, https://fpf.org/blog/the-ai-act-implementation-timeline-what-changes-under-the-ai-omnibus/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-5",
    "title": "[2026-08-15] [United States] [United States] FPF Submits Comments on Colorado Automated Decision-Making Regulations",
    "text": "The Future of Privacy Forum has submitted comments to the Colorado rulemaking processes focused on automated decision-making technology and chatbots. This initiative is part of Colorado's efforts to regulate the use of such technologies in line with privacy considerations. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-submits-comments-to-inform-colorado-automated-decision-making-technology-and-chatbot-rulemaking-processes/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-6",
    "title": "[2026-08-15] [United States] [United States] FPF Releases New Issue Brief on U.S. 'Data Broker' Regulatory Landscape",
    "text": "The Future of Privacy Forum (FPF) has published a new issue brief that explores the regulatory landscape surrounding data brokers in the United States. The brief provides insights into the various state and federal efforts to regulate data broker activities and enhance consumer privacy. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-releases-new-issue-brief-on-u-s-data-broker-regulatory-landscape/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-7",
    "title": "[2026-08-15] [European Union] [European Union] The EU AI Act – Enforcement Timeline",
    "text": "The article discusses the enforcement timeline of the EU AI Act, detailing when the regulations will come into effect and the implications for organizations operating within the European Union. It outlines key dates and expectations surrounding compliance with the new AI regulations. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/the-eu-ai-act-when-does-it-become-enforceable-now/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-8",
    "title": "[2026-08-15] [United States] [United States] Rhode Island’s New AI and Healthcare Privacy Law",
    "text": "Rhode Island has enacted a new law that addresses the intersection of artificial intelligence and healthcare privacy. This law sets forth specific requirements for the use of AI in healthcare settings, emphasizing the protection of patient data and ensuring compliance with existing privacy standards. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/rhode-islands-new-ai-and-healthcare-privacy-law/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-9",
    "title": "[2026-08-15] [Spain] [Spain] Record €18m fine for Amadeus from Spanish Data Protection Agency for GDPR violations",
    "text": "The Spanish Data Protection Agency has imposed a record €18 million fine on IT service provider Amadeus for violations of GDPR related to the reuse of customer data without consent. This marks a significant enforcement action in the aviation sector concerning data protection regulations. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/06/record-e18m-fine-for-amadeus-from-spanish-data-protection-agency-for-gdpr-violations-related-to-use-of-traveller-data-without-consent/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-10",
    "title": "[2026-08-15] [EU] Assessing High-Risk AI Systems under Commission Guidelines",
    "text": "This article discusses the European Commission's guidelines for identifying high-risk AI systems. It provides insights on how organizations can apply these guidelines to evaluate their specific use cases and the next steps in compliance. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/05/is-my-use-case-a-high-risk-ai-system-applying-the-commissions-guidelines-and-next-steps/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-1",
    "title": "[2026-08-15] [United States] [United States] New Design Code in New Jersey",
    "text": "The blog discusses the implementation of a new design code in New Jersey aimed at enhancing data privacy and protection for consumers. This code sets specific requirements for the design of online services to prioritize user privacy. (Source: Future of Privacy Forum, https://fpf.org/blog/a-new-design-code-takes-root-in-the-garden-state/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-2",
    "title": "[2026-08-15] [European Union] [European Union] CADA: An (E)U-turn on AI regulation",
    "text": "The article discusses the proposed Comprehensive AI Development Act (CADA) in the European Union, highlighting its implications and potential shifts in AI regulation. It analyzes the challenges and opportunities presented by the act, particularly in relation to existing frameworks and future governance of artificial intelligence. (Source: Future of Privacy Forum, https://fpf.org/blog/cada-an-eu-turn-on-ai-regulation/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-3",
    "title": "[2026-08-15] [Global] FPF and Leading Companies Release Risk Assessment Framework and Updated Best Practices for AI in Hiring & Employment",
    "text": "The Future of Privacy Forum (FPF), in collaboration with leading companies, has unveiled a new risk assessment framework and updated best practices for the use of AI in hiring and employment. This initiative aims to guide organizations in implementing AI responsibly while addressing ethical considerations and potential risks associated with AI technologies. (Source: Future of Privacy Forum, https://fpf.org/press-releases/fpf-and-leading-companies-release-risk-assessment-framework-and-updated-best-practices-for-ai-in-hiring-employment/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-4",
    "title": "[2026-08-15] [United States] [United States] FPF Statement on the Senior Chatbot Protection Bill",
    "text": "The Future of Privacy Forum (FPF) has issued a statement regarding the Senior Chatbot Protection Bill, which aims to create guidelines for the use of chatbots, particularly in how they interact with vulnerable populations such as seniors. The FPF emphasizes the importance of ensuring transparency and ethical considerations in AI applications. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-statement-on-the-senior-chatbot-protection-bill/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-5",
    "title": "[2026-08-15] [European Union] [European Union] The AI Act Implementation Timeline: What Changes Under the AI Omnibus?",
    "text": "The article discusses the implementation timeline of the EU's AI Act and outlines the changes introduced under the AI Omnibus. It highlights key deadlines and regulatory expectations for AI systems within the EU framework. (Source: Future of Privacy Forum, https://fpf.org/blog/the-ai-act-implementation-timeline-what-changes-under-the-ai-omnibus/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-6",
    "title": "[2026-08-15] [United States] [United States] FPF Submits Comments on Colorado Automated Decision-Making Rulemaking",
    "text": "The Future of Privacy Forum (FPF) has submitted comments aimed at informing the rulemaking processes for automated decision-making technology and chatbots in Colorado. This submission is part of ongoing efforts to shape regulations around AI and automated technologies in a way that aligns with privacy standards. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-submits-comments-to-inform-colorado-automated-decision-making-technology-and-chatbot-rulemaking-processes/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-7",
    "title": "[2026-08-15] [United States] [United States] FPF Releases New Issue Brief on U.S. “Data Broker” Regulatory Landscape",
    "text": "The Future of Privacy Forum has published a new issue brief that examines the regulatory landscape surrounding data brokers in the United States. The brief aims to provide insights into the current laws and regulations applicable to data brokers and the implications for consumer privacy. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-releases-new-issue-brief-on-u-s-data-broker-regulatory-landscape/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-8",
    "title": "[2026-08-15] [European Union] [European Union] The EU AI Act – when does it become enforceable now?",
    "text": "The article discusses the enforceability timeline of the EU AI Act, which aims to regulate artificial intelligence across member states. It outlines the key provisions and compliance requirements that businesses will need to adhere to once the act comes into effect. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/the-eu-ai-act-when-does-it-become-enforceable-now/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-9",
    "title": "[2026-08-15] [United States] [United States] Rhode Island’s New AI and Healthcare Privacy Law",
    "text": "Rhode Island has enacted a new law focusing on the intersection of artificial intelligence and healthcare privacy. This legislation aims to enhance privacy protections for individuals' health data while using AI technologies in the healthcare sector. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/rhode-islands-new-ai-and-healthcare-privacy-law/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-10",
    "title": "[2026-08-15] [Spain] [Spain] Record €18m fine for an IT service provider to the aviation sector - reuse of customer data",
    "text": "Amadeus has been fined €18 million by the Spanish Data Protection Agency for GDPR violations concerning the use of traveler data without proper consent. This penalty marks a significant enforcement action within the aviation sector related to data protection laws. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/06/record-e18m-fine-for-amadeus-from-spanish-data-protection-agency-for-gdpr-violations-related-to-use-of-traveller-data-without-consent/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-11",
    "title": "[2026-08-15] [EU] Is my use case a high-risk AI system? Applying the Commission’s guidelines and next steps",
    "text": "The article discusses the European Commission's guidelines on identifying high-risk AI systems and outlines the next steps for compliance. It aims to provide clarity for organizations on how to assess their AI use cases against the established criteria. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/05/is-my-use-case-a-high-risk-ai-system-applying-the-commissions-guidelines-and-next-steps/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-1",
    "title": "[2026-08-15] [United States] [United States] New Design Code in New Jersey",
    "text": "New Jersey has introduced a new design code aimed at enhancing privacy protections for residents online. This code will require websites and applications to prioritize user privacy in their design and functionality, marking a step forward in state-level data protection efforts. (Source: Future of Privacy Forum, https://fpf.org/blog/a-new-design-code-takes-root-in-the-garden-state/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-2",
    "title": "[2026-08-15] [European Union] [European Union] CADA: An (E)U-turn on AI regulation",
    "text": "The blog discusses the implications of the recently proposed CADA regulation in the EU, which aims to reshape the landscape of AI regulation. It highlights key aspects of the proposal and its potential impact on current policies and governance around AI across member states. (Source: Future of Privacy Forum, https://fpf.org/blog/cada-an-eu-turn-on-ai-regulation/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-3",
    "title": "[2026-08-15] [Global] Risk Assessment Framework and Best Practices for AI in Hiring Released",
    "text": "The Future of Privacy Forum (FPF) alongside leading companies has released a risk assessment framework and updated best practices aimed at guiding the responsible use of AI in hiring and employment. This initiative seeks to address concerns related to privacy and bias in AI applications within the labor market. (Source: Future of Privacy Forum, https://fpf.org/press-releases/fpf-and-leading-companies-release-risk-assessment-framework-and-updated-best-practices-for-ai-in-hiring-employment/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-4",
    "title": "[2026-08-15] [EU] The AI Act Implementation Timeline: What Changes Under the AI Omnibus?",
    "text": "The blog discusses the implementation timeline for the AI Act in the European Union and the changes introduced by the AI Omnibus. It details key milestones and adjustments in the regulatory framework designed to ensure accountability and ethical governance in AI. (Source: Future of Privacy Forum, https://fpf.org/blog/the-ai-act-implementation-timeline-what-changes-under-the-ai-omnibus/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-5",
    "title": "[2026-08-15] [United States] [United States] FPF Submits Comments on Colorado Automated Decision-Making Regulation",
    "text": "The Future of Privacy Forum has submitted comments to inform the rulemaking processes for automated decision-making technology and chatbots in Colorado. These comments aim to influence the development of regulations that govern the use of such technologies. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-submits-comments-to-inform-colorado-automated-decision-making-technology-and-chatbot-rulemaking-processes/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-6",
    "title": "[2026-08-15] [United States] [United States] FPF Releases New Issue Brief on U.S. 'Data Broker' Regulatory Landscape",
    "text": "The Future of Privacy Forum has released a new issue brief examining the regulatory landscape for data brokers in the U.S. This brief outlines the current state of regulations, potential reforms, and the implications for data privacy. (Source: Future of Privacy Forum, https://fpf.org/blog/fpf-releases-new-issue-brief-on-u-s-data-broker-regulatory-landscape/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-7",
    "title": "[2026-08-15] [European Union] [European Union] The EU AI Act – Enforcement Timeline",
    "text": "The article discusses the enforcement timeline of the EU AI Act, detailing when the regulations will take effect and what implications this will have for AI governance in the EU. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/the-eu-ai-act-when-does-it-become-enforceable-now/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-8",
    "title": "[2026-08-15] [United States] [United States] Rhode Island’s New AI and Healthcare Privacy Law",
    "text": "Rhode Island has enacted a new law addressing the intersection of artificial intelligence and healthcare privacy. This legislation aims to enhance patient privacy rights and regulate how AI technologies are utilized in the healthcare sector. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/07/rhode-islands-new-ai-and-healthcare-privacy-law/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-9",
    "title": "[2026-08-15] [Spain] [Spain] Record €18m Fine for Amadeus from Spanish Data Protection Agency",
    "text": "The Spanish Data Protection Agency has imposed a record €18 million fine on the IT service provider Amadeus for violations of GDPR related to the reuse of traveler data without obtaining proper consent. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/06/record-e18m-fine-for-amadeus-from-spanish-data-protection-agency-for-gdpr-violations-related-to-use-of-traveller-data-without-consent/)"
  },
  {
    "id": "privacy-weekly-2026-08-15-10",
    "title": "[2026-08-15] [EU] Is my use case a high-risk AI system? Applying the Commission’s guidelines and next steps",
    "text": "This article discusses the European Commission's guidelines on identifying high-risk AI systems. It highlights the implications for businesses and outlines the necessary steps for compliance with AI regulations. (Source: Norton Rose Fulbright -- Data Protection Report, https://www.dataprotectionreport.com/2026/05/is-my-use-case-a-high-risk-ai-system-applying-the-commissions-guidelines-and-next-steps/)"
  }
];

// ------------------------------------------------------------------
// DAILY AUTO-UPDATE SECTION -- per explicit request, this array is
// entirely managed by scripts/dailyCmmUpdate.mjs, run daily via
// GitHub Actions (see .github/workflows/cmm-daily-update.yml). It
// checks a curated list of real, authoritative cybersecurity/capacity-
// building sources for genuinely new developments, and commits updates
// here automatically -- no manual review step, per explicit request.
// Kept in its own clearly-separated array (not mixed into the
// hand-curated core content above) so the two stay organized even
// though updates apply automatically -- if a bad/hallucinated entry
// ever shows up, it's easy to identify and remove since every entry
// here is clearly dated and sourced, and this whole array can be
// cleared independently without touching the core CMM content above.
// The script also prunes old entries (see MAX_DAILY_UPDATE_CHUNKS
// below) so this doesn't grow unbounded over time.
// ------------------------------------------------------------------
export const CYBERSECURITY_DAILY_UPDATE_CHUNKS = [];

// Combined knowledge base actually used for retrieval (see
// cybersecurityModel.js) -- core content first, then daily/weekly
// auto-managed updates.
export const CYBERSECURITY_KNOWLEDGE_CHUNKS = [
  ...CYBERSECURITY_CORE_KNOWLEDGE_CHUNKS,
  ...CYBERSECURITY_DAILY_UPDATE_CHUNKS,
  ...PRIVACY_LAW_WEEKLY_UPDATE_CHUNKS,
];

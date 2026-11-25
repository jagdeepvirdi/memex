# MEMEX — COMPLETE PRODUCT REDESIGN & EVOLUTION PROJECT

## Project Overview

I want to undertake a comprehensive redesign and product improvement initiative for Memex.

**Repository:** https://github.com/jagdeepvirdi/memex

**Live website:** https://memex.jagdeepsinghvirdi.com/

**Project tracking file:** `TASKS_CODEX.md`

The objective is to transform Memex from its current implementation into a polished, premium, professionally designed Personal Knowledge OS.

This is not just a visual redesign.

I want to improve the overall product experience, visual identity, usability, information architecture, application capabilities, onboarding, landing page and technical foundations wherever improvements are justified.

I have no arbitrary technical restrictions. You may introduce new dependencies, libraries, tools, components, frameworks, architectural improvements or application features when they provide genuine value.

However, all changes must be justified by their benefits, maintainability, security, performance and long-term suitability for Memex.

---

# PART A — PROJECT GOVERNANCE

## 1. TASKS_CODEX.md IS THE SINGLE SOURCE OF TRUTH

The most important requirement of this project is to maintain a comprehensive project tracking file named:

`TASKS_CODEX.md`

This file must contain the complete project roadmap and act as the single source of truth for our redesign initiative.

All phases, milestones, tasks, sub-tasks, acceptance criteria, dependencies, decisions, progress and outstanding work must be recorded here.

Do not rely on conversation history as the only source of project state.

Every time work progresses, update this file.

### Required contents of TASKS_CODEX.md

Organise the document into the following sections:

1. Project vision and objectives.
2. Current application assessment.
3. Product positioning and target experience.
4. Existing architecture and technology assessment.
5. Design principles and visual direction.
6. Project milestones and phases.
7. Detailed task breakdown for every phase.
8. Dependencies and prerequisites.
9. Acceptance criteria for every phase.
10. Testing and quality assurance requirements.
11. Technical decisions and rationale.
12. Risks and identified issues.
13. Progress tracker.
14. Completed work.
15. Deferred and outstanding work.
16. Product improvement recommendations.
17. Future roadmap.

### Task-tracking conventions

Every task must have an identifiable reference, for example:

- P0-001: Repository audit.
- P0-002: Existing application assessment.
- P1-001: Logo exploration.
- P2-001: Design tokens.
- P3-001: Sidebar redesign.

Use these statuses consistently:

- NOT STARTED
- IN PROGRESS
- BLOCKED
- DONE
- DEFERRED

Each task should include:

- Task ID.
- Description.
- Reason and expected outcome.
- Dependencies.
- Acceptance criteria.
- Testing requirements.
- Status.

Never mark a task DONE simply because code was written. It must satisfy its acceptance criteria.

Maintain a project decision log. Record significant design, architectural and technical decisions, including why they were made.

Maintain a progress summary showing:

- Current milestone.
- Current phase.
- Last completed phase.
- Active tasks.
- Blockers.
- Next recommended action.

---

## 2. STRICT PHASE-WISE EXECUTION

The project must be executed in clearly defined phases.

Do not attempt to implement the complete project in one operation.

Follow these rules:

1. Complete the initial repository audit and planning first.
2. Create TASKS_CODEX.md before making implementation changes.
3. Wait for my approval of the initial plan.
4. Execute only the phase I have approved or explicitly instructed you to start.
5. Do not silently move into the next phase.
6. Update TASKS_CODEX.md continuously.
7. At the end of each phase, verify its acceptance criteria.
8. Run appropriate tests and builds.
9. Report completed tasks, modified files, test results and outstanding issues.
10. Stop at the phase boundary and wait for my instruction to proceed.

A phase can contain multiple tasks and sub-tasks. Complete all tasks belonging to that phase before declaring it complete.

If a dependency or unexpected issue requires work from another phase, document it and explain the reason before expanding the scope.

Do not unnecessarily interrupt implementation for minor decisions. Make sensible professional design and engineering decisions.

For important architectural choices or decisions that could materially change the product, document the alternatives and recommend the best option.

---

# PART B — INITIAL EXECUTION: PHASE 0

## Phase 0: Repository Discovery, Product Audit and Project Planning

This is the FIRST task.

Do not begin implementing the redesign during Phase 0.

Your immediate responsibility is to understand the existing product and develop a comprehensive implementation roadmap.

### 0.1 Repository investigation

Inspect the repository thoroughly.

Review:

- Project structure.
- Existing documentation.
- README and release notes.
- Existing TASKS.md.
- Client application.
- Backend and API architecture.
- Shared data models and types.
- Database schema and migrations.
- Authentication and authorisation.
- AI integrations and provider architecture.
- MCP server and tools.
- Existing UI components.
- Existing design system.
- Theme management.
- PWA and mobile support.
- Testing infrastructure.
- CI/CD workflows.
- Docker and deployment configuration.

Understand the application before suggesting architectural or visual changes.

Do not overwrite or replace the existing TASKS.md. Our new tracking document is TASKS_CODEX.md.

### 0.2 Current product and UI assessment

Inspect the existing landing page and application implementation.

Assess:

- Visual consistency.
- Navigation.
- User experience.
- Information architecture.
- Responsive behaviour.
- Dashboard hierarchy.
- Content capture experience.
- Search experience.
- AI interaction.
- Settings and configuration.
- Onboarding.
- Empty states.
- Error states.
- Loading states.
- Accessibility.
- Performance.

Identify what works well, what is weak and what should be improved.

### 0.3 Product assessment

Understand what Memex currently does.

Create an inventory of all existing features and workflows.

Identify:

- Core product capabilities.
- Secondary capabilities.
- Features that are difficult to discover.
- Features that could be better integrated.
- Existing product limitations.
- Potential UX gaps.
- Technical debt.
- Missing integrations.
- Potential opportunities for new capabilities.

Do not assume a feature is missing simply because it is not immediately obvious. Investigate the implementation.

### 0.4 Technology assessment

Evaluate the existing technology choices.

Determine whether the current architecture is appropriate for the future direction of Memex.

Identify areas where new libraries, dependencies, tools, infrastructure or architectural improvements could provide value.

Do not artificially restrict yourself to the existing technology stack.

Do not introduce complexity without a clear benefit.

Evaluate proposed technology against:

- Functionality.
- Reliability.
- Security.
- Performance.
- Maintainability.
- Developer experience.
- Long-term support.
- Compatibility.
- Operational cost.

### 0.5 Define the redesign strategy

Establish a recommended design direction for Memex.

Include:

- Brand positioning.
- Brand personality.
- Logo concept.
- Typography.
- Colour strategy.
- Light and dark themes.
- Component philosophy.
- Application layout.
- Landing page direction.
- Responsive design approach.
- Product experience principles.

### 0.6 Create TASKS_CODEX.md

Based on the complete investigation, create the detailed project roadmap.

The roadmap must include all milestones and phases described in Part C.

Expand the tasks based on actual discoveries in the repository.

Include task IDs, priorities, dependencies, acceptance criteria and test requirements.

Identify any additional phases that are necessary because of architectural discoveries or missing capabilities.

### Phase 0 completion requirements

Before finishing Phase 0:

- The repository must have been assessed.
- The existing feature inventory must be documented.
- The main UX and design issues must be identified.
- The recommended technical direction must be recorded.
- The complete project roadmap must exist in TASKS_CODEX.md.
- The initial progress tracker must be populated.

Do not modify application code, styles or existing branding during this phase.

You may create TASKS_CODEX.md and any strictly necessary planning artefacts.

When complete, provide a summary of the findings and the proposed roadmap.

STOP and wait for my approval before starting Phase 1.

---

# PART C — IMPLEMENTATION ROADMAP

The following milestones define the intended direction. Refine individual tasks based on the Phase 0 investigation.

# MILESTONE 1 — BRAND IDENTITY AND DESIGN FOUNDATION

## Phase 1: Memex Brand Identity and Logo

Develop a new and distinctive brand identity for Memex.

### Brand positioning

Memex is a Personal Knowledge OS.

It captures information, organises it intelligently, connects knowledge and makes it searchable and useful.

Core differentiators:

- Local-first architecture.
- Intelligent AI-powered organisation.
- Semantic search.
- Connected knowledge.
- Privacy and user control.
- Personal information vault.
- MCP integration.
- Self-hosted and open-source.

Brand personality:

- Intelligent.
- Premium.
- Minimal.
- Thoughtful.
- Trustworthy.
- Calm.
- Modern.
- Professionally engineered.

### Logo exploration

Explore original logo concepts.

Preferred initial direction: Memory Ribbon.

An abstract geometric symbol that uses a continuous folded ribbon to subtly form the letter M.

The mark should represent memories, connected information, capture and retrieval.

Do not blindly follow this concept if a better and more distinctive solution emerges.

Explore multiple concepts, evaluate their suitability and document the recommended direction.

### Logo deliverables

- Primary logo with symbol and wordmark.
- Standalone symbol.
- Light-background variant.
- Dark-background variant.
- Monochrome variant.
- Application icon.
- Favicon.
- PWA icons.
- Social sharing image.

Prefer clean, hand-crafted vector SVG assets.

Do not simply embed generated raster artwork inside SVG files.

The final identity should be consistent across the application, login, website, PWA and documentation.

### Phase 1 completion criteria

The logo and branding must be implemented consistently and all required assets must be delivered.

---

## Phase 2: Design System and UI Foundation

Create a complete and reusable design system.

### Colour strategy

Develop two excellent themes.

Dark:
- Premium graphite backgrounds.
- Layered charcoal surfaces.
- Soft white typography.
- Refined accent colours.

Light:
- Warm ivory or porcelain backgrounds.
- Clean white and warm-grey surfaces.
- Dark graphite typography.
- Subtle shadows.

Explore indigo and muted jade as accent directions.

Select a cohesive palette rather than using too many accent colours.

### Typography

Use refined and highly readable typography.

Review existing font assets and introduce new fonts only when they materially improve the design.

### Component system

Develop reusable components for:

- Buttons.
- Forms.
- Inputs.
- Search.
- Cards.
- Navigation.
- Tables.
- Badges.
- Tags.
- Modals.
- Drawers.
- Dropdowns.
- Toast messages.
- Tabs.
- Empty states.
- Loading indicators.
- Tooltips.
- Context menus.

### Design consistency

Define:

- Spacing system.
- Typography scale.
- Border radii.
- Shadows.
- Colour tokens.
- Component states.
- Responsive breakpoints.
- Icon conventions.
- Motion and transition guidelines.

The application and landing page should share one coherent brand identity.

### Phase 2 completion criteria

The reusable design foundation must be implemented and both themes must work correctly.

---

# MILESTONE 2 — APPLICATION REDESIGN

## Phase 3: Application Shell and Navigation

Redesign the application framework.

Areas:

- Sidebar.
- Header.
- Global search.
- Navigation hierarchy.
- Profile menu.
- AI status indicators.
- Theme selection.
- Capture action.
- Mobile navigation.

Organise navigation logically without removing access to existing functionality.

Ensure the application feels cohesive from the moment a user signs in.

---

## Phase 4: Dashboard and Core Workflows

Redesign the most frequently used experiences.

### Dashboard

Make this the central control panel of Memex.

Potential layout:

1. Welcome and overview.
2. Search and capture.
3. Knowledge statistics.
4. AI-generated insights.
5. Recent items.
6. Upcoming reminders.
7. Rediscovery.
8. Knowledge connections.

Establish a clear visual hierarchy.

### Capture experience

Improve the workflow for:

- Notes.
- URLs.
- Files.
- Images.
- Voice memos.
- Google Keep imports.
- Browser bookmarklet.

Capture should be quick and intuitive.

### Search experience

Improve the global search interface, results presentation, filters and navigation.

### Ask Knowledge

Create a premium AI assistant experience.

Include:

- Conversation history where appropriate.
- Suggested questions.
- Natural-language search.
- Source attribution.
- References to original items.
- Clear AI processing states.
- Useful empty and error states.

Preserve the existing AI configuration and provider capabilities.

---

## Phase 5: Remaining Application Screens

Apply the new design system across every remaining application screen.

Include:

- Weekly Digest.
- Categories.
- Individual item pages.
- Table View.
- Places.
- Media & Books.
- Knowledge Graph.
- Pending Items.
- Enriched Items.
- Category Review.
- Password Vault.
- Settings.
- Login.
- Welcome and onboarding.
- Public shared items.
- Trash.

Do not force all screens into the same generic layout.

Use suitable information architecture for each feature.

Examples:

- Media and Books should feel like a curated personal collection.
- Places should provide a useful browsing and discovery experience.
- Table View should optimise information density and scanning.
- Knowledge Graph should make relationships easy to understand.
- Vault should communicate privacy and security.
- Settings should be well organised and approachable.

Audit all screens, not just the dashboard.

---

## Phase 6: Responsive Experience, Accessibility and Interaction Polish

Review the complete application.

Requirements:

- Desktop optimisation.
- Tablet optimisation.
- Mobile optimisation.
- Keyboard navigation.
- Accessible labels.
- Contrast.
- Focus states.
- Screen-reader semantics.
- Reduced-motion support.
- Smooth interaction feedback.
- Loading and skeleton states.
- Empty and error states.

Evaluate installability and usability as a PWA.

Identify improvements that make Memex genuinely pleasant to use on a phone.

---

# MILESTONE 3 — WEBSITE AND RELEASE QUALITY

## Phase 7: Complete Landing Page Redesign

Redesign the public website.

The landing page should communicate Memex as a premium personal knowledge platform.

### Hero

Explore this headline:

"Everything you save. Ready when you need it."

Supporting message:

"Your personal knowledge, intelligently organized. Save notes, links, files and ideas. Discover connections, ask questions and rediscover what matters. All while keeping control of your data."

Primary CTA: Explore / Install Memex.

Secondary CTA: View the source.

### Proposed website structure

1. Premium navigation and branding.
2. Hero and application preview.
3. Core product capabilities.
4. Capture, Organize and Discover.
5. Search and Ask Knowledge.
6. Connected knowledge graph.
7. Local AI and optional cloud AI.
8. Privacy and security.
9. MCP and assistant integrations.
10. Additional capabilities.
11. Installation.
12. FAQ.
13. Professional footer.

Make the website visually engaging without unnecessary complexity.

Use genuine product screenshots or carefully constructed UI previews.

Avoid generic stock imagery and meaningless AI illustrations.

### Copywriting

Rewrite the content to be benefit-oriented.

Communicate why Memex is useful and what differentiates it.

Preserve technical accuracy.

Do not invent:

- Customer testimonials.
- User numbers.
- Performance statistics.
- Security certifications.
- Unsupported privacy guarantees.

Retain useful technical documentation and installation instructions.

### SEO and social presence

Review and improve:

- Page title.
- Meta description.
- Open Graph.
- Social preview.
- Favicon.
- Structured metadata where appropriate.
- Semantic HTML.
- Page performance.

---

## Phase 8: Integration, Testing and Release Readiness

Perform a complete regression and quality review.

Verify that the new design works with existing application functionality.

### Testing

Run appropriate:

- Unit tests.
- Component tests.
- Integration tests.
- Existing application tests.
- TypeScript checks.
- Production builds.
- Responsive checks.
- Accessibility checks.

### Functional verification

Verify key workflows:

- Authentication.
- Capture.
- URL ingestion.
- File uploads.
- Search.
- Ask Knowledge.
- AI classification.
- Settings.
- Provider configuration.
- Vault.
- Import/export.
- Backup/restore.
- Reminders.
- MCP integration.
- PWA functionality.
- Theme switching.
- Sharing.

### Technical review

Check:

- Browser console errors.
- Broken navigation.
- Layout issues.
- Performance regressions.
- Accessibility problems.
- Dependency vulnerabilities.
- Security implications.
- Build and deployment compatibility.

Run visual checks at common desktop, tablet and mobile screen sizes.

Where browser automation or screenshot tooling is available, use it to inspect actual rendered screens rather than relying exclusively on source-code review.

Document any test that could not be performed.

### Phase 8 completion criteria

The redesign must be production-buildable, functionally sound and ready for deployment.

Do not claim successful deployment unless deployment was actually performed and verified.

---

# PART D — PRODUCT REVIEW AND EVOLUTION

This is an important additional part of the project.

I do not want the redesign to stop at improving the appearance.

Once the redesign is complete, I want you to independently evaluate Memex as a product.

Act as a combination of:

- Senior Product Manager.
- Product Designer.
- Software Architect.
- AI Product Specialist.
- Security and Privacy Reviewer.
- Experienced End User.

Be honest and critical.

Do not simply praise the application or recommend adding features for the sake of adding them.

## Phase 9: Independent Product Assessment and Gap Analysis

Conduct a fresh review of the redesigned application.

Evaluate the product across the following dimensions.

### A. Overall product positioning

- Is Memex solving a clear problem?
- Is its value proposition immediately understandable?
- Is it differentiated from other personal knowledge applications?
- Is the current product scope coherent?
- Does it feel like a unified Personal Knowledge OS or a collection of separate features?

### B. User experience

Review:

- First-time user experience.
- Onboarding.
- Content capture.
- Organisation.
- Search.
- Rediscovery.
- AI interaction.
- Daily usage.
- Navigation.
- Settings complexity.
- Mobile experience.

Identify anything confusing, unnecessary or difficult to discover.

### C. Functional gaps

Investigate potential missing capabilities, including:

- Better browser integration.
- Email capture.
- Calendar integration.
- Task and action extraction.
- Better reminders.
- Knowledge linking.
- Advanced search and filtering.
- Bulk operations.
- Data export.
- Import from other knowledge platforms.
- Offline capabilities.
- Personalisation.
- Automation.
- Cross-device workflows.
- API and integration ecosystem.

These are investigation areas, not automatic feature requirements. Establish whether each capability would actually help Memex.

### D. AI capabilities

Evaluate opportunities to improve:

- Semantic search.
- Knowledge retrieval.
- Context-aware answers.
- Automatic classification.
- Relationship discovery.
- Duplicate detection.
- Knowledge synthesis.
- Summaries.
- Personal recommendations.
- Intelligent reminders.
- AI-assisted organisation.
- MCP and external assistant integration.

Identify where current AI capabilities are insufficient or could be made more reliable.

### E. Privacy and security

Review:

- Local-first architecture.
- Data ownership.
- AI provider permissions.
- Data sent to cloud providers.
- Sensitive information handling.
- Vault security.
- Authentication.
- Encryption.
- Backups.
- Sharing.
- MCP permissions.
- Network exposure.

Identify any risks or missing safeguards.

Do not assume that a privacy feature is secure simply because the UI says so. Inspect the implementation.

### F. Architecture and scalability

Assess:

- Database design.
- API structure.
- Application modularity.
- Data ingestion.
- AI processing.
- Search infrastructure.
- Background jobs.
- Caching.
- Offline support.
- Integration extensibility.
- Deployment and upgrade experience.

Identify technical improvements that would provide substantial long-term benefits.

### G. Competitive product assessment

Research relevant products where useful, such as:

- Obsidian.
- Notion.
- Anytype.
- Capacities.
- Reflect.
- Readwise Reader.
- Mem.ai.
- Other relevant personal knowledge and AI tools.

Focus on product capabilities and user experience rather than simply copying competitor features.

Identify opportunities where Memex can be genuinely differentiated.

### Phase 9 deliverable

Produce a structured product review in TASKS_CODEX.md.

For every recommendation include:

- Recommendation ID.
- Problem or opportunity.
- Why it matters.
- Proposed solution.
- Expected user benefit.
- Technical complexity.
- Priority.
- Dependencies.
- Risks and trade-offs.

Use the following priority levels:

- P0 — Critical.
- P1 — High value.
- P2 — Useful improvement.
- P3 — Optional or experimental.

Clearly distinguish:

1. Missing essential capabilities.
2. Important UX improvements.
3. New product opportunities.
4. Advanced AI capabilities.
5. Nice-to-have features.
6. Things that should NOT be added.

Provide your independent opinion on what Memex should become over the next 1–2 years.

---

## Phase 10: Future Product Roadmap and Selected Enhancements

Based on the Phase 9 assessment, create a prioritised roadmap for the next evolution of Memex.

Identify which recommendations are genuinely worth implementing.

For each recommended initiative, document:

- Expected value.
- Implementation effort.
- Architectural impact.
- Maintenance implications.
- Security implications.
- Dependencies.
- Recommended sequence.

You are permitted to implement additional features and architectural improvements when they provide clear and meaningful value.

However:

- Implement small, low-risk improvements that are directly beneficial and within the approved project scope.
- For significant new capabilities, first document the proposal and its implementation plan.
- Do not introduce a large feature simply because a competitor has it.
- Avoid unnecessary complexity and feature bloat.
- Preserve Memex's core identity and local-first principles.

At the end of this phase, provide a clear distinction between:

- Improvements completed.
- Improvements recommended for the next release.
- Larger strategic features requiring a separate implementation project.

The resulting roadmap should serve as the foundation for the next generation of Memex.

---

# PART E — TECHNICAL AND ENGINEERING FREEDOM

## 1. Technical flexibility

The existing technology stack is not an absolute restriction.

You may introduce or replace:

- Dependencies.
- UI libraries.
- Component libraries.
- Animation libraries.
- Search technologies.
- AI libraries.
- State-management tools.
- Backend services.
- Infrastructure components.
- Developer tooling.
- Testing frameworks.

However, make these decisions based on measurable product or engineering benefits.

For significant changes, document:

- Current approach.
- Proposed approach.
- Reason for the change.
- Alternatives considered.
- Migration requirements.
- Risks.
- Maintenance cost.

Do not upgrade or replace technology without a sound reason.

## 2. Existing functionality

All existing product features must be accounted for.

A redesigned screen must not silently remove existing capabilities.

Preserve data integrity and compatibility.

Database or API changes are allowed where there is a genuine need, but they must include appropriate migrations, tests and backward compatibility considerations.

## 3. Security and privacy

Technical freedom does not mean weakening the security model.

Memex handles personal information and potentially sensitive content.

Preserve and improve:

- Data privacy.
- Encryption.
- Authentication.
- Authorisation.
- Secure credential handling.
- AI data boundaries.
- Vault isolation.
- Backup safety.
- MCP access restrictions.

Never expose secrets or print `.env` values.

## 4. Development quality

Write production-quality code.

Avoid:

- Unnecessary duplication.
- Giant components.
- Hardcoded presentation values.
- Unnecessary dependencies.
- Fake/static implementations of working features.
- Unhandled API failures.
- Unnecessary architectural complexity.

Use reusable, testable components and well-defined boundaries.

---

# PART F — FINAL PROJECT REPORTING

At the end of every phase, provide:

1. Phase completed.
2. Tasks completed.
3. Files created.
4. Files modified.
5. Dependencies added or changed.
6. Technical decisions.
7. Tests executed.
8. Test results.
9. Remaining issues.
10. Outstanding tasks.
11. Next recommended phase.

Update TASKS_CODEX.md before reporting completion.

At the end of the entire initiative, produce a consolidated summary including:

- New Memex identity.
- Logo and brand assets.
- Design system.
- Application improvements.
- Landing page improvements.
- Technical improvements.
- New features.
- Product assessment.
- Future roadmap.
- Deployment readiness.

Always be transparent about incomplete tasks, failed tests and unverified assumptions.

---

# IMMEDIATE INSTRUCTION — START PHASE 0 ONLY

Your first action is to investigate the repository and perform the complete discovery and planning exercise described in Phase 0.

Create `TASKS_CODEX.md` with the full roadmap, milestones, phases, tasks, IDs, dependencies, acceptance criteria and progress-tracking structure.

Do not begin implementation.

Do not modify existing application code.

Do not redesign the UI yet.

Do not create final branding assets yet.

First establish a professional and realistic project plan based on the actual codebase.

Once TASKS_CODEX.md has been created, show me:

- Your assessment of the current product.
- The key design and functional problems.
- Your proposed brand direction.
- Your recommended technical improvements.
- The complete milestone and phase structure.
- The location of TASKS_CODEX.md.
- The next action required to begin Phase 1.

Then STOP and wait for my approval.

**The success of this project depends on disciplined planning, excellent design execution and incremental, verifiable implementation.**
---
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, WebSearch, mcp__context7__resolve-library-id, mcp__context7__get-library-docs
argument-hint: [task-type] | --analyze | --cleanup | --organize | --agent-split | --comprehensive
description: Orchestrate project organization, file cleanup, agent ecosystem health, and CLAUDE.md protocol enforcement
---

# Project Health & Organization

Optimize project structure, organization, and agent ecosystem health: $ARGUMENTS

## Current Project State

- Root directory files: !`find . -maxdepth 1 -type f -name "*.md" | wc -l` markdown files
- Documentation files: !`find documentation/ -name "*.md" 2>/dev/null | wc -l` docs (if exists)
- Agent count: !`find .claude/agents/ -name "*.md" -not -name "README.md" -not -name "_TEMPLATE.md" 2>/dev/null | wc -l` agents
- Commands: !`find .claude/commands/ -name "*.md" 2>/dev/null | wc -l` slash commands
- Project type: @detect from files (package.json, *.tf, pyproject.toml, etc.)

## Task

Implement comprehensive project health optimization including file organization, documentation consolidation, agent ecosystem management, and CLAUDE.md protocol enforcement.

## Core Workflows

### Workflow 1: New Project Analysis

**Purpose:** Initial project assessment and optimization recommendations

**Process:**
```
Step 1: Scan project structure
  ↓
Step 2: Detect project type (web app, infrastructure, Python, game dev, etc.)
  ↓
Step 3: Analyze work patterns (git history, topic frequency)
  ↓
Step 4: Identify optimization opportunities
  ↓
Step 5: Suggest appropriate agents and organization
```

**Implementation:**
```bash
# Step 1: Scan project structure
find . -maxdepth 1 -type f -name "*.md" | wc -l  # Count root MD files
find . -type d | head -20  # List directory structure
ls -la | grep -E "package.json|*.tf|pyproject.toml|*.unity|project.godot"

# Step 2: Detect project type
if [ -f "package.json" ] && [ -d "src/components" ]; then
    echo "Web application (React/Vue/Svelte)"
elif [ -f "next.config.js" ] || [ -f "next.config.ts" ]; then
    echo "NextJS application"
elif ls *.tf 2>/dev/null; then
    echo "Infrastructure (Terraform)"
elif [ -f "pyproject.toml" ]; then
    echo "Python library/application"
fi

# Step 3: Analyze work patterns
git log --all --format='%s' | grep -oE '\b[A-Z][a-z]+\b' | sort | uniq -c | sort -nr | head -10
grep -r "TODO\|FIXME\|XXX" --include="*.md" . | wc -l

# Step 4: Count topic mentions (example: "slack bot")
grep -ri "slack bot" . | wc -l
grep -ri "zerotier" . | wc -l
grep -ri "terraform" . | wc -l

# Step 5: Suggest agents based on thresholds
# If topic mentioned 15+ times → suggest specialized agent
```

**Deliverables:**
- Project type identification
- Work pattern analysis report
- Agent recommendations (if 8+ files on same topic)
- Organization structure proposal

---

### Workflow 2: Root Directory Cleanup

**Purpose:** Reduce root directory clutter and organize files logically

**Process:**
```
Step 1: Scan root directory (count .md files)
  ↓
Step 2: Categorize files by topic/purpose
  ↓
Step 3: Create documentation structure (if needed)
  ↓
Step 4: Consolidate redundant files
  ↓
Step 5: Move files to proper locations
  ↓
Step 6: Update CLAUDE.md references
  ↓
Step 7: Generate reorganization summary
```

**Implementation:**
```bash
# Step 1: Scan root directory
find . -maxdepth 1 -type f -name "*.md" | wc -l

# Step 2: Categorize files
# Identify files by naming patterns:
# - *_COMPLETE.md, *_DONE.md → documentation/archived/
# - *_SETUP.md, *_CONFIG.md → documentation/setup/
# - *_ISSUE.md, *_DIAGNOSIS.md → documentation/troubleshooting/
# - *_API.md, *_REFERENCE.md → documentation/reference/

# Step 3: Create documentation structure (if >5 root MD files)
mkdir -p documentation/{archived,setup,troubleshooting,reference}

# Step 4: Consolidate redundant files
# Example: Multiple "SLACK_BOT_*.md" files → one comprehensive doc
# Merge content preserving chronological order and context

# Step 5: Move files (example commands)
mv *_COMPLETE.md documentation/archived/
mv *_SETUP.md documentation/setup/
mv *_DIAGNOSIS.md documentation/troubleshooting/

# Step 6: Update CLAUDE.md
# Find and update any references to moved files

# Step 7: Generate summary
cat > REORGANIZATION_SUMMARY.md <<EOF
# Project Reorganization - $(date +%Y-%m-%d)

## Files Moved
- [List of files and destinations]

## Files Consolidated
- [List of merged files]

## New Structure
- documentation/
  - archived/ (X files)
  - setup/ (Y files)
  - troubleshooting/ (Z files)
  - reference/ (W files)

## Next Steps
- [ ] Verify CLAUDE.md references
- [ ] Update README.md if needed
- [ ] Archive old files in git
EOF
```

**Deliverables:**
- Clean root directory (≤5 .md files)
- Organized documentation structure
- Consolidated files (50%+ redundancy reduction)
- Reorganization summary document

---

### Workflow 3: Agent Split (When Agent >38k Characters)

**Purpose:** Split oversized agents into focused specialists

**Process:**
```
Step 1: Analyze content by section size
  ↓
Step 2: Identify functional boundaries
  ↓
Step 3: Propose split with benefits
  ↓
Step 4: Get user approval (REQUIRED)
  ↓
Step 5: Create 2 focused agents
  ↓
Step 6: Cross-reference both agents
  ↓
Step 7: Archive original agent
  ↓
Step 8: Update documentation and CLAUDE.md
```

**Implementation:**
```bash
# Step 1: Check agent size
wc -c .claude/agents/agent-name.md

# Step 2: Analyze sections
grep -n "^##" .claude/agents/agent-name.md  # List all major sections

# Example split analysis:
# Original: slack-bot-developer (42,000 chars)
# Split into:
#   - slack-bot-core (20,000 chars) - Command handling, DynamoDB, Lambda
#   - slack-bot-ai (18,000 chars) - NLP parsing, Gemini integration, formatting

# Step 3: Propose split (present to user)
cat <<EOF
Agent Split Proposal:

Original: agent-name.md (42,000 chars)
Proposed Split:
  1. agent-name-core.md (20,000 chars)
     - Core functionality A
     - Core functionality B

  2. agent-name-advanced.md (18,000 chars)
     - Advanced feature A
     - Advanced feature B

Benefits:
  - Faster loading per agent
  - Clearer specialization
  - Easier maintenance

Proceed with split? (Y/N)
EOF

# Step 4: User approval (ASK - NEVER AUTO-SPLIT)

# Step 5: Create new agents (if approved)
# Extract sections to new files

# Step 6: Cross-reference
# Add to each agent:
# "Related Agents: See [agent-name-core] for core functionality"

# Step 7: Archive original
mkdir -p .claude/agents/archived/
mv .claude/agents/agent-name.md .claude/agents/archived/agent-name-pre-split-$(date +%Y%m%d).md

# Step 8: Update documentation
# Update .claude/agents/README.md
# Update CLAUDE.md task mapping
```

**Deliverables:**
- Two focused, specialized agents (<25k chars each)
- Cross-references between agents
- Archived original agent
- Updated agent registry and CLAUDE.md

**EXCEPTION:** project-manager agent NEVER splits (meta-agent exception, user decision)

---

## Standard Project Structure

### Root Directory Standards

**Acceptable root files (≤5 .md files):**
- README.md (project overview)
- CLAUDE.md (project context for AI)
- LICENSE, .gitignore, .env (configuration)
- CHANGELOG.md or CONTRIBUTING.md (if needed)

**Standard directory structure:**
```
/
├── .claude/               # Claude Code configuration
│   ├── agents/           # Specialized agents
│   └── commands/         # Slash commands
├── documentation/         # All project documentation
│   ├── archived/         # Historical context, completed work
│   ├── reference/        # API docs, technical specs
│   ├── troubleshooting/  # Organized by symptom/domain
│   └── setup/            # Installation and configuration
├── scripts/              # Automation scripts
├── infrastructure/       # IaC configurations (Terraform, etc.)
└── src/ or lambda/       # Source code
```

### Documentation Organization Categories

**archived/** - Historical and completed work
- Status updates and delivery notes
- Completed project phases
- Evolution logs and change history
- Old configurations and deprecated docs

**reference/** - Technical specifications
- API documentation
- CLI command references
- Configuration file schemas
- External integration specs

**troubleshooting/** - Organized by symptom
- Error diagnosis guides
- Performance issues
- Network connectivity
- Service-specific problems

**setup/** - Installation and configuration
- Initial setup procedures
- Configuration templates
- Environment preparation
- Integration guides

### Consolidation Strategy

**Multiple files on same topic** → Merge into 1 comprehensive file
- Preserve all unique content
- Maintain chronological order for status updates
- Add table of contents for long documents

**Historical status updates** → 1 chronological history file
- Combine daily updates into timeline
- Preserve context and decision points
- Archive completed phases

**Duplicate content** → Merge with preserved context
- Keep most recent version as base
- Integrate unique insights from older versions
- Note sources in merged document

---

## Project Type Detection & Agent Recommendations

### Web Application Projects

**Detection:**
```bash
# NextJS
[ -f "next.config.js" ] || [ -f "next.config.ts" ]

# React/Vue/Svelte
[ -f "package.json" ] && [ -d "src/components" ]

# SvelteKit
[ -f "svelte.config.js" ]
```

**Recommended Agents:**
- frontend-developer
- api-architect
- styling-expert
- testing-specialist

### Infrastructure Projects

**Detection:**
```bash
# Terraform
ls *.tf 2>/dev/null

# Ansible
[ -d "ansible" ] && ls ansible/*.yml 2>/dev/null

# CloudFormation
ls *.yaml *.json 2>/dev/null | grep -i cloudformation
```

**Recommended Agents:**
- terraform-specialist
- cloud-architect
- sre-expert

### Python Projects

**Detection:**
```bash
# Python library
[ -f "pyproject.toml" ]

# Python application
[ -f "requirements.txt" ] && [ -d "src" ]
```

**Recommended Agents:**
- python-expert
- testing-specialist
- packaging-expert

### Game Development

**Detection:**
```bash
# Unity
ls *.unity 2>/dev/null

# Godot
[ -f "project.godot" ]

# Unreal
[ -f "*.uproject" ]
```

**Recommended Agents:**
- game-developer
- shader-specialist
- asset-pipeline-manager

---

## CLAUDE.md Protocol Enforcement

### Required Section Verification

**Check CLAUDE.md contains:**
```bash
# Verify agent-first protocol exists
grep -q "Agent-First Workflow" CLAUDE.md && echo "✅ Protocol found" || echo "❌ Missing protocol"

# Check for task mapping table
grep -q "Task → Agent Mapping" CLAUDE.md && echo "✅ Mapping found" || echo "❌ Missing mapping"

# Verify character count
wc -c CLAUDE.md  # Should be <40,000 characters
```

### Auto-Update Trigger

**If CLAUDE.md missing agent protocol:**
1. Read existing CLAUDE.md content
2. Add "Claude Code Agents - CRITICAL USAGE PROTOCOL" section
3. Generate Task → Agent Mapping table for all agents in `.claude/agents/`
4. Add workflow examples (wrong vs. correct approaches)
5. Verify character count remains <40k
6. Document in reorganization summary

### Required Protocol Template

```markdown
## Claude Code Agents - CRITICAL USAGE PROTOCOL

**BEFORE starting ANY significant task, check for a specialized agent. Agent-first workflow is MANDATORY.**

### Agent-First Workflow (REQUIRED)

When user requests a task:

1. **PAUSE** - Do not start work immediately
2. **CHECK** `.claude/agents/` directory for relevant specialist
3. **DECIDE**:
   - ✅ **Agent exists** → Use `Task` tool to invoke agent
   - ❌ **No agent** → Proceed manually BUT suggest creating agent if 8+ related files
4. **IF AGENT FAILS**:
   - Document the failure reason
   - **ASK USER** how to proceed: fix agent OR proceed manually
   - **NEVER** silently fall back to manual work

### Task → Agent Mapping

| Task Type | Use Agent | Trigger Keywords |
|-----------|-----------|------------------|
[Generated from .claude/agents/ directory]
```

---

## Agent Need Detection

### Detection Triggers

**A) Topic Clustering**
```bash
# Count mentions of a topic across files
TOPIC="zerotier"
COUNT=$(grep -ri "$TOPIC" . | wc -l)
FILES=$(grep -ril "$TOPIC" . | wc -l)

if [ $COUNT -ge 15 ] && [ $FILES -ge 8 ]; then
    echo "Consider creating agent: ${TOPIC}-specialist"
fi
```

**Thresholds:**
- 15+ total mentions across project
- 8+ files containing topic
- OR 5+ work sessions on same topic (check git log)

**B) Agent Size Threshold**
```bash
# Check all agent sizes
for agent in .claude/agents/*.md; do
    SIZE=$(wc -c < "$agent")
    NAME=$(basename "$agent")

    if [ $SIZE -ge 40000 ]; then
        echo "❌ CRITICAL: $NAME ($SIZE chars) - MUST SPLIT"
    elif [ $SIZE -ge 38000 ]; then
        echo "⚠️  RECOMMEND: $NAME ($SIZE chars) - suggest split"
    elif [ $SIZE -ge 35000 ]; then
        echo "📊 ANALYZE: $NAME ($SIZE chars) - analyze for split"
    fi
done
```

**C) Work Pattern Evolution**
- Agent invoked frequently for distinct sub-tasks
- Clear functional boundaries emerge
- If agent >35k AND clear usage split → suggest specialization

### Agent Creation Workflow

**Step 1: Research Phase**
```bash
# Check context7 for library documentation
# Use mcp__context7__resolve-library-id "LibraryName"
# Then mcp__context7__get-library-docs

# Web search for best practices
# WebSearch: "[Technology] best practices 2025"

# Mine project history
grep -r "keyword" .
git log --grep="keyword" --all --oneline
```

**Step 2: Agent Scaffolding**
- Use `.claude/agents/_TEMPLATE.md`
- Fill with research-backed content:
  - Overview from official docs
  - Core concepts from documentation
  - Common tasks from best practices
  - Troubleshooting from project history

**Step 3: Integration**
```bash
# Save agent
cp .claude/agents/_TEMPLATE.md .claude/agents/new-agent.md

# Update registry
echo "- **new-agent**: Description here" >> .claude/agents/README.md

# Add to CLAUDE.md task mapping
# Test with sample query
```

---

## Success Metrics

### Project Organization
- ✅ Root directory ≤5 .md files
- ✅ All documentation properly categorized
- ✅ Redundancy reduced 50%+
- ✅ Clear navigation and discoverability

### Agent Ecosystem
- ✅ Agents created for major topics (8+ file mentions)
- ✅ All agents monitored for size (flag at 35k+)
- ✅ No agents >40k (except project-manager)
- ✅ CLAUDE.md has agent-first protocol

### System Intelligence
- ✅ Detects agent needs proactively
- ✅ Creates research-backed agents
- ✅ Maintains organization without manual intervention
- ✅ Enforces consistent standards

---

## Deliverables

### 1. Project Analysis Report
- Project type identification
- Current organization assessment
- Optimization recommendations
- Agent suggestions with rationale

### 2. Organized File Structure
- Clean root directory (≤5 files)
- Categorized documentation
- Consolidated redundant content
- Clear navigation paths

### 3. Agent Ecosystem Health
- Size monitoring report
- Split recommendations (if needed)
- New agent proposals
- Integration documentation

### 4. CLAUDE.md Protocol Compliance
- Agent-first workflow verified
- Task mapping table complete
- Character count within limits
- Cross-references accurate

### 5. Reorganization Documentation
- Summary of changes made
- File movement log
- Consolidation details
- Next steps and recommendations

---

## Usage Examples

### Analyze New Project
```bash
/project-health --analyze
```

### Clean Root Directory
```bash
/project-health --cleanup
```

### Full Organization Pass
```bash
/project-health --comprehensive
```

### Monitor Agent Sizes
```bash
/project-health --agent-split
```

---

## Integration Guidelines

This command works autonomously but integrates with:
- **project-manager agent** - Invokes this command for detailed execution
- **documentation-expert agent** - For documentation quality assessment
- **technical-writer agent** - For content clarity improvements

Maintain project health through regular monitoring and proactive organization.

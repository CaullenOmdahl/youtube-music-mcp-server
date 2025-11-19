---
name: agent-name-here
description: Brief description of what this agent does. Use PROACTIVELY for [key scenarios]. [One sentence on when to invoke this agent.]
tools: Read, Write, Edit, Bash
model: sonnet
---

You are a [role/specialty] specialist focused on [primary domain/responsibility].

## Overview

[1-2 paragraphs describing the agent's purpose, scope, and primary responsibilities]

## Core Concepts

### [Concept 1]

**[Sub-concept]:**
- Key detail 1
- Key detail 2
- Key detail 3

**[Sub-concept]:**
- Key detail 1
- Key detail 2

### [Concept 2]

[Detailed explanation with examples]

```bash
# Example command or code
example-command --flag value
```

**Output:**
```
Expected output format
```

## Configuration

### [Configuration Area 1]

**Required Settings:**
- `SETTING_NAME` - Description
- `ANOTHER_SETTING` - Description

**Optional Settings:**
- `OPTIONAL_SETTING` - Description (default: value)

**Example Configuration:**
```yaml
# Example configuration file
setting1: value1
setting2: value2
```

### [Configuration Area 2]

[Details about another configuration aspect]

## Common Tasks

### 1. [Task Name]

**Purpose:** [What this task accomplishes]

**Steps:**
1. [Step 1 with command]
2. [Step 2 with command]
3. [Step 3 with command]

**Example:**
```bash
# Complete working example
command1
command2
command3
```

**Expected Result:**
[What you should see when it works]

### 2. [Task Name]

**Purpose:** [What this task accomplishes]

**Command:**
```bash
example-command --with-flags
```

**Parameters:**
- `--param1` - What it does
- `--param2` - What it does

**Example:**
```bash
example-command --param1 value1 --param2 value2
```

### 3. [Task Name]

[Detailed explanation of complex task]

**Pre-requisites:**
- [ ] Requirement 1
- [ ] Requirement 2

**Execution:**
```bash
# Step-by-step commands
command1
command2
```

## Workflows

### [Workflow Name]

**Scenario:** [When to use this workflow]

**Process:**
```
Step 1
  ↓
Step 2
  ↓
Step 3 (conditional)
  ├─→ Path A (if condition met)
  └─→ Path B (if condition not met)
```

**Implementation:**
```bash
# Complete workflow commands
if condition; then
    action_a
else
    action_b
fi
```

## Troubleshooting

### [Common Issue 1]

**Symptom:** [What the user sees]

**Cause:** [Why this happens]

**Detection:**
```bash
# Commands to verify the issue
diagnostic-command
```

**Fix:**
```bash
# Commands to resolve
fix-command
```

**Prevention:** [How to avoid this issue]

### [Common Issue 2]

**Symptom:** [What the user sees]

**Possible Causes:**
1. [Cause 1]
2. [Cause 2]
3. [Cause 3]

**Diagnosis:**
```bash
# Check cause 1
check-command-1

# Check cause 2
check-command-2
```

**Resolution:**

**For Cause 1:**
```bash
fix-for-cause-1
```

**For Cause 2:**
```bash
fix-for-cause-2
```

### [Common Issue 3]

**❌ WRONG - Anti-pattern:**
```bash
# Example of what NOT to do
wrong-command
```

**✅ CORRECT - Best practice:**
```bash
# Example of the right approach
correct-command
```

## Critical Procedures

### [Critical Operation Name]

**IMPORTANT:** [Critical warning or requirement]

**Pre-flight Checklist:**
- [ ] Verification 1
- [ ] Verification 2
- [ ] Backup created
- [ ] Rollback plan ready

**Execution Steps:**

**Step 1: [Action]**
```bash
command1
```
Expected: [What should happen]

**Step 2: [Action]**
```bash
command2
```
Expected: [What should happen]

**Step 3: [Verification]**
```bash
verification-command
```
Expected: [What confirms success]

**Rollback Procedure:**
```bash
# If something goes wrong
rollback-command
```

## Best Practices

1. **[Practice Category]**
   - [Specific practice 1]
   - [Specific practice 2]
   - [Why this matters]

2. **[Practice Category]**
   - [Specific practice 1]
   - [Specific practice 2]
   - [Why this matters]

3. **[Practice Category]**
   - [Specific practice 1]
   - [Specific practice 2]
   - [Why this matters]

## Common Mistakes to Avoid

### ❌ MISTAKE 1: [Description]
```bash
# Example of the mistake
bad-command
```
**Problem:** [Why this is wrong]

**Solution:**
```bash
# Correct approach
good-command
```

### ❌ MISTAKE 2: [Description]
**Impact:** [What goes wrong]
**Fix:** [How to do it right]

## Monitoring and Verification

**Health Checks:**
```bash
# Regular health check commands
health-check-1
health-check-2
```

**Performance Metrics:**
```bash
# Commands to check performance
metric-command-1
metric-command-2
```

**Expected Values:**
- Metric 1: [Normal range]
- Metric 2: [Normal range]
- Metric 3: [Normal range]

## Integration Points

### [Integration with System/Tool 1]

**Connection Method:** [How they connect]

**Configuration:**
```yaml
# Configuration required for integration
integration_setting: value
```

**Example Usage:**
```bash
# Using the integration
integrated-command
```

### [Integration with System/Tool 2]

[Details about second integration]

## Security Considerations

1. **[Security Aspect 1]**
   - [Requirement or best practice]
   - [Why this matters]
   - [How to implement]

2. **[Security Aspect 2]**
   - [Requirement or best practice]
   - [Why this matters]
   - [How to implement]

3. **[Security Aspect 3]**
   - [Requirement or best practice]
   - [Why this matters]

## Advanced Topics

### [Advanced Feature 1]

**Use Case:** [When you need this]

**Implementation:**
```bash
# Advanced commands
advanced-command-1
advanced-command-2
```

**Considerations:**
- [Important note 1]
- [Important note 2]
- [Trade-off or limitation]

### [Advanced Feature 2]

[Detailed explanation of advanced feature]

## Reference

### Quick Command Reference

**Most Common Commands:**
```bash
# List/view operations
list-command
view-command

# Create/modify operations
create-command
modify-command

# Delete/cleanup operations
delete-command
cleanup-command
```

### File Locations

**Important Files:**
- `/path/to/config.conf` - [What this file is]
- `/path/to/data/` - [What this directory contains]
- `/path/to/logs/` - [Where logs are stored]

### Environment Variables

**Required:**
- `ENV_VAR_1` - [Purpose]
- `ENV_VAR_2` - [Purpose]

**Optional:**
- `ENV_VAR_3` - [Purpose] (default: value)
- `ENV_VAR_4` - [Purpose] (default: value)

### External Resources

- [Resource Name](URL) - [Description]
- [Resource Name](URL) - [Description]
- [Resource Name](URL) - [Description]

## Your Role

When working with [domain/system]:

1. **[Primary Responsibility]**
   - [Specific task or concern]
   - [Specific task or concern]
   - [Specific task or concern]

2. **[Secondary Responsibility]**
   - [Specific task or concern]
   - [Specific task or concern]

3. **[Tertiary Responsibility]**
   - [Specific task or concern]
   - [Specific task or concern]

4. **Always:**
   - [Critical requirement that must always be followed]
   - [Critical requirement that must always be followed]
   - [Critical requirement that must always be followed]

5. **Never:**
   - [Action to avoid]
   - [Action to avoid]
   - [Action to avoid]

You have full autonomy to [list permissions and scope of authority]. Your primary responsibility is [core mission statement].

**Decision Authority:**
- ✅ Can decide: [What agent can decide without asking]
- ❓ Must ask: [What requires user confirmation]
- ❌ Cannot decide: [What is outside agent's scope]

## Current State

**Last Updated:** [Date]

**Active Configuration:**
- [Setting 1]: [Current value]
- [Setting 2]: [Current value]
- [Setting 3]: [Current value]

**Known Issues:**
- [Issue 1 and workaround]
- [Issue 2 and workaround]

**Recent Changes:**
- [Date]: [Change description]
- [Date]: [Change description]

**Next Steps:**
- [ ] [Planned improvement or task]
- [ ] [Planned improvement or task]
- [ ] [Planned improvement or task]

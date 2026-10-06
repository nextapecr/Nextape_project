# ✅ PARSER REPLACEMENT - DEPLOYMENT & VERIFICATION GUIDE

**Date:** October 3, 2026  
**Commit:** `db8e95b` - "feat: replace tree-sitter with typescript-estree for TS/JS/TSX parsing"  
**Status:** ⏳ DEPLOYED TO GIT - AWAITING NETLIFY BUILD & VERIFICATION

---

## 🎯 WHAT WAS IMPLEMENTED

### The Solution
Replaced tree-sitter native bindings with `@typescript-eslint/typescript-estree` for TypeScript/JavaScript/TSX parsing.

**Why:** After 3 failed attempts to install Linux native bindings in Netlify, we switched to a pure JavaScript parser that has zero native dependencies.

### Files Changed
1. **NEW:** `src/services/github-engine/parsers/typescript-estree-parser.ts`
   - Pure JavaScript parser for TS/JS/TSX
   - Converts ESTree AST to generic ASTNode format

2. **MODIFIED:** `src/services/github-engine/ir/universal-ir-builder.ts`
   - Added ESTree node type mappings (FunctionDeclaration, ClassDeclaration, etc.)
   - Now supports both Tree-sitter (snake_case) AND ESTree (PascalCase)

3. **MODIFIED:** `src/services/github-engine/parsers/universal-parser.ts`
   - Routes TS/JS/TSX to typescript-estree parser
   - Keeps tree-sitter for ALL other languages (Python, Go, Java, Rust, etc.)

4. **REMOVED:** `.npmrc` and Linux native binding from `optionalDependencies`

5. **CLEANED:** Diagnostic logging from debugging session

### What Stays the Same
- ✅ Tree-sitter STILL USED for Python, Go, Java, Rust, C/C++, Ruby, etc.
- ✅ Same EngineeringIR output format
- ✅ Analyzers and skill-mapping unchanged
- ✅ Same LanguageParser interface

---

## 📋 DEPLOYMENT CHECKLIST

### Step 1: Verify Netlify Build (5-10 minutes)
1. Go to https://app.netlify.com
2. Navigate to your site (Nextape)
3. Click **"Deploys"** tab
4. Wait for the build with commit `db8e95b` to complete
5. Status should show **"Published"**

### Step 2: Check Build Log (IMPORTANT)
Once the build completes:
1. Click on the deploy
2. Click **"Deploy log"**
3. Search for `@typescript-eslint/typescript-estree`
4. **Verify:** Should see it being installed (no EBADPLATFORM errors)
5. **Verify:** Build should complete successfully

### Step 3: Re-Run GitHub Analysis in Production
1. Go to your production site
2. Navigate to GitHub Analysis page
3. Run analysis on the same repo that was failing before: `skrsoftwarecr/Nextape_project`
4. Wait for completion

### Step 4: Verify Production Logs
Go back to Netlify → Functions → Find the most recent execution

**Look for these SUCCESS indicators:**
```
✅ canParse() returns true for .ts/.tsx/.js/.jsx files
✅ filesAnalyzed > 0 (should be ~12 for the test repo)
✅ NO errors about "Cannot find module 'tree-sitter-language-pack-linux-x64-gnu'"
✅ Scores present: Architecture, Security, Maintainability NOT null
```

**FAIL indicators (if you see these, report immediately):**
```
❌ canParse() = false for TypeScript files
❌ filesAnalyzed = 0
❌ Parse errors or "Cannot find module" errors
❌ Scores are null
```

---

## 🎉 SUCCESS CRITERIA

| Metric | Before (Failed) | After (Expected) |
|--------|-----------------|------------------|
| **Parser Used** | tree-sitter (native bindings) | typescript-estree (pure JS) |
| **Module Found** | ❌ No | ✅ Yes |
| **canParse()** | false | true |
| **Files Analyzed** | 0 | 12 |
| **Has AST Data** | false | true |
| **Architecture Score** | null | 0-100 |
| **Security Score** | null | 0-100 |
| **Maintainability Score** | null | 0-100 |
| **UI Message** | "Sin código analizable" | Scores displayed |

---

## 📊 EXPECTED PRODUCTION LOGS

### BEFORE (Failed with tree-sitter):
```
[universal-parser] ❌ EXCEPTION: Failed to load grammar for "typescript": 
Cannot find module './ts-pack-core-node.linux-x64-gnu.node'

[universal-parser] DIAGNOSTIC: canParse("src/lib/server/question-bank.ts") = false

Result: filesAnalyzed = 0, hasASTData = false
```

### AFTER (Success with typescript-estree):
```
[typescript-estree-parser] Parsing "src/lib/server/question-bank.ts" as typescript
[typescript-estree-parser] ✅ Successfully parsed

Result: filesAnalyzed = 12, hasASTData = true
Architecture Score: 85, Security Score: 78, Maintainability Score: 82
```

---

## 🔍 DETAILED VERIFICATION STEPS

### A. Verify TypeScript Files Parse
Check logs for specific files from the test repo:
- `src/lib/server/question-bank.ts` (typescript, 39757 bytes)
- `src/app/dashboard/roadmap/page.tsx` (tsx, 27760 bytes)
- `src/services/github-signals.service.ts` (typescript, 24230 bytes)

Each should show:
- ✅ Parsed successfully
- ✅ No "Cannot find module" errors
- ✅ AST data extracted

### B. Verify Other Languages Still Work
Tree-sitter should STILL work for:
- `migration.sh` (bash)
- Any Python files (if present in other repos)
- Any Go files (if present in other repos)

### C. Verify UI Shows Scores
In the GitHub Evidence Card:
- ✅ Architecture score visible (not null)
- ✅ Security score visible (not null)
- ✅ Maintainability score visible (not null)
- ✅ NO "Sin código analizable" message

---

## 🐛 TROUBLESHOOTING

### Issue: Build fails with typescript-estree errors
**Cause:** Package installation failure  
**Solution:** 
1. Check Netlify build log for npm install errors
2. Try: Trigger deploy → "Clear cache and deploy site"

### Issue: Parser still returns canParse() = false
**Cause:** Routing logic not working  
**Solution:**
1. Check if file extension is in SUPPORTED_EXTENSIONS set
2. Verify import statement for typescript-estree-parser
3. Check Netlify deployed the correct commit (`db8e95b`)

### Issue: ESTree nodes not recognized by IR builder
**Cause:** Missing node type mappings  
**Solution:**
1. Check universal-ir-builder.ts has PascalCase node types
2. Verify UNIVERSAL_FUNCTION_NODES includes 'FunctionDeclaration'
3. Verify UNIVERSAL_CLASS_NODES includes 'ClassDeclaration'

### Issue: Tree-sitter fails for other languages
**Cause:** Accidentally broke tree-sitter for non-TS languages  
**Solution:**
1. Verify @kreuzberg/tree-sitter-language-pack is still in dependencies
2. Check universal-parser routing: should ONLY use typescript-estree for TS/JS/TSX
3. Test with a Python or Go repo

---

## 📝 REPORT TEMPLATE

After verification, provide this information:

```
DEPLOYMENT VERIFICATION REPORT
==============================

Netlify Build:
- Commit SHA: db8e95b
- Build Status: [Published/Failed]
- Build Time: [X minutes]
- typescript-estree installed: [Yes/No]

GitHub Analysis Results:
- Repo analyzed: skrsoftwarecr/Nextape_project
- Files analyzed: [X] (expected: 12)
- Has AST data: [true/false]
- Architecture Score: [X or null]
- Security Score: [X or null]
- Maintainability Score: [X or null]

Production Logs (sample):
[Paste relevant log lines here]

Status: [✅ SUCCESS / ❌ FAILED]
```

---

## ✅ NEXT STEPS AFTER SUCCESS

1. **Monitor:** Watch for 24-48 hours for any regressions
2. **Test:** Try analysis on 2-3 other TypeScript repos
3. **Clean up:** Remove diagnostic .md files from repo root (optional)
4. **Document:** Update main README with parser architecture notes

---

## 🚨 IF IT FAILS

If after Netlify deploy the parser still doesn't work:

1. **DO NOT PANIC** - Tree-sitter is still there for other languages
2. **Gather evidence:** Full build log + full function log
3. **Check alternative:** Consider pre-compiling grammars (Plan C from report)
4. **Rollback option:** Revert commit `db8e95b` if critical

---

**Generated:** October 3, 2026, 18:50 PM  
**Author:** backend-ai-engineer agent  
**Commit:** db8e95b  
**Time invested:** ~2.5 hours total (debugging + implementation)

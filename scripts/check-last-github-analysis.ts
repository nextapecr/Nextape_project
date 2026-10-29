/**
 * Check when last GitHub analysis was executed and from which environment.
 */

import './load-env';
import { scriptFirestore } from './lib/firestore';

const db = scriptFirestore();

async function checkLastAnalysis() {
  console.log('🔍 Checking last GitHub analysis in Firestore...\n');
  
  // Check github_evidence collection (aggregated profiles)
  const evidenceSnapshot = await db.collection('github_evidence')
    .orderBy('analyzedAt', 'desc')
    .limit(5)
    .get();
  
  if (!evidenceSnapshot.empty) {
    console.log('📊 Recent GitHub Analyses (Aggregated Profiles):\n');
    console.log('═'.repeat(80));
    
    evidenceSnapshot.docs.forEach((doc, idx) => {
      const data = doc.data();
      const timestamp = data.analyzedAt?._seconds 
        ? new Date(data.analyzedAt._seconds * 1000) 
        : 'Unknown';
      
      console.log(`\n${idx + 1}. User: ${doc.id}`);
      console.log(`   Username: ${data.githubUsername || 'Unknown'}`);
      console.log(`   Analyzed At: ${timestamp}`);
      console.log(`   Engine Version: ${data.engineVersion || 'Unknown'}`);
      console.log(`   Repos Analyzed: ${data.reposAnalyzed || 0}`);
      console.log(`   Files Analyzed: ${data.filesAnalyzed || 0}`);
      console.log(`   Has AST Data: ${data.skillScores?.hasASTData ?? 'Unknown'}`);
      
      if (data.parsedLanguages) {
        const langs = Object.entries(data.parsedLanguages as Record<string, number>)
          .map(([lang, count]) => `${lang}(${count})`)
          .join(', ');
        console.log(`   Parsed Languages: ${langs || 'None'}`);
      }
    });
  }
  
  // Check individual repo analyses
  console.log('\n\n🔍 Checking individual repo analyses...\n');
  
  const repoAnalyses = await db.collectionGroup('repos')
    .orderBy('analyzedAt', 'desc')
    .limit(10)
    .get();
  
  if (!repoAnalyses.empty) {
    console.log('📦 Recent Repository Analyses:\n');
    console.log('═'.repeat(80));
    
    repoAnalyses.docs.forEach((doc, idx) => {
      const data = doc.data();
      const timestamp = data.analyzedAt?._seconds 
        ? new Date(data.analyzedAt._seconds * 1000) 
        : 'Unknown';
      
      console.log(`\n${idx + 1}. Repo: ${data.fullName || 'Unknown'}`);
      console.log(`   User: ${data.uid || 'Unknown'}`);
      console.log(`   Analyzed At: ${timestamp}`);
      console.log(`   Engine Version: ${data.engineVersion || 'Unknown'}`);
      console.log(`   Files Analyzed: ${data.filesAnalyzed || 0}`);
      console.log(`   Has AST Data: ${data.skillScores?.hasASTData ?? 'Unknown'}`);
      
      if (data.parsedLanguages) {
        const langs = Object.entries(data.parsedLanguages as Record<string, number>)
          .map(([lang, count]) => `${lang}(${count})`)
          .join(', ');
        console.log(`   Parsed Languages: ${langs || 'None'}`);
      } else {
        console.log(`   Parsed Languages: None`);
      }
    });
  } else {
    console.log('No individual repo analyses found.');
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('\n💡 INTERPRETATION:\n');
  console.log('If "Parsed Languages: None" and "Has AST Data: false":');
  console.log('  → Parser failed to load tree-sitter grammars');
  console.log('  → Check if analysis ran on Windows (will fail) or Linux (should work)');
  console.log('\nIf analysis timestamp is recent (today):');
  console.log('  → Analysis likely ran on LOCAL (Windows dev environment)');
  console.log('\nIf analysis timestamp is old OR production URL shows recent analysis:');
  console.log('  → Need to check Netlify Function logs for production evidence\n');
}

checkLastAnalysis()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
